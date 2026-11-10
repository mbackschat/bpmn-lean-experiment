module

public import Kernel.IL.Types
public import Kernel.IL.Timer

/-! # Admission of catch Events, boundaries and triggered starts. A refusal carries a stable code.

Admitted: Timers with a literal exact duration (a cycle only on a boundary), Messages with a literal name and no
correlation, a correlated Message only on a catch Event, and, on boundaries, the triggers that
`Kernel.Feature.Propagation` delivers (an interrupting Error, Escalation, Compensation, and Cancel on a Transaction).
-/

public section

namespace Kernel.Admission.Subscriptions

/-- `cycles` admits an unbounded cycle, which only an attached subscription can repeat. -/
def timer (cycles : Bool) (trigger : TimerTrigger) : Option String :=
  match trigger.schedule with
  | .duration value =>
    match (ValueSource.literal? value).bind Timer.durationMs? with
    | some _ => none
    | none => some "timer.duration"
  | .date _ => some "timer.date"
  | .cycle value dialect =>
    match dialect, cycles, (ValueSource.literal? value).bind Timer.cyclePeriodMs? with
    | .iso8601, true, some _ => none
    | .iso8601, true, none => some "timer.cycle"
    | .iso8601, false, _ => some "timer.cycleNotAttached"
    | .cron, _, _ => some "timer.cron"

/-- An interrupting catch ends what it interrupts at its first firing, so a repeating Timer has no second firing to
give; no row selects a meaning for it. -/
def interruptingCycle (trigger : TimerTrigger) : Option String :=
  match trigger.schedule with
  | .cycle _ _ => some "timer.interruptingCycle"
  | .duration _ => none
  | .date _ => none

/-- A Message subscription is addressed by its Message (`messageRef`, BPMN 2.0.2 §10.5.5); without one only an
occurrence-addressed command could reach it, which CIB-INT-0004 selects for a Receive Task alone, and
`BpmnParse#parseMessageEventDefinition` refuses it (PC-MESSAGE-01). -/
def message (trigger : MessageTrigger) : Option String :=
  if !trigger.correlation.isEmpty then some "message.correlation"
  else
    match trigger.name with
    | some (.expression _) => some "message.nameExpression"
    | some (.literal _) => none
    | none => some "message.unnamed"

/-- A correlated catch, as the [specification](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md)
bounds it: one key bound to a variable, an Operation channel, and no output, since its payload is never written. -/
def correlatedCatch (subscription : Subscription) (trigger : MessageTrigger) : Option String :=
  match trigger.correlation with
  | [] => message trigger
  | [criterion] =>
    if !subscription.outputs.isEmpty then some "message.correlation.output"
    else if trigger.name.isNone || trigger.interfaceRef.isNone || trigger.operationRef.isNone then
      some "message.correlation.channel"
    else
      match criterion.value with
      | .variable _ => message { trigger with correlation := [] }
      | .literal _ => some "message.correlation.value"
      | .simpleBoolean _ => some "message.correlation.value"
      | .juel _ => some "expression.juel.site"
      | .foreign _ _ => some "expression.outsideSimpleBoolean"
  | _ :: _ :: _ => some "message.correlation.keys"

/-- A Multiple or Parallel Multiple Event (BPMN 2.0.2 §10.5.1): pinned CIB keeps one of several definitions by a
precedence that depends on the position and never reads `parallelMultiple` (CIB-LIM-0008) (PC-BASIC-04). -/
def definitions (subscription : Subscription) : Option String :=
  if subscription.parallelMultiple then some "event.parallelMultiple"
  else if !subscription.alternatives.isEmpty then some "event.multipleDefinitions"
  else none

/-- Only a Message subscription writes what its delivery carries; any other trigger's outputs would be dropped. -/
def subscriptionOutputs (subscription : Subscription) : Option String :=
  if subscription.trigger.message?.isSome || subscription.outputs.isEmpty then none else some "event.outputs"

/-- Catch variables are a CIB extension (CIB-EXT-0028) the profile selects; BPMN 2.0.2 defines none. -/
def errorTrigger (variables : ErrorCatchVariables) (trigger : ErrorTrigger) : Option String :=
  match variables with
  | .eventScope => none
  | .refused =>
    if trigger.codeVariable.isSome then some "event.error.codeVariable"
    else if trigger.messageVariable.isSome then some "event.error.messageVariable"
    else none

def escalationTrigger (trigger : EscalationTrigger) : Option String :=
  if trigger.codeVariable.isSome then some "event.escalation.codeVariable" else none

/-- An interrupting Event Sub-Process started by a Message has no selected meaning for the Scope it interrupts; an Error
Event Sub-Process always interrupts (BPMN 2.0.2 Table 10.86, Table 10.87 `isInterrupting`, §13.5.4) (PC-ERROR-02). -/
def eventSubProcess (start : Subscription) (interrupting : Bool) : Option String :=
  definitions start <|>
  match start.trigger with
  | .message _ => if interrupting then some "scope.eventSubProcess.interruptingMessage" else none
  | .timer trigger => if interrupting then interruptingCycle trigger else none
  | .error _ => if interrupting then none else some "start.error.nonInterrupting"
  | .signal _ => none
  | .condition _ => none
  | .escalation _ => none
  | .compensation => none
  | .cancel => none

def catchEvent (subscription : Subscription) : Option String :=
  definitions subscription <|> subscriptionOutputs subscription <|>
  match subscription.trigger with
  | .timer trigger => timer false trigger
  | .message trigger => correlatedCatch subscription trigger
  | .signal _ => some "event.catch.signal"
  | .condition _ => some "event.catch.condition"
  | .error _ => some "event.catch.error"
  | .escalation _ => some "event.catch.escalation"
  | .compensation => some "event.catch.compensation"
  | .cancel => some "event.catch.cancel"

/-- `transactionHost` says whether the boundary hangs on a Transaction. An Error boundary always interrupts (BPMN 2.0.2
Table 10.90) (PC-ERROR-01); a Cancel boundary always interrupts and hangs only on a Transaction (Table 10.90, §10.3.5;
`BpmnParse#parseBoundaryCancelEventDefinition`) (PC-TX-02). `seen` holds the codes of the host's Error boundaries
before this one, and an admitted Error boundary adds its own. Two with one code are refused: BPMN 2.0.2 §10.5.6
allows one interrupting handler per Event Declaration and states no precedence between two declarations of one code,
so the kernel restricts a host to one boundary per code, and CIB's first in document order (`BpmnParse:3646`) is not
adopted (PC-ERROR-01). -/
def boundary (variables : ErrorCatchVariables) (transactionHost : Bool) (seen : List String) (boundary : Boundary) :
    Except String (List String) :=
  let check (refusal : Option String) : Except String (List String) :=
    match refusal with
    | some code => .error code
    | none => .ok seen
  match definitions boundary.subscription <|> subscriptionOutputs boundary.subscription with
  | some code => .error code
  | none =>
    match boundary.subscription.trigger with
    | .timer trigger => check ((if boundary.interrupting then interruptingCycle trigger else none) <|> timer true trigger)
    | .message trigger => check (message trigger)
    | .signal _ => .error "boundary.signal"
    | .condition _ => .error "boundary.condition"
    | .error trigger => do
      let seen ← check ((if boundary.interrupting then none else some "boundary.error.nonInterrupting") <|>
        errorTrigger variables trigger)
      match trigger.code with
      | some code => if seen.contains code then .error "boundary.error.duplicateCode" else .ok (code :: seen)
      | none => .ok seen
    | .escalation trigger => check (escalationTrigger trigger)
    | .compensation => .ok seen
    | .cancel =>
      check (if !transactionHost then some "boundary.cancel.host"
        else if boundary.interrupting then none
        else some "boundary.cancel.nonInterrupting")

def boundaries (variables : ErrorCatchVariables) (transactionHost : Bool) (list : List Boundary) : Option String :=
  match list.foldlM (boundary variables transactionHost) [] with
  | .error code => some code
  | .ok _ => none

/-- A triggered start. At process level (`nested = false`) the start input names it; nested, it is an Event
Sub-Process start, which may also repeat a cycle and catch what `Kernel.Feature.Propagation` raises. -/
def start (variables : ErrorCatchVariables) (nested : Bool) (subscription : Subscription) : Option String :=
  let raised (code : String) : Option String := if nested then none else some code
  definitions subscription <|> subscriptionOutputs subscription <|>
  match subscription.trigger with
  | .timer trigger => timer nested trigger
  | .message trigger =>
    (if !nested && !subscription.outputs.isEmpty then some "start.message.outputs" else none) <|> message trigger
  | .signal _ => some "start.signal"
  | .condition _ => some "start.condition"
  | .error trigger => raised "start.error" <|> errorTrigger variables trigger
  | .escalation trigger => raised "start.escalation" <|> escalationTrigger trigger
  | .compensation => raised "start.compensation"
  | .cancel => some "start.cancel"

end Kernel.Admission.Subscriptions
