/**
 * Admission of a program's profile options, transcribed from `Kernel/Admission/Profile.lean`. A refusal carries a
 * stable code.
 *
 * A profile may select only behaviour the kernel implements. `abnormalScope` says whether the program's own shape
 * reaches the abnormal end `ProfileOptions.abnormalScopeEnd` governs (a Terminate in a Sub-Process or an interrupting
 * Event Sub-Process, BPMN 2.0.2 §13.3.4, §13.5.6); the standards reading refuses only those programs, since the kernel
 * has only the normal-continuation semantics of CIB-INT-0007.
 */
import {
  AbnormalScopeEnd,
  CallBindingTime,
  CompensationHandlerFailureTag,
  CompensationOrder,
  DeliveryVariables,
  Evaluator,
  MessageCorrelation,
  MultiInstanceCounters,
  MultiInstanceInputFailure,
  assertNever,
  type CompensationHandlerFailure,
  type ProfileOptions,
} from "../il/types.js";

function compensationHandlerFailure(selected: CompensationHandlerFailure): string | null {
  switch (selected.tag) {
    case CompensationHandlerFailureTag.FailsInstance:
      return null;
    case CompensationHandlerFailureTag.Selected:
      return "profile.compensationHandlerFailure.selected";
  }
  return assertNever(selected);
}

/**
 * For a program with a Multi-Instance loop, the option combinations that would read a loop expression under two engines
 * at once: JUEL without CIB's counters or its input failure, and Simple Boolean with CIB's counters.
 */
function multiInstance(loops: boolean, selected: ProfileOptions): string | null {
  if (!loops) return null;
  if (selected.evaluator === Evaluator.Juel) {
    if (selected.multiInstanceCounters === MultiInstanceCounters.None) return "profile.multiInstanceCounters.none";
    if (selected.multiInstanceInputFailure === MultiInstanceInputFailure.Hold) return "profile.multiInstanceInputFailure.hold";
    return null;
  }
  return selected.multiInstanceCounters === MultiInstanceCounters.CibLocals ? "profile.multiInstanceCounters.cibLocals" : null;
}

export function options(abnormalScope: boolean, loops: boolean, selected: ProfileOptions): string | null {
  if (selected.messageCorrelation === MessageCorrelation.ApiCriteria) return "profile.messageCorrelation.apiCriteria";
  if (selected.deliveryVariables === DeliveryVariables.Installs) return "profile.deliveryVariables.installs";
  if (selected.compensationOrder === CompensationOrder.ReverseCreation) return "profile.compensationOrder.reverseCreation";
  const handlerFailure = compensationHandlerFailure(selected.compensationHandlerFailure);
  if (handlerFailure !== null) return handlerFailure;
  if (selected.callBindingTime === CallBindingTime.Invocation) return "profile.callBindingTime.invocation";
  if (selected.timerZone !== null) return "profile.timerZone";
  if (abnormalScope && selected.abnormalScopeEnd === AbnormalScopeEnd.WithoutOutflow) return "profile.abnormalScopeEnd.withoutOutflow";
  return multiInstance(loops, selected);
}
