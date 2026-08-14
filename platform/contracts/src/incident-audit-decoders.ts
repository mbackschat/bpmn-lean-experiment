import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import { decodePublicApiErrorResponse } from "./definition-decoders.js";
import {
  IncidentAuditApiErrorCodes,
} from "./incident-errors.js";
import type {
  IncidentAuditApiResponse,
} from "./incidents.js";
import {
  decodePublicEffectIncidentId,
} from "./incident-decoders.js";
import type {
  IncidentAuditActionKind,
  IncidentAuditEvent,
  IncidentAuditOutcome,
  IncidentAuditPage,
  IncidentAuditRequest,
} from "./incident-audit.js";

const requestFields = new Set([
  "actionKind",
  "actorId",
  "cursor",
  "hostingProcessInstanceId",
  "incidentActivation",
  "incidentElementId",
  "incidentGeneration",
  "incidentProcessInstanceId",
  "limit",
]);
const opaqueCursor = /^v1\.[A-Za-z0-9_-]+$/u;
const canonicalUtcInstant =
  /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/u;

/** Decodes one exact incident-action audit event. */
export function decodeIncidentAuditEvent(
  value: unknown,
  label = "incident audit event",
): IncidentAuditEvent {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "actionId",
    "actionKind",
    "actorId",
    "eventId",
    "hostingProcessInstanceId",
    "incidentId",
    "outcome",
    "recordedAt",
  ]);
  const hostingProcessInstanceId = requireNonemptyString(
    readOwn(value, "hostingProcessInstanceId"),
    `${label}.hostingProcessInstanceId`,
  );
  const incidentId = decodePublicEffectIncidentId(
    readOwn(value, "incidentId"),
    `${label}.incidentId`,
  );
  if (hostingProcessInstanceId !== incidentId.effectId.processInstanceId) {
    throw new TypeError(`${label}.hosting identity must equal incident identity`);
  }
  return {
    eventId: requireNonemptyString(readOwn(value, "eventId"), `${label}.eventId`),
    actorId: requireNonemptyString(readOwn(value, "actorId"), `${label}.actorId`),
    recordedAt: decodeCanonicalIncidentAuditTimestamp(
      readOwn(value, "recordedAt"),
      `${label}.recordedAt`,
    ),
    hostingProcessInstanceId,
    incidentId,
    actionId: requireNonemptyString(readOwn(value, "actionId"), `${label}.actionId`),
    actionKind: decodeIncidentAuditActionKind(
      readOwn(value, "actionKind"),
      `${label}.actionKind`,
    ),
    outcome: decodeIncidentAuditOutcome(
      readOwn(value, "outcome"),
      `${label}.outcome`,
    ),
  };
}

/** Decodes one public audit page while keeping insertion ordinals private. */
export function decodeIncidentAuditPage(value: unknown): IncidentAuditPage {
  requireObject(value, "incident audit page");
  requireExactKeys(value, "incident audit page", ["events", "nextCursor"]);
  const eventsValue = readOwn(value, "events");
  if (!Array.isArray(eventsValue)) {
    throw new TypeError("incident audit page.events must be an array");
  }
  const events = eventsValue.map((event, index) =>
    decodeIncidentAuditEvent(event, `incident audit page.events[${index}]`)
  );
  if (new Set(events.map(({ eventId }) => eventId)).size !== events.length) {
    throw new TypeError("incident audit page.events must not repeat an event identity");
  }
  const nextCursor = readOwn(value, "nextCursor");
  return {
    events,
    nextCursor: nextCursor === null
      ? null
      : decodeOpaqueIncidentAuditCursor(
          nextCursor,
          "incident audit page.nextCursor",
        ),
  };
}

/** Decodes the closed optional audit filters without adding defaults. */
export function decodeIncidentAuditRequest(
  value: unknown,
): IncidentAuditRequest {
  requireObject(value, "incident audit request");
  requireKnownRequestFields(value);
  requireCompleteIncidentFilter(value);
  return {
    ...(Object.hasOwn(value, "actorId")
      ? {
          actorId: requireNonemptyString(
            readOwn(value, "actorId"),
            "incident audit request.actorId",
          ),
        }
      : {}),
    ...(Object.hasOwn(value, "hostingProcessInstanceId")
      ? {
          hostingProcessInstanceId: requireNonemptyString(
            readOwn(value, "hostingProcessInstanceId"),
            "incident audit request.hostingProcessInstanceId",
          ),
        }
      : {}),
    ...(Object.hasOwn(value, "incidentProcessInstanceId")
      ? {
          incidentProcessInstanceId: requireNonemptyString(
            readOwn(value, "incidentProcessInstanceId"),
            "incident audit request.incidentProcessInstanceId",
          ),
          incidentElementId: requireNonemptyString(
            readOwn(value, "incidentElementId"),
            "incident audit request.incidentElementId",
          ),
          incidentActivation: requirePositiveSafeInteger(
            readOwn(value, "incidentActivation"),
            "incident audit request.incidentActivation",
          ),
          incidentGeneration: decodeGeneration(
            readOwn(value, "incidentGeneration"),
            "incident audit request.incidentGeneration",
          ),
        }
      : {}),
    ...(Object.hasOwn(value, "actionKind")
      ? {
          actionKind: decodeIncidentAuditActionKind(
            readOwn(value, "actionKind"),
            "incident audit request.actionKind",
          ),
        }
      : {}),
    ...(Object.hasOwn(value, "cursor")
      ? {
          cursor: decodeOpaqueIncidentAuditCursor(
            readOwn(value, "cursor"),
            "incident audit request.cursor",
          ),
        }
      : {}),
    ...(Object.hasOwn(value, "limit")
      ? { limit: decodeIncidentAuditLimit(readOwn(value, "limit")) }
      : {}),
  };
}

export function decodeIncidentAuditApiResponse(
  value: unknown,
): IncidentAuditApiResponse {
  return value !== null && typeof value === "object" && Object.hasOwn(value, "error")
    ? decodePublicApiErrorResponse(value, IncidentAuditApiErrorCodes)
    : decodeIncidentAuditPage(value);
}

export function decodeOpaqueIncidentAuditCursor(
  value: unknown,
  label = "incident audit cursor",
): string {
  if (typeof value !== "string" || !opaqueCursor.test(value)) {
    throw new TypeError(`${label} must be a nonempty unpadded v1 base64url cursor`);
  }
  return value;
}

export function decodeCanonicalIncidentAuditTimestamp(
  value: unknown,
  label = "incident audit timestamp",
): string {
  if (
    typeof value !== "string" ||
    !canonicalUtcInstant.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new TypeError(`${label} must be a canonical millisecond UTC instant`);
  }
  return value;
}

export function decodeIncidentAuditActionKind(
  value: unknown,
  label = "incident audit action kind",
): IncidentAuditActionKind {
  switch (value) {
    case "retryIncident":
    case "cancelIncidentProcess":
      return value;
    default:
      throw new TypeError(`${label} is not public`);
  }
}

function decodeIncidentAuditOutcome(
  value: unknown,
  label: string,
): IncidentAuditOutcome {
  switch (value) {
    case "reserved":
    case "committed":
    case "rejected":
    case "indeterminate":
      return value;
    default:
      throw new TypeError(`${label} is not public`);
  }
}

function requireKnownRequestFields(value: object): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !requestFields.has(key)) {
      throw new TypeError("incident audit request contains an unknown field");
    }
  }
}

function requireCompleteIncidentFilter(value: object): void {
  const fields = [
    "incidentProcessInstanceId",
    "incidentElementId",
    "incidentActivation",
    "incidentGeneration",
  ];
  const present = fields.filter((field) => Object.hasOwn(value, field)).length;
  if (present !== 0 && present !== fields.length) {
    throw new TypeError(
      "incident audit identity filters must all be present or all be absent",
    );
  }
}

function decodeGeneration(value: unknown, label: string): 1 {
  if (value !== 1) throw new TypeError(`${label} must be 1`);
  return 1;
}

function decodeIncidentAuditLimit(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 100
  ) {
    throw new TypeError("incident audit request.limit must be an integer from 1 through 100");
  }
  return value;
}
