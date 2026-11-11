module

public import Kernel.Admission.Subscriptions

/-! # Admission of triggered start Events. A refusal carries a stable code.

A root start Event, which a start input names or its trigger fires, and an Event Sub-Process start. The one dispatch on
a start's trigger lives here; an Event Sub-Process start's Signal is `Kernel.Admission.Subscriptions`'
`eventSubProcessSignal`.
-/

public section

namespace Kernel.Admission.Subscriptions

/-- A triggered start. At process level (`nested = false`) the start input names it; nested, it is an Event
Sub-Process start, which may also repeat a cycle and catch what `Kernel.Feature.Propagation` raises. -/
def start (options : ProfileOptions) (reading : Reading) (nested : Bool) (subscription : Subscription) :
    Option String :=
  let variables := options.errorCatchVariables
  let raised (code : String) : Option String := if nested then none else some code
  definitions subscription <|> subscriptionOutputs subscription <|>
  match subscription.trigger with
  | .timer trigger => timerAt options reading (!nested) trigger
  | .message trigger =>
    (if !nested && !subscription.outputs.isEmpty then some "start.message.outputs" else none) <|>
      message options reading (!nested) trigger
  | .signal trigger => if nested then eventSubProcessSignal trigger else some "start.signal"
  | .condition trigger => if nested then conditionRefusal options reading trigger else some "start.condition"
  | .error trigger => raised "start.error" <|> errorTrigger variables trigger
  | .escalation trigger => raised "start.escalation" <|> escalationTrigger variables trigger
  | .compensation => raised "start.compensation"
  | .cancel => some "start.cancel"

end Kernel.Admission.Subscriptions
