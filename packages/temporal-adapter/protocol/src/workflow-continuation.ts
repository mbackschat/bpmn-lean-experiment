import {
  ControlStateKind,
  MappingExpressionKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOriginKind,
  enabledInternalOperationCount,
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
  SemanticFlowNodeOccurrenceAnchor,
  SemanticProcessIdentity,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import type {
  MessageDeliveryRecord,
} from "./contracts.js";
import type {
  OpenFlowNodeOccurrence,
} from "./flow-node-occurrence-publication.js";
import {
  FlowNodeOccurrencePublicationResultKind,
  requireFlowNodeOccurrencePublicationResult,
} from "./flow-node-occurrence-publication.js";
import type {
  CurrentCommittedExecution,
} from "./semantic-publication.js";
import { requireExecutionPublicationPage } from "./semantic-publication.js";
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
import { isMessageDeliveryRecord } from "./lifecycle-results.js";

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
}>;

/** Private chain metadata. Run identity remains absent from every public engine contract. */
export type BpmnWorkflowContinuationHostInputV1 = DeepReadonly<{
  protocol: typeof bpmnWorkflowContinuationV1;
  kind: BpmnWorkflowHostInputKind.Continuation;
  eventHistoryEventLimit: number;
  runOrdinal: number;
  firstExecutionRunId: string;
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  startCommandId: string;
  completedMessageDeliveryRecords: MessageDeliveryRecord[];
}>;

export type BpmnWorkflowHostInputV1 =
  | BpmnWorkflowInitialHostInputV1
  | BpmnWorkflowContinuationHostInputV1;

export function requireBpmnWorkflowHostInputV1(
  value: unknown,
): BpmnWorkflowHostInputV1 {
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
  switch (value.kind) {
    case BpmnWorkflowHostInputKind.Initial:
      requireOnlyKeys(value, ["protocol", "kind", "eventHistoryEventLimit"]);
      return value as BpmnWorkflowInitialHostInputV1;
    case BpmnWorkflowHostInputKind.Continuation:
      requireOnlyKeys(value, [
        "protocol", "kind", "eventHistoryEventLimit", "runOrdinal",
        "firstExecutionRunId", "definition", "processId", "processInstanceId",
        "startCommandId", "completedMessageDeliveryRecords",
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

export function requireBpmnWorkflowContinuationStateV1(
  value: unknown,
  program: SemanticProcessProgram,
  processInstanceId: string,
): BpmnWorkflowContinuationStateV1 {
  requirePlainDataTree(value);
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
  return value;
}

/** Lifetime command recovery is a separate, independently measured Temporal argument. */
export type BpmnWorkflowContinuationRecoveryV1 = DeepReadonly<{
  entries: WorkflowChainRecoveryEntry[];
}>;

export type BpmnWorkflowContinuationPublicationV1 = DeepReadonly<{
  execution: {
    definition: SemanticProcessIdentity;
    processId: string;
    processInstanceId: string;
    headRevision: number;
    current: CurrentCommittedExecution | null;
  };
  flowNodeOccurrences: {
    definition: SemanticProcessIdentity;
    processId: string;
    processInstanceId: string;
    headRevision: number;
    currentOpen: OpenFlowNodeOccurrence[];
    retainedOpen: Array<{
      anchor: SemanticFlowNodeOccurrenceAnchor;
      occurrence: OpenFlowNodeOccurrence;
    }>;
    lastCommittedAtEpochMs: number | null;
  };
}>;

export function requireBpmnWorkflowContinuationPublicationV1(
  value: unknown,
  program: SemanticProcessProgram,
  state: BpmnWorkflowContinuationStateV1,
  processInstanceId: string,
): BpmnWorkflowContinuationPublicationV1 {
  requirePlainDataTree(value);
  if (!isRecord(value)) {
    throw new TypeError("Malformed publication continuation");
  }
  requireOnlyKeys(value, ["execution", "flowNodeOccurrences"]);
  if (!isRecord(value.execution) || !isRecord(value.flowNodeOccurrences)) {
    throw new TypeError("Malformed publication continuation");
  }
  requireOnlyKeys(value.execution, [
    "definition", "processId", "processInstanceId", "headRevision", "current",
  ]);
  requireOnlyKeys(value.flowNodeOccurrences, [
    "definition", "processId", "processInstanceId", "headRevision",
    "currentOpen", "retainedOpen", "lastCommittedAtEpochMs",
  ]);
  const execution = value.execution;
  const occurrences = value.flowNodeOccurrences;
  const canonical = canonicalWorkflowChainJson;
  if (
    execution.processId !== program.processId ||
    execution.processInstanceId !== processInstanceId ||
    occurrences.processId !== program.processId ||
    occurrences.processInstanceId !== processInstanceId ||
    !Number.isSafeInteger(execution.headRevision) ||
    Number(execution.headRevision) < 1 ||
    !Number.isSafeInteger(occurrences.headRevision) ||
    Number(occurrences.headRevision) < 1 ||
    execution.headRevision !== occurrences.headRevision ||
    canonical(execution.definition) !== canonical(program.identity) ||
    canonical(occurrences.definition) !== canonical(program.identity) ||
    !isRecord(execution.current) ||
    !Array.isArray(occurrences.currentOpen) ||
    !Array.isArray(occurrences.retainedOpen) ||
    !Number.isSafeInteger(occurrences.lastCommittedAtEpochMs) ||
    Number(occurrences.lastCommittedAtEpochMs) < 0
  ) {
    throw new TypeError("Publication continuation identity or head mismatch");
  }
  const headRevision = Number(execution.headRevision);
  const executionPage = requireExecutionPublicationPage({
    definition: execution.definition,
    processId: execution.processId,
    processInstanceId: execution.processInstanceId,
    requestedAfterRevision: headRevision,
    pageThroughRevision: headRevision,
    headRevision,
    batches: [],
    current: execution.current,
  }, {
    program,
    processInstanceId,
    afterRevision: headRevision,
    limit: 1,
  });
  const observation = observeStableState(program, state);
  const positions = projectCurrentControlPositions(program, state);
  if (observation === null || positions === null || canonical(execution.current) !== canonical({
    revision: headRevision,
    state: observation,
    controlTokens: positions.controlTokens,
    scopes: positions.scopes,
  })) {
    throw new TypeError("Publication current does not match committed RuntimeState");
  }
  requireFlowNodeOccurrencePublicationResult({
    kind: FlowNodeOccurrencePublicationResultKind.Available,
    page: {
      definition: occurrences.definition,
      processId: occurrences.processId,
      processInstanceId: occurrences.processInstanceId,
      requestedAfterRevision: headRevision,
      pageThroughRevision: headRevision,
      headRevision,
      batches: [],
      currentOpen: occurrences.currentOpen,
    },
  }, {
    program,
    processInstanceId,
    executionPublication: executionPage,
    afterRevision: headRevision,
    limit: 1,
  });
  const projectedOpen = projectOpenFlowNodeOccurrences(program, state);
  if (projectedOpen === null || !retainedOpenMatchesRuntime(
    occurrences.retainedOpen,
    occurrences.currentOpen,
    projectedOpen,
    Number(occurrences.lastCommittedAtEpochMs),
  )) {
    throw new TypeError("Publication open occurrences do not match RuntimeState");
  }
  return value as BpmnWorkflowContinuationPublicationV1;
}

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
  const aggregate = [start, program, host, state, recovery, publication];
  const measured: ReadonlyArray<readonly [WorkflowChainBudgetKind, unknown]> = [
    [WorkflowChainBudgetKind.InitialStartStimulusBytes, start],
    [WorkflowChainBudgetKind.SemanticProcessProgramBytes, program],
    [WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes, host],
    [WorkflowChainBudgetKind.CommittedRuntimeStateBytes, state],
    [WorkflowChainBudgetKind.CommandRecoveryLedgerBytes, recovery.entries],
    [WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes, publication],
    [WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes, aggregate],
  ];
  for (const [budget, value] of measured) {
    const observedValue = workflowChainCanonicalUtf8ByteLength(value);
    const configuredBound = workflowChainProductionLimit(budget);
    if (observedValue > configuredBound) {
      return { budget, observedValue, configuredBound };
    }
  }
  return null;
}

function isRuntimeState(value: unknown): value is RuntimeState {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "control", "initiationPending", "scopeOccurrences", "controlTokens",
    "userTaskWaits", "messageWaits", "timerWaits", "effectWaits",
    "effectIncidents", "selectedBranchSets", "eventRaces",
    "calledProcessOccurrences", "variables", "taskActivations",
    "messageActivations", "timerActivations", "eventRaceActivations",
    "callActivations", "effectActivations", "scopeActivations",
    "endOccurrences", "logicalTimeMs",
  ]) || !isRecord(value.control) || !hasOnlyKeys(value.control, ["kind", "instanceId"]) ||
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
    !isScopedVariables(value.variables) ||
    !isList(value.taskActivations, isActivationCounter) ||
    !isList(value.messageActivations, isActivationCounter) ||
    !isList(value.timerActivations, isActivationCounter) ||
    !isList(value.eventRaceActivations, isActivationCounter) ||
    !isList(value.callActivations, isActivationCounter) ||
    !isList(value.effectActivations, isActivationCounter) ||
    !isList(value.scopeActivations, isActivationCounter) ||
    !isSafeInteger(value.endOccurrences, 0) || !isSafeInteger(value.logicalTimeMs, 0)) {
    return false;
  }
  return true;
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
      isOccurrenceId(activity.owner) && isVariablePatch(activity.bindings));
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

function retainedOpenMatchesRuntime(
  retained: ReadonlyArray<unknown>,
  current: ReadonlyArray<unknown>,
  projected: NonNullable<ReturnType<typeof projectOpenFlowNodeOccurrences>>,
  lastCommittedAtEpochMs: number,
): boolean {
  if (retained.length !== current.length || retained.length !== projected.length ||
    canonicalWorkflowChainJson(current) !== canonicalWorkflowChainJson(
      retained.map((entry) => isRecord(entry) ? entry.occurrence : undefined),
    )) return false;
  const anchors = new Set<string>();
  return retained.every((entry) => {
    if (!isRecord(entry) || !hasOnlyKeys(entry, ["anchor", "occurrence"]) ||
      !isAnchor(entry.anchor) || !isRecord(entry.occurrence) ||
      !isSafeInteger(entry.occurrence.startedAtEpochMs, 0) ||
      Number(entry.occurrence.startedAtEpochMs) > lastCommittedAtEpochMs) return false;
    const key = canonicalWorkflowChainJson(entry.anchor);
    if (anchors.has(key)) return false;
    anchors.add(key);
    const match = projected.find((candidate) =>
      canonicalWorkflowChainJson(candidate.anchor) === key);
    return match !== undefined && match.processId === entry.occurrence.processId &&
      match.elementId === entry.occurrence.elementId &&
      canonicalWorkflowChainJson(match.owner) ===
        canonicalWorkflowChainJson(entry.occurrence.owner);
  });
}

function isAnchor(value: unknown): value is SemanticFlowNodeOccurrenceAnchor {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
      return hasOnlyKeys(value, ["kind", "id"]) && isOccurrenceId(value.id);
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      return hasOnlyKeys(value, ["kind", "id"]) && isScopeId(value.id);
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return hasOnlyKeys(value, ["kind", "commandId", "transitionIndex", "localIndex"]) &&
        isNonemptyString(value.commandId) && isSafeInteger(value.transitionIndex, 0) &&
        isSafeInteger(value.localIndex, 0);
    default:
      return false;
  }
}

function requirePlainDataTree(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
    typeof value === "number") return;
  if (typeof value !== "object" || seen.has(value)) {
    throw new TypeError("Workflow continuation must be an acyclic plain-data tree");
  }
  seen.add(value);
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null) {
    throw new TypeError("Workflow continuation contains a non-plain object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key === "symbol") ||
    (array && (keys.length !== value.length + 1 ||
      !Array.from({ length: value.length }, (_, index) => String(index))
        .every((key) => Object.hasOwn(descriptors, key))))) {
    throw new TypeError("Workflow continuation contains non-JSON properties");
  }
  for (const key of keys) {
    const descriptor = Reflect.get(descriptors, key) as PropertyDescriptor | undefined;
    if (descriptor === undefined || !("value" in descriptor) ||
      (!array && !descriptor.enumerable) ||
      (array && key !== "length" && !descriptor.enumerable)) {
      throw new TypeError("Workflow continuation contains an executable property");
    }
    if (key !== "length") requirePlainDataTree(descriptor.value, seen);
  }
  seen.delete(value);
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
