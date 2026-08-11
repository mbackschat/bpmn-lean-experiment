import type {
  DefinitionSchedule,
  DefinitionScheduleConflictErrorResponse,
  DefinitionScheduleListResponse,
  DeployedDefinitionVersion,
  PutDefinitionScheduleRequest,
  PublicTimerStartCapability,
} from "../src/index.js";

declare const capability: PublicTimerStartCapability;

// @ts-expect-error Timer Start capability identity is immutable.
capability.startEventId = "replacement";
// @ts-expect-error Timer Start duration is immutable.
capability.durationMs = 2000;

declare const definition: DeployedDefinitionVersion;

// @ts-expect-error The capability container is immutable.
definition.startCapabilities = { timerStarts: [] };
// @ts-expect-error The Timer Start capability array is immutable.
definition.startCapabilities.timerStarts.push(capability);
if (definition.startCapabilities.timerStarts[0] !== undefined) {
  // @ts-expect-error Values inside the capability array are immutable.
  definition.startCapabilities.timerStarts[0].durationMs = 2000;
}

declare const request: PutDefinitionScheduleRequest;

// @ts-expect-error The activation request is immutable.
request.activationAt = "2026-08-11T12:00:01.000Z";

declare const discriminantSchedule: DefinitionSchedule;

// @ts-expect-error The schedule discriminant is immutable.
discriminantSchedule.status = "cancelled";

declare const schedule: DefinitionSchedule;

// @ts-expect-error The exact nested definition is immutable.
schedule.definition.source.sha256 = "0".repeat(64);
// @ts-expect-error The selected Timer Start capability is immutable.
schedule.timerStart.durationMs = 3000;
// @ts-expect-error Temporal Workflow identity is not public schedule state.
schedule.workflowId;
// @ts-expect-error Temporal Run identity is not public schedule state.
schedule.firstExecutionRunId;
// @ts-expect-error Temporal task queues are not public schedule state.
schedule.taskQueue;
// @ts-expect-error Temporal Schedule actions are not public schedule state.
schedule.action;

if (schedule.status === "started") {
  // @ts-expect-error The semantic Process-instance identity is immutable.
  schedule.instance.processInstanceId = "replacement";
  const nestedCapability =
    schedule.instance.definition.startCapabilities.timerStarts[0];
  if (nestedCapability !== undefined) {
    // @ts-expect-error The instance's exact nested definition is immutable.
    nestedCapability.startEventId = "replacement";
  }
}

declare const list: DefinitionScheduleListResponse;

// @ts-expect-error Schedule list arrays are immutable.
list.schedules.push(schedule);
if (list.schedules[0] !== undefined) {
  // @ts-expect-error Schedule values inside the list are immutable.
  list.schedules[0].activationAt = "2026-08-11T12:00:01.000Z";
}

declare const conflict: DefinitionScheduleConflictErrorResponse;

// @ts-expect-error The conflict discriminant is immutable.
conflict.error.code = "conflict";
// @ts-expect-error The conflict message is immutable.
conflict.error.message = "replacement";
