import {
  CanonicalObservationKind,
  ProcessStatus,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  StimulusKind,
  WaitKind,
  compareCanonicalStrings,
  hasExactOptionalUserTaskMetadata,
  isMessageChannel,
  isSourceOverlayIdentityOrNull,
  isWellFormedStimulus,
  isWellFormedWireString,
  openEffectIncidentAssociationIsValid,
  sameMessageChannel,
} from "@bpmn-lean/semantic-core";
import type {
  PublicControlPositionDelta,
  PublicControlTokenPosition,
  PublicScopePosition,
  ScopeOccurrenceId,
  SemanticProcessIdentity,
  SemanticProcessProgram,
  StateObservation,
  Stimulus,
} from "@bpmn-lean/semantic-core";

import type {
  CommittedTransitionBatch,
  CommittedTransitionRecord,
  CurrentCommittedExecution,
  ExecutionPublicationExport,
  ExecutionPublicationPage,
  ExecutionPublicationResult,
  ExecutionPublicationTransportValidationContext,
  ExecutionPublicationValidationContext,
} from "./semantic-publication.js";
import { isMultiInstanceProgress } from "./parallel-multi-instance-publication-validation.js";
import { isCanonicalPublicationVariablePatch } from "./semantic-publication-variable-validation.js";

export type ExecutionPublicationValidationAuthority =
  | { kind: "program"; context: ExecutionPublicationValidationContext }
  | { kind: "transport"; context: ExecutionPublicationTransportValidationContext };

export function isExecutionPublicationResult(
  value: unknown,
  authority: ExecutionPublicationValidationAuthority,
): value is ExecutionPublicationResult {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case "available":
      return hasOnlyKeys(value, ["kind", "page"]) &&
        isExecutionPublicationPage(value.page, authority, true);
    case "notReady":
    case "notFound":
    case "unavailable":
    case "gap":
      return hasOnlyKeys(value, ["kind"]);
    default:
      return false;
  }
}

export function isExecutionPublicationExport(
  value: unknown,
  context: ExecutionPublicationValidationContext,
): value is ExecutionPublicationExport {
  return isRecord(value) && hasOnlyKeys(value, [
    "format", "definition", "processId", "processInstanceId", "headRevision",
    "batches", "current",
  ]) && value.format === "bpmn-lean.execution-publication.v1" &&
    Array.isArray(value.batches) && value.batches.length > 0 &&
    isExecutionPublicationPage({
      definition: value.definition,
      processId: value.processId,
      processInstanceId: value.processInstanceId,
      requestedAfterRevision: 0,
      pageThroughRevision: value.headRevision,
      headRevision: value.headRevision,
      batches: value.batches,
      current: value.current,
    }, { kind: "program", context }, false);
}

export function isExecutionPublicationPage(
  value: unknown,
  authority: ExecutionPublicationValidationAuthority,
  enforceLimit: boolean,
): value is ExecutionPublicationPage {
  const definition = authority.kind === "program"
    ? authority.context.program.identity
    : authority.context.definition;
  const processId = authority.kind === "program"
    ? authority.context.program.processId
    : authority.context.processId;
  const expectedAfter = authority.context.afterRevision;
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "definition", "processId", "processInstanceId", "requestedAfterRevision",
    "pageThroughRevision", "headRevision", "batches", "current",
  ]) || !sameDefinition(value.definition, definition) || value.processId !== processId ||
    value.processInstanceId !== authority.context.processInstanceId ||
    !isSafe(value.requestedAfterRevision, 0) ||
    (expectedAfter !== undefined && value.requestedAfterRevision !== expectedAfter) ||
    !isSafe(value.pageThroughRevision, 0) || !isSafe(value.headRevision, 1) ||
    value.requestedAfterRevision > value.pageThroughRevision ||
    value.pageThroughRevision > value.headRevision || !Array.isArray(value.batches)) {
    return false;
  }
  const limit = authority.context.limit ?? 50;
  if (!isSafe(limit, 1) || limit > 100 || (enforceLimit && value.batches.length > limit) ||
    ((value.batches.length === 0) !==
      (value.requestedAfterRevision === value.pageThroughRevision))) {
    return false;
  }
  const program = authority.kind === "program" ? authority.context.program : null;
  let cursor = Number(value.requestedAfterRevision);
  let logicalTime: number | undefined;
  const records: CommittedTransitionRecord[] = [];
  for (const batch of value.batches) {
    if (!isBatch(batch, value, program, cursor, logicalTime)) {
      return false;
    }
    const typed = batch as CommittedTransitionBatch;
    cursor = typed.throughRevision;
    logicalTime = typed.transitions[typed.transitions.length - 1]?.logicalTimeMs;
    records.push(...typed.transitions);
  }
  if (cursor !== value.pageThroughRevision ||
    ((value.current !== null) !== (value.pageThroughRevision === value.headRevision)) ||
    (value.current !== null &&
      !isCurrent(value.current, value, program, processId, logicalTime))) {
    return false;
  }
  // A positive cursor has no prior public position or time anchor. This checks
  // only the visible suffix; the authoritative producer reconciles stored head continuity.
  return !(value.requestedAfterRevision === 0 && value.current !== null &&
    !foldMatchesCurrent(records, value.current));
}

function isBatch(
  value: unknown,
  page: Record<string, unknown>,
  program: SemanticProcessProgram | null,
  expectedFrom: number,
  priorLogicalTime: number | undefined,
): value is CommittedTransitionBatch {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "commandId", "fromRevision", "throughRevision", "transitions",
  ]) || !isNonEmpty(value.commandId) || value.fromRevision !== expectedFrom ||
    !isSafe(value.throughRevision, 1) || !Array.isArray(value.transitions) ||
    value.transitions.length === 0 ||
    value.throughRevision - expectedFrom !== value.transitions.length) {
    return false;
  }
  let time = priorLogicalTime;
  for (let index = 0; index < value.transitions.length; index += 1) {
    const record = value.transitions[index];
    if (!isRecord(record) || !hasOnlyKeys(record, [
      "revision", "logicalTimeMs", "transition", "positionDelta",
    ]) || record.revision !== expectedFrom + index + 1 || !isSafe(record.logicalTimeMs, 0) ||
      (time !== undefined && record.logicalTimeMs < time) ||
      !isDelta(record.positionDelta, program) || !isRecord(record.transition)) {
      return false;
    }
    time = Number(record.logicalTimeMs);
    if (index === 0) {
      if (!hasOnlyKeys(record.transition, ["kind", "stimulus"]) ||
        record.transition.kind !== "externalStimulus" ||
        !isWellFormedStimulus(record.transition.stimulus) ||
        record.transition.stimulus.commandId !== value.commandId ||
        !stimulusMatchesPage(record.transition.stimulus, page, record.revision,
          record.logicalTimeMs)) {
        return false;
      }
    } else if (!isInternalTransition(
      record.transition, record.positionDelta, program, String(page.processInstanceId),
    )) {
      return false;
    }
  }
  return true;
}

function isInternalTransition(
  value: Record<string, unknown>,
  delta: unknown,
  program: SemanticProcessProgram | null,
  processInstanceId: string,
): boolean {
  if (!hasOnlyKeys(value, ["kind", "operationId", "operationKind", "origin", "owner"]) ||
    value.kind !== "internalOperation" || !isNonEmpty(value.operationId) ||
    !Object.values(SemanticOperationKind).includes(value.operationKind as SemanticOperationKind) ||
    !isRecord(value.origin) || !hasOnlyKeys(value.origin, ["kind", "elementId"]) ||
    value.origin.kind !== SemanticOriginKind.BpmnElement || !isNonEmpty(value.origin.elementId) ||
    !isScopeId(value.owner) || !deltaMentionsOwner(delta, value.owner)) {
    return false;
  }
  if (program === null) {
    // Structural transport validation cannot prove equality with a private selected Program step.
    return true;
  }
  const operations = program.operations.filter(({ id }) => id === value.operationId);
  const ownership = program.operationScopes.filter(
    ({ operationId }) => operationId === value.operationId,
  );
  if (operations.length !== 1 || ownership.length !== 1) {
    return false;
  }
  const operation = operations[0];
  const owner = value.owner as ScopeOccurrenceId;
  const definition = program.definitionScopes.find(({ id }) => id === ownership[0]?.scopeId);
  return operation !== undefined && ownership[0] !== undefined &&
    value.operationKind === operation.kind && sameOrigin(value.origin, operation.origin) &&
    owner.definitionScopeId === ownership[0].scopeId &&
    (definition?.originElementId !== program.processId || owner.processInstanceId === processInstanceId);
}

function stimulusMatchesPage(
  stimulus: Stimulus,
  page: Record<string, unknown>,
  revision: unknown,
  logicalTime: unknown,
): boolean {
  if (revision === 1 && stimulus.kind !== StimulusKind.StartProcess &&
    stimulus.kind !== StimulusKind.TriggerMessageStart &&
    stimulus.kind !== StimulusKind.TriggerTimerStart) return false;
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
      return revision === 1 && stimulus.processId === page.processId &&
        stimulus.instanceId === page.processInstanceId;
    case StimulusKind.FireTimer:
      return stimulus.logicalTimeMs === logicalTime;
    case StimulusKind.CompleteUserTaskInstance:
    case StimulusKind.DeliverMessage:
    case StimulusKind.CompleteEffect:
    case StimulusKind.ReportEffectFailure:
    case StimulusKind.RetryIncident:
      return true;
    case StimulusKind.CancelIncidentProcess:
      return stimulus.processInstanceId === page.processInstanceId;
  }
}

function isDelta(
  value: unknown,
  program: SemanticProcessProgram | null,
): value is PublicControlPositionDelta {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "consumedTokens", "producedTokens", "enteredScopes", "exitedScopes",
  ]) || !isTokenList(value.consumedTokens, program) ||
    !isTokenList(value.producedTokens, program) ||
    !isScopeList(value.enteredScopes, program, false) ||
    !isScopeList(value.exitedScopes, program, false)) {
    return false;
  }
  return disjoint(value.consumedTokens, value.producedTokens, sameToken) &&
    disjoint(value.enteredScopes, value.exitedScopes, sameScopePosition);
}

function isCurrent(
  value: unknown,
  page: Record<string, unknown>,
  program: SemanticProcessProgram | null,
  processId: string,
  lastLogicalTime: number | undefined,
): value is CurrentCommittedExecution {
  if (!isRecord(value) || !hasOnlyKeys(value, ["revision", "state", "controlTokens", "scopes"]) ||
    value.revision !== page.headRevision ||
    !isState(value.state, page.processInstanceId, program) ||
    !isTokenList(value.controlTokens, program) || !isScopeList(value.scopes, program, true) ||
    (lastLogicalTime !== undefined &&
      (value.state as StateObservation).logicalTimeMs !== lastLogicalTime)) {
    return false;
  }
  const scopes = value.scopes as PublicScopePosition[];
  return scopes.every(({ id, bpmnElementId }) =>
    bpmnElementId !== processId || id.processInstanceId === page.processInstanceId) &&
    (value.controlTokens as PublicControlTokenPosition[]).every(({ owner }) =>
      scopes.some(({ id }) => sameScope(id, owner)));
}

function isState(
  value: unknown,
  instanceId: unknown,
  program: SemanticProcessProgram | null,
): value is StateObservation {
  const hasMultiInstances = isRecord(value) &&
    Object.hasOwn(value, "openMultiInstances");
  const programDeclaresMultiInstances = program?.operations.some(({ kind }) =>
    kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask ||
    kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask
  );
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "kind", "instanceId", "status", "activeWaits", "openUserTasks",
    "openMessageSubscriptions", "openTimers", "openEffects", "openIncidents",
    ...(hasMultiInstances ? ["openMultiInstances"] : []),
    "variables", "enabledInteractions", "logicalTimeMs",
  ]) || value.kind !== CanonicalObservationKind.State || value.instanceId !== instanceId ||
    (program !== null && hasMultiInstances !== programDeclaresMultiInstances) ||
    !isSafe(value.logicalTimeMs, 0) ||
    ![ProcessStatus.Running, ProcessStatus.Completed, ProcessStatus.Cancelled]
      .includes(value.status as ProcessStatus) ||
    !Array.isArray(value.openUserTasks) || !value.openUserTasks.every(isOpenUserTask) ||
    !canonical(value.openUserTasks, compareOpenOccurrence) ||
    !Array.isArray(value.openMessageSubscriptions) ||
    !value.openMessageSubscriptions.every(isOpenMessage) ||
    !canonical(value.openMessageSubscriptions, compareOpenOccurrence) ||
    !Array.isArray(value.openTimers) || !value.openTimers.every(isOpenTimer) ||
    !canonical(value.openTimers, compareOpenOccurrence) || !Array.isArray(value.openEffects) ||
    !value.openEffects.every(isOpenEffect) || !canonical(value.openEffects, compareOpenOccurrence) ||
    !Array.isArray(value.openIncidents) || !value.openIncidents.every(isOpenIncident) ||
    !canonical(value.openIncidents, (a, b) => compareOpenOccurrence(a.effect, b.effect)) ||
    (hasMultiInstances && !isMultiInstanceProgress(
      value.openMultiInstances,
      instanceId,
      value.openUserTasks,
      program,
    )) ||
    !isPatch(value.variables) || !isActiveWaits(value.activeWaits) ||
    !isEnabledInteractions(value.enabledInteractions, value)) {
    return false;
  }
  return value.status === ProcessStatus.Running || [
    value.openUserTasks, value.openMessageSubscriptions, value.openTimers,
    value.openEffects, value.openIncidents,
    ...(hasMultiInstances ? [value.openMultiInstances] : []),
    value.enabledInteractions, value.activeWaits,
  ].every((items) => Array.isArray(items) && items.length === 0);
}

function isOpenUserTask(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value,
    Object.hasOwn(value, "metadata") ? ["id", "name", "state", "metadata"] : ["id", "name", "state"]) &&
    isOccurrence(value.id) && (value.name === null || isNonEmpty(value.name)) &&
    value.state === "active" && hasExactOptionalUserTaskMetadata(value);
}

function isOpenMessage(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["id", "channel"]) &&
    isOccurrence(value.id) && isMessageChannel(value.channel);
}

function isOpenTimer(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["id", "deadlineMs"]) &&
    isOccurrence(value.id) && isSafe(value.deadlineMs, 0);
}

function isOpenEffect(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["id", "descriptor", "arguments"]) &&
    isOccurrence(value.id) && isRecord(value.descriptor) &&
    hasOnlyKeys(value.descriptor, ["protocol", "operation"]) &&
    isNonEmpty(value.descriptor.protocol) && isNonEmpty(value.descriptor.operation) &&
    isPatch(value.arguments);
}

function isOpenIncident(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["kind", "id", "effect"]) &&
    value.kind === "effectExecutionFailed" && isRecord(value.id) &&
    hasOnlyKeys(value.id, ["effectId", "generation"]) && isOccurrence(value.id.effectId) &&
    value.id.generation === 1 && isOpenEffect(value.effect) &&
    openEffectIncidentAssociationIsValid(value as never);
}

function isActiveWaits(value: unknown): boolean {
  const order = [WaitKind.UserTask, WaitKind.Message, WaitKind.Timer, WaitKind.Effect, WaitKind.Incident];
  return Array.isArray(value) && value.every((wait) => isRecord(wait) &&
    hasOnlyKeys(wait, ["elementId", "kind", "multiplicity"]) && isNonEmpty(wait.elementId) &&
    order.includes(wait.kind as WaitKind) && isSafe(wait.multiplicity, 1)) &&
    canonical(value, (a, b) => order.indexOf(a.kind as WaitKind) - order.indexOf(b.kind as WaitKind) ||
      compareCanonicalStrings(String(a.elementId), String(b.elementId)));
}

function isEnabledInteractions(value: unknown, state: Record<string, unknown>): boolean {
  if (!Array.isArray(value) || !value.every((item) => isRecord(item))) {
    return false;
  }
  const openTasks = state.openUserTasks as Array<Record<string, unknown>>;
  const messages = state.openMessageSubscriptions as Array<Record<string, unknown>>;
  const incidents = state.openIncidents as Array<Record<string, unknown>>;
  let index = 0;
  for (const task of openTasks) {
    const item = value[index++];
    if (!isRecord(item) || !hasOnlyKeys(item, ["kind", "taskId"]) ||
      item.kind !== StimulusKind.CompleteUserTaskInstance ||
      !sameOccurrence(item.taskId, task.id)) return false;
  }
  for (const message of messages) {
    const item = value[index++];
    if (!isRecord(item) || !hasOnlyKeys(item, ["kind", "subscriptionId", "channel"]) ||
      item.kind !== StimulusKind.DeliverMessage ||
      !sameOccurrence(item.subscriptionId, message.id) ||
      !isMessageChannel(item.channel) || !isMessageChannel(message.channel) ||
      !sameMessageChannel(item.channel, message.channel)) return false;
  }
  for (const incident of incidents) {
    const item = value[index++];
    if (!isRecord(item) || !hasOnlyKeys(item, ["kind", "incidentId"]) ||
      item.kind !== StimulusKind.RetryIncident ||
      !sameIncident(item.incidentId, incident.id)) return false;
  }
  if (index < value.length) {
    const cancel = value[index++];
    if (!isRecord(cancel) || !hasOnlyKeys(cancel, ["kind", "processInstanceId", "incidentId"]) ||
      cancel.kind !== StimulusKind.CancelIncidentProcess || cancel.processInstanceId !== state.instanceId ||
      !incidents.some(({ id }) => sameIncident(cancel.incidentId, id))) return false;
  }
  return index === value.length;
}

function isTokenList(
  value: unknown,
  program: SemanticProcessProgram | null,
): value is PublicControlTokenPosition[] {
  return Array.isArray(value) && value.every((item) => isRecord(item) &&
    hasOnlyKeys(item, ["sequenceFlowId", "owner", "multiplicity"]) &&
    isNonEmpty(item.sequenceFlowId) && isScopeId(item.owner) && isSafe(item.multiplicity, 1) &&
    (program === null || tokenOriginMatches(item, program))) && canonical(value, compareToken);
}

function tokenOriginMatches(value: Record<string, unknown>, program: SemanticProcessProgram): boolean {
  const owner = value.owner as ScopeOccurrenceId;
  const places = program.controlPlaces.filter(({ origin }) =>
    origin.elementId === value.sequenceFlowId);
  return places.length === 1 && program.controlPlaceScopes.some(({ controlPlaceId, scopeId }) =>
    controlPlaceId === places[0]?.id && scopeId === owner.definitionScopeId);
}

function isScopeList(
  value: unknown,
  program: SemanticProcessProgram | null,
  requireClosedParents: boolean,
): value is PublicScopePosition[] {
  if (!Array.isArray(value) || !value.every((item) => isRecord(item) &&
    hasOnlyKeys(item, ["id", "parent", "bpmnElementId"]) && isScopeId(item.id) &&
    (item.parent === null || isScopeId(item.parent)) && isNonEmpty(item.bpmnElementId) &&
    (program === null || scopeOriginMatches(item, program))) ||
    !canonical(value, compareScopePosition)) return false;
  const scopes = value as PublicScopePosition[];
  return !requireClosedParents || scopes.every(({ parent }) => parent === null ||
    scopes.some(({ id }) => sameScope(id, parent)));
}

function scopeOriginMatches(value: Record<string, unknown>, program: SemanticProcessProgram): boolean {
  const id = value.id as ScopeOccurrenceId;
  const definition = program.definitionScopes.filter(({ id: scope }) =>
    scope === id.definitionScopeId);
  if (definition.length !== 1 || definition[0]?.originElementId !== value.bpmnElementId) return false;
  const exactDefinition = definition[0]!;
  const parent = value.parent as ScopeOccurrenceId | null;
  return exactDefinition.parentScopeId === null
    ? parent === null
    : parent !== null && parent.definitionScopeId === exactDefinition.parentScopeId;
}

function foldMatchesCurrent(
  records: CommittedTransitionRecord[],
  current: CurrentCommittedExecution,
): boolean {
  const scopes: PublicScopePosition[] = [];
  const tokens: PublicControlTokenPosition[] = [];
  for (const { positionDelta: delta } of records) {
    for (const scope of delta.enteredScopes) {
      if (scopes.some(({ id }) => sameScope(id, scope.id))) return false;
      scopes.push(scope);
    }
    for (const token of delta.consumedTokens) {
      const existing = tokens.find((item) => sameToken(item, token));
      if (existing === undefined || existing.multiplicity < token.multiplicity) return false;
      const remaining = existing.multiplicity - token.multiplicity;
      tokens.splice(tokens.indexOf(existing), 1);
      if (remaining > 0) tokens.push({ ...existing, multiplicity: remaining });
    }
    for (const token of delta.producedTokens) {
      const existing = tokens.find((item) => sameToken(item, token));
      if (existing === undefined) tokens.push(token);
      else {
        const multiplicity = existing.multiplicity + token.multiplicity;
        if (!Number.isSafeInteger(multiplicity)) return false;
        tokens.splice(tokens.indexOf(existing), 1, { ...existing, multiplicity });
      }
    }
    for (const scope of delta.exitedScopes) {
      const existing = scopes.find(({ id }) => sameScope(id, scope.id));
      if (existing === undefined ||
        tokens.some(({ owner }) => sameScope(owner, scope.id))) return false;
      scopes.splice(scopes.indexOf(existing), 1);
    }
  }
  return sameSet(tokens, current.controlTokens, sameTokenWithMultiplicity) &&
    sameSet(scopes, current.scopes, sameScopePosition);
}

function canonical<T>(value: T[], compare: (left: T, right: T) => number): boolean {
  return value.every((item, index) =>
    index === 0 || compare(value[index - 1] as T, item) < 0);
}

function compareToken(left: unknown, right: unknown): number {
  const a = left as PublicControlTokenPosition;
  const b = right as PublicControlTokenPosition;
  return compareCanonicalStrings(a.sequenceFlowId, b.sequenceFlowId) ||
    compareScope(a.owner, b.owner);
}

function compareScopePosition(left: unknown, right: unknown): number {
  return compareScope((left as PublicScopePosition).id, (right as PublicScopePosition).id);
}

function compareScope(left: ScopeOccurrenceId, right: ScopeOccurrenceId): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.definitionScopeId, right.definitionScopeId) ||
    left.activation - right.activation;
}

function compareOpenOccurrence(left: unknown, right: unknown): number {
  return compareOccurrence((left as { id: never }).id, (right as { id: never }).id);
}

function compareOccurrence(left: unknown, right: unknown): number {
  const a = left as { processInstanceId: string; elementId: string; activation: number };
  const b = right as typeof a;
  return compareCanonicalStrings(a.processInstanceId, b.processInstanceId) ||
    compareCanonicalStrings(a.elementId, b.elementId) || a.activation - b.activation;
}

function isOccurrence(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["processInstanceId", "elementId", "activation"]) &&
    isNonEmpty(value.processInstanceId) && isNonEmpty(value.elementId) &&
    isSafe(value.activation, 1);
}

function isScopeId(value: unknown): value is ScopeOccurrenceId {
  return isRecord(value) &&
    hasOnlyKeys(value, ["processInstanceId", "definitionScopeId", "activation"]) &&
    isNonEmpty(value.processInstanceId) && isNonEmpty(value.definitionScopeId) &&
    isSafe(value.activation, 1);
}

function isPatch(value: unknown): boolean {
  return isCanonicalPublicationVariablePatch(value);
}

function sameDefinition(value: unknown, expected: SemanticProcessIdentity): boolean {
  return isRecord(value) && hasOnlyKeys(value, [
    "compiler", "semanticProfile", "sourceId", "sourceSha256", "sourceOverlay",
  ]) && value.compiler === SemanticProcessCompilerId.BpmnSourceSemanticProcess &&
    value.compiler === expected.compiler && value.semanticProfile === expected.semanticProfile &&
    value.sourceId === expected.sourceId && value.sourceSha256 === expected.sourceSha256 &&
    isSourceOverlayIdentityOrNull(value.sourceOverlay) &&
    ((value.sourceOverlay === null && expected.sourceOverlay === null) ||
      (value.sourceOverlay !== null && expected.sourceOverlay !== null &&
        value.sourceOverlay.id === expected.sourceOverlay.id &&
        value.sourceOverlay.sha256 === expected.sourceOverlay.sha256));
}

function deltaMentionsOwner(delta: unknown, owner: ScopeOccurrenceId): boolean {
  return isRecord(delta) && ["consumedTokens", "producedTokens", "enteredScopes", "exitedScopes"]
    .some((field) => Array.isArray(delta[field]) && delta[field].some((item) => isRecord(item) &&
      ((isRecord(item.owner) && sameScope(item.owner as ScopeOccurrenceId, owner)) ||
        (isRecord(item.id) && sameScope(item.id as ScopeOccurrenceId, owner)) ||
        (isRecord(item.parent) && sameScope(item.parent as ScopeOccurrenceId, owner)))));
}

function sameOrigin(value: unknown, expected: { kind: string; elementId: string }): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["kind", "elementId"]) &&
    value.kind === expected.kind && value.elementId === expected.elementId;
}

function sameOccurrence(left: unknown, right: unknown): boolean {
  return isOccurrence(left) && isOccurrence(right) && compareOccurrence(left, right) === 0;
}

function sameIncident(left: unknown, right: unknown): boolean {
  return isRecord(left) && isRecord(right) && hasOnlyKeys(left, ["effectId", "generation"]) &&
    hasOnlyKeys(right, ["effectId", "generation"]) && left.generation === 1 &&
    right.generation === 1 && sameOccurrence(left.effectId, right.effectId);
}

function sameScope(left: ScopeOccurrenceId, right: ScopeOccurrenceId): boolean {
  return compareScope(left, right) === 0;
}

function sameToken(left: PublicControlTokenPosition, right: PublicControlTokenPosition): boolean {
  return left.sequenceFlowId === right.sequenceFlowId && sameScope(left.owner, right.owner);
}

function sameTokenWithMultiplicity(
  left: PublicControlTokenPosition,
  right: PublicControlTokenPosition,
): boolean {
  return sameToken(left, right) && left.multiplicity === right.multiplicity;
}

function sameScopePosition(left: PublicScopePosition, right: PublicScopePosition): boolean {
  return sameScope(left.id, right.id) && left.bpmnElementId === right.bpmnElementId &&
    ((left.parent === null && right.parent === null) ||
      (left.parent !== null && right.parent !== null && sameScope(left.parent, right.parent)));
}

function sameSet<T>(
  left: readonly T[],
  right: readonly T[],
  same: (a: T, b: T) => boolean,
): boolean {
  return left.length === right.length &&
    left.every((item) => right.some((candidate) => same(item, candidate)));
}

function disjoint<T>(
  left: readonly T[],
  right: readonly T[],
  same: (a: T, b: T) => boolean,
): boolean {
  return left.every((item) => !right.some((candidate) => same(item, candidate)));
}

function isSafe(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function isNonEmpty(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}
