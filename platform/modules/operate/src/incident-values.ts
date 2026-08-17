import type {
  CancelIncidentProcessInteraction,
  ConfirmedProcessOperationsPublication,
  EffectIncident,
  IncidentActionBinding,
  IncidentActionRequest,
  IncidentActionResult,
  IncidentAuditEvent,
  IncidentId,
  IncidentObservationResult,
  IncidentPublishedOperations,
  OperateProcessObservation,
  StoredIncidentAction,
} from "./incident-contracts.js";
import {
  decodeStoredProcessInstanceIdentity,
  encodeProcessInstanceIdentity,
} from "./process-instance-values.js";

const canonicalTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export function snapshotConfirmedPublication(
  value: ConfirmedProcessOperationsPublication,
): ConfirmedProcessOperationsPublication {
  if (!isRecord(value) || !hasOnlyKeys(value, ["instance", "locator"])) {
    throw new TypeError("confirmed Process publication must be exact");
  }
  const instance = decodeStoredProcessInstanceIdentity(
    encodeProcessInstanceIdentity(value.instance),
  );
  return {
    instance,
    locator: requireNonemptyString(value.locator, "locator"),
  };
}

export function snapshotObservationResult(
  value: unknown,
  hostingProcessInstanceId: string,
): IncidentObservationResult {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new TypeError("incident observation is malformed");
  }
  switch (value.status) {
    case "closed":
    case "unknown":
    case "unavailable":
      if (!hasOnlyKeys(value, ["status"])) {
        throw new TypeError("incident observation is malformed");
      }
      return { status: value.status };
    case "observed": {
      if (!hasOnlyKeys(value, ["status", "incidents"]) || !Array.isArray(value.incidents)) {
        throw new TypeError("incident observation is malformed");
      }
      const incidents = value.incidents.map((candidate) =>
        snapshotPublishedOperations(candidate, hostingProcessInstanceId)
      );
      for (let index = 1; index < incidents.length; index += 1) {
        if (compareIncidentIds(incidents[index - 1]!.incident.id, incidents[index]!.incident.id) >= 0) {
          throw new TypeError("incident observation is not canonically ordered");
        }
      }
      return { status: "observed", incidents };
    }
    default:
      throw new TypeError("incident observation has an unsupported status");
  }
}

export function snapshotIncidentActionRequest(value: unknown): IncidentActionRequest {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new TypeError("incident interaction is malformed");
  }
  switch (value.kind) {
    case "retryIncident":
      if (!hasOnlyKeys(value, ["kind", "incidentId"])) {
        throw new TypeError("Retry interaction is malformed");
      }
      return { kind: "retryIncident", incidentId: snapshotIncidentId(value.incidentId) };
    case "cancelIncidentProcess":
      if (!hasOnlyKeys(value, ["kind", "processInstanceId", "incidentId"])) {
        throw new TypeError("Cancel interaction is malformed");
      }
      return {
        kind: "cancelIncidentProcess",
        processInstanceId: requireNonemptyString(value.processInstanceId, "processInstanceId"),
        incidentId: snapshotIncidentId(value.incidentId),
      };
    default:
      throw new TypeError("incident interaction has an unsupported kind");
  }
}

export function snapshotActionBinding(value: IncidentActionBinding): IncidentActionBinding {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "actionId",
    "actorId",
    "hostingInstance",
    "locator",
    "incident",
    "interaction",
  ])) {
    throw new TypeError("incident action binding must be exact");
  }
  const publication = snapshotConfirmedPublication({
    instance: value.hostingInstance,
    locator: value.locator,
  });
  const incident = snapshotEffectIncident(
    value.incident,
    publication.instance.processInstanceId,
  );
  const interaction = snapshotIncidentActionRequest(value.interaction);
  requireInteractionMatches(interaction, incident.id, publication.instance.processInstanceId);
  return {
    actionId: requireNonemptyString(value.actionId, "actionId"),
    actorId: requireNonemptyString(value.actorId, "actorId"),
    hostingInstance: publication.instance,
    locator: publication.locator,
    incident,
    interaction,
  };
}

export function snapshotActionResult(value: IncidentActionResult): IncidentActionResult {
  if (!isRecord(value) || typeof value.state !== "string") {
    throw new TypeError("incident action result is malformed");
  }
  const common = {
    actionId: requireNonemptyString(value.actionId, "actionId"),
    interaction: snapshotIncidentActionRequest(value.interaction),
  };
  switch (value.state) {
    case "committed":
    case "indeterminate":
      if (!hasOnlyKeys(value, ["state", "actionId", "interaction"])) {
        throw new TypeError("incident action result is malformed");
      }
      return { state: value.state, ...common };
    case "rejected": {
      if (!hasOnlyKeys(value, ["state", "actionId", "interaction", "engineResult"]) ||
          !isRecord(value.engineResult) || typeof value.engineResult.kind !== "string") {
        throw new TypeError("incident action rejection is malformed");
      }
      const engineResult = snapshotRejectedEngineResult(value.engineResult);
      return { state: "rejected", ...common, engineResult };
    }
    default:
      throw new TypeError("incident action result has unsupported state");
  }
}

export function snapshotAuditEvent(value: IncidentAuditEvent): IncidentAuditEvent {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "eventId",
    "actorId",
    "recordedAt",
    "hostingProcessInstanceId",
    "incidentId",
    "actionId",
    "actionKind",
    "outcome",
  ])) {
    throw new TypeError("incident audit event must be exact");
  }
  const event: IncidentAuditEvent = {
    eventId: requireNonemptyString(value.eventId, "eventId"),
    actorId: requireNonemptyString(value.actorId, "actorId"),
    recordedAt: requireCanonicalTimestamp(value.recordedAt),
    hostingProcessInstanceId: requireNonemptyString(
      value.hostingProcessInstanceId,
      "hostingProcessInstanceId",
    ),
    incidentId: snapshotIncidentId(value.incidentId),
    actionId: requireNonemptyString(value.actionId, "actionId"),
    actionKind: requireActionKind(value.actionKind),
    outcome: requireAuditOutcome(value.outcome),
  };
  if (event.hostingProcessInstanceId !== event.incidentId.effectId.processInstanceId) {
    throw new TypeError("incident audit Process identities disagree");
  }
  return event;
}

export function decodeStoredAction(
  bindingJson: unknown,
  state: unknown,
  resultJson: unknown,
): StoredIncidentAction {
  try {
    const encodedBinding = requireNonemptyString(bindingJson, "binding_json");
    const binding = snapshotActionBinding(JSON.parse(encodedBinding));
    if (JSON.stringify(binding) !== encodedBinding) {
      throw new TypeError("stored action binding is not canonical JSON");
    }
    const exactState = requireActionState(state);
    const encodedResult = resultJson === null
      ? null
      : requireNonemptyString(resultJson, "result_json");
    const result = encodedResult === null
      ? null
      : snapshotActionResult(JSON.parse(encodedResult));
    if (result !== null && JSON.stringify(result) !== encodedResult) {
      throw new TypeError("stored action result is not canonical JSON");
    }
    if ((exactState === "committed" || exactState === "rejected" || exactState === "indeterminate") !== (result !== null)) {
      throw new TypeError("stored action state and result disagree");
    }
    if (result !== null && (
      result.actionId !== binding.actionId ||
      !sameJson(result.interaction, binding.interaction)
    )) {
      throw new TypeError("stored action result and binding disagree");
    }
    return { binding, state: exactState, result };
  } catch (error: unknown) {
    throw error;
  }
}

export function requireObservation(value: unknown): OperateProcessObservation {
  if (value === "active" || value === "closed" || value === "indeterminate") return value;
  throw new TypeError("Process observation is invalid");
}

export function compareCanonicalStrings(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return leftPoints.length === rightPoints.length
    ? 0
    : leftPoints.length < rightPoints.length ? -1 : 1;
}

export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function requirePositiveSafeInteger(value: unknown, label: string): number {
  const decoded = typeof value === "bigint" ? Number(value) : value;
  if (typeof decoded !== "number" || !Number.isSafeInteger(decoded) || decoded <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return decoded;
}

export function requireNonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || !isWellFormedUnicode(value)) {
    throw new TypeError(`${label} must be a nonempty well-formed Unicode string`);
  }
  return value;
}

function snapshotPublishedOperations(
  value: unknown,
  hostingProcessInstanceId: string,
): IncidentPublishedOperations {
  if (!isRecord(value) || !hasOnlyKeys(value, ["incident", "interactions"]) || !Array.isArray(value.interactions)) {
    throw new TypeError("published incident operations are malformed");
  }
  const incident = snapshotEffectIncident(value.incident, hostingProcessInstanceId);
  if (value.interactions.length !== 1 && value.interactions.length !== 2) {
    throw new TypeError("published incident action set is unsupported");
  }
  const retry = snapshotIncidentActionRequest(value.interactions[0]);
  if (retry.kind !== "retryIncident") throw new TypeError("Retry must be the first incident action");
  requireInteractionMatches(retry, incident.id, hostingProcessInstanceId);
  const cancelValue = value.interactions[1];
  if (cancelValue === undefined) return { incident, interactions: [retry] };
  const cancel = snapshotIncidentActionRequest(cancelValue);
  if (cancel.kind !== "cancelIncidentProcess") throw new TypeError("Cancel must be the second incident action");
  requireInteractionMatches(cancel, incident.id, hostingProcessInstanceId);
  return { incident, interactions: [retry, cancel] };
}

function snapshotEffectIncident(value: unknown, hostingProcessInstanceId: string): EffectIncident {
  if (!isRecord(value) || !hasOnlyKeys(value, ["kind", "id", "effect"]) ||
      value.kind !== "effectExecutionFailed" || !isRecord(value.effect) ||
      !hasOnlyKeys(value.effect, ["id", "descriptor", "arguments"]) ||
      !isRecord(value.effect.descriptor) ||
      !hasOnlyKeys(value.effect.descriptor, ["protocol", "operation"]) ||
      !Array.isArray(value.effect.arguments) || value.effect.arguments.length !== 0) {
    throw new TypeError("effect incident is malformed or unsupported");
  }
  const id = snapshotIncidentId(value.id);
  const effectId = snapshotOccurrenceId(value.effect.id);
  if (!sameJson(id.effectId, effectId) || effectId.processInstanceId !== hostingProcessInstanceId) {
    throw new TypeError("effect incident identities disagree");
  }
  return {
    kind: "effectExecutionFailed",
    id,
    effect: {
      id: effectId,
      descriptor: {
        protocol: requireNonemptyString(value.effect.descriptor.protocol, "effect protocol"),
        operation: requireNonemptyString(value.effect.descriptor.operation, "effect operation"),
      },
      arguments: [],
    },
  };
}

function snapshotIncidentId(value: unknown): IncidentId {
  if (!isRecord(value) || !hasOnlyKeys(value, ["effectId", "generation"]) || value.generation !== 1) {
    throw new TypeError("incident ID must be exact generation 1");
  }
  return { effectId: snapshotOccurrenceId(value.effectId), generation: 1 };
}

function snapshotOccurrenceId(value: unknown) {
  if (!isRecord(value) || !hasOnlyKeys(value, ["processInstanceId", "elementId", "activation"])) {
    throw new TypeError("effect occurrence ID must be exact");
  }
  return {
    processInstanceId: requireNonemptyString(value.processInstanceId, "incident processInstanceId"),
    elementId: requireNonemptyString(value.elementId, "incident elementId"),
    activation: requirePositiveSafeInteger(value.activation, "incident activation"),
  };
}

function requireInteractionMatches(
  interaction: IncidentActionRequest,
  incidentId: IncidentId,
  hostingProcessInstanceId: string,
): void {
  if (!sameJson(interaction.incidentId, incidentId) ||
      incidentId.effectId.processInstanceId !== hostingProcessInstanceId ||
      (interaction.kind === "cancelIncidentProcess" && interaction.processInstanceId !== hostingProcessInstanceId)) {
    throw new TypeError("incident interaction identities disagree");
  }
}

function compareIncidentIds(left: IncidentId, right: IncidentId): number {
  const process = compareCanonicalStrings(left.effectId.processInstanceId, right.effectId.processInstanceId);
  if (process !== 0) return process;
  const element = compareCanonicalStrings(left.effectId.elementId, right.effectId.elementId);
  if (element !== 0) return element;
  return left.effectId.activation - right.effectId.activation;
}

function snapshotRejectedEngineResult(
  value: Record<string, unknown>,
): Extract<IncidentActionResult, { state: "rejected" }>["engineResult"] {
  switch (value.kind) {
    case "semantic":
      if (!hasOnlyKeys(value, ["kind", "outcome"]) ||
          (value.outcome !== "rolledBack" && value.outcome !== "rejected" &&
           value.outcome !== "semanticFailure" && value.outcome !== "unsupported")) {
        throw new TypeError("semantic rejection is malformed");
      }
      return { kind: "semantic" as const, outcome: value.outcome };
    case "processClosed":
      if (!hasOnlyKeys(value, ["kind", "status"]) ||
          (value.status !== "completed" && value.status !== "cancelled")) {
        throw new TypeError("closed rejection is malformed");
      }
      return { kind: "processClosed" as const, status: value.status };
    default:
      throw new TypeError("rejected engine result is malformed");
  }
}

function requireActionState(value: unknown): StoredIncidentAction["state"] {
  if (value === "reserved" || value === "submitting" || value === "committed" ||
      value === "rejected" || value === "indeterminate") return value;
  throw new TypeError("incident action state is invalid");
}

function requireActionKind(value: unknown): IncidentActionRequest["kind"] {
  if (value === "retryIncident" || value === "cancelIncidentProcess") return value;
  throw new TypeError("incident action kind is invalid");
}

function requireAuditOutcome(value: unknown): IncidentAuditEvent["outcome"] {
  if (value === "reserved" || value === "committed" || value === "rejected" || value === "indeterminate") return value;
  throw new TypeError("incident audit outcome is invalid");
}

function requireCanonicalTimestamp(value: unknown): string {
  const timestamp = requireNonemptyString(value, "recordedAt");
  if (!canonicalTimestamp.test(timestamp) || new Date(timestamp).toISOString() !== timestamp) {
    throw new TypeError("recordedAt must be canonical UTC RFC 3339 milliseconds");
  }
  return timestamp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).toSorted();
  const expected = [...keys].toSorted();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isWellFormedUnicode(value: string): boolean {
  return !Array.from(value).some((character) => character.codePointAt(0) === undefined) &&
    !/[\uD800-\uDFFF]/u.test(Array.from(value).filter((character) => character.length === 1).join(""));
}
