/**
 * Admission of a program's profile options, transcribed from `Kernel/Admission/Profile.lean`. A refusal carries a
 * stable code.
 *
 * A profile may select only behaviour the kernel implements. `Reach.abnormalScope` says whether the program's own shape
 * reaches the abnormal end `ProfileOptions.abnormalScopeEnd` governs (a Terminate in a Sub-Process or at a called
 * process's level, or an interrupting Event Sub-Process, BPMN 2.0.2 §13.3.4, §13.5.6); the standards reading refuses only
 * those programs, since the kernel has only the normal-continuation semantics of CIB-INT-0007. `errorExitCompensation`
 * and `multiInstanceCompensation` are refused likewise only for the programs their alternative would change.
 */
import {
  AbnormalScopeEnd,
  CallBindingTime,
  CompensationHandlerFailureTag,
  CompensationOrder,
  ErrorExitCompensation,
  Evaluator,
  ImplicitCompensation,
  MultiInstanceCompensation,
  MultiInstanceCounters,
  MultiInstanceInputFailure,
  assertNever,
  type CompensationHandlerFailure,
  type ProfileOptions,
} from "../il/types.js";

function compensationHandlerFailure(selected: CompensationHandlerFailure): string | null {
  switch (selected.tag) {
    case CompensationHandlerFailureTag.FailsInstance:
    case CompensationHandlerFailureTag.PropagatesFromTrigger:
      return null;
    case CompensationHandlerFailureTag.Selected:
      return "profile.compensationHandlerFailure.selected";
  }
  return assertNever(selected);
}

/** What the program's own shape reaches, for the options that govern only such programs. */
export interface Reach {
  /** An abnormal scope end. */
  readonly abnormalScope: boolean;
  /** A Multi-Instance loop. */
  readonly loops: boolean;
  /** A Sub-Process with compensable work that an Error can leave. */
  readonly errorExit: boolean;
  /** A Multi-Instance Task or Call with a compensation handler. */
  readonly loopedHandler: boolean;
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

export function options(reach: Reach, selected: ProfileOptions): string | null {
  if (selected.compensationOrder === CompensationOrder.AllAtOnce) return "profile.compensationOrder.allAtOnce";
  const handlerFailure = compensationHandlerFailure(selected.compensationHandlerFailure);
  if (handlerFailure !== null) return handlerFailure;
  if (selected.implicitCompensation === ImplicitCompensation.EverySubProcess) return "profile.implicitCompensation.everySubProcess";
  if (reach.errorExit && selected.errorExitCompensation === ErrorExitCompensation.CompensatesContained) {
    return "profile.errorExitCompensation.compensatesContained";
  }
  if (reach.loopedHandler && selected.multiInstanceCompensation === MultiInstanceCompensation.PerInstance) {
    return "profile.multiInstanceCompensation.perInstance";
  }
  if (selected.callBindingTime === CallBindingTime.Invocation) return "profile.callBindingTime.invocation";
  if (selected.timerZone !== null) return "profile.timerZone";
  if (reach.abnormalScope && selected.abnormalScopeEnd === AbnormalScopeEnd.WithoutOutflow) return "profile.abnormalScopeEnd.withoutOutflow";
  return multiInstance(reach.loops, selected);
}
