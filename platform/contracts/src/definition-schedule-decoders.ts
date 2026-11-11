import {
  decodeDeployedDefinitionVersion,
  decodePublicTimerStartCapability,
} from "./deployed-definition-decoder.js";
import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireObject,
  requireString,
} from "./decoder-primitives.js";
import { DefinitionScheduleStatus } from "./definition-schedules.js";
import type {
  DefinitionSchedule,
  DefinitionScheduleBase,
  DefinitionScheduleConflictErrorResponse,
  DefinitionScheduleListResponse,
  DefinitionScheduleOccurrenceListResponse,
  PutDefinitionScheduleRequest,
} from "./definition-schedules.js";
import type { DeployedDefinitionVersion, PublicTimerStartCapability } from "./definitions.js";
import { PublicApiErrorCode } from "./definitions.js";
import { decodePublicProcessInstanceIdentity } from "./process-instance-decoders.js";

const canonicalUtc =
  /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/u;

/** Decodes the one-field immutable schedule request. */
export function decodePutDefinitionScheduleRequest(
  value: unknown,
): PutDefinitionScheduleRequest {
  requireObject(value, "schedule request");
  requireExactKeys(value, "schedule request", ["dueAt"]);
  return { dueAt: decodeCanonicalUtcInstant(readOwn(value, "dueAt"), "dueAt") };
}

/** Requires the exact `Date.prototype.toISOString` millisecond rendering of a real UTC instant. */
export function decodeCanonicalUtcInstant(
  value: unknown,
  label: string,
): string {
  const instant = requireString(value, label);
  if (!canonicalUtc.test(instant)) {
    throw new TypeError(`${label} must be a canonical UTC instant`);
  }
  const milliseconds = Date.parse(instant);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== instant
  ) {
    throw new TypeError(`${label} must be a canonical UTC instant`);
  }
  return instant;
}

/** Decodes one closed schedule item and validates its repeated exact identities. */
export function decodeDefinitionSchedule(
  value: unknown,
  label = "definition schedule",
): DefinitionSchedule {
  requireObject(value, label);
  const status = readOwn(value, "status");
  requireExactKeys(value, label, [
    "definition",
    "dueAt",
    "instance",
    ...(status === DefinitionScheduleStatus.Refused ? ["refusal"] : []),
    "scheduleId",
    "status",
    "timerStart",
  ]);
  const base = decodeScheduleBase(value, label);
  const instance = readOwn(value, "instance");
  switch (status) {
    case DefinitionScheduleStatus.Refused:
      if (instance !== null) {
        throw new TypeError("refused schedule.instance must be null");
      }
      return {
        ...base,
        status,
        instance,
        refusal: requireNonemptyString(readOwn(value, "refusal"), `${label}.refusal`),
      };
    case DefinitionScheduleStatus.Scheduled:
    case DefinitionScheduleStatus.Missed:
    case DefinitionScheduleStatus.Cancelled:
      if (instance !== null) {
        throw new TypeError(`${status} schedule.instance must be null`);
      }
      return { ...base, status, instance };
    case DefinitionScheduleStatus.Started: {
      if (instance === null) {
        throw new TypeError(
          "started schedule.instance must be a public Process-instance identity",
        );
      }
      const decodedInstance = decodePublicProcessInstanceIdentity(instance);
      if (!definitionsEqual(decodedInstance.definition, base.definition)) {
        throw new TypeError("instance.definition must equal definition");
      }
      return { ...base, status, instance: decodedInstance };
    }
    default:
      throw new TypeError(
        "definition schedule.status is not a public schedule status",
      );
  }
}

/** Decodes the closed schedule list for one exact deployed definition. */
export function decodeDefinitionScheduleListResponse(
  value: unknown,
): DefinitionScheduleListResponse {
  requireObject(value, "definition schedule list");
  requireExactKeys(value, "definition schedule list", ["definition", "schedules"]);
  const definition = decodeDeployedDefinitionVersion(
    readOwn(value, "definition"),
    "definition",
  );
  const schedulesValue = readOwn(value, "schedules");
  if (!Array.isArray(schedulesValue)) {
    throw new TypeError("schedules must be an array");
  }
  const schedules = Array.from(schedulesValue, (schedule, index) => {
    const decoded = decodeDefinitionSchedule(schedule, `schedules[${index}]`);
    if (!definitionsEqual(decoded.definition, definition)) {
      throw new TypeError(`schedules[${index}].definition must equal definition`);
    }
    return decoded;
  });
  return { definition, schedules };
}

/** Decodes the closed occurrence list of one exact deployed definition's Timer start, in strictly ascending due order. */
export function decodeDefinitionScheduleOccurrenceListResponse(
  value: unknown,
): DefinitionScheduleOccurrenceListResponse {
  const label = "definition schedule occurrences";
  requireObject(value, label);
  requireExactKeys(value, label, ["definition", "occurrences", "timerStart"]);
  const definition = decodeDeployedDefinitionVersion(readOwn(value, "definition"), "definition");
  const timerStart = decodePublishedTimerStart(definition, readOwn(value, "timerStart"), `${label}.timerStart`);
  const occurrencesValue = readOwn(value, "occurrences");
  if (!Array.isArray(occurrencesValue)) {
    throw new TypeError("occurrences must be an array");
  }
  const occurrences = Array.from(occurrencesValue, (occurrence, index) => {
    const itemLabel = `occurrences[${index}]`;
    requireObject(occurrence, itemLabel);
    requireExactKeys(occurrence, itemLabel, ["dueAt"]);
    return { dueAt: decodeCanonicalUtcInstant(readOwn(occurrence, "dueAt"), `${itemLabel}.dueAt`) };
  });
  occurrences.forEach((occurrence, index) => {
    const previous = occurrences[index - 1];
    if (previous !== undefined && Date.parse(previous.dueAt) >= Date.parse(occurrence.dueAt)) {
      throw new TypeError("occurrences must be in strictly ascending due order");
    }
  });
  return { definition, timerStart, occurrences };
}

/** Decodes only the selected closed 409 schedule-conflict body. */
export function decodeDefinitionScheduleConflictErrorResponse(
  value: unknown,
): DefinitionScheduleConflictErrorResponse {
  requireObject(value, "schedule conflict response");
  requireExactKeys(value, "schedule conflict response", ["error"]);
  const error = readOwn(value, "error");
  requireObject(error, "schedule conflict error");
  requireExactKeys(error, "schedule conflict error", ["code", "message"]);
  const code = readOwn(error, "code");
  if (code !== PublicApiErrorCode.Conflict) {
    throw new TypeError("schedule conflict error.code must be conflict");
  }
  return {
    error: {
      code,
      message: requireNonemptyString(
        readOwn(error, "message"),
        "schedule conflict error.message",
      ),
    },
  };
}

function decodeScheduleBase(value: object, label: string): DefinitionScheduleBase {
  const definition = decodeDeployedDefinitionVersion(
    readOwn(value, "definition"),
    `${label}.definition`,
  );
  return {
    scheduleId: requireNonemptyString(
      readOwn(value, "scheduleId"),
      `${label}.scheduleId`,
    ),
    definition,
    timerStart: decodePublishedTimerStart(definition, readOwn(value, "timerStart"), `${label}.timerStart`),
    dueAt: decodeCanonicalUtcInstant(readOwn(value, "dueAt"), `${label}.dueAt`),
  };
}

function decodePublishedTimerStart(
  definition: DeployedDefinitionVersion,
  value: unknown,
  label: string,
): PublicTimerStartCapability {
  const timerStart = decodePublicTimerStartCapability(value, label);
  if (!definition.startCapabilities.timerStarts.some((capability) =>
    capability.startEventId === timerStart.startEventId &&
    capability.durationMs === timerStart.durationMs
  )) {
    throw new TypeError(
      "timerStart must be published by definition.startCapabilities",
    );
  }
  return timerStart;
}

function definitionsEqual(
  left: DeployedDefinitionVersion,
  right: DeployedDefinitionVersion,
): boolean {
  return left.processId === right.processId &&
    left.version === right.version &&
    left.semanticProfile === right.semanticProfile &&
    left.source.kind === right.source.kind &&
    left.source.id === right.source.id &&
    left.source.sha256 === right.source.sha256 &&
    left.source.byteLength === right.source.byteLength &&
    left.source.declaredEncoding === right.source.declaredEncoding &&
    left.source.decodedAs === right.source.decodedAs &&
    left.startCapabilities.messageStarts.length ===
      right.startCapabilities.messageStarts.length &&
    left.startCapabilities.messageStarts.every((capability, index) => {
      const other = right.startCapabilities.messageStarts[index];
      return other !== undefined &&
        capability.startEventId === other.startEventId &&
        capability.channel.kind === other.channel.kind &&
        capability.channel.interfaceId === other.channel.interfaceId &&
        capability.channel.interfaceOperationId ===
          other.channel.interfaceOperationId &&
        capability.channel.messageId === other.channel.messageId;
    }) &&
    left.startCapabilities.timerStarts.length ===
      right.startCapabilities.timerStarts.length &&
    left.startCapabilities.timerStarts.every((capability, index) => {
      const other = right.startCapabilities.timerStarts[index];
      return other !== undefined &&
        capability.startEventId === other.startEventId &&
        capability.durationMs === other.durationMs;
    });
}
