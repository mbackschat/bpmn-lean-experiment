module

public import Kernel.Admission.Subscriptions

/-! # Admission of triggered start Events. A refusal carries a stable code.

A root start Event, which a start input names or its trigger fires, and an Event Sub-Process start. The one dispatch on
a start's trigger lives here (`triggered`).
-/

public section

namespace Kernel.Admission.Subscriptions

/-- A root Conditional start. BPMN 2.0.2 Table 10.84 puts the environment its condition reads outside the standard, so it
is refused unless the profile evaluates it over submitted variables (`ConditionalStart.submittedContext`, CIB-EXT-0044).
CIB deploys and ignores `camunda:variableEvents` there (`DefaultConditionHandler.java:121-134`), so it is refused under
every profile rather than given a meaning. -/
def rootCondition (options : ProfileOptions) (reading : Reading) (trigger : ConditionTrigger) : Option String :=
  if options.conditionalStart == .refused then some "start.condition"
  else if !trigger.variableEvents.isEmpty then some "start.condition.variableEvents"
  else conditionRefusal options reading trigger

/-- What admission reads of a triggered start's trigger: its refusal and Signal (`Admitted`), and a root Conditional
start's predicate, which `startConditions` compares across one process level. -/
structure Triggered extends Admitted where
  predicate : Option Expression := none

/-- The one dispatch on a start's trigger. At process level (`nested = false`) the start input names it; nested, it is an
Event Sub-Process start, which may also repeat a cycle and catch what `Kernel.Feature.Propagation` raises. -/
def triggered (options : ProfileOptions) (reading : Reading) (nested : Bool) (trigger : Trigger) : Triggered :=
  let variables := options.errorCatchVariables
  let raised (code : String) : Option String := if nested then none else some code
  let refusing (refusal : Option String) : Triggered := { refusal }
  match trigger with
  | .timer trigger => refusing (timerAt options reading (!nested) trigger)
  | .message trigger => refusing (message options reading (!nested) trigger)
  | .signal trigger =>
    { refusal := signalAddress options reading (!nested) trigger.signalRef trigger.name
      signal := some trigger }
  | .condition trigger =>
    if nested then refusing (conditionRefusal options reading trigger)
    else { refusal := rootCondition options reading trigger, predicate := some trigger.condition }
  | .error trigger => refusing (raised "start.error" <|> errorTrigger variables trigger)
  | .escalation trigger => refusing (raised "start.escalation" <|> escalationTrigger variables trigger)
  | .compensation => refusing (raised "start.compensation")
  | .cancel => refusing (some "start.cancel")

/-- A triggered start's refusal. -/
def start (options : ProfileOptions) (reading : Reading) (nested : Bool) (subscription : Subscription) :
    Option String :=
  definitions subscription <|> subscriptionOutputs subscription <|>
    (triggered options reading nested subscription.trigger).refusal

/-- Two Conditional starts of one process level with equal predicates are refused (`start.condition.duplicate`,
CIB-LIM-0027): CIB refuses two with one condition text (`BpmnParse.java:1289-1292`, `:1305-1315`), and the IL keeps a
predicate's parsed form, not its text. Parsed forms compare by their derived `Repr`: every IL type below `Expression`
derives it and none holds a `Float`, so this is exact structural equality without a `DecidableEq` on the guarded JUEL
types or a dispatch over them (guards 2 and 18). -/
def startConditions (program : Program) : Option String :=
  let predicates (elements : List Element) : List String :=
    elements.filterMap fun element => (element.start?.bind (·.2.subscription)).bind fun subscription =>
      ((triggered program.options {} false subscription.trigger).predicate).map reprStr
  let level (elements : List Element) : Option String :=
    let seen := predicates elements
    if seen.eraseDups.length == seen.length then none else some "start.condition.duplicate"
  if program.options.conditionalStart == .refused then none
  else level (program.children none) <|> program.processes.findSome? fun process =>
    level (process.children.filterMap program.element?)

end Kernel.Admission.Subscriptions
