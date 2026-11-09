module

public import Kernel.IL.Types

/-! # Open-wait details

What an open item publishes besides its identity: one typed detail per `OpenKind`, and `WaitView`, the
uniform reading of an open wait. Part of `Kernel.State`, which re-exports it.
-/

public section

namespace Kernel

/-- What an open User Task publishes besides its identity. Metadata is published only when the task carries
candidate groups; form fields are `(key, type)` pairs. -/
structure UserTaskDetail where
  name : Option String
  assignee : Option String := none
  candidateUsers : List String := []
  candidateGroups : List String := []
  formKey : Option String := none
  formFields : List (String × String) := []
  dueDate : Option String := none
  followUpDate : Option String := none
  priority : Option Int := none
  inputs : List (String × Value) := []
  deriving Repr

/-- A Message address: the Message's identifier and, when the model routes it through an Operation, that
Operation. `messageId = none` is an unspecified Message. -/
structure MessageChannel where
  messageId : Option String
  interfaceRef : Option String := none
  operationRef : Option String := none
  deriving DecidableEq, Repr

structure MessageWaitDetail where
  channel : MessageChannel
  /-- The delivery carries a payload the wait writes. -/
  payload : Bool := false
  /-- The correlation keys a delivery must match: such a wait is published as a definition-scoped correlated
  publication, never as a directly addressed delivery
  ([specification](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md)). -/
  criteria : List String := []
  deriving Repr

structure SignalWaitDetail where
  name : String
  payload : Bool := false
  deriving Repr

/-- `lastValue` is the most recent evaluation; a false to true change and each filtered event are separate facts
(PC-CONDITION-01). -/
structure ConditionalWaitDetail where
  variableName : Option String := none
  variableEvents : List String := []
  lastValue : Option Bool := none
  deriving Repr

/-- How a Timer repeats after it fires; `remaining = none` is unbounded (PC-TIMER-02). A cycle is captured once armed
(PC-TIMER-03). -/
structure TimerRecurrence where
  periodMs : Option Nat := none
  cron : Option String := none
  remaining : Option Nat := none
  deriving Repr

structure TimerDetail where
  deadlineMs : Nat
  recurrence : Option TimerRecurrence := none
  deriving Repr

/-- What a Send Task's or throwing Message's effect addresses (PC-AUTO-04, PC-MESSAGE-09). -/
structure SendDescriptor where
  recipient : Option String := none
  correlation : List (String × Value) := []
  deriving Repr

/-- `failures` counts the incidents this effect occurrence has had; a retry reopens it with the same activation. -/
structure EffectDetail where
  protocol : String
  operation : String
  arguments : List (String × Value) := []
  failures : Nat := 0
  send : Option SendDescriptor := none
  deriving Repr

/-- `cancellable` publishes the `cancelIncidentProcess` interaction beside `retryIncident`. -/
structure IncidentDetail where
  effect : EffectDetail
  generation : Nat := 1
  cancellable : Bool := false
  deriving Repr

/-- Guarded type: only `OpenKind.view` and the codec match on it. Each kind carries the typed detail its public
observation needs, filled by the feature that opens the item. -/
inductive OpenKind where
  | userTask (detail : UserTaskDetail)
  | message (detail : MessageWaitDetail)
  | signal (detail : SignalWaitDetail)
  | conditional (detail : ConditionalWaitDetail)
  | timer (detail : TimerDetail)
  | effect (detail : EffectDetail)
  | incident (detail : IncidentDetail)
  deriving Repr

/-- The inputs a host can submit; `Kernel.Step.step` dispatches on `Input`, which has one constructor per tag. -/
inductive InputTag where
  | start
  | command
  | deliver
  | timerFire
  | effectResult
  deriving DecidableEq, Repr

/-- One open wait, read uniformly: which input closes it, `none` for a wait a variable write closes, how publication
names it, and its typed detail. No consumer matches `OpenKind`; each reads the field it is about. -/
structure WaitView where
  input : Option InputTag
  published : Option (String × Nat) := none
  deadlineMs : Option Nat := none
  recurrence : Option TimerRecurrence := none
  channel : Option MessageChannel := none
  payload : Bool := false
  criteria : List String := []
  signal : Option SignalWaitDetail := none
  conditional : Option ConditionalWaitDetail := none
  userTask : Option UserTaskDetail := none
  effect : Option EffectDetail := none
  incident : Option IncidentDetail := none
  deriving Repr

def OpenKind.view : OpenKind → WaitView
  | .userTask detail => { input := some .command, published := some ("userTask", 0), userTask := some detail }
  | .message detail =>
    { input := some .deliver, published := some ("message", 1), channel := some detail.channel, payload := detail.payload
      criteria := detail.criteria }
  | .signal detail => { input := some .deliver, signal := some detail, payload := detail.payload }
  | .conditional detail => { input := none, conditional := some detail }
  | .timer detail =>
    { input := some .timerFire, published := some ("timer", 2), deadlineMs := some detail.deadlineMs
      recurrence := detail.recurrence }
  | .effect detail => { input := some .effectResult, published := some ("effect", 3), effect := some detail }
  | .incident detail => { input := some .command, published := some ("incident", 4), incident := some detail }

end Kernel
