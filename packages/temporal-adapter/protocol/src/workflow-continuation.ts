import {
  ActivityBodyKind,
  ActivityHandlerKind,
  ControlStateKind,
  LocalDataOwnerKind,
  MappingExpressionKind,
  SemanticOriginKind,
  enabledInternalOperationCount,
  isGateAdmissibleRuntimeState,
  isMessageChannel,
  isStableStateResumable,
  isUserTaskMetadata,
  isVariablePatch,
  isWellFormedWireString,
  observeStableState,
  projectCurrentControlPositions,
  projectOpenFlowNodeOccurrences,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  ProcessStartStimulus,
  RuntimeState,
  SemanticProcessIdentity,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import type {
  MessageDeliveryRecord,
} from "./contracts.js";
import type {
  WorkflowChainRecoveryEntry,
} from "./workflow-chain.js";
import {
  WorkflowChainBudgetKind,
  canonicalWorkflowChainJson,
  requireWorkflowChainCanonicalByteBudget,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "./workflow-chain.js";
import { requireWorkflowChainPlainDataTree } from "./workflow-chain-plain-data.js";
import { isMessageDeliveryRecord } from "./lifecycle-results.js";
import type {
  BpmnWorkflowContinuationPublicationV1,
} from "./workflow-publication-segments.js";

export type {
  BpmnWorkflowContinuationPublicationV1,
} from "./workflow-publication-segments.js";

export const bpmnWorkflowContinuationV1 =
  "bpmn-lean.workflow-continuation.v1" as const;
export const bpmnWorkflowChainPatchId = "bpmn-workflow-chain-v1" as const;
export const bpmnWorkflowRolloverInProgressFailureType =
  "BpmnWorkflowRolloverInProgress" as const;

export enum BpmnWorkflowHostInputKind {
  Initial = "initial",
  Continuation = "continuation",
}

/** Explicit initial input used only by the direct first-green host witness. */
export type BpmnWorkflowInitialHostInputV1 = DeepReadonly<{
  protocol: typeof bpmnWorkflowContinuationV1;
  kind: BpmnWorkflowHostInputKind.Initial;
  eventHistoryEventLimit: number;
  eventHistoryByteLimit: number;
}>;

/** Private chain metadata. Run identity remains absent from every public engine contract. */
export type BpmnWorkflowContinuationHostInputV1 = DeepReadonly<{
  protocol: typeof bpmnWorkflowContinuationV1;
  kind: BpmnWorkflowHostInputKind.Continuation;
  eventHistoryEventLimit: number;
  eventHistoryByteLimit: number;
  runOrdinal: number;
  firstExecutionRunId: string;
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  startCommandId: string;
  publicationSegmentDirectorySha256: string;
  completedMessageDeliveryRecords: MessageDeliveryRecord[];
}>;

export type BpmnWorkflowHostInputV1 =
  | BpmnWorkflowInitialHostInputV1
  | BpmnWorkflowContinuationHostInputV1;

export function requireBpmnWorkflowHostInputV1(
  value: unknown,
): BpmnWorkflowHostInputV1 {
  requireWorkflowChainPlainDataTree(value);
  if (!isRecord(value) || value.protocol !== bpmnWorkflowContinuationV1) {
    throw new TypeError("Unsupported Workflow continuation schema");
  }
  if (
    !Number.isSafeInteger(value.eventHistoryEventLimit) ||
    Number(value.eventHistoryEventLimit) < 1 ||
    Number(value.eventHistoryEventLimit) >
      workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryEvents)
  ) {
    throw new RangeError("Event History event limit is outside production bounds");
  }
  if (
    !Number.isSafeInteger(value.eventHistoryByteLimit) ||
    Number(value.eventHistoryByteLimit) < 1 ||
    Number(value.eventHistoryByteLimit) >
      workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes)
  ) {
    throw new RangeError("Event History byte limit is outside production bounds");
  }
  switch (value.kind) {
    case BpmnWorkflowHostInputKind.Initial:
      requireOnlyKeys(value, [
        "protocol", "kind", "eventHistoryEventLimit", "eventHistoryByteLimit",
      ]);
      return value as BpmnWorkflowInitialHostInputV1;
    case BpmnWorkflowHostInputKind.Continuation:
      requireOnlyKeys(value, [
        "protocol", "kind", "eventHistoryEventLimit", "eventHistoryByteLimit", "runOrdinal",
        "firstExecutionRunId", "definition", "processId", "processInstanceId",
        "startCommandId", "publicationSegmentDirectorySha256",
        "completedMessageDeliveryRecords",
      ]);
      if (
        !Number.isSafeInteger(value.runOrdinal) ||
        Number(value.runOrdinal) < 2 ||
        Number(value.runOrdinal) >
          workflowChainProductionLimit(WorkflowChainBudgetKind.WorkflowChainRuns) ||
        !isNonemptyString(value.firstExecutionRunId) ||
        !isNonemptyString(value.processId) ||
        !isNonemptyString(value.processInstanceId) ||
        !isNonemptyString(value.startCommandId) ||
        !isSha256(value.publicationSegmentDirectorySha256) ||
        !Array.isArray(value.completedMessageDeliveryRecords) ||
        !value.completedMessageDeliveryRecords.every(isMessageDeliveryRecord)
      ) {
        throw new TypeError("Malformed Workflow continuation metadata");
      }
      return value as BpmnWorkflowContinuationHostInputV1;
    default:
      throw new TypeError("Unknown Workflow continuation variant");
  }
}

/** The committed semantic state is a separate, independently measured Temporal argument. */
export type BpmnWorkflowContinuationStateV1 = RuntimeState;

/**
 * Whether recovered logical time still precedes every live deadline.
 *
 * This is where the one monotonicity fact the state conjuncts cannot supply is discharged. Every
 * time-advancing arm takes logical time from the deadline it fires after checking only that the
 * stimulus instant equals it, so a recovered state holding a live deadline *below* current logical
 * time would let the next firing move time backwards. A transition cannot produce such a state, but
 * a Run boundary is where one re-enters the account without passing a transition.
 */
function recoveredTimeIsBelowEveryLiveDeadline(state: RuntimeState): boolean {
  return state.timerWaits.every(({ deadlineMs }) => state.logicalTimeMs <= deadlineMs);
}

export function requireBpmnWorkflowContinuationStateV1(
  value: unknown,
  program: SemanticProcessProgram,
  processInstanceId: string,
): BpmnWorkflowContinuationStateV1 {
  requireWorkflowChainPlainDataTree(value);
  if (!isRuntimeState(value) ||
    value.control.kind !== ControlStateKind.Running ||
    value.control.instanceId !== processInstanceId) {
    throw new TypeError("Malformed committed RuntimeState continuation");
  }
  const observation = observeStableState(program, value);
  const positions = projectCurrentControlPositions(program, value);
  const occurrences = projectOpenFlowNodeOccurrences(program, value);
  if (observation === null || positions === null || occurrences === null ||
    !isStableStateResumable(value) || enabledInternalOperationCount(program, value) !== 0) {
    throw new TypeError("RuntimeState is not one resumable stable checkpoint");
  }
  if (!isGateAdmissibleRuntimeState(program, processInstanceId, value) ||
    !recoveredTimeIsBelowEveryLiveDeadline(value)) {
    throw new TypeError("RuntimeState is not one representable committed state");
  }
  return value;
}

/** Lifetime command recovery is a separate, independently measured Temporal argument. */
export type BpmnWorkflowContinuationRecoveryV1 = DeepReadonly<{
  entries: WorkflowChainRecoveryEntry[];
}>;

export type WorkflowContinuationBudgetViolation = Readonly<{
  budget: WorkflowChainBudgetKind;
  observedValue: number;
  configuredBound: number;
}>;

export function requireWorkflowChainInitialArgumentBudgets(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
): void {
  requireWorkflowChainCanonicalByteBudget(
    WorkflowChainBudgetKind.InitialStartStimulusBytes,
    start,
  );
  requireWorkflowChainCanonicalByteBudget(
    WorkflowChainBudgetKind.SemanticProcessProgramBytes,
    program,
  );
}

/** Measures each carried argument and their aggregate without classifying the caller. */
export function workflowContinuationBudgetViolation(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
  host: BpmnWorkflowContinuationHostInputV1,
  state: RuntimeState,
  recovery: BpmnWorkflowContinuationRecoveryV1,
  publication: BpmnWorkflowContinuationPublicationV1,
): WorkflowContinuationBudgetViolation | null {
  const measured: ReadonlyArray<readonly [WorkflowChainBudgetKind, unknown]> = [
    [WorkflowChainBudgetKind.InitialStartStimulusBytes, start],
    [WorkflowChainBudgetKind.SemanticProcessProgramBytes, program],
    [WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes, host],
    [WorkflowChainBudgetKind.CommittedRuntimeStateBytes, state],
    [WorkflowChainBudgetKind.CommandRecoveryLedgerBytes, recovery.entries],
    [WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes, publication],
  ];
  for (const [budget, value] of measured) {
    const observedValue = workflowChainCanonicalUtf8ByteLength(value);
    const configuredBound = workflowChainProductionLimit(budget);
    if (observedValue > configuredBound) {
      return { budget, observedValue, configuredBound };
    }
  }
  // Temporal transports six separate payloads. Array brackets and separators are not carried.
  const observedValue = [start, program, host, state, recovery, publication]
    .reduce(
      (total, value) => total + workflowChainCanonicalUtf8ByteLength(value),
      0,
    );
  const configuredBound = workflowChainProductionLimit(
    WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes,
  );
  if (observedValue > configuredBound) {
    return {
      budget: WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes,
      observedValue,
      configuredBound,
    };
  }
  return null;
}

function isRuntimeState(value: unknown): value is RuntimeState {
  if (!isRecord(value)) return false;
  const keys = [
    "control", "initiationPending", "scopeOccurrences", "controlTokens",
    "userTaskWaits", "messageWaits", "timerWaits", "effectWaits",
    "effectIncidents", "selectedBranchSets", "eventRaces",
    "calledProcessOccurrences", "activityOccurrences",
    ...(Object.hasOwn(value, "sequentialMultiInstanceControllers")
      ? ["sequentialMultiInstanceControllers"]
      : []),
    ...(Object.hasOwn(value, "parallelMultiInstanceControllers")
      ? ["parallelMultiInstanceControllers"]
      : []),
    "variables",
    "taskActivations", "messageActivations", "timerActivations",
    "eventRaceActivations", "callActivations", "effectActivations",
    "scopeActivations", "activityActivations",
    "endOccurrences", "logicalTimeMs",
  ];
  if (!hasOnlyKeys(value, keys) ||
    !isRecord(value.control) || !hasOnlyKeys(value.control, ["kind", "instanceId"]) ||
    value.control.kind !== ControlStateKind.Running ||
    !isNonemptyString(value.control.instanceId) ||
    typeof value.initiationPending !== "boolean" ||
    !isList(value.scopeOccurrences, isScopeOccurrence) ||
    !isList(value.controlTokens, isControlToken) ||
    !isList(value.userTaskWaits, isUserTaskWait) ||
    !isList(value.messageWaits, isMessageWait) ||
    !isList(value.timerWaits, isTimerWait) ||
    !isList(value.effectWaits, isEffectWait) ||
    !isList(value.effectIncidents, isEffectIncident) ||
    !isList(value.selectedBranchSets, isSelectedBranchSet) ||
    !isList(value.eventRaces, isEventRace) ||
    !isList(value.calledProcessOccurrences, isCalledProcessOccurrence) ||
    !isList(value.activityOccurrences, isActivityOccurrence) ||
    (Object.hasOwn(value, "sequentialMultiInstanceControllers") &&
      !isList(value.sequentialMultiInstanceControllers, isSequentialMultiInstanceController)) ||
    (Object.hasOwn(value, "parallelMultiInstanceControllers") &&
      !isList(value.parallelMultiInstanceControllers, isParallelMultiInstanceController)) ||
    !isScopedVariables(value.variables) ||
    !isList(value.taskActivations, isActivationCounter) ||
    !isList(value.messageActivations, isActivationCounter) ||
    !isList(value.timerActivations, isActivationCounter) ||
    !isList(value.eventRaceActivations, isActivationCounter) ||
    !isList(value.callActivations, isActivationCounter) ||
    !isList(value.effectActivations, isActivationCounter) ||
    !isList(value.scopeActivations, isActivationCounter) ||
    !isList(value.activityActivations, isActivationCounter) ||
    !isSafeInteger(value.endOccurrences, 0) || !isSafeInteger(value.logicalTimeMs, 0)) {
    return false;
  }
  return true;
}

/**
 * One Activity occurrence ownership record, decoded structurally.
 *
 * A continuation that loses, duplicates, or substitutes a record is invalid before Workflow
 * evaluation, because the record is the only thing joining a body to the handler waits attached to it.
 * Every admitted body arm checks its payload against that arm's own identity shape, so a task
 * identity cannot be carried in a child-scope position.
 */
function isActivityOccurrence(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, ["id", "owner", "operationId", "body", "attachedHandlers"]) &&
    isActivityOccurrenceId(value.id) &&
    isScopeId(value.owner) &&
    isNonemptyString(value.operationId) &&
    isActivityBody(value.body) &&
    isList(value.attachedHandlers, isActivityHandlerOccurrence);
}

function isActivityHandlerOccurrence(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["kind", "occurrence"]) &&
    (value.kind === ActivityHandlerKind.Timer || value.kind === ActivityHandlerKind.Message) &&
    isOccurrenceId(value.occurrence);
}

function isSequentialMultiInstanceController(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["id", "snapshot", "outputSlots"]) &&
    isActivityOccurrenceId(value.id) &&
    isList(value.snapshot, isWireString) &&
    isList(value.outputSlots, isWireString);
}

function isParallelMultiInstanceController(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["id", "snapshot", "slots"]) &&
    isActivityOccurrenceId(value.id) && isList(value.snapshot, isWireString) &&
    isList(value.slots, isParallelMultiInstanceSlot);
}

function isParallelMultiInstanceSlot(value: unknown): boolean {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "pending":
      return hasOnlyKeys(value, ["kind", "taskId"]) &&
        isOccurrenceId(value.taskId);
    case "completed":
      return hasOnlyKeys(value, ["kind", "taskId", "result"]) &&
        isOccurrenceId(value.taskId) && isWireString(value.result);
    default:
      return false;
  }
}

function isActivityOccurrenceId(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, ["processInstanceId", "activityElementId", "activation"]) &&
    isNonemptyString(value.processInstanceId) &&
    isNonemptyString(value.activityElementId) &&
    isSafeInteger(value.activation, 1);
}

function isActivityBody(value: unknown): boolean {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case ActivityBodyKind.UserTask:
      return hasOnlyKeys(value, ["kind", "task"]) && isOccurrenceId(value.task);
    case ActivityBodyKind.ParallelUserTasks:
      return hasOnlyKeys(value, ["kind", "tasks"]) &&
        isList(value.tasks, isOccurrenceId) && value.tasks.length > 0;
    case ActivityBodyKind.ChildScope:
      return hasOnlyKeys(value, ["kind", "scope"]) && isScopeId(value.scope);
    default:
      return false;
  }
}

function isScopeOccurrence(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["id", "parent"]) &&
    isScopeId(value.id) && (value.parent === null || isScopeId(value.parent));
}

function isControlToken(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["placeId", "owner", "multiplicity"]) &&
    isNonemptyString(value.placeId) && isScopeId(value.owner) &&
    isSafeInteger(value.multiplicity, 1);
}

function isUserTaskWait(value: unknown): boolean {
  const keys = isRecord(value) && Object.hasOwn(value, "metadata")
    ? ["id", "owner", "name", "metadata", "output"]
    : ["id", "owner", "name", "output"];
  return isRecord(value) && hasOnlyKeys(value, keys) && isOccurrenceId(value.id) &&
    isScopeId(value.owner) && (value.name === null || isWireString(value.name)) &&
    (!Object.hasOwn(value, "metadata") || isUserTaskMetadata(value.metadata)) &&
    isNonemptyString(value.output);
}

function isMessageWait(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["id", "owner", "channel", "output"]) &&
    isOccurrenceId(value.id) && isScopeId(value.owner) &&
    isMessageChannel(value.channel) && isNonemptyString(value.output);
}

function isTimerWait(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["id", "owner", "deadlineMs", "output"]) &&
    isOccurrenceId(value.id) && isScopeId(value.owner) &&
    isSafeInteger(value.deadlineMs, 0) && isNonemptyString(value.output);
}

function isEffectWait(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, [
    "id", "owner", "descriptor", "arguments", "outputMappings",
    "bpmnErrorRoute", "output", "incidentAlreadyRetried",
  ]) && isOccurrenceId(value.id) && isScopeId(value.owner) &&
    isEffectDescriptor(value.descriptor) && isVariablePatch(value.arguments) &&
    isList(value.outputMappings, isVariableMapping) &&
    (value.bpmnErrorRoute === null || isBpmnErrorRoute(value.bpmnErrorRoute)) &&
    isNonemptyString(value.output) && typeof value.incidentAlreadyRetried === "boolean";
}

function isEffectIncident(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["id", "wait"]) &&
    isEffectIncidentId(value.id) && isEffectWait(value.wait);
}

function isSelectedBranchSet(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["owner", "selectionKey", "expectedInputs"]) &&
    isScopeId(value.owner) && isNonemptyString(value.selectionKey) &&
    Array.isArray(value.expectedInputs) &&
    (value.expectedInputs.length === 1 || value.expectedInputs.length === 2) &&
    value.expectedInputs.every(isNonemptyString) &&
    new Set(value.expectedInputs).size === value.expectedInputs.length;
}

function isEventRace(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, [
    "id", "owner", "messageSubscriptionId", "timerOccurrenceId",
  ]) && isOccurrenceId(value.id) && isScopeId(value.owner) &&
    isOccurrenceId(value.messageSubscriptionId) && isOccurrenceId(value.timerOccurrenceId);
}

function isCalledProcessOccurrence(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, [
    "id", "caller", "calledProcessId", "calledRoot", "returnOperationId",
  ]) && isOccurrenceId(value.id) && isScopeId(value.caller) &&
    isNonemptyString(value.calledProcessId) && isScopeId(value.calledRoot) &&
    isNonemptyString(value.returnOperationId);
}

function isScopedVariables(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["process", "activities"]) &&
    isRecord(value.process) && hasOnlyKeys(value.process, ["bindings"]) &&
    isVariablePatch(value.process.bindings) && isList(value.activities, (activity) =>
      isRecord(activity) && hasOnlyKeys(activity, ["owner", "bindings"]) &&
      isLocalDataOwner(activity.owner) && isVariablePatch(activity.bindings));
}

function isLocalDataOwner(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ["kind", "id"])) return false;
  switch (value.kind) {
    case LocalDataOwnerKind.EffectOccurrence:
      return isOccurrenceId(value.id);
    case LocalDataOwnerKind.ActivityOccurrence:
      return isActivityOccurrenceId(value.id);
    default:
      return false;
  }
}

function isActivationCounter(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["elementId", "count"]) &&
    isNonemptyString(value.elementId) && isSafeInteger(value.count, 1);
}

function isEffectDescriptor(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["protocol", "operation"]) &&
    isNonemptyString(value.protocol) && isNonemptyString(value.operation);
}

function isVariableMapping(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ["target", "expression"]) ||
    !isNonemptyString(value.target) || !isRecord(value.expression)) return false;
  switch (value.expression.kind) {
    case MappingExpressionKind.StringLiteral:
      return hasOnlyKeys(value.expression, ["kind", "value"]) &&
        isWireString(value.expression.value);
    case MappingExpressionKind.LocalVariable:
      return hasOnlyKeys(value.expression, ["kind", "name"]) &&
        isNonemptyString(value.expression.name);
    default:
      return false;
  }
}

function isBpmnErrorRoute(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["code", "output", "origin"]) &&
    isNonemptyString(value.code) && isNonemptyString(value.output) &&
    isRecord(value.origin) && hasOnlyKeys(value.origin, [
      "kind", "boundaryEventId", "errorDefinitionId", "errorElementId", "sequenceFlowId",
    ]) && value.origin.kind === SemanticOriginKind.BpmnElement &&
    isNonemptyString(value.origin.boundaryEventId) &&
    isNonemptyString(value.origin.errorDefinitionId) &&
    isNonemptyString(value.origin.errorElementId) &&
    isNonemptyString(value.origin.sequenceFlowId);
}

function isEffectIncidentId(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["effectId", "generation"]) &&
    isOccurrenceId(value.effectId) && value.generation === 1;
}

function isOccurrenceId(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, [
    "processInstanceId", "elementId", "activation",
  ]) && isNonemptyString(value.processInstanceId) &&
    isNonemptyString(value.elementId) && isSafeInteger(value.activation, 1);
}

function isScopeId(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, [
    "processInstanceId", "definitionScopeId", "activation",
  ]) && isNonemptyString(value.processInstanceId) &&
    isNonemptyString(value.definitionScopeId) && isSafeInteger(value.activation, 1);
}

function isList(
  value: unknown,
  predicate: (candidate: unknown) => boolean,
): value is ReadonlyArray<unknown> {
  return Array.isArray(value) && value.every(predicate);
}

function isSafeInteger(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function isWireString(value: unknown): value is string {
  return isWellFormedWireString(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return isWireString(value) && value.length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  return Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}

function requireOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): void {
  if (!hasOnlyKeys(value, keys)) {
    throw new TypeError("Workflow continuation contains unknown fields");
  }
}
