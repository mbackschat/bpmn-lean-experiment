import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionScheduledTimerStart,
} from "./contracts.js";
import {
  decodeCanonicalUtcInstant,
} from "@bpmn-lean/platform-contracts";
import {
  cloneDefinitionMetadata,
  equalDefinitionMetadata,
} from "./definition-values.js";
import {
  DefinitionScheduleConflictError,
  DefinitionScheduleIntegrityError,
  DefinitionScheduleState,
  DefinitionScheduleValidationError,
} from "./definition-schedule-contracts.js";
import type {
  DefinitionSchedule,
  DefinitionScheduleRecord,
  DefinitionScheduleReference,
} from "./definition-schedule-contracts.js";

export function requireSameScheduleIntent(
  record: DefinitionScheduleRecord,
  definition: DefinitionMetadata,
  timerStart: DefinitionScheduledTimerStart,
  dueAt: string,
): void {
  if (
    record.dueAt !== dueAt ||
    record.timerStart.startEventId !== timerStart.startEventId ||
    record.timerStart.durationMs !== timerStart.durationMs ||
    !equalDefinitionMetadata(record.definition, definition)
  ) {
    throw new DefinitionScheduleConflictError(
      "schedule identity is already bound to another immutable request",
    );
  }
}

export function requireCanonicalDueAt(value: string): string {
  try {
    return decodeCanonicalUtcInstant(value, "dueAt");
  } catch {
    throw new DefinitionScheduleValidationError("dueAt must be a canonical UTC instant");
  }
}

export function projectDefinitionSchedule(
  record: DefinitionScheduleRecord,
): DefinitionSchedule {
  const base = {
    scheduleId: record.reference.scheduleId,
    definition: cloneDefinitionMetadata(record.definition),
    timerStart: { ...record.timerStart },
    dueAt: record.dueAt,
  };
  switch (record.state) {
    case DefinitionScheduleState.Scheduled:
    case DefinitionScheduleState.Missed:
    case DefinitionScheduleState.Cancelled:
      return { ...base, status: record.state, instance: null };
    case DefinitionScheduleState.Refused:
      if (record.refusalCode === null) {
        throw new DefinitionScheduleIntegrityError("refused schedule has no engine refusal code");
      }
      return { ...base, status: record.state, instance: null, refusal: record.refusalCode };
    case DefinitionScheduleState.Started:
      return {
        ...base,
        status: record.state,
        instance: {
          processInstanceId: record.identity.processInstanceId,
          definition: cloneDefinitionMetadata(record.definition),
        },
      };
    case DefinitionScheduleState.Creating:
    case DefinitionScheduleState.CreatingHost:
    case DefinitionScheduleState.Cancelling:
      throw new DefinitionScheduleIntegrityError(
        `internal schedule state ${record.state} escaped reconciliation`,
      );
    default:
      return assertNever(record.state);
  }
}

export function requireScheduleReference(
  reference: DefinitionScheduleReference,
): void {
  requireDefinitionReference(reference);
  requireScheduleIdentity(reference.scheduleId, "scheduleId");
}

export function requireDefinitionReference(reference: DefinitionReference): void {
  requireScheduleIdentity(reference.processId, "processId");
  if (!Number.isSafeInteger(reference.version) || reference.version <= 0) {
    throw new DefinitionScheduleValidationError("version must be a positive safe integer");
  }
}

export function requireScheduleIdentity(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new DefinitionScheduleValidationError(
      `${name} must be nonempty well-formed Unicode`,
    );
  }
}

export function cloneScheduleReference(
  reference: DefinitionScheduleReference,
): DefinitionScheduleReference {
  return {
    processId: reference.processId,
    version: reference.version,
    scheduleId: reference.scheduleId,
  };
}

export function cloneDefinitionReference(
  reference: DefinitionReference,
): DefinitionReference {
  return { processId: reference.processId, version: reference.version };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported definition schedule variant: ${String(value)}`);
}
