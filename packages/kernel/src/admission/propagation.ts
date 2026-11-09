/** Admission of throw Events, transcribed from `Kernel/Admission/Propagation.lean`. A refusal carries a stable code. */
import { ThrowTag, ValueSourceTag, assertNever, type Throw } from "../il/types.js";

export function throwRecord(thrown: Throw): string | null {
  switch (thrown.tag) {
    case ThrowTag.None:
    case ThrowTag.Escalation:
    case ThrowTag.Terminate:
    case ThrowTag.Cancel:
      return null;
    case ThrowTag.Error:
      return thrown.payload.message !== null && thrown.payload.message.tag === ValueSourceTag.Expression
        ? "throw.error.message"
        : null;
    case ThrowTag.Message:
      return "throw.message";
    case ThrowTag.Signal:
      return "throw.signal";
    case ThrowTag.Compensation:
      if (thrown.payload.activity !== null) return "throw.compensation.activity";
      if (!thrown.payload.waitForCompletion) return "throw.compensation.asynchronous";
      return null;
  }
  return assertNever(thrown);
}

export function terminates(thrown: Throw): boolean {
  switch (thrown.tag) {
    case ThrowTag.Terminate:
      return true;
    case ThrowTag.None:
    case ThrowTag.Message:
    case ThrowTag.Signal:
    case ThrowTag.Error:
    case ThrowTag.Escalation:
    case ThrowTag.Compensation:
    case ThrowTag.Cancel:
      return false;
  }
  return assertNever(thrown);
}
