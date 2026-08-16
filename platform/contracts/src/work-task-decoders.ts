import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireNonnegativeSafeInteger,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import { decodePublicWorkTaskId } from "./work-task-snapshot-decoders.js";
import type {
  WorkAuditAction,
  WorkAuditEvent,
  WorkAuditPage,
  WorkClaimRequest,
  WorkClaimResult,
  WorkReleaseResult,
} from "./work-tasks.js";

export {
  decodeWorkApiErrorResponse,
  decodeWorkCompletionRequest,
  decodeWorkCompletionResult,
} from "./work-completion-decoders.js";
export {
  decodePublicFormValue,
  decodePublicTaskDetail,
} from "./work-task-form-decoders.js";
export {
  decodePublicWorkTask,
  decodePublicWorkTaskId,
  decodeWorkTaskSnapshot,
} from "./work-task-snapshot-decoders.js";

const opaqueAuditCursor = /^v1\.[A-Za-z0-9_-]+$/u;
const canonicalUtcInstant =
  /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/u;

export function decodeWorkClaimRequest(value: unknown): WorkClaimRequest {
  requireObject(value, "Work claim request");
  requireExactKeys(value, "Work claim request", ["actionId", "expectedGeneration"]);
  return {
    actionId: requireNonemptyString(readOwn(value, "actionId"), "Work claim request.actionId"),
    expectedGeneration: requireNonnegativeSafeInteger(
      readOwn(value, "expectedGeneration"),
      "Work claim request.expectedGeneration",
    ),
  };
}

export function decodeWorkClaimResult(value: unknown): WorkClaimResult {
  requireObject(value, "Work claim result");
  requireExactKeys(value, "Work claim result", ["claim", "taskId"]);
  const claim = readOwn(value, "claim");
  requireObject(claim, "Work claim result.claim");
  requireExactKeys(claim, "Work claim result.claim", ["actorId", "generation"]);
  return {
    taskId: decodePublicWorkTaskId(readOwn(value, "taskId"), "Work claim result.taskId"),
    claim: {
      actorId: requireNonemptyString(
        readOwn(claim, "actorId"),
        "Work claim result.claim.actorId",
      ),
      generation: requirePositiveSafeInteger(
        readOwn(claim, "generation"),
        "Work claim result.claim.generation",
      ),
    },
  };
}

export function decodeWorkReleaseResult(value: unknown): WorkReleaseResult {
  requireObject(value, "Work release result");
  requireExactKeys(value, "Work release result", [
    "claimGeneration",
    "released",
    "taskId",
  ]);
  if (readOwn(value, "released") !== true) {
    throw new TypeError("Work release result.released must be true");
  }
  return {
    taskId: decodePublicWorkTaskId(readOwn(value, "taskId"), "Work release result.taskId"),
    claimGeneration: requireNonnegativeSafeInteger(
      readOwn(value, "claimGeneration"),
      "Work release result.claimGeneration",
    ),
    released: true,
  };
}

export function decodeWorkAuditPage(value: unknown): WorkAuditPage {
  requireObject(value, "Work audit page");
  requireExactKeys(value, "Work audit page", ["events", "nextCursor"]);
  const eventsValue = readOwn(value, "events");
  if (!Array.isArray(eventsValue)) {
    throw new TypeError("Work audit page.events must be an array");
  }
  const events = eventsValue.map((event, index) =>
    decodeWorkAuditEvent(event, `Work audit page.events[${index}]`)
  );
  if (new Set(events.map(({ eventId }) => eventId)).size !== events.length) {
    throw new TypeError("Work audit page.events must not repeat an event identity");
  }
  const nextCursor = readOwn(value, "nextCursor");
  return {
    events,
    nextCursor: nextCursor === null
      ? null
      : decodeOpaqueWorkAuditCursor(nextCursor, "Work audit page.nextCursor"),
  };
}

export function decodeWorkAuditEvent(
  value: unknown,
  label = "Work audit event",
): WorkAuditEvent {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "action",
    "actorId",
    "eventId",
    "hostingProcessInstanceId",
    "recordedAt",
    "taskId",
  ]);
  return {
    eventId: requireNonemptyString(readOwn(value, "eventId"), `${label}.eventId`),
    actorId: requireNonemptyString(readOwn(value, "actorId"), `${label}.actorId`),
    recordedAt: decodeCanonicalWorkAuditTimestamp(
      readOwn(value, "recordedAt"),
      `${label}.recordedAt`,
    ),
    hostingProcessInstanceId: requireNonemptyString(
      readOwn(value, "hostingProcessInstanceId"),
      `${label}.hostingProcessInstanceId`,
    ),
    taskId: decodePublicWorkTaskId(readOwn(value, "taskId"), `${label}.taskId`),
    action: decodeWorkAuditAction(readOwn(value, "action"), `${label}.action`),
  };
}

/** Validates the public cursor syntax while leaving its exclusive position opaque. */
export function decodeOpaqueWorkAuditCursor(
  value: unknown,
  label = "Work audit cursor",
): string {
  if (typeof value !== "string" || !opaqueAuditCursor.test(value)) {
    throw new TypeError(`${label} must be a nonempty unpadded v1 base64url cursor`);
  }
  return value;
}

export function decodeCanonicalWorkAuditTimestamp(
  value: unknown,
  label = "Work audit timestamp",
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

function decodeWorkAuditAction(value: unknown, label: string): WorkAuditAction {
  requireObject(value, label);
  requireExactKeys(value, label, ["actionId", "kind", "outcome"]);
  const actionId = requireNonemptyString(readOwn(value, "actionId"), `${label}.actionId`);
  const kind = readOwn(value, "kind");
  const outcome = readOwn(value, "outcome");
  switch (kind) {
    case "claim":
      switch (outcome) {
        case "claimed":
        case "idempotent":
        case "conflict":
          return { kind, actionId, outcome };
        default:
          throw new TypeError(`${label}.outcome is not a claim outcome`);
      }
    case "release":
      switch (outcome) {
        case "released":
        case "idempotent":
        case "conflict":
          return { kind, actionId, outcome };
        default:
          throw new TypeError(`${label}.outcome is not a release outcome`);
      }
    case "completion":
      switch (outcome) {
        case "reserved":
        case "committed":
        case "rejected":
        case "indeterminate":
          return { kind, actionId, outcome };
        default:
          throw new TypeError(`${label}.outcome is not a completion outcome`);
      }
    default:
      throw new TypeError(`${label}.kind is not a public audit action kind`);
  }
}
