import assert from "node:assert/strict";
import test from "node:test";

import {
  LeaseMutationResult,
  RecoveryHandlerOutcomeKind,
} from "@bpmn-lean/platform-recovery-runtime";
import {
  PostgresqlDefinitionsRecoveryIntermediateResult,
  PostgresqlDefinitionsRecoveryStepKind,
} from "@bpmn-lean/platform-definitions";

import {
  createRecoveryLoops,
  handleDefinitionsRecoveryStep,
  mapOperateRecoveryStep,
  prepareIncidentActionRecovery,
  RecoveryWorkerFamily,
  recoveryWorkerFamilies,
} from "../dist/family-loops.js";

const encoder = new TextEncoder();

test("declares exactly the eleven closed recovery families", () => {
  assert.deepEqual(recoveryWorkerFamilies, [
    RecoveryWorkerFamily.DefinitionsConfirmedRegistration,
    RecoveryWorkerFamily.DefinitionsDirectStart,
    RecoveryWorkerFamily.DefinitionsSchedule,
    RecoveryWorkerFamily.DefinitionsMessageStart,
    RecoveryWorkerFamily.OperateIncidentAction,
    RecoveryWorkerFamily.OperateIncidentAudit,
    RecoveryWorkerFamily.OperateCommittedExecution,
    RecoveryWorkerFamily.OperateFlowNodeOccurrence,
    RecoveryWorkerFamily.OperateIncidentSnapshot,
    RecoveryWorkerFamily.WorkAudit,
    RecoveryWorkerFamily.WorkSnapshot,
  ]);
  assert.equal(recoveryWorkerFamilies.length, 11);
});

test("refuses missing, duplicate, and additional bindings", () => {
  const bindings = recoveryWorkerFamilies.map((family) => binding(family));
  const options = loopOptions();
  assert.equal(createRecoveryLoops({ ...options, bindings }).length, 11);
  assert.throws(
    () => createRecoveryLoops({ ...options, bindings: bindings.slice(1) }),
    /exactly eleven/u,
  );
  assert.throws(
    () => createRecoveryLoops({ ...options, bindings: [...bindings, binding("extra")] }),
    /exactly eleven/u,
  );
  assert.throws(
    () => createRecoveryLoops({ ...options, bindings: [bindings[0]!, ...bindings.slice(0, -1)] }),
    /duplicate|closed recovery family/u,
  );
});

test("Definitions intermediate continuation requires both generic and module ownership", async () => {
  let continued = 0;
  const intermediate = () => ({
    kind: PostgresqlDefinitionsRecoveryStepKind.Intermediate,
    applyWhileOwned: async () => PostgresqlDefinitionsRecoveryIntermediateResult.Applied,
    continue: async () => {
      continued += 1;
      return {
        kind: PostgresqlDefinitionsRecoveryStepKind.Complete,
        apply: async () => undefined,
      };
    },
  } as const);
  const leaseLost = await handleDefinitionsRecoveryStep(
    async () => intermediate(),
    encoder.encode("candidate"),
    handlerContext(async () => LeaseMutationResult.LeaseLost),
  );
  assert.equal(leaseLost.kind, RecoveryHandlerOutcomeKind.Complete);
  assert.equal(continued, 0);

  const moduleLost = await handleDefinitionsRecoveryStep(
    async () => ({
      ...intermediate(),
      applyWhileOwned: async () => PostgresqlDefinitionsRecoveryIntermediateResult.LeaseLost,
    }),
    encoder.encode("candidate"),
    handlerContext(async (apply) => {
      await apply({ query: async () => ({ rows: [], rowCount: 0 }) });
      return LeaseMutationResult.Applied;
    }),
  );
  assert.equal(moduleLost.kind, RecoveryHandlerOutcomeKind.Complete);
  assert.equal(continued, 0);

  const applied = await handleDefinitionsRecoveryStep(
    async () => intermediate(),
    encoder.encode("candidate"),
    handlerContext(async (apply) => {
      await apply({ query: async () => ({ rows: [], rowCount: 0 }) });
      return LeaseMutationResult.Applied;
    }),
  );
  assert.equal(applied.kind, RecoveryHandlerOutcomeKind.Complete);
  assert.equal(continued, 1);
});

test("incident action uses bounded reconcileAction and maps reserved Audit to Retry", async () => {
  let actionCalls = 0;
  let allCalls = 0;
  const result = await prepareIncidentActionRecovery({
    reconcileAction: async (actionId: string) => {
      actionCalls += 1;
      assert.equal(actionId, "action\u0000id");
      return { kind: "retry", reason: "reservedAuditPending" };
    },
    reconcileAll: async () => { allCalls += 1; },
  }, encoder.encode("action\u0000id"));
  assert.equal(result.kind, RecoveryHandlerOutcomeKind.Retry);
  assert.equal(actionCalls, 1);
  assert.equal(allCalls, 0);
});

test("closed domain failure evidence is deterministic bounded data and handler infrastructure escapes", async () => {
  const failure = mapOperateRecoveryStep({
    kind: "fail",
    code: "storedCorruption",
    evidence: "registrationAndProjection",
  });
  assert.equal(failure.kind, RecoveryHandlerOutcomeKind.Fail);
  if (failure.kind !== RecoveryHandlerOutcomeKind.Fail) return;
  assert.equal(failure.failureCode, "storedCorruption");
  assert.equal(
    new TextDecoder().decode(failure.failureEvidence),
    '["storedCorruption","registrationAndProjection"]',
  );
  assert.ok(failure.failureEvidence.byteLength < 4_096);

  const infrastructure = new Error("postgresql driver failure with credential text");
  await assert.rejects(
    handleDefinitionsRecoveryStep(
      async () => { throw infrastructure; },
      encoder.encode("candidate"),
      handlerContext(async () => LeaseMutationResult.Applied),
    ),
    (error: unknown) => error === infrastructure,
  );
});

function binding(family: string) {
  return {
    family,
    listCandidateKeys: async () => [],
    handle: async () => ({
      kind: RecoveryHandlerOutcomeKind.Complete,
      apply: async () => undefined,
    }),
  };
}

function loopOptions() {
  return {
    store: {
      claimCandidates: async () => [],
      applyWhileOwned: async () => LeaseMutationResult.LeaseLost,
      complete: async () => LeaseMutationResult.LeaseLost,
      retry: async () => LeaseMutationResult.LeaseLost,
      fail: async () => LeaseMutationResult.LeaseLost,
    },
    workerId: encoder.encode("worker"),
    batchSize: 1,
    leaseDurationMs: 30_000,
    itemDeadlineMs: 10_000,
    retryDelayMs: 1_000,
    concurrency: 1,
    pollingDelayMs: 250,
    createLeaseToken: () => "00000000-0000-4000-8000-000000000001",
  };
}

function handlerContext(
  applyWhileOwned: Parameters<typeof handleDefinitionsRecoveryStep>[2]["applyWhileOwned"],
) {
  return {
    deadlineEpochMs: Date.now() + 10_000,
    signal: new AbortController().signal,
    applyWhileOwned,
  };
}
