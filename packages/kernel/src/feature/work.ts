/**
 * Work: what an Activity does, transcribed from `Kernel/Feature/Work.lean`.
 *
 * Owns matching on `Work`. A task without work passes its token through; a User Task opens a wait that a
 * `completeUserTask` command closes, writing the submitted values from the task's scope outward.
 */
import {
  ValueSourceTag,
  WorkTag,
  assertNever,
  type ActivityPayload,
  type Header,
  type UserWork,
  type ValueSource,
} from "../il/types.js";
import type { Arrival, Ctx } from "../hooks.js";
import {
  FailureTag,
  OpenKindTag,
  closeItem,
  committed,
  emit,
  failed,
  openItem,
  write,
  type Binding,
  type OpenItem,
  type OpenKind,
  type Outcome,
  type State,
} from "../state.js";

/** A literal candidate group; an expression source is dropped, since admission refuses it. */
function literalGroup(source: ValueSource): readonly string[] {
  switch (source.tag) {
    case ValueSourceTag.Literal:
      return [source.value];
    case ValueSourceTag.Expression:
      return [];
  }
  return assertNever(source);
}

function userTask(task: UserWork): OpenKind {
  return {
    tag: OpenKindTag.UserTask,
    detail: { name: task.name, candidateGroups: task.candidateGroups.flatMap(literalGroup), formFields: task.formFields },
  };
}

export function arriveActivity(
  _ctx: Ctx,
  header: Header,
  payload: ActivityPayload,
  arrival: Arrival,
  state: State,
): Outcome {
  const work = payload.work;
  switch (work.tag) {
    case WorkTag.None:
      return committed(emit(state, payload.envelope.outgoing, arrival.scope));
    case WorkTag.Manual:
      return committed(emit(state, payload.envelope.outgoing, arrival.scope));
    case WorkTag.User:
      return committed(openItem(state, userTask(work.payload), header.id, arrival.scope));
    case WorkTag.Receive:
      return failed(FailureTag.Unsupported, "receive-task");
    case WorkTag.Service:
      return failed(FailureTag.Unsupported, "service-task");
    case WorkTag.Send:
      return failed(FailureTag.Unsupported, "send-task");
    case WorkTag.Script:
      return failed(FailureTag.Unsupported, "script-task");
    case WorkTag.Rule:
      return failed(FailureTag.Unsupported, "business-rule-task");
    case WorkTag.Call:
      return failed(FailureTag.Unsupported, "call-activity");
  }
  return assertNever(work);
}

export function completeUserTask(
  _ctx: Ctx,
  _header: Header,
  payload: ActivityPayload,
  item: OpenItem,
  values: readonly Binding[],
  state: State,
): Outcome {
  const written = values.reduce((current, [name, value]) => write(current, item.scope, name, value), state);
  return committed(emit(closeItem(written, item.id), payload.envelope.outgoing, item.scope));
}
