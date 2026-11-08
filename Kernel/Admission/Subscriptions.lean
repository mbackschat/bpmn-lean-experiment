module

public import Kernel.IL.Types
public import Kernel.IL.Timer

/-! # Admission of catch Events, boundaries and triggered starts. A refusal carries a stable code.

Admitted: Timers with a literal exact duration (a cycle only on a boundary), Messages with a literal or unspecified
name and no correlation, a correlated Message only on a catch Event, and, on boundaries, the triggers that
`Kernel.Feature.Propagation` delivers (Error, Escalation, Compensation, Cancel).
-/

public section

namespace Kernel.Admission.Subscriptions

def literal? : ValueSource → Option String
  | .literal value => some value
  | .expression _ => none

/-- `cycles` admits an unbounded cycle, which only an attached subscription can repeat. -/
def timer (cycles : Bool) (trigger : TimerTrigger) : Option String :=
  match trigger.schedule with
  | .duration value =>
    match (literal? value).bind Timer.durationMs? with
    | some _ => none
    | none => some "timer.duration"
  | .date _ => some "timer.date"
  | .cycle value dialect =>
    match dialect, cycles, (literal? value).bind Timer.cyclePeriodMs? with
    | .iso8601, true, some _ => none
    | .iso8601, true, none => some "timer.cycle"
    | .iso8601, false, _ => some "timer.cycleNotAttached"
    | .cron, _, _ => some "timer.cron"

def message (trigger : MessageTrigger) : Option String :=
  if !trigger.correlation.isEmpty then some "message.correlation"
  else
    match trigger.name with
    | some (.expression _) => some "message.nameExpression"
    | some (.literal _) => none
    | none => none

/-- A correlated catch, as the [specification](../../docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md#required-optional-and-excluded-scope)
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
      | .foreign _ _ => some "message.correlation.value"
  | _ :: _ :: _ => some "message.correlation.keys"

def catchEvent (subscription : Subscription) : Option String :=
  match subscription.trigger with
  | .timer trigger => timer false trigger
  | .message trigger => correlatedCatch subscription trigger
  | .signal _ => some "event.catch.signal"
  | .condition _ => some "event.catch.condition"
  | .error _ => some "event.catch.error"
  | .escalation _ => some "event.catch.escalation"
  | .compensation => some "event.catch.compensation"
  | .cancel => some "event.catch.cancel"

def boundary (boundary : Boundary) : Option String :=
  match boundary.subscription.trigger with
  | .timer trigger => timer true trigger
  | .message trigger => message trigger
  | .signal _ => some "boundary.signal"
  | .condition _ => some "boundary.condition"
  | .error _ => none
  | .escalation _ => none
  | .compensation => none
  | .cancel => none

def boundaries (list : List Boundary) : Option String :=
  list.findSome? boundary

/-- A triggered start. At process level (`nested = false`) the start input names it; nested, it is an Event
Sub-Process start, which may also repeat a cycle and catch what `Kernel.Feature.Propagation` raises. -/
def start (nested : Bool) (subscription : Subscription) : Option String :=
  let raised (code : String) : Option String := if nested then none else some code
  match subscription.trigger with
  | .timer trigger => timer nested trigger
  | .message trigger => message trigger
  | .signal _ => some "start.signal"
  | .condition _ => some "start.condition"
  | .error _ => raised "start.error"
  | .escalation _ => raised "start.escalation"
  | .compensation => raised "start.compensation"
  | .cancel => some "start.cancel"

end Kernel.Admission.Subscriptions
