/** Admission of throw Events, transcribed from `Kernel/Admission/Propagation.lean`. A refusal carries a stable code. */
import { ThrowTag, ValueSourceTag, assertNever, type Throw } from "../il/types.js";

/**
 * `inTransaction` says whether the throw's parent is a Transaction: a Cancel End is used only within a Transaction
 * Sub-Process (BPMN 2.0.2 §10.3.5, §10.5.5 Cancel Event; `BpmnParse#parseEndEvents` refuses it elsewhere) (PC-TX-02).
 */
export function throwRecord(inTransaction: boolean, thrown: Throw): string | null {
  switch (thrown.tag) {
    case ThrowTag.None:
    case ThrowTag.Escalation:
    case ThrowTag.Terminate:
      return null;
    case ThrowTag.Cancel:
      return inTransaction ? null : "throw.cancel.outsideTransaction";
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

/** What other admissions read of a throw: whether it terminates its scope or throws Compensation. */
export type Reading = Readonly<{ terminates: boolean; compensates: boolean }>;

export function reading(thrown: Throw): Reading {
  switch (thrown.tag) {
    case ThrowTag.Terminate:
      return { terminates: true, compensates: false };
    case ThrowTag.Compensation:
      return { terminates: false, compensates: true };
    case ThrowTag.None:
    case ThrowTag.Message:
    case ThrowTag.Signal:
    case ThrowTag.Error:
    case ThrowTag.Escalation:
    case ThrowTag.Cancel:
      return { terminates: false, compensates: false };
  }
  return assertNever(thrown);
}
