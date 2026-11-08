/**
 * Publish, transcribed from `Kernel/Publish.lean`: the one generic projection from runtime state to the public
 * state observation of the canonical result. Owns matching on `OpenKind` with `step.ts`.
 */
import { assertNever } from "./il/types.js";
import {
  InstanceStatus,
  OpenKindTag,
  root,
  type Binding,
  type OpenItem,
  type OpenKind,
  type State,
} from "./state.js";

export interface TaskRef {
  readonly processInstanceId: string;
  readonly elementId: string;
  readonly activation: number;
}

export interface ActiveWait {
  readonly elementId: string;
  readonly kind: string;
  readonly multiplicity: number;
}

export interface OpenUserTask {
  readonly id: TaskRef;
  readonly name: string | null;
  readonly candidateGroups: readonly string[];
  readonly formFields: readonly (readonly [string, string])[];
}

export interface EnabledInteraction {
  readonly kind: string;
  readonly taskId: TaskRef;
}

export interface Observation {
  readonly instanceId: string;
  readonly status: string;
  readonly activeWaits: readonly ActiveWait[];
  readonly openUserTasks: readonly OpenUserTask[];
  readonly variables: readonly Binding[];
  readonly enabledInteractions: readonly EnabledInteraction[];
  readonly logicalTimeMs: number;
}

function waitKind(kind: OpenKind): string {
  switch (kind.tag) {
    case OpenKindTag.UserTask:
      return "userTask";
    case OpenKindTag.Receive:
      return "message";
    case OpenKindTag.Timer:
      return "timer";
    case OpenKindTag.Subscription:
      return "message";
    case OpenKindTag.Effect:
      return "effect";
    case OpenKindTag.Incident:
      return "incident";
    case OpenKindTag.Evaluation:
      return "evaluation";
  }
  return assertNever(kind);
}

function statusName(status: InstanceStatus): string {
  switch (status) {
    case InstanceStatus.Running:
      return "running";
    case InstanceStatus.Completed:
      return "completed";
    case InstanceStatus.Terminated:
      return "terminated";
  }
  return assertNever(status);
}

/** One wait per element and kind, counting its open items, in the order the first of them opened. */
function activeWaits(items: readonly OpenItem[]): readonly ActiveWait[] {
  return items.reduce<readonly ActiveWait[]>((waits, item) => {
    const kind = waitKind(item.kind);
    const matches = (wait: ActiveWait): boolean => wait.elementId === item.element && wait.kind === kind;
    return waits.some(matches)
      ? waits.map((wait) => (matches(wait) ? { ...wait, multiplicity: wait.multiplicity + 1 } : wait))
      : [...waits, { elementId: item.element, kind, multiplicity: 1 }];
  }, []);
}

function taskRef(state: State, item: OpenItem): TaskRef {
  return { processInstanceId: state.instanceId, elementId: item.element, activation: item.activation };
}

function openUserTask(state: State, item: OpenItem): OpenUserTask | undefined {
  const kind = item.kind;
  switch (kind.tag) {
    case OpenKindTag.UserTask:
      return {
        id: taskRef(state, item),
        name: kind.detail.name,
        candidateGroups: kind.detail.candidateGroups,
        formFields: kind.detail.formFields,
      };
    case OpenKindTag.Receive:
    case OpenKindTag.Timer:
    case OpenKindTag.Subscription:
    case OpenKindTag.Effect:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return undefined;
  }
  return assertNever(kind);
}

function openUserTasks(state: State): readonly OpenUserTask[] {
  return state.openItems.flatMap((item) => {
    const task = openUserTask(state, item);
    return task === undefined ? [] : [task];
  });
}

/** Lean's `String` order: lexicographic by Unicode scalar value, not by UTF-16 code unit. */
function compareByCodePoint(left: string, right: string): number {
  const a = Array.from(left, (char) => char.codePointAt(0) ?? 0);
  const b = Array.from(right, (char) => char.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return a.length - b.length;
}

export function observe(state: State): Observation {
  const tasks = openUserTasks(state);
  return {
    instanceId: state.instanceId,
    status: statusName(state.status),
    activeWaits: activeWaits(state.openItems),
    openUserTasks: tasks,
    // `List.mergeSort` is stable, as `Array.prototype.toSorted` is.
    variables: (state.variables.find((vars) => vars.scope === root)?.entries ?? []).toSorted((left, right) =>
      compareByCodePoint(left[0], right[0]),
    ),
    enabledInteractions: tasks.map((task) => ({ kind: "completeUserTaskInstance", taskId: task.id })),
    logicalTimeMs: state.logicalTimeMs,
  };
}
