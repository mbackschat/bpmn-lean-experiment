import type {
  DeployedDefinitionVersion,
  PublicTimerStartCapability,
} from "./definitions.js";
import type { PublicProcessInstanceIdentity } from "./process-instances.js";

/** Public terminal and pending states of one immutable definition schedule. */
export const DefinitionScheduleStatus = {
  Scheduled: "scheduled",
  Started: "started",
  Missed: "missed",
  Cancelled: "cancelled",
} as const;

export type DefinitionScheduleStatus =
  typeof DefinitionScheduleStatus[keyof typeof DefinitionScheduleStatus];

/** Closed request for one immutable definition-schedule activation. */
export type PutDefinitionScheduleRequest = Readonly<{
  activationAt: string;
}>;

/** Facts shared by every public definition-schedule lifecycle state. */
export type DefinitionScheduleBase = Readonly<{
  scheduleId: string;
  definition: DeployedDefinitionVersion;
  timerStart: PublicTimerStartCapability;
  activationAt: string;
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

/** The exact public 409 body selected for an immutable schedule conflict. */
export type DefinitionScheduleConflictErrorResponse = Readonly<{
  error: Readonly<{
    code: "conflict";
    message: string;
  }>;
}>;
