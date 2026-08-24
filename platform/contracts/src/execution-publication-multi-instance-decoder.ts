/** Strict recursive decoder for Product 1's sequential Multi-Instance progress projection. */
import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireNonnegativeSafeInteger,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import { requirePublicationVariableValue } from "./execution-publication-variable-value-decoder.js";
import { VariableValueKind } from "./execution-publications.js";
import type {
  ActivityOccurrenceId,
  OccurrenceId,
} from "./execution-publications.js";

type OpenTask = Readonly<{ id: OccurrenceId }>;
type DecodedController = Readonly<{
  id: ActivityOccurrenceId;
  taskId: OccurrenceId;
}>;

export function requireOpenSequentialMultiInstances(
  value: unknown,
  tasks: ReadonlyArray<OpenTask>,
  processInstanceId: string,
): DecodedController[] {
  const controllers = requireDenseArray(
    value,
    (item, label) => requireController(item, tasks, processInstanceId, label),
    "openMultiInstances",
  );
  requireCanonicalControllers(controllers);
  requireUniqueActiveTasks(controllers);
  return controllers;
}

function requireController(
  value: unknown,
  tasks: ReadonlyArray<OpenTask>,
  processInstanceId: string,
  label: string,
): DecodedController {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "id",
    "mode",
    "plannedInstanceCount",
    "pendingItemCount",
    "numberOfInstances",
    "numberOfActiveInstances",
    "numberOfCompletedInstances",
    "numberOfTerminatedInstances",
    "activeIterations",
  ]);
  const id = requireActivityOccurrenceId(readOwn(value, "id"), `${label}.id`);
  if (
    id.processInstanceId !== processInstanceId ||
    readOwn(value, "mode") !== "sequential"
  ) {
    throw new TypeError(`${label} identity or mode is invalid`);
  }
  const completed = requireControllerCounts(value, label);
  const iterations = requireDenseArray(
    readOwn(value, "activeIterations"),
    (iteration, iterationLabel) => requireIteration(
      iteration,
      tasks,
      processInstanceId,
      id,
      completed,
      iterationLabel,
    ),
    `${label}.activeIterations`,
  );
  if (iterations.length !== 1) {
    throw new TypeError(`${label} must contain exactly one active iteration`);
  }
  return { id, taskId: iterations[0]! };
}

function requireControllerCounts(value: object, label: string): number {
  const planned = requireCount(value, "plannedInstanceCount", label);
  const pending = requireCount(value, "pendingItemCount", label);
  const total = requireCount(value, "numberOfInstances", label);
  const active = requireCount(value, "numberOfActiveInstances", label);
  const completed = requireCount(value, "numberOfCompletedInstances", label);
  const terminated = requireCount(value, "numberOfTerminatedInstances", label);
  if (
    active !== 1 ||
    terminated !== 0 ||
    total !== active + completed + terminated ||
    planned !== pending + total ||
    total > planned
  ) {
    throw new TypeError(`${label} count identities are invalid`);
  }
  return completed;
}

function requireIteration(
  value: unknown,
  tasks: ReadonlyArray<OpenTask>,
  processInstanceId: string,
  controllerId: ActivityOccurrenceId,
  completed: number,
  label: string,
): OccurrenceId {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "loopCounter",
    "taskId",
    "taskInput",
    "completionBindingName",
  ]);
  if (requireNonnegativeSafeInteger(
    readOwn(value, "loopCounter"),
    `${label}.loopCounter`,
  ) !== completed) {
    throw new TypeError(`${label}.loopCounter does not equal completed count`);
  }
  const taskId = requireOccurrenceId(readOwn(value, "taskId"), `${label}.taskId`);
  if (
    taskId.processInstanceId !== processInstanceId ||
    taskId.elementId !== controllerId.activityElementId ||
    tasks.filter(({ id }) => sameOccurrence(id, taskId)).length !== 1
  ) {
    throw new TypeError(`${label}.taskId is not its exact open task`);
  }
  requireIterationInput(readOwn(value, "taskInput"), `${label}.taskInput`);
  requireNonemptyString(
    readOwn(value, "completionBindingName"),
    `${label}.completionBindingName`,
  );
  return taskId;
}

function requireIterationInput(value: unknown, label: string): void {
  requireObject(value, label);
  requireExactKeys(value, label, ["name", "value"]);
  requireNonemptyString(readOwn(value, "name"), `${label}.name`);
  const inputValue = readOwn(value, "value");
  requirePublicationVariableValue(inputValue, `${label}.value`);
  requireObject(inputValue, `${label}.value`);
  if (readOwn(inputValue, "kind") !== VariableValueKind.String) {
    throw new TypeError(`${label}.value must be a string value`);
  }
}

function requireActivityOccurrenceId(
  value: unknown,
  label: string,
): ActivityOccurrenceId {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "processInstanceId",
    "activityElementId",
    "activation",
  ]);
  return {
    processInstanceId: requireNonemptyString(
      readOwn(value, "processInstanceId"),
      `${label}.processInstanceId`,
    ),
    activityElementId: requireNonemptyString(
      readOwn(value, "activityElementId"),
      `${label}.activityElementId`,
    ),
    activation: requirePositiveSafeInteger(
      readOwn(value, "activation"),
      `${label}.activation`,
    ),
  };
}

function requireOccurrenceId(value: unknown, label: string): OccurrenceId {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "processInstanceId",
    "elementId",
    "activation",
  ]);
  return {
    processInstanceId: requireNonemptyString(
      readOwn(value, "processInstanceId"),
      `${label}.processInstanceId`,
    ),
    elementId: requireNonemptyString(
      readOwn(value, "elementId"),
      `${label}.elementId`,
    ),
    activation: requirePositiveSafeInteger(
      readOwn(value, "activation"),
      `${label}.activation`,
    ),
  };
}

function requireCount(
  value: object,
  key: string,
  label: string,
): number {
  return requireNonnegativeSafeInteger(readOwn(value, key), `${label}.${key}`);
}

function requireDenseArray<T>(
  value: unknown,
  decode: (item: unknown, label: string) => T,
  label: string,
): T[] {
  if (!isDenseArray(value)) {
    throw new TypeError(`${label} must be a dense array`);
  }
  return value.map((item, index) => decode(item, `${label}[${index}]`));
}

function requireCanonicalControllers(controllers: DecodedController[]): void {
  if (controllers.some((controller, index) =>
    index > 0 && compareActivityOccurrence(
      controllers[index - 1]!.id,
      controller.id,
    ) >= 0
  )) {
    throw new TypeError("openMultiInstances must use canonical strict ascending order");
  }
}

function requireUniqueActiveTasks(controllers: DecodedController[]): void {
  if (controllers.some((controller, index) =>
    controllers.slice(index + 1).some((other) =>
      sameOccurrence(controller.taskId, other.taskId)
    )
  )) {
    throw new TypeError("openMultiInstances contains duplicate active task identities");
  }
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value) &&
    Reflect.ownKeys(value).length === value.length + 1 &&
    Reflect.ownKeys(value).every((key) => key === "length" ||
      (typeof key === "string" &&
        /^(?:0|[1-9][0-9]*)$/u.test(key) &&
        Number(key) < value.length));
}

function compareActivityOccurrence(
  left: ActivityOccurrenceId,
  right: ActivityOccurrenceId,
): number {
  return compareScalarStrings(left.processInstanceId, right.processInstanceId) ||
    compareScalarStrings(left.activityElementId, right.activityElementId) ||
    left.activation - right.activation;
}

function sameOccurrence(left: OccurrenceId, right: OccurrenceId): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation;
}

function compareScalarStrings(left: string, right: string): number {
  const a = Array.from(left, (scalar) => scalar.codePointAt(0)!);
  const b = Array.from(right, (scalar) => scalar.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return a.length - b.length;
}
