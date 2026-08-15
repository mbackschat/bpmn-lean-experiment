import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireObject,
} from "./decoder-primitives.js";
import { decodeIncidentAuditEvent } from "./incident-audit-decoders.js";
import {
  OperatorAuditMaximumEventsPerStream,
  operatorAuditExportFormat,
} from "./operator-audit-export.js";
import type { OperatorAuditExport } from "./operator-audit-export.js";
import { decodePublicProcessInstanceIdentity } from "./process-instance-decoders.js";
import type { PublicProcessInstanceIdentity } from "./process-instances.js";
import { sameCanonicalJsonBytes, serializeCanonicalJsonValue } from "./canonical-json.js";
import { decodeWorkAuditEvent } from "./work-task-decoders.js";
import type { WorkAuditEvent } from "./work-tasks.js";
import type { IncidentAuditEvent } from "./incident-audit.js";

/** Decodes the exact closed v1 envelope without asserting a cross-stream chronology. */
export function decodeOperatorAuditExport(
  value: unknown,
  confirmedInstance: PublicProcessInstanceIdentity,
): OperatorAuditExport {
  const expectedInstance = decodePublicProcessInstanceIdentity(
    confirmedInstance,
    "confirmed operator audit instance",
  );
  requireObject(value, "operator audit export");
  requireExactKeys(value, "operator audit export", [
    "format",
    "incidentActions",
    "instance",
    "work",
  ]);
  if (readOwn(value, "format") !== operatorAuditExportFormat) {
    throw new TypeError("operator audit export has an unknown format");
  }
  const instance = decodePublicProcessInstanceIdentity(
    readOwn(value, "instance"),
    "operator audit export.instance",
  );
  if (!sameCanonicalValue(instance, expectedInstance)) {
    throw new TypeError("operator audit export instance does not match the confirmed instance");
  }
  const work = decodeStream(
    readOwn(value, "work"),
    "operator audit export.work",
    decodeWorkAuditEvent,
  );
  const incidentActions = decodeStream(
    readOwn(value, "incidentActions"),
    "operator audit export.incidentActions",
    decodeIncidentAuditEvent,
  );
  const allEvents: ReadonlyArray<WorkAuditEvent | IncidentAuditEvent> = [
    ...work.events,
    ...incidentActions.events,
  ];
  const eventIds = new Set<string>();
  for (const event of allEvents) {
    if (event.hostingProcessInstanceId !== instance.processInstanceId) {
      throw new TypeError("operator audit event hosting identity does not match the confirmed instance");
    }
    if (eventIds.has(event.eventId)) {
      throw new TypeError("operator audit streams must not repeat an event identity");
    }
    eventIds.add(event.eventId);
  }
  return {
    format: operatorAuditExportFormat,
    instance,
    work,
    incidentActions,
  };
}

function decodeStream<Event>(
  value: unknown,
  label: string,
  decodeEvent: (value: unknown, label: string) => Event,
): Readonly<{ headEventId: string | null; events: readonly Event[] }> {
  requireObject(value, label);
  requireExactKeys(value, label, ["events", "headEventId"]);
  const eventsValue = readOwn(value, "events");
  if (!isDenseArray(eventsValue)) {
    throw new TypeError(`${label}.events must be a dense array`);
  }
  if (eventsValue.length > OperatorAuditMaximumEventsPerStream) {
    throw new TypeError(`${label}.events exceeds the public event ceiling`);
  }
  const events = eventsValue.map((event, index) =>
    decodeEvent(event, `${label}.events[${index}]`)
  );
  const headValue = readOwn(value, "headEventId");
  const headEventId = headValue === null
    ? null
    : requireNonemptyString(headValue, `${label}.headEventId`);
  if (events.length === 0) {
    if (headEventId !== null) {
      throw new TypeError(`${label}.headEventId must be null exactly when events is empty`);
    }
  } else if (headEventId !== requireEventId(events.at(-1), `${label}.events`)) {
    throw new TypeError(`${label}.headEventId must equal the last event identity`);
  }
  return { headEventId, events };
}

function requireEventId(value: unknown, label: string): string {
  requireObject(value, `${label} last event`);
  return requireNonemptyString(readOwn(value, "eventId"), `${label} last event.eventId`);
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.every((_, index) => Object.hasOwn(value, index));
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return sameCanonicalJsonBytes(
    serializeCanonicalJsonValue(left),
    serializeCanonicalJsonValue(right),
  );
}
