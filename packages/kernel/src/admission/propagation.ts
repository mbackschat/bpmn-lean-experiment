/** Admission of Events, transcribed from `Kernel/Admission/Propagation.lean`. A refusal carries a stable code. */
import { EventRoleTag, ThrowTag, assertNever, type EventPayload, type Throw } from "../il/types.js";

function throwRecord(record: Throw): string | null {
  switch (record.tag) {
    case ThrowTag.None:
      return null;
    case ThrowTag.Message:
      return "throw.message";
    case ThrowTag.Signal:
      return "throw.signal";
    case ThrowTag.Error:
      return "throw.error";
    case ThrowTag.Escalation:
      return "throw.escalation";
    case ThrowTag.Compensation:
      return "throw.compensation";
    case ThrowTag.Cancel:
      return "throw.cancel";
    case ThrowTag.Terminate:
      return "throw.terminate";
  }
  return assertNever(record);
}

export function event(payload: EventPayload): string | null {
  const role = payload.role;
  switch (role.tag) {
    case EventRoleTag.Catch:
      return "event.catch";
    case EventRoleTag.Throw:
      return throwRecord(role.record);
    case EventRoleTag.LinkCatch:
    case EventRoleTag.LinkThrow:
      return "event.link";
  }
  return assertNever(role);
}
