module

public import Kernel.IL.Types

/-! # Admission of a program's profile options. A refusal carries a stable code.

A profile may select only behaviour the kernel implements. `Reach.abnormalScope` says whether the program's own shape
reaches the abnormal end `ProfileOptions.abnormalScopeEnd` governs (a Terminate in a Sub-Process or at a called
process's level, or an interrupting Event Sub-Process, BPMN 2.0.2 §13.3.4, §13.5.6); the standards reading refuses only
those programs, since the kernel has only the normal-continuation semantics of CIB-INT-0007. `errorExitCompensation`
and `multiInstanceCompensation` are refused likewise only for the programs their alternative would change.
-/

public section

namespace Kernel.Admission.Profile

def compensationHandlerFailure : CompensationHandlerFailure → Option String
  | .failsInstance => none
  | .selected _ => some "profile.compensationHandlerFailure.selected"
  | .propagatesFromTrigger => some "profile.compensationHandlerFailure.propagatesFromTrigger"

/-- What the program's own shape reaches, for the options that govern only such programs. -/
structure Reach where
  /-- An abnormal scope end. -/
  abnormalScope : Bool
  /-- A Multi-Instance loop. -/
  loops : Bool
  /-- A Sub-Process with compensable work that an Error can leave. -/
  errorExit : Bool
  /-- A Multi-Instance Task or Call with a compensation handler. -/
  loopedHandler : Bool

/-- For a program with a Multi-Instance loop, the option combinations that would read a loop expression under two
engines at once ([Multi-Instance level](../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#option-combinations)):
JUEL without CIB's counters or its input failure, and Simple Boolean with CIB's counters. -/
def multiInstance (loops : Bool) (selected : ProfileOptions) : Option String :=
  if !loops then none
  else if selected.evaluator == .juel then
    if selected.multiInstanceCounters == .none then some "profile.multiInstanceCounters.none"
    else if selected.multiInstanceInputFailure == .hold then some "profile.multiInstanceInputFailure.hold"
    else none
  else if selected.multiInstanceCounters == .cibLocals then some "profile.multiInstanceCounters.cibLocals"
  else none

def options (reach : Reach) (selected : ProfileOptions) : Option String :=
  (if selected.compensationOrder == .allAtOnce then some "profile.compensationOrder.allAtOnce" else none) <|>
  compensationHandlerFailure selected.compensationHandlerFailure <|>
  (if selected.implicitCompensation == .everySubProcess then some "profile.implicitCompensation.everySubProcess" else none) <|>
  (if reach.errorExit && selected.errorExitCompensation == .compensatesContained then
    some "profile.errorExitCompensation.compensatesContained" else none) <|>
  (if reach.loopedHandler && selected.multiInstanceCompensation == .perInstance then
    some "profile.multiInstanceCompensation.perInstance" else none) <|>
  (if selected.compensationReferenceScope == .eventSubProcessParent then
    some "profile.compensationReferenceScope.eventSubProcessParent" else none) <|>
  (if selected.callBindingTime == .invocation then some "profile.callBindingTime.invocation" else none) <|>
  (if selected.timerZone.isSome then some "profile.timerZone" else none) <|>
  (if reach.abnormalScope && selected.abnormalScopeEnd == .withoutOutflow then some "profile.abnormalScopeEnd.withoutOutflow" else none) <|>
  multiInstance reach.loops selected

end Kernel.Admission.Profile
