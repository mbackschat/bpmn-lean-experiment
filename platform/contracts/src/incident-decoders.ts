import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import { decodePublicApiErrorResponse } from "./definition-decoders.js";
import { PublicApiErrorCode } from "./definitions.js";
import type {
  PublicApiErrorCatalogCode,
  PublicApiErrorResponse,
} from "./definitions.js";
import {
  IncidentActionApiErrorCodes,
  IncidentDetailApiErrorCodes,
  IncidentListApiErrorCodes,
  IncidentSnapshotUnavailableMessage,
} from "./incident-errors.js";
import {
  comparePublicIncidents,
} from "./incidents.js";
import type {
  IncidentActionApiResponse,
  IncidentActionRequest,
  IncidentActionResult,
  IncidentDetailApiResponse,
  IncidentListApiResponse,
  PublicCancelIncidentProcessInteraction,
  PublicEffectIncident,
  PublicEffectIncidentId,
  PublicEffectOccurrenceId,
  PublicIncident,
  PublicIncidentSnapshot,
  PublicRetryIncidentInteraction,
} from "./incidents.js";
import { decodePublicProcessInstanceIdentity } from "./process-instance-decoders.js";

/** Decodes one complete public incident identity. */
export function decodePublicEffectOccurrenceId(
  value: unknown,
  label = "effect occurrence identity",
): PublicEffectOccurrenceId {
  requireObject(value, label);
  requireExactKeys(value, label, ["activation", "elementId", "processInstanceId"]);
  return {
    processInstanceId: requireNonemptyString(
      readOwn(value, "processInstanceId"),
      `${label}.processInstanceId`,
    ),
    elementId: requireNonemptyString(
      readOwn(value, "elementId"),
      `${label}.elementId`,
    ),
    activation: requirePositiveSafeInteger(
      readOwn(value, "activation"),
      `${label}.activation`,
    ),
  };
}

/** Decodes the closed generation-1 incident identity. */
export function decodePublicEffectIncidentId(
  value: unknown,
  label = "effect incident identity",
): PublicEffectIncidentId {
  requireObject(value, label);
  requireExactKeys(value, label, ["effectId", "generation"]);
  if (readOwn(value, "generation") !== 1) {
    throw new TypeError(`${label}.generation must be 1`);
  }
  return {
    effectId: decodePublicEffectOccurrenceId(
      readOwn(value, "effectId"),
      `${label}.effectId`,
    ),
    generation: 1,
  };
}

/** Decodes one exact payload-free effect failure. */
export function decodePublicEffectIncident(
  value: unknown,
  label = "effect incident",
): PublicEffectIncident {
  requireObject(value, label);
  requireExactKeys(value, label, ["effect", "id", "kind"]);
  if (readOwn(value, "kind") !== "effectExecutionFailed") {
    throw new TypeError(`${label}.kind must be effectExecutionFailed`);
  }
  const id = decodePublicEffectIncidentId(readOwn(value, "id"), `${label}.id`);
  const effect = readOwn(value, "effect");
  requireObject(effect, `${label}.effect`);
  requireExactKeys(effect, `${label}.effect`, ["arguments", "descriptor", "id"]);
  const effectId = decodePublicEffectOccurrenceId(
    readOwn(effect, "id"),
    `${label}.effect.id`,
  );
  if (!effectOccurrenceIdsEqual(effectId, id.effectId)) {
    throw new TypeError(`${label}.effect identity must equal incident identity`);
  }
  const descriptor = readOwn(effect, "descriptor");
  requireObject(descriptor, `${label}.effect.descriptor`);
  requireExactKeys(descriptor, `${label}.effect.descriptor`, ["operation", "protocol"]);
  const argumentsValue = readOwn(effect, "arguments");
  if (!Array.isArray(argumentsValue) || argumentsValue.length !== 0) {
    throw new TypeError(`${label}.effect.arguments must be empty`);
  }
  return {
    kind: "effectExecutionFailed",
    id,
    effect: {
      id: effectId,
      descriptor: {
        protocol: requireNonemptyString(
          readOwn(descriptor, "protocol"),
          `${label}.effect.descriptor.protocol`,
        ),
        operation: requireNonemptyString(
          readOwn(descriptor, "operation"),
          `${label}.effect.descriptor.operation`,
        ),
      },
      arguments: [],
    },
  };
}

/** Decodes Retry or incident-scoped root Cancel without constructing either identity. */
export function decodeIncidentActionRequest(
  value: unknown,
  label = "incident action request",
): IncidentActionRequest {
  requireObject(value, label);
  const kind = readOwn(value, "kind");
  switch (kind) {
    case "retryIncident":
      requireExactKeys(value, label, ["incidentId", "kind"]);
      return {
        kind,
        incidentId: decodePublicEffectIncidentId(
          readOwn(value, "incidentId"),
          `${label}.incidentId`,
        ),
      };
    case "cancelIncidentProcess": {
      requireExactKeys(value, label, ["incidentId", "kind", "processInstanceId"]);
      const processInstanceId = requireNonemptyString(
        readOwn(value, "processInstanceId"),
        `${label}.processInstanceId`,
      );
      const incidentId = decodePublicEffectIncidentId(
        readOwn(value, "incidentId"),
        `${label}.incidentId`,
      );
      if (processInstanceId !== incidentId.effectId.processInstanceId) {
        throw new TypeError(
          `${label}.Cancel Process identity must equal the incident Process identity`,
        );
      }
      return { kind, processInstanceId, incidentId };
    }
    default:
      throw new TypeError(`${label}.kind is not a public incident action`);
  }
}

/** Decodes one current incident and verifies every repeated identity. */
export function decodePublicIncident(
  value: unknown,
  label = "public incident",
): PublicIncident {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "availableInteractions",
    "hostingInstance",
    "incident",
  ]);
  const hostingInstance = decodePublicProcessInstanceIdentity(
    readOwn(value, "hostingInstance"),
    `${label}.hostingInstance`,
  );
  const incident = decodePublicEffectIncident(
    readOwn(value, "incident"),
    `${label}.incident`,
  );
  if (hostingInstance.processInstanceId !== incident.id.effectId.processInstanceId) {
    throw new TypeError(`${label}.hosting identity must equal the incident Process identity`);
  }
  const availableInteractions = readOwn(value, "availableInteractions");
  if (
    !Array.isArray(availableInteractions) ||
    (availableInteractions.length !== 1 && availableInteractions.length !== 2)
  ) {
    throw new TypeError(`${label}.availableInteractions must contain Retry and optional Cancel`);
  }
  const retry = decodeRetryInteraction(
    availableInteractions[0],
    `${label}.availableInteractions[0]`,
  );
  requireIncidentIdEqual(retry.incidentId, incident.id, `${label} Retry`);
  if (availableInteractions.length === 1) {
    return { hostingInstance, incident, availableInteractions: [retry] };
  }
  const cancel = decodeCancelInteraction(
    availableInteractions[1],
    `${label}.availableInteractions[1]`,
  );
  requireIncidentIdEqual(cancel.incidentId, incident.id, `${label} Cancel`);
  if (cancel.processInstanceId !== hostingInstance.processInstanceId) {
    throw new TypeError(
      `${label}.Cancel Process identity must equal the incident Process identity`,
    );
  }
  return { hostingInstance, incident, availableInteractions: [retry, cancel] };
}

/** Decodes one complete snapshot and verifies its canonical strict order. */
export function decodePublicIncidentSnapshot(
  value: unknown,
): PublicIncidentSnapshot {
  requireObject(value, "public incident snapshot");
  requireExactKeys(value, "public incident snapshot", ["incidents"]);
  const incidentsValue = readOwn(value, "incidents");
  if (!Array.isArray(incidentsValue)) {
    throw new TypeError("public incident snapshot.incidents must be an array");
  }
  const incidents = incidentsValue.map((incident, index) =>
    decodePublicIncident(incident, `public incident snapshot.incidents[${index}]`)
  );
  for (let index = 1; index < incidents.length; index += 1) {
    const previous = incidents[index - 1];
    const current = incidents[index];
    if (previous === undefined || current === undefined) {
      throw new TypeError("public incident snapshot contains an unreachable sparse position");
    }
    if (comparePublicIncidents(previous, current) >= 0) {
      throw new TypeError(
        "public incident snapshot.incidents must use canonical strict ascending order",
      );
    }
  }
  return { incidents };
}

export function decodeIncidentActionResult(value: unknown): IncidentActionResult {
  requireObject(value, "incident action result");
  const state = readOwn(value, "state");
  switch (state) {
    case "committed":
    case "indeterminate":
      requireExactKeys(value, "incident action result", [
        "actionId",
        "interaction",
        "state",
      ]);
      return {
        state,
        actionId: requireNonemptyString(
          readOwn(value, "actionId"),
          "incident action result.actionId",
        ),
        interaction: decodeIncidentActionRequest(
          readOwn(value, "interaction"),
          "incident action result.interaction",
        ),
      };
    case "rejected":
      requireExactKeys(value, "incident action result", [
        "actionId",
        "engineResult",
        "interaction",
        "state",
      ]);
      return {
        state,
        actionId: requireNonemptyString(
          readOwn(value, "actionId"),
          "incident action result.actionId",
        ),
        interaction: decodeIncidentActionRequest(
          readOwn(value, "interaction"),
          "incident action result.interaction",
        ),
        engineResult: decodeRejectedEngineResult(readOwn(value, "engineResult")),
      };
    default:
      throw new TypeError("incident action result.state is not public");
  }
}

export function decodeIncidentListApiResponse(
  value: unknown,
): IncidentListApiResponse {
  return hasError(value)
    ? decodeIncidentError(value, IncidentListApiErrorCodes)
    : decodePublicIncidentSnapshot(value);
}

export function decodeIncidentDetailApiResponse(
  value: unknown,
): IncidentDetailApiResponse {
  return hasError(value)
    ? decodeIncidentError(value, IncidentDetailApiErrorCodes)
    : decodePublicIncident(value);
}

export function decodeIncidentActionApiResponse(
  value: unknown,
): IncidentActionApiResponse {
  return hasError(value)
    ? decodeIncidentError(value, IncidentActionApiErrorCodes)
    : decodeIncidentActionResult(value);
}

function decodeRetryInteraction(
  value: unknown,
  label: string,
): PublicRetryIncidentInteraction {
  const interaction = decodeIncidentActionRequest(value, label);
  if (interaction.kind !== "retryIncident") {
    throw new TypeError(`${label} must be Retry`);
  }
  return interaction;
}

function decodeCancelInteraction(
  value: unknown,
  label: string,
): PublicCancelIncidentProcessInteraction {
  const interaction = decodeIncidentActionRequest(value, label);
  if (interaction.kind !== "cancelIncidentProcess") {
    throw new TypeError(`${label} must be Cancel`);
  }
  return interaction;
}

function decodeRejectedEngineResult(
  value: unknown,
): Extract<IncidentActionResult, { state: "rejected" }>["engineResult"] {
  requireObject(value, "incident action engine result");
  const kind = readOwn(value, "kind");
  switch (kind) {
    case "semantic": {
      requireExactKeys(value, "incident action engine result", ["kind", "outcome"]);
      const outcome = readOwn(value, "outcome");
      switch (outcome) {
        case "rolledBack":
        case "rejected":
        case "semanticFailure":
        case "unsupported":
          return { kind, outcome };
        default:
          throw new TypeError("incident action engine result.outcome is not public");
      }
    }
    case "processClosed": {
      requireExactKeys(value, "incident action engine result", ["kind", "status"]);
      const status = readOwn(value, "status");
      switch (status) {
        case "completed":
        case "cancelled":
          return { kind, status };
        default:
          throw new TypeError("incident action engine result.status is not terminal");
      }
    }
    default:
      throw new TypeError("incident action engine result.kind is not public");
  }
}

function hasError(value: unknown): boolean {
  return value !== null && typeof value === "object" && Object.hasOwn(value, "error");
}

function decodeIncidentError<Code extends PublicApiErrorCatalogCode>(
  value: unknown,
  allowedCodes: readonly Code[],
): PublicApiErrorResponse<Code> {
  const decoded = decodePublicApiErrorResponse(value, allowedCodes);
  if (
    decoded.error.code === PublicApiErrorCode.IncidentSnapshotUnavailable &&
    decoded.error.message !== IncidentSnapshotUnavailableMessage
  ) {
    throw new TypeError(
      "incidentSnapshotUnavailable must use its canonical message",
    );
  }
  return decoded;
}

function requireIncidentIdEqual(
  actual: PublicEffectIncidentId,
  expected: PublicEffectIncidentId,
  label: string,
): void {
  if (
    actual.generation !== expected.generation ||
    !effectOccurrenceIdsEqual(actual.effectId, expected.effectId)
  ) {
    throw new TypeError(`${label} incident identity must equal the published incident`);
  }
}

function effectOccurrenceIdsEqual(
  left: PublicEffectOccurrenceId,
  right: PublicEffectOccurrenceId,
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation;
}
