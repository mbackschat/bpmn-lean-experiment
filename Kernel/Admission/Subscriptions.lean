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
      | .foreign _ _ => some "expression.outsideSimpleBoolean"
  | _ :: _ :: _ => some "message.correlation.keys"

/-- Only a Message subscription writes what its delivery carries; any other trigger's outputs would be dropped. -/
def outputs (subscription : Subscription) : Option String :=
  if subscription.trigger.message?.isSome || subscription.outputs.isEmpty then none else some "event.outputs"

def errorTrigger (trigger : ErrorTrigger) : Option String :=
  if trigger.codeVariable.isSome then some "event.error.codeVariable"
  else if trigger.messageVariable.isSome then some "event.error.messageVariable"
  else none

def escalationTrigger (trigger : EscalationTrigger) : Option String :=
  if trigger.codeVariable.isSome then some "event.escalation.codeVariable" else none

/-- An interrupting Event Sub-Process started by a Message has no selected meaning for the Scope it interrupts; an Error
Event Sub-Process always interrupts (BPMN 2.0.2 Table 10.86, Table 10.87 `isInterrupting`, §13.5.4) (PC-ERROR-02). -/
def eventSubProcess (start : Subscription) (interrupting : Bool) : Option String :=
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
  outputs subscription <|>
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
`BpmnParse#parseBoundaryCancelEventDefinition`) (PC-TX-02). -/
def boundary (transactionHost : Bool) (boundary : Boundary) : Option String :=
  outputs boundary.subscription <|>
  match boundary.subscription.trigger with
  | .timer trigger => (if boundary.interrupting then interruptingCycle trigger else none) <|> timer true trigger
  | .message trigger => message trigger
  | .signal _ => some "boundary.signal"
  | .condition _ => some "boundary.condition"
  | .error trigger =>
    (if boundary.interrupting then none else some "boundary.error.nonInterrupting") <|> errorTrigger trigger
  | .escalation trigger => escalationTrigger trigger
  | .compensation => none
  | .cancel =>
    if !transactionHost then some "boundary.cancel.host"
    else if boundary.interrupting then none
    else some "boundary.cancel.nonInterrupting"

def boundaries (transactionHost : Bool) (list : List Boundary) : Option String :=
  list.findSome? (boundary transactionHost)

/-- A triggered start. At process level (`nested = false`) the start input names it; nested, it is an Event
Sub-Process start, which may also repeat a cycle and catch what `Kernel.Feature.Propagation` raises. -/
def start (nested : Bool) (subscription : Subscription) : Option String :=
  let raised (code : String) : Option String := if nested then none else some code
  outputs subscription <|>
  match subscription.trigger with
  | .timer trigger => timer nested trigger
  | .message trigger =>
    (if !nested && !subscription.outputs.isEmpty then some "start.message.outputs" else none) <|> message trigger
  | .signal _ => some "start.signal"
  | .condition _ => some "start.condition"
  | .error trigger => raised "start.error" <|> errorTrigger trigger
  | .escalation trigger => raised "start.escalation" <|> escalationTrigger trigger
  | .compensation => raised "start.compensation"
  | .cancel => some "start.cancel"

end Kernel.Admission.Subscriptions
