import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireNonnegativeSafeInteger,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import {
  EffectExecutionResultKind,
  executionPublicationStateAcceptedKeys,
  MessageChannelKind,
  ProcessStatus,
  SemanticOperationKind,
  SemanticTransitionKind,
  StimulusKind,
  WaitKind,
} from "./execution-publications.js";
import type {
  ExecutionPublicationDefinitionIdentity,
  ExecutionPublicationIdentity,
  MessageChannel,
  OccurrenceId,
  PublicControlPositionDelta,
  PublicControlTokenPosition,
  PublicScopePosition,
  ScopeOccurrenceId,
  StateObservation,
} from "./execution-publications.js";
import { requirePublicationVariableValue } from "./execution-publication-variable-value-decoder.js";
import { requireOpenMultiInstances } from "./execution-publication-multi-instance-decoder.js";

const lowercaseSha256 = /^[0-9a-f]{64}$/u;

export function requirePublicationDefinitionIdentity(
  value: unknown,
  label: string,
): ExecutionPublicationDefinitionIdentity {
  requireObject(value, label);
  exact(value, label, ["compiler", "semanticProfile", "sourceId", "sourceSha256", "sourceOverlay"]);
  if (readOwn(value, "compiler") !== "bpmn-source-semantic-process") {
    throw new TypeError(`${label}.compiler is invalid`);
  }
  requireNonemptyString(readOwn(value, "semanticProfile"), `${label}.semanticProfile`);
  requireNonemptyString(readOwn(value, "sourceId"), `${label}.sourceId`);
  requireDigest(readOwn(value, "sourceSha256"), `${label}.sourceSha256`);
  const overlay = readOwn(value, "sourceOverlay");
  if (overlay !== null) {
    requireObject(overlay, `${label}.sourceOverlay`);
    exact(overlay, `${label}.sourceOverlay`, ["id", "sha256"]);
    requireNonemptyString(readOwn(overlay, "id"), `${label}.sourceOverlay.id`);
    requireDigest(readOwn(overlay, "sha256"), `${label}.sourceOverlay.sha256`);
  }
  return value as ExecutionPublicationDefinitionIdentity;
}

export function samePublicationDefinition(
  left: ExecutionPublicationDefinitionIdentity,
  right: ExecutionPublicationDefinitionIdentity,
): boolean {
  return left.compiler === right.compiler &&
    left.semanticProfile === right.semanticProfile &&
    left.sourceId === right.sourceId &&
    left.sourceSha256 === right.sourceSha256 &&
    (left.sourceOverlay === null || right.sourceOverlay === null
      ? left.sourceOverlay === right.sourceOverlay
      : left.sourceOverlay.id === right.sourceOverlay.id &&
        left.sourceOverlay.sha256 === right.sourceOverlay.sha256);
}

export function requirePublicationStimulus(
  value: unknown,
  identity: ExecutionPublicationIdentity,
  commandId: string,
  revision: number,
  logicalTime: number,
  label: string,
): void {
  requireObject(value, label);
  if (readOwn(value, "commandId") !== commandId) {
    throw new TypeError(`${label}.commandId does not match its batch`);
  }
  switch (readOwn(value, "kind")) {
    case StimulusKind.StartProcess:
      exact(value, label, ["kind", "commandId", "processId", "instanceId", "initialVariables"]);
      requireStartIdentity(value, identity, revision, label);
      requirePatch(readOwn(value, "initialVariables"), `${label}.initialVariables`);
      return;
    case StimulusKind.TriggerMessageStart:
      exact(value, label, ["kind", "commandId", "processId", "instanceId", "startEventId", "channel"]);
      requireStartIdentity(value, identity, revision, label);
      requireNonemptyString(readOwn(value, "startEventId"), `${label}.startEventId`);
      if (requireChannel(readOwn(value, "channel"), `${label}.channel`).kind !== MessageChannelKind.OperationMessage) {
        throw new TypeError(`${label}.channel must be operation-addressed`);
      }
      return;
    case StimulusKind.TriggerTimerStart:
      exact(value, label, ["kind", "commandId", "processId", "instanceId", "startEventId"]);
      requireStartIdentity(value, identity, revision, label);
      requireNonemptyString(readOwn(value, "startEventId"), `${label}.startEventId`);
      return;
    case StimulusKind.CompleteUserTaskInstance:
      exact(value, label, ["kind", "commandId", "taskId", "submittedValues"]);
      requireOccurrence(readOwn(value, "taskId"), `${label}.taskId`);
      requirePatch(readOwn(value, "submittedValues"), `${label}.submittedValues`);
      return;
    case StimulusKind.DeliverMessage:
      exact(value, label, ["kind", "commandId", "subscriptionId", "channel"]);
      requireOccurrence(readOwn(value, "subscriptionId"), `${label}.subscriptionId`);
      requireChannel(readOwn(value, "channel"), `${label}.channel`);
      return;
    case StimulusKind.FireTimer:
      exact(value, label, ["kind", "commandId", "timerId", "logicalTimeMs"]);
      requireOccurrence(readOwn(value, "timerId"), `${label}.timerId`);
      if (readOwn(value, "logicalTimeMs") !== logicalTime) {
        throw new TypeError(`${label}.logicalTimeMs must equal its successor state time`);
      }
      return;
    case StimulusKind.CompleteEffect:
      exact(value, label, ["kind", "commandId", "effectId", "result"]);
      requireOccurrence(readOwn(value, "effectId"), `${label}.effectId`);
      requireEffectResult(readOwn(value, "result"), `${label}.result`);
      return;
    case StimulusKind.ReportEffectFailure:
      exact(value, label, ["kind", "commandId", "effectId", "generation"]);
      requireOccurrence(readOwn(value, "effectId"), `${label}.effectId`);
      if (readOwn(value, "generation") !== 1) throw new TypeError(`${label}.generation must be one`);
      return;
    case StimulusKind.RetryIncident:
      exact(value, label, ["kind", "commandId", "incidentId"]);
      requireIncidentId(readOwn(value, "incidentId"), `${label}.incidentId`);
      return;
    case StimulusKind.CancelIncidentProcess:
      exact(value, label, ["kind", "commandId", "processInstanceId", "incidentId"]);
      if (readOwn(value, "processInstanceId") !== identity.processInstanceId) {
        throw new TypeError(`${label}.processInstanceId does not match`);
      }
      requireIncidentId(readOwn(value, "incidentId"), `${label}.incidentId`);
      return;
    default:
      throw new TypeError(`${label} has an unknown stimulus kind`);
  }
}

export function requirePublicationInternalTransition(
  value: object,
  delta: PublicControlPositionDelta,
  label: string,
): void {
  exact(value, label, ["kind", "operationId", "operationKind", "origin", "owner"]);
  if (readOwn(value, "kind") !== SemanticTransitionKind.InternalOperation) {
    throw new TypeError(`${label} must be an internal operation`);
  }
  requireNonemptyString(readOwn(value, "operationId"), `${label}.operationId`);
  if (!Object.values(SemanticOperationKind).includes(readOwn(value, "operationKind") as never)) {
    throw new TypeError(`${label}.operationKind is unknown`);
  }
  const origin = readOwn(value, "origin");
  requireObject(origin, `${label}.origin`);
  exact(origin, `${label}.origin`, ["kind", "elementId"]);
  if (readOwn(origin, "kind") !== "bpmnElement") throw new TypeError(`${label}.origin kind is invalid`);
  requireNonemptyString(readOwn(origin, "elementId"), `${label}.origin.elementId`);
  const owner = requireScopeId(readOwn(value, "owner"), `${label}.owner`);
  const tokens = [...delta.consumedTokens, ...delta.producedTokens];
  const scopes = [...delta.enteredScopes, ...delta.exitedScopes];
  if (!tokens.some((token) => samePublicationScope(token.owner, owner)) &&
    !scopes.some((scope) => samePublicationScope(scope.id, owner) ||
      (scope.parent !== null && samePublicationScope(scope.parent, owner)))) {
    throw new TypeError(`${label}.owner is absent from its position delta`);
  }
}

export function requirePublicationPositionDelta(
  value: unknown,
  label: string,
): PublicControlPositionDelta {
  requireObject(value, label);
  exact(value, label, ["consumedTokens", "producedTokens", "enteredScopes", "exitedScopes"]);
  const consumedTokens = requirePublicationTokenPositions(readOwn(value, "consumedTokens"), `${label}.consumedTokens`);
  const producedTokens = requirePublicationTokenPositions(readOwn(value, "producedTokens"), `${label}.producedTokens`);
  const enteredScopes = requirePublicationScopePositions(readOwn(value, "enteredScopes"), false, `${label}.enteredScopes`);
  const exitedScopes = requirePublicationScopePositions(readOwn(value, "exitedScopes"), false, `${label}.exitedScopes`);
  if (!disjoint(consumedTokens, producedTokens, samePublicationToken) ||
    !disjoint(enteredScopes, exitedScopes, samePublicationScopePosition)) {
    throw new TypeError(`${label} consumed/produced or entered/exited positions overlap`);
  }
  return value as PublicControlPositionDelta;
}

export function requirePublicationState(
  value: unknown,
  instanceId: string,
): StateObservation {
  const label = "execution publication current.state";
  requireObject(value, label);
  const hasMultiInstances = Object.hasOwn(value, "openMultiInstances");
  exact(value, label, hasMultiInstances ? executionPublicationStateAcceptedKeys
    : executionPublicationStateAcceptedKeys.filter((key) => key !== "openMultiInstances"));
  if (readOwn(value, "kind") !== "state" || readOwn(value, "instanceId") !== instanceId) {
    throw new TypeError(`${label} has the wrong instance identity`);
  }
  const status = readOwn(value, "status");
  if (!Object.values(ProcessStatus).includes(status as never)) throw new TypeError(`${label}.status is invalid`);
  const waits = requireActiveWaits(readOwn(value, "activeWaits"));
  const tasks = requireArray(readOwn(value, "openUserTasks"), requireOpenUserTask, "openUserTasks");
  requireCanonical(tasks, (a, b) => compareOccurrence(a.id, b.id), "openUserTasks");
  const messages = requireArray(readOwn(value, "openMessageSubscriptions"), requireOpenMessage, "openMessageSubscriptions");
  requireCanonical(messages, (a, b) => compareOccurrence(a.id, b.id), "openMessageSubscriptions");
  const timers = requireArray(readOwn(value, "openTimers"), requireOpenTimer, "openTimers");
  requireCanonical(timers, (a, b) => compareOccurrence(a.id, b.id), "openTimers");
  const effects = requireArray(readOwn(value, "openEffects"), requireOpenEffect, "openEffects");
  requireCanonical(effects, (a, b) => compareOccurrence(a.id, b.id), "openEffects");
  const incidents = requireArray(readOwn(value, "openIncidents"), requireOpenIncident, "openIncidents");
  requireCanonical(incidents, (a, b) => compareOccurrence(a.effect.id, b.effect.id), "openIncidents");
  const multiInstances = hasMultiInstances
    ? requireOpenMultiInstances(
      readOwn(value, "openMultiInstances"),
      tasks,
      instanceId,
    )
    : [];
  requirePatch(readOwn(value, "variables"), `${label}.variables`);
  const interactions = readOwn(value, "enabledInteractions");
  requireEnabledInteractions(interactions, tasks, messages, incidents, instanceId);
  requireNonnegativeSafeInteger(readOwn(value, "logicalTimeMs"), `${label}.logicalTimeMs`);
  if (status !== ProcessStatus.Running && [waits, tasks, messages, timers, effects, incidents, multiInstances, interactions]
    .some((items) => (items as unknown[]).length !== 0)) {
    throw new TypeError(`terminal ${label} must have no open work`);
  }
  return value as StateObservation;
}

export function requirePublicationTokenPositions(
  value: unknown,
  label: string,
): PublicControlTokenPosition[] {
  const tokens = requireArray(value, (item, itemLabel) => {
    requireObject(item, itemLabel);
    exact(item, itemLabel, ["sequenceFlowId", "owner", "multiplicity"]);
    return {
      sequenceFlowId: requireNonemptyString(readOwn(item, "sequenceFlowId"), `${itemLabel}.sequenceFlowId`),
      owner: requireScopeId(readOwn(item, "owner"), `${itemLabel}.owner`),
      multiplicity: requirePositiveSafeInteger(readOwn(item, "multiplicity"), `${itemLabel}.multiplicity`),
    };
  }, label);
  requireCanonical(tokens, compareToken, label);
  return value as PublicControlTokenPosition[];
}

export function requirePublicationScopePositions(
  value: unknown,
  closedParents: boolean,
  label: string,
): PublicScopePosition[] {
  const scopes = requireArray(value, (item, itemLabel) => {
    requireObject(item, itemLabel);
    exact(item, itemLabel, ["id", "parent", "bpmnElementId"]);
    const parent = readOwn(item, "parent");
    return {
      id: requireScopeId(readOwn(item, "id"), `${itemLabel}.id`),
      parent: parent === null ? null : requireScopeId(parent, `${itemLabel}.parent`),
      bpmnElementId: requireNonemptyString(readOwn(item, "bpmnElementId"), `${itemLabel}.bpmnElementId`),
    };
  }, label);
  requireCanonical(scopes, (a, b) => compareScope(a.id, b.id), label);
  if (closedParents && scopes.some(({ parent }) => parent !== null &&
    !scopes.some(({ id }) => samePublicationScope(id, parent)))) {
    throw new TypeError(`${label} contains a missing parent scope`);
  }
  return value as PublicScopePosition[];
}

export function samePublicationScope(left: ScopeOccurrenceId, right: ScopeOccurrenceId): boolean {
  return compareScope(left, right) === 0;
}

export function samePublicationToken(
  left: PublicControlTokenPosition,
  right: PublicControlTokenPosition,
): boolean {
  return left.sequenceFlowId === right.sequenceFlowId && samePublicationScope(left.owner, right.owner);
}

export function samePublicationScopePosition(
  left: PublicScopePosition,
  right: PublicScopePosition,
): boolean {
  return samePublicationScope(left.id, right.id) && left.bpmnElementId === right.bpmnElementId &&
    (left.parent === null || right.parent === null
      ? left.parent === right.parent
      : samePublicationScope(left.parent, right.parent));
}

function requireActiveWaits(value: unknown): Array<{ elementId: string; kind: string }> {
  const waits = requireArray(value, (item, label) => {
    requireObject(item, label);
    exact(item, label, ["elementId", "kind", "multiplicity"]);
    const kind = readOwn(item, "kind");
    if (!Object.values(WaitKind).includes(kind as never)) throw new TypeError(`${label}.kind is invalid`);
    requirePositiveSafeInteger(readOwn(item, "multiplicity"), `${label}.multiplicity`);
    return { elementId: requireNonemptyString(readOwn(item, "elementId"), `${label}.elementId`), kind: String(kind) };
  }, "activeWaits");
  const order = Object.values(WaitKind);
  requireCanonical(waits, (a, b) => order.indexOf(a.kind as never) - order.indexOf(b.kind as never) ||
    compareScalarStrings(a.elementId, b.elementId), "activeWaits");
  return waits;
}

const openUserTaskOptionalKeys = ["metadata", "inputs"] as const;

function requireOpenUserTask(value: unknown, label: string) {
  requireObject(value, label);
  const present = openUserTaskOptionalKeys.filter((key) => Object.hasOwn(value, key));
  exact(value, label, ["id", "name", "state", ...present]);
  const id = requireOccurrence(readOwn(value, "id"), `${label}.id`);
  const name = readOwn(value, "name");
  if (name !== null) requireNonemptyString(name, `${label}.name`);
  if (readOwn(value, "state") !== "active") throw new TypeError(`${label}.state must be active`);
  if (present.includes("metadata")) requireUserTaskMetadata(readOwn(value, "metadata"), `${label}.metadata`);
  if (present.includes("inputs")) requireTaskInputs(readOwn(value, "inputs"), `${label}.inputs`);
  return { id };
}

/**
 * Requires exactly the one published Activity DataInput binding.
 *
 * The admitted profile fills a single input, so an empty or longer collection is a producer defect
 * rather than a shape to tolerate: accepting it here would let the platform present a task as having
 * no Activity data when the engine says it has some.
 */
function requireTaskInputs(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new TypeError(`${label} must publish exactly one Activity DataInput binding`);
  }
  requirePatch(value, label);
}

function requireOpenMessage(value: unknown, label: string) {
  requireObject(value, label);
  exact(value, label, ["id", "channel"]);
  return {
    id: requireOccurrence(readOwn(value, "id"), `${label}.id`),
    channel: requireChannel(readOwn(value, "channel"), `${label}.channel`),
  };
}

function requireOpenTimer(value: unknown, label: string) {
  requireObject(value, label);
  exact(value, label, ["id", "deadlineMs"]);
  requireNonnegativeSafeInteger(readOwn(value, "deadlineMs"), `${label}.deadlineMs`);
  return { id: requireOccurrence(readOwn(value, "id"), `${label}.id`) };
}

function requireOpenEffect(value: unknown, label: string) {
  requireObject(value, label);
  exact(value, label, ["id", "descriptor", "arguments"]);
  const descriptor = readOwn(value, "descriptor");
  requireObject(descriptor, `${label}.descriptor`);
  exact(descriptor, `${label}.descriptor`, ["protocol", "operation"]);
  requireNonemptyString(readOwn(descriptor, "protocol"), `${label}.descriptor.protocol`);
  requireNonemptyString(readOwn(descriptor, "operation"), `${label}.descriptor.operation`);
  requirePatch(readOwn(value, "arguments"), `${label}.arguments`);
  return { id: requireOccurrence(readOwn(value, "id"), `${label}.id`) };
}

function requireOpenIncident(value: unknown, label: string) {
  requireObject(value, label);
  exact(value, label, ["kind", "id", "effect"]);
  if (readOwn(value, "kind") !== "effectExecutionFailed") throw new TypeError(`${label}.kind is invalid`);
  const id = requireIncidentId(readOwn(value, "id"), `${label}.id`);
  const effect = requireOpenEffect(readOwn(value, "effect"), `${label}.effect`);
  if (!sameOccurrence(id.effectId, effect.id)) throw new TypeError(`${label} effect identity must equal incident identity`);
  return { id, effect };
}

function requireEnabledInteractions(
  value: unknown,
  tasks: Array<{ id: OccurrenceId }>,
  messages: Array<{ id: OccurrenceId; channel: MessageChannel }>,
  incidents: Array<{ id: { effectId: OccurrenceId } }>,
  instanceId: string,
): void {
  if (!isDenseArray(value)) throw new TypeError("enabledInteractions must be a dense array");
  let index = 0;
  for (const task of tasks) {
    const item = requireInteraction(value[index++], StimulusKind.CompleteUserTaskInstance, ["kind", "taskId"]);
    if (!sameOccurrence(requireOccurrence(readOwn(item, "taskId"), "enabled task identity"), task.id)) throw new TypeError("enabled task identity drift");
  }
  for (const message of messages) {
    const item = requireInteraction(value[index++], StimulusKind.DeliverMessage, ["kind", "subscriptionId", "channel"]);
    if (!sameOccurrence(requireOccurrence(readOwn(item, "subscriptionId"), "enabled message identity"), message.id) ||
      !sameChannel(requireChannel(readOwn(item, "channel"), "enabled message channel"), message.channel)) {
      throw new TypeError("enabled message identity drift");
    }
  }
  for (const incident of incidents) {
    const item = requireInteraction(value[index++], StimulusKind.RetryIncident, ["kind", "incidentId"]);
    if (!sameIncident(requireIncidentId(readOwn(item, "incidentId"), "enabled incident identity"), incident.id)) {
      throw new TypeError("enabled incident identity drift");
    }
  }
  if (index < value.length) {
    const item = requireInteraction(value[index++], StimulusKind.CancelIncidentProcess, ["kind", "processInstanceId", "incidentId"]);
    const incident = requireIncidentId(readOwn(item, "incidentId"), "enabled cancellation identity");
    if (readOwn(item, "processInstanceId") !== instanceId || !incidents.some(({ id }) => sameIncident(incident, id))) {
      throw new TypeError("enabled cancellation identity drift");
    }
  }
  if (index !== value.length) throw new TypeError("enabledInteractions do not match open occurrences");
}

function requireInteraction(value: unknown, kind: string, keys: string[]): object {
  requireObject(value, "enabled interaction");
  exact(value, "enabled interaction", keys);
  if (readOwn(value, "kind") !== kind) throw new TypeError("enabled interaction order or kind is invalid");
  return value;
}

function requirePatch(value: unknown, label: string): void {
  const patch = requireArray(value, (item, itemLabel) => {
    requireObject(item, itemLabel);
    exact(item, itemLabel, ["name", "value"]);
    const name = requireNonemptyString(readOwn(item, "name"), `${itemLabel}.name`);
    requirePublicationVariableValue(readOwn(item, "value"), `${itemLabel}.value`);
    return { name };
  }, label);
  requireCanonical(patch, (a, b) => compareScalarStrings(a.name, b.name), label);
}

function requireChannel(value: unknown, label: string): MessageChannel {
  requireObject(value, label);
  switch (readOwn(value, "kind")) {
    case MessageChannelKind.OperationMessage:
      exact(value, label, ["kind", "interfaceId", "interfaceOperationId", "messageId"]);
      requireNonemptyString(readOwn(value, "interfaceId"), `${label}.interfaceId`);
      requireNonemptyString(readOwn(value, "interfaceOperationId"), `${label}.interfaceOperationId`);
      requireNonemptyString(readOwn(value, "messageId"), `${label}.messageId`);
      return value as MessageChannel;
    case MessageChannelKind.DirectMessage:
      exact(value, label, ["kind", "messageId"]);
      requireNonemptyString(readOwn(value, "messageId"), `${label}.messageId`);
      return value as MessageChannel;
    default:
      throw new TypeError(`${label}.kind is unknown`);
  }
}

function requireEffectResult(value: unknown, label: string): void {
  requireObject(value, label);
  switch (readOwn(value, "kind")) {
    case EffectExecutionResultKind.Success:
      exact(value, label, ["kind", "localPatch"]);
      requirePatch(readOwn(value, "localPatch"), `${label}.localPatch`);
      return;
    case EffectExecutionResultKind.BpmnError:
      exact(value, label, ["kind", "code", "message", "localPatch"]);
      requireNonemptyString(readOwn(value, "code"), `${label}.code`);
      if (readOwn(value, "message") !== null) requireNonemptyString(readOwn(value, "message"), `${label}.message`);
      requirePatch(readOwn(value, "localPatch"), `${label}.localPatch`);
      return;
    default:
      throw new TypeError(`${label}.kind is unknown`);
  }
}

function requireUserTaskMetadata(value: unknown, label: string): void {
  requireObject(value, label);
  const hasForm = Object.hasOwn(value, "form");
  exact(value, label, hasForm ? ["assignment", "form"] : ["assignment"]);
  const assignment = readOwn(value, "assignment");
  requireObject(assignment, `${label}.assignment`);
  exact(assignment, `${label}.assignment`, ["candidates"]);
  const candidates = readOwn(assignment, "candidates");
  if (!isDenseArray(candidates) || candidates.length !== 1) throw new TypeError(`${label}.candidates must contain one group`);
  const candidate = candidates[0];
  requireObject(candidate, `${label}.candidate`);
  exact(candidate, `${label}.candidate`, ["kind", "id"]);
  if (readOwn(candidate, "kind") !== "group") throw new TypeError(`${label}.candidate.kind must be group`);
  requireMetadataIdentity(readOwn(candidate, "id"), `${label}.candidate.id`, true);
  if (!hasForm) return;
  const form = readOwn(value, "form");
  requireObject(form, `${label}.form`);
  exact(form, `${label}.form`, ["fields"]);
  const fields = readOwn(form, "fields");
  if (!isDenseArray(fields) || fields.length !== 1) throw new TypeError(`${label}.fields must contain one field`);
  const field = fields[0];
  requireObject(field, `${label}.field`);
  exact(field, `${label}.field`, ["key", "type"]);
  requireMetadataIdentity(readOwn(field, "key"), `${label}.field.key`, false);
  if (readOwn(field, "type") !== "string" && readOwn(field, "type") !== "boolean") {
    throw new TypeError(`${label}.field.type is invalid`);
  }
}

function requireMetadataIdentity(value: unknown, label: string, candidate: boolean): void {
  const identity = requireNonemptyString(value, label);
  const boundarySpace = /^[\s\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\s\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/u;
  if (boundarySpace.test(identity) || (candidate &&
    (identity.includes(",") || identity.includes("${") || identity.includes("#{")))) {
    throw new TypeError(`${label} is not an admitted metadata identity`);
  }
}

function requireStartIdentity(
  value: object,
  identity: ExecutionPublicationIdentity,
  revision: number,
  label: string,
): void {
  if (revision !== 1 || readOwn(value, "processId") !== identity.processId ||
    readOwn(value, "instanceId") !== identity.processInstanceId) {
    throw new TypeError(`${label} start identity or revision is invalid`);
  }
}

function requireOccurrence(value: unknown, label: string): OccurrenceId {
  requireObject(value, label);
  exact(value, label, ["processInstanceId", "elementId", "activation"]);
  requireNonemptyString(readOwn(value, "processInstanceId"), `${label}.processInstanceId`);
  requireNonemptyString(readOwn(value, "elementId"), `${label}.elementId`);
  requirePositiveSafeInteger(readOwn(value, "activation"), `${label}.activation`);
  return value as OccurrenceId;
}

function requireScopeId(value: unknown, label: string): ScopeOccurrenceId {
  requireObject(value, label);
  exact(value, label, ["processInstanceId", "definitionScopeId", "activation"]);
  requireNonemptyString(readOwn(value, "processInstanceId"), `${label}.processInstanceId`);
  requireNonemptyString(readOwn(value, "definitionScopeId"), `${label}.definitionScopeId`);
  requirePositiveSafeInteger(readOwn(value, "activation"), `${label}.activation`);
  return value as ScopeOccurrenceId;
}

function requireIncidentId(value: unknown, label: string): { effectId: OccurrenceId; generation: 1 } {
  requireObject(value, label);
  exact(value, label, ["effectId", "generation"]);
  if (readOwn(value, "generation") !== 1) throw new TypeError(`${label}.generation must be one`);
  return { effectId: requireOccurrence(readOwn(value, "effectId"), `${label}.effectId`), generation: 1 };
}

function requireArray<T>(
  value: unknown,
  decode: (item: unknown, label: string) => T,
  label: string,
): T[] {
  if (!isDenseArray(value)) throw new TypeError(`${label} must be a dense array`);
  return value.map((item, index) => decode(item, `${label}[${index}]`));
}

function requireCanonical<T>(
  items: T[],
  compare: (left: T, right: T) => number,
  label: string,
): void {
  if (items.some((item, index) => index > 0 && compare(items[index - 1]!, item) >= 0)) {
    throw new TypeError(`${label} must use canonical strict ascending order`);
  }
}

function exact(value: object, label: string, keys: ReadonlyArray<string>): void {
  requireExactKeys(value, label, keys);
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && Reflect.ownKeys(value).length === value.length + 1 &&
    Reflect.ownKeys(value).every((key) => key === "length" ||
      (typeof key === "string" && /^(?:0|[1-9][0-9]*)$/u.test(key) && Number(key) < value.length));
}

function requireDigest(value: unknown, label: string): void {
  if (typeof value !== "string" || !lowercaseSha256.test(value)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
  }
}

function requireWireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.isWellFormed()) {
    throw new TypeError(`${label} must contain well-formed Unicode`);
  }
  return value;
}

function compareScalarStrings(left: string, right: string): number {
  const a = Array.from(left, (scalar) => scalar.codePointAt(0)!);
  const b = Array.from(right, (scalar) => scalar.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}

function compareOccurrence(left: OccurrenceId, right: OccurrenceId): number {
  return compareScalarStrings(left.processInstanceId, right.processInstanceId) ||
    compareScalarStrings(left.elementId, right.elementId) || left.activation - right.activation;
}

function compareScope(left: ScopeOccurrenceId, right: ScopeOccurrenceId): number {
  return compareScalarStrings(left.processInstanceId, right.processInstanceId) ||
    compareScalarStrings(left.definitionScopeId, right.definitionScopeId) || left.activation - right.activation;
}

function compareToken(left: PublicControlTokenPosition, right: PublicControlTokenPosition): number {
  return compareScalarStrings(left.sequenceFlowId, right.sequenceFlowId) || compareScope(left.owner, right.owner);
}

function sameOccurrence(left: OccurrenceId, right: OccurrenceId): boolean {
  return compareOccurrence(left, right) === 0;
}

function sameChannel(left: MessageChannel, right: MessageChannel): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameIncident(left: { effectId: OccurrenceId }, right: { effectId: OccurrenceId }): boolean {
  return sameOccurrence(left.effectId, right.effectId);
}

function disjoint<T>(
  left: readonly T[],
  right: readonly T[],
  same: (a: T, b: T) => boolean,
): boolean {
  return left.every((item) => !right.some((candidate) => same(item, candidate)));
}
