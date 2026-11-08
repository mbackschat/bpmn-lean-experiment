/** Admission of Activities, transcribed from `Kernel/Admission/Work.lean`. A refusal carries a stable code. */
import {
  ValueSourceTag,
  WorkTag,
  assertNever,
  type ActivityPayload,
  type Envelope,
  type UserWork,
  type ValueSource,
  type Work,
} from "../il/types.js";

function envelope(envelope: Envelope): string | null {
  if (envelope.inputs.length !== 0) {
    return "activity.inputMappings";
  }
  if (envelope.outputs.length !== 0) {
    return "activity.outputMappings";
  }
  if (envelope.boundaries.length !== 0) {
    return "activity.boundary";
  }
  if (envelope.multiInstance !== null) {
    return "activity.multiInstance";
  }
  if (envelope.compensationHandler !== null) {
    return "activity.compensationHandler";
  }
  return null;
}

function isExpression(source: ValueSource): boolean {
  switch (source.tag) {
    case ValueSourceTag.Literal:
      return false;
    case ValueSourceTag.Expression:
      return true;
  }
  return assertNever(source);
}

function user(task: UserWork): string | null {
  return task.candidateGroups.some(isExpression) ? "work.user.candidateGroupExpression" : null;
}

function work(work: Work): string | null {
  switch (work.tag) {
    case WorkTag.None:
    case WorkTag.Manual:
      return null;
    case WorkTag.User:
      return user(work.payload);
    case WorkTag.Receive:
      return "work.receive";
    case WorkTag.Service:
      return "work.service";
    case WorkTag.Send:
      return "work.send";
    case WorkTag.Script:
      return "work.script";
    case WorkTag.Rule:
      return "work.rule";
    case WorkTag.Call:
      return "work.call";
  }
  return assertNever(work);
}

export function activity(payload: ActivityPayload): string | null {
  return work(payload.work) ?? envelope(payload.envelope);
}
