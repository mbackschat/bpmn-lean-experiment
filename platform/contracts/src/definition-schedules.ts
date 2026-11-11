import type {
  DeployedDefinitionVersion,
  PublicTimerStartCapability,
} from "./definitions.js";
import type { PublicProcessInstanceIdentity } from "./process-instances.js";

/** Public terminal and pending states of one immutable definition schedule. */
export const DefinitionScheduleStatus = {
  Scheduled: "scheduled",
  Started: "started",
  /** The occurrence fired and the engine started nothing, such as after a later version superseded this one. */
  Refused: "refused",
  Missed: "missed",
  Cancelled: "cancelled",
} as const;

export type DefinitionScheduleStatus =
  typeof DefinitionScheduleStatus[keyof typeof DefinitionScheduleStatus];

/**
 * Closed request for one immutable definition schedule: the occurrence of the version's Timer start it fires, named by
 * its canonical UTC due instant, one the occurrences route lists.
 */
export type PutDefinitionScheduleRequest = Readonly<{
  dueAt: string;
}>;

/** Facts shared by every public definition-schedule lifecycle state. */
export type DefinitionScheduleBase = Readonly<{
  scheduleId: string;
  definition: DeployedDefinitionVersion;
  timerStart: PublicTimerStartCapability;
  dueAt: string;
}>;

export type DefinitionSchedule =
  | (DefinitionScheduleBase & Readonly<{
      status: typeof DefinitionScheduleStatus.Scheduled;
      instance: null;
    }>)
  | (DefinitionScheduleBase & Readonly<{
      status: typeof DefinitionScheduleStatus.Started;
      instance: PublicProcessInstanceIdentity;
    }>)
  | (DefinitionScheduleBase & Readonly<{
      status: typeof DefinitionScheduleStatus.Refused;
      instance: null;
      /** The engine's refusal code, such as `timer-start-superseded`. */
      refusal: string;
    }>)
  | (DefinitionScheduleBase & Readonly<{
      status: typeof DefinitionScheduleStatus.Missed;
      instance: null;
    }>)
  | (DefinitionScheduleBase & Readonly<{
      status: typeof DefinitionScheduleStatus.Cancelled;
      instance: null;
    }>);

/** Stable schedule-ID-ordered schedules for one exact definition version. */
export type DefinitionScheduleListResponse = Readonly<{
  definition: DeployedDefinitionVersion;
  schedules: readonly DefinitionSchedule[];
}>;

/** One occurrence of a version's Timer start a schedule can fire. */
export type DefinitionScheduleOccurrence = Readonly<{
  dueAt: string;
}>;

/** The engine's occurrences of one exact version's Timer start, due at or after the requested instant, in due order. */
export type DefinitionScheduleOccurrenceListResponse = Readonly<{
  definition: DeployedDefinitionVersion;
  timerStart: PublicTimerStartCapability;
  occurrences: readonly DefinitionScheduleOccurrence[];
}>;

/** The most occurrences one listing returns, and the number listed when the request names none. */
export const definitionScheduleOccurrenceLimit = { maximum: 100, default: 10 } as const;

/** The exact public 409 body selected for an immutable schedule conflict. */
export type DefinitionScheduleConflictErrorResponse = Readonly<{
  error: Readonly<{
    code: "conflict";
    message: string;
  }>;
}>;
