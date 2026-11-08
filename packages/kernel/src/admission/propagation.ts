/** Admission of throw Events, transcribed from `Kernel/Admission/Propagation.lean`. A refusal carries a stable code. */
import { ThrowTag, assertNever, type Throw } from "../il/types.js";

export function throwRecord(record: Throw): string | null {
  switch (record.tag) {
    case ThrowTag.None:
      return null;
    case ThrowTag.Error:
      return null;
    case ThrowTag.Escalation:
      return null;
    case ThrowTag.Terminate:
      return null;
    case ThrowTag.Message:
      return "throw.message";
    case ThrowTag.Signal:
      return "throw.signal";
    case ThrowTag.Compensation:
      if (record.payload.activity !== null) {
        return "throw.compensation.activity";
      }
      if (!record.payload.waitForCompletion) {
        return "throw.compensation.asynchronous";
      }
      return null;
    case ThrowTag.Cancel:
      return null;
  }
  return assertNever(record);
}
