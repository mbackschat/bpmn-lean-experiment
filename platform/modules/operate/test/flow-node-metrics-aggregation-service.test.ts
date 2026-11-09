import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ExecutionPublicationReconciliationKind,
  FlowNodeMetricsAggregationService,
  FlowNodeOccurrenceReconciliationKind,
  FlowNodeOccurrenceProjectionStatus,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type {
  ExecutionPublicationReconciliationResult,
  FlowNodeOccurrenceReconciliationResult,
  OperateProcessRegistration,
  ProjectedFlowNodeOccurrence,
} from "@bpmn-lean/platform-operate";
import {
  FlowNodeOccurrenceRole,
  publicationIdentityForPublicProcessInstance,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

const definition: DeployedDefinitionVersion = {
  processId: "Process_Metrics",
  version: 7,
  source: {
    kind: "bpmnSource",
    id: "metrics.bpmn",
    sha256: "b".repeat(64),
    byteLength: 128,
    declaredEncoding: null,
    decodedAs: "UTF-8",
  },
  semanticProfile: "metrics-profile",
  startCapabilities: { messageStarts: [], timerStarts: [] },
  sourceOverlay: null,
};

test("returns an exact available empty aggregate for zero retained members", async () => {
  await withPopulation(async (population) => {
    let executionCalls = 0;
    let occurrenceCalls = 0;
    const service = aggregateService(population, {
      executions: async () => {
        executionCalls += 1;
        return availableExecution();
      },
      occurrenceReconciliation: async (registration) => {
        occurrenceCalls += 1;
        return availableOccurrences(registration);
      },
    });

    const result = await service.get({ processId: definition.processId, version: 7 });
    assert.equal(result?.kind, "available");
    assert.deepEqual(result?.kind === "available" ? result.snapshot : null, {
      definition,
      population: {
        processInstances: 0,
        label: "allRetainedEvidence",
      },
      flowNodes: [],
    });
    assert.equal(executionCalls, 0);
    assert.equal(occurrenceCalls, 0);
  });
});

test("aggregates the exact maximum population of 100 retained members", async () => {
  await withPopulation(async (population) => {
    for (let index = 1; index <= 100; index += 1) {
      await record(population, `instance-${index}`);
    }
    let executionCalls = 0;
    let occurrenceCalls = 0;
    const service = aggregateService(population, {
      executions: async () => {
        executionCalls += 1;
        return availableExecution();
      },
      occurrenceReconciliation: async (registration) => {
        occurrenceCalls += 1;
        return availableOccurrences(registration);
      },
    });

    const result = await service.get({ processId: definition.processId, version: 7 });
    assert.equal(result?.kind, "available");
    assert.equal(
      result?.kind === "available" ? result.snapshot.population.processInstances : null,
      100,
    );
    assert.deepEqual(result?.kind === "available" ? result.snapshot.flowNodes : null, []);
    assert.equal(executionCalls, 100);
    assert.equal(occurrenceCalls, 100);
  });
});

for (const failure of [
  FlowNodeOccurrenceReconciliationKind.Unavailable,
  FlowNodeOccurrenceReconciliationKind.Gap,
] as const) {
  test(`suppresses a partial aggregate after a late ${failure} member`, async () => {
    await withPopulation(async (population) => {
      await record(population, "instance-1");
      await record(population, "instance-2");
      await record(population, "instance-3");
      let occurrenceCalls = 0;
      const service = aggregateService(population, {
        occurrenceReconciliation: async (registration) => {
          occurrenceCalls += 1;
          return occurrenceCalls === 3
            ? { kind: failure }
            : availableOccurrences(registration, [
                running(registration.instance.processInstanceId, `Running_${occurrenceCalls}`, 1),
              ]);
        },
      });

      assert.deepEqual(
        await service.get({ processId: definition.processId, version: 7 }),
        { kind: "unavailable", reason: "flowNodeMetricsUnavailable" },
      );
      assert.equal(occurrenceCalls, 3);
    });
  });
}

test("freezes membership before gateway work and sees a concurrent insert next time", async () => {
  await withPopulation(async (population) => {
    await record(population, "instance-1");
    await record(population, "instance-2");
    let executionCalls = 0;
    let inserted = false;
    const service = aggregateService(population, {
      executions: async () => {
        executionCalls += 1;
        if (!inserted) {
          inserted = true;
          await record(population, "instance-3");
        }
        return availableExecution();
      },
    });

    const first = await service.get({ processId: definition.processId, version: 7 });
    assert.equal(first?.kind, "available");
    assert.equal(first?.kind === "available"
      ? first.snapshot.population.processInstances
      : null, 2);
    const second = await service.get({ processId: definition.processId, version: 7 });
    assert.equal(second?.kind === "available"
      ? second.snapshot.population.processInstances
      : null, 3);
    assert.equal(executionCalls, 5);
  });
});

test("makes 101 members unavailable before any gateway call", async () => {
  await withPopulation(async (population) => {
    for (let index = 1; index <= 101; index += 1) {
      await record(population, `instance-${index}`);
    }
    let gatewayCalls = 0;
    const service = aggregateService(population, {
      executions: async () => {
        gatewayCalls += 1;
        return availableExecution();
      },
    });
    assert.deepEqual(
      await service.get({ processId: definition.processId, version: 7 }),
      { kind: "unavailable", reason: "flowNodeMetricsUnavailable" },
    );
    assert.equal(gatewayCalls, 0);
  });
});

test("fails closed when indexed definition columns match but another field drifts", async () => {
  await withPopulation(async (population) => {
    await record(population, "drifted", {
      ...definition,
      source: { ...definition.source, id: "different-source-id.bpmn" },
    });
    let gatewayCalls = 0;
    const service = aggregateService(population, {
      executions: async () => {
        gatewayCalls += 1;
        return availableExecution();
      },
    });
    assert.equal((await service.get({ processId: definition.processId, version: 7 }))?.kind,
      "unavailable");
    assert.equal(gatewayCalls, 0);
  });
});

test("counts only the hosting instance's element occurrences and publishes no completed duration", async () => {
  await withPopulation(async (population) => {
    await record(population, "instance-1");
    const occurrences = [
      completed("instance-1", "A", 1),
      completed("instance-1", "A", 2),
      completed("instance-1", "A", 3),
      completed("instance-1", "A", 1, FlowNodeOccurrenceRole.MultiInstanceBody),
      running("instance-1", "B", 1),
      cancelled("instance-1", "C", 1),
      completed("called-instance", "CalledTask", 1),
    ];
    const service = aggregateService(population, { occurrences });
    const result = await service.get({ processId: definition.processId, version: 7 });
    assert.equal(result?.kind, "available");
    assert.deepEqual(result?.kind === "available" ? result.snapshot.flowNodes : null, [
      {
        elementId: "A",
        frequency: 3,
        running: 0,
        completed: 3,
        cancelled: 0,
        completedDuration: null,
      },
      {
        elementId: "B",
        frequency: 1,
        running: 1,
        completed: 0,
        cancelled: 0,
        completedDuration: null,
      },
      {
        elementId: "C",
        frequency: 1,
        running: 0,
        completed: 0,
        cancelled: 1,
        completedDuration: null,
      },
    ]);
  });
});

function aggregateService(
  population: SqliteProcessInstanceRepository,
  options: Readonly<{
    executions?: (processInstanceId: string) => Promise<ExecutionPublicationReconciliationResult>;
    occurrences?: readonly ProjectedFlowNodeOccurrence[];
    occurrenceReconciliation?: (
      registration: OperateProcessRegistration,
    ) => Promise<FlowNodeOccurrenceReconciliationResult>;
  }>,
) {
  return new FlowNodeMetricsAggregationService({
    definitions: { get: async () => structuredClone(definition) },
    population,
    executions: {
      reconcile: options.executions ?? (async () => availableExecution()),
    },
    occurrences: {
      reconcile: options.occurrenceReconciliation ?? (async (registration) =>
        availableOccurrences(registration, options.occurrences)),
    },
  });
}

function availableOccurrences(
  registration: OperateProcessRegistration,
  occurrences: readonly ProjectedFlowNodeOccurrence[] = [],
): FlowNodeOccurrenceReconciliationResult {
  return {
    kind: FlowNodeOccurrenceReconciliationKind.Available,
    projection: {
      identity: publicationIdentityForPublicProcessInstance(registration.instance),
      status: FlowNodeOccurrenceProjectionStatus.Healthy,
      headRevision: 1,
      producerHeadRevision: 1,
      batches: [],
      occurrences: structuredClone(occurrences),
    },
  };
}

function availableExecution() {
  return {
    kind: ExecutionPublicationReconciliationKind.Available,
    projection: {} as never,
  } as const;
}

function completed(
  processInstanceId: string,
  elementId: string,
  activation: number,
  role: FlowNodeOccurrenceRole = FlowNodeOccurrenceRole.Element,
): ProjectedFlowNodeOccurrence {
  return occurrence(processInstanceId, elementId, activation, role, "completed");
}

function cancelled(
  processInstanceId: string,
  elementId: string,
  activation: number,
): ProjectedFlowNodeOccurrence {
  return occurrence(processInstanceId, elementId, activation, FlowNodeOccurrenceRole.Element, "cancelled");
}

function running(
  processInstanceId: string,
  elementId: string,
  activation: number,
): ProjectedFlowNodeOccurrence {
  return occurrence(processInstanceId, elementId, activation, FlowNodeOccurrenceRole.Element, null);
}

function occurrence(
  processInstanceId: string,
  elementId: string,
  activation: number,
  role: FlowNodeOccurrenceRole,
  terminal: "completed" | "cancelled" | null,
): ProjectedFlowNodeOccurrence {
  return {
    occurrence: { processInstanceId, elementId, activation, role },
    startRevision: 1,
    startIndex: 0,
    owner: 0,
    sourceType: "task",
    terminal,
  };
}

async function record(
  population: SqliteProcessInstanceRepository,
  processInstanceId: string,
  selected: DeployedDefinitionVersion = definition,
): Promise<void> {
  const instance: PublicProcessInstanceIdentity = {
    processInstanceId,
    definition: structuredClone(selected),
  };
  await population.recordConfirmed({ instance, locator: `private:${processInstanceId}` });
}

async function withPopulation(
  run: (population: SqliteProcessInstanceRepository) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-metrics-population-"));
  const population = new SqliteProcessInstanceRepository(join(root, "operate.sqlite"));
  try {
    await run(population);
  } finally {
    population.close();
    await rm(root, { recursive: true, force: true });
  }
}
