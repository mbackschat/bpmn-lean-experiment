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
} from "@bpmn-lean/platform-operate";
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
      record(population, `instance-${index}`);
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
      record(population, "instance-1");
      record(population, "instance-2");
      record(population, "instance-3");
      let occurrenceCalls = 0;
      const service = aggregateService(population, {
        occurrenceReconciliation: async (registration) => {
          occurrenceCalls += 1;
          return occurrenceCalls === 3
            ? { kind: failure }
            : availableOccurrences(registration, [
                completed(
                  `Completed_${registration.instance.processInstanceId}`,
                  definition.processId,
                  occurrenceCalls,
                  0,
                  occurrenceCalls,
                ),
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
    record(population, "instance-1");
    record(population, "instance-2");
    let executionCalls = 0;
    let inserted = false;
    const service = aggregateService(population, {
      executions: async () => {
        executionCalls += 1;
        if (!inserted) {
          inserted = true;
          record(population, "instance-3");
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
      record(population, `instance-${index}`);
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
    record(population, "drifted", {
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

test("excludes called-Process interiors and computes exact completed durations", async () => {
  await withPopulation(async (population) => {
    record(population, "instance-1");
    const occurrences = [
      completed("A", definition.processId, 1, 100, 100),
      completed("A", definition.processId, 2, 100, 105),
      completed("A", definition.processId, 3, 100, 106),
      running("B", definition.processId, 4, 200),
      cancelled("C", definition.processId, 5, 200, 220),
      completed("CalledTask", "Called_Process", 6, 100, 110),
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
        completedDuration: {
          sampleCount: 3,
          minimumMs: 0,
          maximumMs: 6,
          averageMs: 3,
        },
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

test("makes the whole result unavailable when the BigInt duration total is unsafe", async () => {
  await withPopulation(async (population) => {
    record(population, "instance-1");
    const service = aggregateService(population, {
      occurrences: [
        completed("A", definition.processId, 1, 0, Number.MAX_SAFE_INTEGER),
        completed("A", definition.processId, 2, 0, 1),
      ],
    });
    assert.deepEqual(
      await service.get({ processId: definition.processId, version: 7 }),
      { kind: "unavailable", reason: "flowNodeMetricsUnavailable" },
    );
  });
});

function aggregateService(
  population: SqliteProcessInstanceRepository,
  options: Readonly<{
    executions?: (processInstanceId: string) => Promise<ExecutionPublicationReconciliationResult>;
    occurrences?: readonly ReturnType<typeof completed>[];
    occurrenceReconciliation?: (
      registration: OperateProcessRegistration,
    ) => Promise<FlowNodeOccurrenceReconciliationResult>;
  }>,
) {
  return new FlowNodeMetricsAggregationService({
    definitions: { get: () => structuredClone(definition) },
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
  occurrences: readonly ReturnType<typeof completed>[] = [],
): FlowNodeOccurrenceReconciliationResult {
  return {
    kind: FlowNodeOccurrenceReconciliationKind.Available,
    projection: {
      identity: {
        definition: {
          compiler: "bpmn-source-semantic-process",
          semanticProfile: definition.semanticProfile,
          sourceId: definition.source.id,
          sourceSha256: definition.source.sha256,
          sourceOverlay: null,
        },
        processId: definition.processId,
        processInstanceId: registration.instance.processInstanceId,
      },
      status: FlowNodeOccurrenceProjectionStatus.Healthy,
      headRevision: 1,
      producerHeadRevision: 1,
      lastCommittedAtEpochMs: 0,
      batches: [],
      occurrences: structuredClone(occurrences),
      currentOpen: [],
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
  elementId: string,
  processId: string,
  startIndex: number,
  startedAtEpochMs: number,
  terminalAtEpochMs: number,
) {
  return occurrence(
    elementId,
    processId,
    startIndex,
    startedAtEpochMs,
    "completed",
    terminalAtEpochMs,
  );
}

function cancelled(
  elementId: string,
  processId: string,
  startIndex: number,
  startedAtEpochMs: number,
  terminalAtEpochMs: number,
) {
  return occurrence(
    elementId,
    processId,
    startIndex,
    startedAtEpochMs,
    "cancelled",
    terminalAtEpochMs,
  );
}

function running(
  elementId: string,
  processId: string,
  startIndex: number,
  startedAtEpochMs: number,
) {
  return occurrence(elementId, processId, startIndex, startedAtEpochMs, null, null);
}

function occurrence(
  elementId: string,
  processId: string,
  startIndex: number,
  startedAtEpochMs: number,
  terminal: "completed" | "cancelled" | null,
  terminalAtEpochMs: number | null,
) {
  return {
    id: { processInstanceId: "instance-1", startRevision: 1, startIndex },
    processId,
    elementId,
    owner: {
      processInstanceId: "instance-1",
      definitionScopeId: "root",
      activation: 1,
    },
    startedAtEpochMs,
    terminal,
    terminalAtEpochMs,
  } as const;
}

function record(
  population: SqliteProcessInstanceRepository,
  processInstanceId: string,
  selected: DeployedDefinitionVersion = definition,
): void {
  const instance: PublicProcessInstanceIdentity = {
    processInstanceId,
    definition: structuredClone(selected),
  };
  population.recordConfirmed({ instance, locator: `private:${processInstanceId}` });
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
