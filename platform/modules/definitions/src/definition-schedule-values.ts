import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionTimerStartCapability,
} from "./contracts.js";
import {
  equalDefinitionStartCapabilities,
} from "./definition-capabilities.js";
import {
  cloneDefinitionMetadata,
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
  timerStart: DefinitionTimerStartCapability,
  activationAt: string,
  dueAt: string,
): void {
  if (
    record.activationAt !== activationAt ||
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

export function equalDefinitionMetadata(
  left: DefinitionMetadata,
  right: DefinitionMetadata,
): boolean {
  return left.processId === right.processId &&
    left.version === right.version &&
    left.semanticProfile === right.semanticProfile &&
    equalDefinitionSource(left.source, right.source) &&
    equalDefinitionStartCapabilities(
      left.startCapabilities,
      right.startCapabilities,
    );
}

export function equalDefinitionSource(
  left: DefinitionMetadata["source"],
  right: DefinitionMetadata["source"],
): boolean {
  return left.kind === right.kind &&
    left.id === right.id &&
    left.sha256 === right.sha256 &&
    left.byteLength === right.byteLength &&
    left.declaredEncoding === right.declaredEncoding &&
    left.decodedAs === right.decodedAs;
}

export function deriveScheduleDueAt(
  activationAt: string,
  durationMs: number,
): string {
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs % 1_000 !== 0) {
    throw new DefinitionScheduleValidationError(
      "Timer Start duration must be a positive whole-second duration",
    );
  }
  const dueMs = Date.parse(activationAt) + durationMs;
  if (!Number.isSafeInteger(dueMs)) {
    throw new DefinitionScheduleValidationError("derived schedule due instant is out of range");
  }
  try {
    return new Date(dueMs).toISOString();
  } catch {
    throw new DefinitionScheduleValidationError("derived schedule due instant is out of range");
  }
}

export function requireWholeSecondActivation(value: string): string {
  if (typeof value !== "string" || !value.endsWith(".000Z")) {
    throw new DefinitionScheduleValidationError(
      "activationAt must be a canonical whole-second UTC instant",
    );
  }
  const timestamp = Date.parse(value);
  let canonical: string;
  try {
    canonical = new Date(timestamp).toISOString();
  } catch {
    throw new DefinitionScheduleValidationError("activationAt is out of range");
  }
  if (canonical !== value) {
    throw new DefinitionScheduleValidationError("activationAt must be canonical");
  }
  return value;
}

export function projectDefinitionSchedule(
  record: DefinitionScheduleRecord,
): DefinitionSchedule {
  const base = {
    scheduleId: record.reference.scheduleId,
    definition: cloneDefinitionMetadata(record.definition),
    timerStart: { ...record.timerStart },
    activationAt: record.activationAt,
    dueAt: record.dueAt,
  };
  switch (record.state) {
    case DefinitionScheduleState.Scheduled:
    case DefinitionScheduleState.Missed:
    case DefinitionScheduleState.Cancelled:
      return { ...base, status: record.state, instance: null };
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
