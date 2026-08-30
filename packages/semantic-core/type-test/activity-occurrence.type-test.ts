import {
  ActivityBodyKind,
  type ActivityBody,
  type ActivityOccurrence,
  type ActivityOccurrenceId,
  type ScopeOccurrenceId,
  type UserTaskInstanceId,
} from "../src/index.js";

declare const taskId: UserTaskInstanceId;
declare const scopeId: ScopeOccurrenceId;
declare const activityId: ActivityOccurrenceId;
declare const occurrence: ActivityOccurrence;

// An Activity occurrence keys on `activityElementId`, so neither identity is a
// structural subtype of the other and no accidental substitution compiles. A
// shared alias would make both assignments legal while the wire shapes stayed
// indistinguishable.

// @ts-expect-error A task identity is not an Activity occurrence identity
const wideningTask: ActivityOccurrenceId = taskId;

// @ts-expect-error An Activity occurrence identity is not a task identity
const narrowingActivity: UserTaskInstanceId = activityId;

// @ts-expect-error A scope identity is not an Activity occurrence identity
const wideningScope: ActivityOccurrenceId = scopeId;

const constructed: ActivityOccurrenceId = {
  processInstanceId: activityId.processInstanceId,
  activityElementId: "Activity_ReviewClaim",
  activation: 1,
};

const taskBody: ActivityBody = { kind: ActivityBodyKind.UserTask, task: taskId };
const scopeBody: ActivityBody = { kind: ActivityBodyKind.ChildScope, scope: scopeId };

// @ts-expect-error A task body carries no child scope
const crossedBody: ActivityBody = { kind: ActivityBodyKind.UserTask, scope: scopeId };

// @ts-expect-error An Activity occurrence identity is deeply immutable
occurrence.id.activation = 2;

// @ts-expect-error The attached-handler list of an Activity occurrence is deeply immutable
occurrence.attachedHandlers.push(occurrence.attachedHandlers[0]);

// @ts-expect-error An attached-handler identity is deeply immutable
occurrence.attachedHandlers[0]!.occurrence.activation = 2;

export type Constructed = [
  typeof wideningTask,
  typeof narrowingActivity,
  typeof wideningScope,
  typeof constructed,
  typeof taskBody,
  typeof scopeBody,
  typeof crossedBody,
];
