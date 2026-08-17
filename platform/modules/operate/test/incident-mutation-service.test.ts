import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  IncidentActionAuditOutboxService,
  IncidentAggregationService,
  IncidentMutationService,
  SqliteIncidentActionRepository,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type {
  IncidentActionRequest,
  IncidentAuditEvent,
  IncidentAuditOutboxItem,
} from "@bpmn-lean/platform-operate";
import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

test("durably rejects changed nested content under one action ID and forbids another actor", async () => {
  await withStore(async ({ processRepository, actionRepository, databaseFile }) => {
    const published = incidentPublication("instance", true);
    await processRepository.recordConfirmed(publication("instance"));
    const gateway = gatewayFor([published], async ({ stimulus }) => ({
      kind: "semantic",
      commandId: stimulus.commandId,
      outcome: "committed",
    }));
    const first = service(processRepository, actionRepository, gateway);
    assert.equal(
      (await first.submitAuthorized({ actorId: "operator-a" }, "same-action", published.interactions[0])).kind,
      "result",
    );
    actionRepository.close();

    const reopened = new SqliteIncidentActionRepository(databaseFile);
    try {
      const afterRestart = service(processRepository, reopened, gateway);
      const changed: IncidentActionRequest = {
        kind: "retryIncident",
        incidentId: {
          effectId: {
            ...published.interactions[0].incidentId.effectId,
            elementId: "changed-task",
          },
          generation: 1,
        },
      };
      assert.deepEqual(
        await afterRestart.submitAuthorized({ actorId: "operator-a" }, "same-action", changed),
        { kind: "conflict" },
      );
      assert.deepEqual(
        await afterRestart.submitAuthorized({ actorId: "operator-b" }, "same-action", published.interactions[0]),
        { kind: "forbidden" },
      );
      assert.equal(gateway.actionCalls.length, 1);
    } finally {
      reopened.close();
    }
  });
});

test("keeps distinct Retry and Cancel action IDs independent without a platform winner", async () => {
  await withStore(async ({ processRepository, actionRepository }) => {
    const published = incidentPublication("instance", true);
    await processRepository.recordConfirmed(publication("instance"));
    const gateway = gatewayFor([published], async ({ stimulus }) =>
      stimulus.kind === "retryIncident"
        ? { kind: "semantic", commandId: stimulus.commandId, outcome: "committed" }
        : {
            kind: "processClosed",
            commandId: stimulus.commandId,
            receipt: {
              processInstanceId: "instance",
              finalState: { status: "cancelled" },
            },
          });
    const mutations = service(processRepository, actionRepository, gateway);

    const retry = await mutations.submitAuthorized(
      { actorId: "operator" },
      "retry-action",
      published.interactions[0],
    );
    const cancel = await mutations.submitAuthorized(
      { actorId: "operator" },
      "cancel-action",
      published.interactions[1]!,
    );

    assert.equal(retry.kind === "result" && retry.result.state, "committed");
    assert.deepEqual(cancel.kind === "result" && cancel.result, {
      state: "rejected",
      actionId: "cancel-action",
      interaction: published.interactions[1],
      engineResult: { kind: "processClosed", status: "cancelled" },
    });
    assert.deepEqual(
      gateway.actionCalls.map(({ stimulus }) => stimulus.kind),
      ["retryIncident", "cancelIncidentProcess"],
    );
  });
});

test("delivers and acknowledges reserved audit before the first engine action call", async () => {
  await withStore(async ({ processRepository, actionRepository }) => {
    const published = incidentPublication("instance", false);
    await processRepository.recordConfirmed(publication("instance"));
    const gateway = gatewayFor([published], async ({ stimulus }) => ({
      kind: "semantic",
      commandId: stimulus.commandId,
      outcome: "committed",
    }));
    const failing = service(processRepository, actionRepository, gateway, {
      record: async () => { throw new Error("audit unavailable"); },
    });

    await assert.rejects(
      failing.submitAuthorized({ actorId: "operator" }, "action", published.interactions[0]),
      /audit unavailable/u,
    );
    assert.equal(gateway.actionCalls.length, 0);
    assert.equal((await actionRepository.listUndeliveredAuditEvents()).length, 1);

    const events: IncidentAuditEvent[] = [];
    const recovered = service(processRepository, actionRepository, gateway, {
      record: async ({ event }) => {
        events.push(structuredClone(event));
        return events.length;
      },
    });
    const result = await recovered.submitAuthorized(
      { actorId: "operator" },
      "action",
      published.interactions[0],
    );
    assert.equal(result.kind === "result" && result.result.state, "committed");
    assert.equal(gateway.actionCalls.length, 1);
    assert.deepEqual(events.map(({ outcome }) => outcome), ["reserved", "committed"]);
    assert.equal((await actionRepository.listUndeliveredAuditEvents()).length, 0);
  });
});

test("converges response loss and restart and coalesces one in-process same-action call", async () => {
  await withStore(async ({ processRepository, actionRepository, databaseFile }) => {
    const published = incidentPublication("instance", false);
    await processRepository.recordConfirmed(publication("instance"));
    const lost = gatewayFor([published], async () => { throw new Error("response lost"); });
    const first = service(processRepository, actionRepository, lost);
    const uncertain = await first.submitAuthorized(
      { actorId: "operator" },
      "action",
      published.interactions[0],
    );
    assert.equal(uncertain.kind === "result" && uncertain.result.state, "indeterminate");
    actionRepository.close();

    const reopened = new SqliteIncidentActionRepository(databaseFile);
    try {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const recoveredGateway = gatewayFor([published], async ({ stimulus }) => {
        await gate;
        return { kind: "semantic", commandId: stimulus.commandId, outcome: "committed" };
      });
      const recovered = service(processRepository, reopened, recoveredGateway);
      const left = recovered.submitAuthorized(
        { actorId: "operator" },
        "action",
        published.interactions[0],
      );
      const right = recovered.submitAuthorized(
        { actorId: "operator" },
        "action",
        published.interactions[0],
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(recoveredGateway.actionCalls.length, 1);
      release();
      assert.deepEqual(await left, await right);
      assert.equal((await left).kind, "result");
    } finally {
      reopened.close();
    }
  });
});

test("maps only exact committed semantic results to committed and every uncertainty to indeterminate", async () => {
  await withStore(async ({ processRepository, actionRepository }) => {
    const published = incidentPublication("instance", false);
    await processRepository.recordConfirmed(publication("instance"));
    const outcomes = new Map<string, unknown>([
      ["committed", { kind: "semantic", commandId: "committed", outcome: "committed" }],
      ["rolled", { kind: "semantic", commandId: "rolled", outcome: "rolledBack" }],
      ["rejected", { kind: "semantic", commandId: "rejected", outcome: "rejected" }],
      ["failure", { kind: "semantic", commandId: "failure", outcome: "semanticFailure" }],
      ["unsupported", { kind: "semantic", commandId: "unsupported", outcome: "unsupported" }],
      ["unknown", { kind: "processUnknown", commandId: "unknown", processInstanceId: "instance" }],
      ["mismatch", { kind: "semantic", commandId: "another-action", outcome: "committed" }],
    ]);
    const gateway = gatewayFor([published], async ({ stimulus }) =>
      structuredClone(outcomes.get(stimulus.commandId))
    );
    const mutations = service(processRepository, actionRepository, gateway);
    const results = new Map<string, string>();
    for (const actionId of outcomes.keys()) {
      const result = await mutations.submitAuthorized(
        { actorId: "operator" },
        actionId,
        published.interactions[0],
      );
      if (result.kind !== "result") assert.fail(`unexpected ${result.kind}`);
      results.set(actionId, result.result.state);
    }
    assert.deepEqual(Object.fromEntries(results), {
      committed: "committed",
      rolled: "rejected",
      rejected: "rejected",
      failure: "rejected",
      unsupported: "rejected",
      unknown: "indeterminate",
      mismatch: "indeterminate",
    });
  });
});

function service(
  processRepository: SqliteProcessInstanceRepository,
  actionRepository: SqliteIncidentActionRepository,
  gateway: ReturnType<typeof gatewayFor>,
  sink = { record: async (_item: IncidentAuditOutboxItem) => 1 },
) {
  const timestampByOutcome = {
    reserved: "2026-08-14T00:00:00.001Z",
    committed: "2026-08-14T00:00:00.002Z",
    rejected: "2026-08-14T00:00:00.003Z",
    indeterminate: "2026-08-14T00:00:00.004Z",
  } as const;
  return new IncidentMutationService({
    aggregation: new IncidentAggregationService({ repository: processRepository, gateway }),
    repository: actionRepository,
    gateway,
    outbox: new IncidentActionAuditOutboxService(actionRepository, sink),
    auditEvents: {
      create: (seed) => ({
        ...structuredClone(seed),
        eventId: `event-${seed.actionId}-${seed.outcome}`,
        recordedAt: timestampByOutcome[seed.outcome],
      }),
    },
  });
}

function gatewayFor(
  incidents: ReadonlyArray<ReturnType<typeof incidentPublication>>,
  submit: (request: Readonly<{ stimulus: IncidentActionRequest & { commandId: string } }>) => Promise<unknown>,
) {
  const actionCalls: Array<Readonly<{ stimulus: IncidentActionRequest & { commandId: string } }>> = [];
  return {
    actionCalls,
    observeIncidents: async () => ({ status: "observed", incidents: structuredClone(incidents) }),
    submitIncidentOperation: async (request: Readonly<{ stimulus: IncidentActionRequest & { commandId: string } }>) => {
      actionCalls.push(structuredClone(request));
      return submit(request);
    },
  };
}

function incidentPublication(processInstanceId: string, cancellable: boolean) {
  const effectId = { processInstanceId, elementId: "ServiceTask", activation: 1 } as const;
  const incidentId = { effectId, generation: 1 } as const;
  const retry = { kind: "retryIncident", incidentId } as const;
  const cancel = { kind: "cancelIncidentProcess", processInstanceId, incidentId } as const;
  return {
    incident: {
      kind: "effectExecutionFailed",
      id: incidentId,
      effect: {
        id: effectId,
        descriptor: { protocol: "demo", operation: "invoke" },
        arguments: [],
      },
    },
    interactions: cancellable ? [retry, cancel] as const : [retry] as const,
  };
}

function publication(processInstanceId: string) {
  return {
    instance: instance(processInstanceId),
    locator: `bpmn-process-work-v1:${processInstanceId}`,
  } as const;
}

function instance(processInstanceId: string): PublicProcessInstanceIdentity {
  return {
    processInstanceId,
    definition: {
      processId: "Process_Incident",
      version: 1,
      source: {
        kind: "bpmnSource",
        id: "source",
        sha256: "a".repeat(64),
        byteLength: 1,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "cibseven-incident",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  };
}

async function withStore(
  run: (stores: Readonly<{
    processRepository: SqliteProcessInstanceRepository;
    actionRepository: SqliteIncidentActionRepository;
    databaseFile: string;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-incident-actions-"));
  const databaseFile = join(root, "operate.sqlite");
  const processRepository = new SqliteProcessInstanceRepository(databaseFile);
  const actionRepository = new SqliteIncidentActionRepository(databaseFile);
  try {
    await run({ processRepository, actionRepository, databaseFile });
  } finally {
    if (processRepository.isOpen) processRepository.close();
    if (actionRepository.isOpen) actionRepository.close();
    await rm(root, { recursive: true, force: true });
  }
}
