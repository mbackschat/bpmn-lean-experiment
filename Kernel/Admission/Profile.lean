module

public import Kernel.IL.Types

/-! # Admission of a program's profile options. A refusal carries a stable code.

A profile may select only behaviour the kernel implements. `abnormalScope` says whether the program's own shape reaches
the abnormal end `ProfileOptions.abnormalScopeEnd` governs (a Terminate in a Sub-Process or at a called process's
level, or an interrupting Event Sub-Process, BPMN 2.0.2 §13.3.4, §13.5.6); the standards reading refuses only those programs, since the kernel has only
the normal-continuation semantics of CIB-INT-0007.
-/

public section

namespace Kernel.Admission.Profile

def compensationHandlerFailure : CompensationHandlerFailure → Option String
  | .failsInstance => none
  | .selected _ => some "profile.compensationHandlerFailure.selected"

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

def options (abnormalScope loops : Bool) (selected : ProfileOptions) : Option String :=
  (if selected.messageCorrelation == .apiCriteria then some "profile.messageCorrelation.apiCriteria" else none) <|>
  (if selected.deliveryVariables == .installs then some "profile.deliveryVariables.installs" else none) <|>
  (if selected.compensationOrder == .reverseCreation then some "profile.compensationOrder.reverseCreation" else none) <|>
  compensationHandlerFailure selected.compensationHandlerFailure <|>
  (if selected.callBindingTime == .invocation then some "profile.callBindingTime.invocation" else none) <|>
  (if selected.timerZone.isSome then some "profile.timerZone" else none) <|>
  (if abnormalScope && selected.abnormalScopeEnd == .withoutOutflow then some "profile.abnormalScopeEnd.withoutOutflow" else none) <|>
  multiInstance loops selected

end Kernel.Admission.Profile
