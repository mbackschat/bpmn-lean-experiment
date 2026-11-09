module

public import Kernel.IL.Types

/-! # Admission of a program's profile options. A refusal carries a stable code.

A profile may select only behaviour the kernel implements. `abnormalScope` says whether the program's own shape reaches
the abnormal end `ProfileOptions.abnormalScopeEnd` governs (a Terminate in a Sub-Process or an interrupting Event
Sub-Process, BPMN 2.0.2 §13.3.4, §13.5.6); the standards reading refuses only those programs, since the kernel has only
the normal-continuation semantics of CIB-INT-0007.
-/

public section

namespace Kernel.Admission.Profile

def compensationHandlerFailure : CompensationHandlerFailure → Option String
  | .failsInstance => none
  | .selected _ => some "profile.compensationHandlerFailure.selected"

def options (abnormalScope : Bool) (selected : ProfileOptions) : Option String :=
  (if selected.evaluator == .juel then some "profile.evaluator.juel" else none) <|>
  (if selected.messageCorrelation == .apiCriteria then some "profile.messageCorrelation.apiCriteria" else none) <|>
  (if selected.deliveryVariables == .installs then some "profile.deliveryVariables.installs" else none) <|>
  (if selected.compensationOrder == .reverseCreation then some "profile.compensationOrder.reverseCreation" else none) <|>
  compensationHandlerFailure selected.compensationHandlerFailure <|>
  (if selected.unhandledError == .endsThrowingPath then some "profile.unhandledError.endsThrowingPath" else none) <|>
  (if selected.callBindingTime == .invocation then some "profile.callBindingTime.invocation" else none) <|>
  (if selected.timerZone.isSome then some "profile.timerZone" else none) <|>
  (if abnormalScope && selected.abnormalScopeEnd == .withoutOutflow then some "profile.abnormalScopeEnd.withoutOutflow" else none)

end Kernel.Admission.Profile
