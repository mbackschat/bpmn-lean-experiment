import {
  PostgresqlDefinitionsRecoveryIntermediateResult,
  PostgresqlDefinitionsRecoveryStepKind,
} from "@bpmn-lean/platform-definitions";
import type {
  IncidentActionReconciliationService,
  PostgresqlOperateRecoveryStepResult,
} from "@bpmn-lean/platform-operate";
import {
  decodeOperateRecoveryCandidateKey,
  PostgresqlOperateRecoveryStepKind,
} from "@bpmn-lean/platform-operate";
import {
  LeaseMutationResult,
  RecoveryHandlerOutcomeKind,
  RecoveryLoop,
} from "@bpmn-lean/platform-recovery-runtime";
import type {
  RecoveryHandlerContext,
  RecoveryHandlerOutcome,
  RecoveryLease,
  RecoveryLeaseStore,
  RecoveryLoopObserver,
} from "@bpmn-lean/platform-recovery-runtime";
import type {
  PostgresqlDefinitionsRecoveryStepResult,
} from "@bpmn-lean/platform-definitions";
import type {
  PostgresqlWorkSnapshotStepResult,
} from "@bpmn-lean/platform-work";
import {
  PostgresqlWorkSnapshotStepKind,
} from "@bpmn-lean/platform-work";

export const RecoveryWorkerFamily = Object.freeze({
  DefinitionsConfirmedRegistration: "definitions.confirmed-registration",
  DefinitionsDirectStart: "definitions.direct-start",
  DefinitionsSchedule: "definitions.schedule",
  DefinitionsMessageStart: "definitions.message-start",
  OperateIncidentAction: "operate.incident-action",
  OperateIncidentAudit: "operate.incident-audit",
  OperateCommittedExecution: "operate.committed-execution",
  OperateFlowNodeOccurrence: "operate.flow-node-occurrence",
  OperateIncidentSnapshot: "operate.incident-snapshot",
  WorkAudit: "work.audit",
  WorkSnapshot: "work.snapshot",
} as const);

export type RecoveryWorkerFamily = typeof RecoveryWorkerFamily[
  keyof typeof RecoveryWorkerFamily
];

export const recoveryWorkerFamilies: readonly RecoveryWorkerFamily[] = Object.freeze([
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

export type RecoveryFamilyBinding = Readonly<{
  family: string;
  listCandidateKeys: () => Promise<readonly Uint8Array[]>;
  handle: (
    lease: RecoveryLease,
    context: RecoveryHandlerContext,
  ) => Promise<RecoveryHandlerOutcome>;
}>;

export type SupervisedRecoveryLoop = Readonly<{
  family: RecoveryWorkerFamily;
  runUntilAborted(
    signal: AbortSignal,
    observeRun: RecoveryLoopObserver,
  ): Promise<void>;
}>;

export type CreateRecoveryLoopsOptions = Readonly<{
  store: RecoveryLeaseStore;
  bindings: readonly RecoveryFamilyBinding[];
  workerId: Uint8Array;
  batchSize: number;
  leaseDurationMs: number;
  itemDeadlineMs: number;
  retryDelayMs: number;
  concurrency: number;
  pollingDelayMs: number;
  createLeaseToken: () => string;
}>;

/** Validates the closed topology before constructing any independently supervised loop. */
export function createRecoveryLoops(
  options: CreateRecoveryLoopsOptions,
): readonly SupervisedRecoveryLoop[] {
  const bindings = exactBindings(options.bindings);
  return recoveryWorkerFamilies.map((family) => {
    const binding = bindings.get(family)!;
    const loop = new RecoveryLoop(options.store, {
      family,
      workerId: Uint8Array.from(options.workerId),
      batchSize: options.batchSize,
      leaseDurationMs: options.leaseDurationMs,
      itemDeadlineMs: options.itemDeadlineMs,
      retryDelayMs: options.retryDelayMs,
      concurrency: options.concurrency,
      pollingDelayMs: options.pollingDelayMs,
      createLeaseToken: options.createLeaseToken,
      listCandidateKeys: binding.listCandidateKeys,
      handle: binding.handle,
    });
    return {
      family,
      runUntilAborted: async (signal, observeRun) =>
        await loop.runUntilAborted(signal, observeRun),
    };
  });
}

/** Runs every Definitions intermediate behind both the generic and module-specific fences. */
export async function handleDefinitionsRecoveryStep(
  prepare: (itemKey: Uint8Array) => Promise<PostgresqlDefinitionsRecoveryStepResult>,
  itemKey: Uint8Array,
  context: RecoveryHandlerContext,
): Promise<RecoveryHandlerOutcome> {
  let result = await prepare(Uint8Array.from(itemKey));
  while (result.kind === PostgresqlDefinitionsRecoveryStepKind.Intermediate) {
    const intermediate = result;
    const moduleMutation: {
      value: typeof PostgresqlDefinitionsRecoveryIntermediateResult[
        keyof typeof PostgresqlDefinitionsRecoveryIntermediateResult
      ];
    } = { value: PostgresqlDefinitionsRecoveryIntermediateResult.LeaseLost };
    const genericMutation = await context.applyWhileOwned(async (session) => {
      moduleMutation.value = await intermediate.applyWhileOwned(session);
    });
    if (
      genericMutation !== LeaseMutationResult.Applied ||
      moduleMutation.value !== PostgresqlDefinitionsRecoveryIntermediateResult.Applied
    ) {
      return completeWithoutChange();
    }
    result = await intermediate.continue();
  }
  return mapDefinitionsResult(result);
}

/** Decodes only the Operate-owned candidate before bounded single-action reconciliation. */
export async function prepareIncidentActionRecovery(
  service: Pick<IncidentActionReconciliationService, "reconcileAction">,
  itemKey: Uint8Array,
): Promise<RecoveryHandlerOutcome> {
  const result = await service.reconcileAction(
    decodeOperateRecoveryCandidateKey(itemKey),
  );
  switch (result.kind) {
    case "complete":
      return { kind: RecoveryHandlerOutcomeKind.Complete, apply: result.apply };
    case "retry":
      return { kind: RecoveryHandlerOutcomeKind.Retry };
  }
}

export function mapOperateRecoveryStep(
  result: PostgresqlOperateRecoveryStepResult,
): RecoveryHandlerOutcome {
  switch (result.kind) {
    case PostgresqlOperateRecoveryStepKind.Complete:
      return { kind: RecoveryHandlerOutcomeKind.Complete, apply: result.apply };
    case PostgresqlOperateRecoveryStepKind.Retry:
      return { kind: RecoveryHandlerOutcomeKind.Retry };
    case PostgresqlOperateRecoveryStepKind.Fail:
      return failure(result.code, result.evidence);
  }
}

export function mapWorkSnapshotRecoveryStep(
  result: PostgresqlWorkSnapshotStepResult,
): RecoveryHandlerOutcome {
  switch (result.kind) {
    case PostgresqlWorkSnapshotStepKind.Complete:
      return { kind: RecoveryHandlerOutcomeKind.Complete, apply: result.apply };
    case PostgresqlWorkSnapshotStepKind.Retry:
      return { kind: RecoveryHandlerOutcomeKind.Retry };
    case PostgresqlWorkSnapshotStepKind.Fail:
      return failure(result.code, result.evidence);
  }
}

function mapDefinitionsResult(
  result: Exclude<PostgresqlDefinitionsRecoveryStepResult, { kind: "intermediate" }>,
): RecoveryHandlerOutcome {
  switch (result.kind) {
    case PostgresqlDefinitionsRecoveryStepKind.Complete:
      return { kind: RecoveryHandlerOutcomeKind.Complete, apply: result.apply };
    case PostgresqlDefinitionsRecoveryStepKind.Retry:
      return { kind: RecoveryHandlerOutcomeKind.Retry };
    case PostgresqlDefinitionsRecoveryStepKind.Fail:
      return failure(result.code, result.evidence);
  }
}

function failure(code: string, evidence: string): RecoveryHandlerOutcome {
  return {
    kind: RecoveryHandlerOutcomeKind.Fail,
    failureCode: code,
    failureEvidence: new TextEncoder().encode(JSON.stringify([code, evidence])),
  };
}

function completeWithoutChange(): RecoveryHandlerOutcome {
  return {
    kind: RecoveryHandlerOutcomeKind.Complete,
    apply: async () => undefined,
  };
}

function exactBindings(
  values: readonly RecoveryFamilyBinding[],
): ReadonlyMap<RecoveryWorkerFamily, RecoveryFamilyBinding> {
  if (values.length !== recoveryWorkerFamilies.length) {
    throw new TypeError("recovery-worker requires exactly eleven family bindings");
  }
  const allowed = new Set<string>(recoveryWorkerFamilies);
  const result = new Map<RecoveryWorkerFamily, RecoveryFamilyBinding>();
  for (const binding of values) {
    if (!allowed.has(binding.family)) {
      throw new TypeError("recovery-worker binding is not a closed recovery family");
    }
    const family = binding.family as RecoveryWorkerFamily;
    if (result.has(family)) {
      throw new TypeError("recovery-worker has a duplicate family binding");
    }
    result.set(family, binding);
  }
  if (result.size !== recoveryWorkerFamilies.length) {
    throw new TypeError("recovery-worker requires every closed recovery family");
  }
  return result;
}
