module

public import Kernel.State.Wait

/-! # Kernel inputs

The inputs a host submits, the occurrence identities they name and the start triggers and deliveries they carry.
Part of `Kernel.State`, which re-exports it.
-/

public section

namespace Kernel

/-- The public identity of an occurrence: its process instance, the element and its activation number. -/
structure OccurrenceRef where
  processInstanceId : String
  element : ElementId
  activation : Nat
  deriving DecidableEq, Repr

inductive StartTrigger where
  -- guard-exception(3): the start input's own statement of how it fired, not a second dispatch over `Trigger`.
  | none
  | timer (logicalTimeMs : Nat)
  | message (channel : MessageChannel) (payload : Option Value)
  | signal (address : SignalAddress) (variables : List (String × Value))
  | condition
  deriving Repr

/-- How a Signal delivery reached its occurrence. Only the population's fan-out builds `broadcast`; the scenario wire and
every external ingress decode to `targeted`, so no caller can set it (PC-SIGNAL-04). -/
inductive SignalReach where
  /-- A request naming one occurrence, admitted only under `signalDelivery = occurrenceTargeted` (CIB-EXT-0042). -/
  | targeted
  /-- One receiver of a broadcast or of a thrown Signal's intent, taken from the population's snapshot. -/
  | broadcast
  deriving DecidableEq, Repr

/-- What a delivery delivers. An addressless Receive stays a delivery on the unspecified channel (CIB-INT-0004). -/
inductive DeliveryTrigger where
  | message (channel : MessageChannel)
  | signal (address : SignalAddress) (reach : SignalReach)
  deriving Repr

/-- Whether a delivery is one receiver of a broadcast, which may carry the Signal's variables. -/
def DeliveryTrigger.fromBroadcast : DeliveryTrigger → Bool
  | .signal _ reach => reach == .broadcast
  | .message _ => false

inductive CriterionTarget where
  | processVariable (name : String)
  | localVariable (name : String)
  | businessKey
  | processInstance
  deriving Repr

/-- A present null matches only a present null; an absent name matches nothing (PC-MESSAGE-08). -/
structure CorrelationMatch where
  target : CriterionTarget
  expected : Value
  deriving Repr

/-- A Message or Signal delivered to the subscription `occurrence` names. `variables` are the delivery's own variables
beside its payload, which CIB installs in the receiving scope (CIB-EXT-0025); `Kernel.Step` rejects a non-empty list
(`delivery-variables-not-admitted`) while no profile installs them. -/
structure DeliveryInput where
  occurrence : OccurrenceRef
  trigger : DeliveryTrigger
  correlation : List CorrelationMatch := []
  payload : Option Value := none
  variables : List (String × Value) := []
  /-- The input's logical time (`Input.atMs`). -/
  atMs : Option Nat := none
  deriving Repr

/-! ## Inputs -/

structure StartInput where
  instanceId : String
  startEvent : Option ElementId := none
  variables : List (String × Value) := []
  trigger : StartTrigger := .none
  businessKey : Option String := none
  /-- The input's logical time (`Input.atMs`). -/
  atMs : Option Nat := none
  deriving Repr

/-- An incident command names the incident's `generation` (`IncidentDetail.generation`) beside its occurrence, so a
command issued against an incident that has since been resolved or reopened is rejected rather than applied to another
one. -/
inductive CommandAction where
  | completeUserTask (values : List (String × Value))
  | retryIncident (generation : Nat)
  | cancelIncidentProcess (generation : Nat)
  | setVariables (values : List (String × Value))
  | removeVariables (names : List String)
  deriving Repr

structure CommandInput where
  occurrence : OccurrenceRef
  action : CommandAction
  /-- The input's logical time (`Input.atMs`). -/
  atMs : Option Nat := none
  deriving Repr

structure TimerInput where
  occurrence : OccurrenceRef
  logicalTimeMs : Nat
  /-- The input's logical time (`Input.atMs`). -/
  atMs : Option Nat := none
  deriving Repr

inductive EffectOutcome where
  | success (outputs : List (String × Value))
  | businessFailure (code : String) (message : Option String) (outputs : List (String × Value))
  | technicalFailure
  deriving Repr

structure EffectInput where
  occurrence : OccurrenceRef
  outcome : EffectOutcome
  /-- The input's logical time (`Input.atMs`). -/
  atMs : Option Nat := none
  deriving Repr

/-- Guarded type: `Kernel.Step` owns matching on it. Every payload carries `atMs`, the input's logical time in
milliseconds: the clock advances to it before the input's transition, so a timer armed by the input counts from it, and
`none` leaves the clock where it is. Logical time is an explicit input, never a wall clock. -/
inductive Input where
  | start (payload : StartInput)
  | command (payload : CommandInput)
  | deliver (payload : DeliveryInput)
  | timerFire (payload : TimerInput)
  | effectResult (payload : EffectInput)
  deriving Repr

/-- What an expression reads: the variables in view and the logical time, never a wall clock. -/
structure EvalContext where
  variables : List (String × Value)
  nowMs : Nat
  /-- Whether a JUEL result passes the portable-domain check before the site sees it; the Multi-Instance count and
  collection sites read it first (EXPRESSION-SEMANTICS-SPEC "Multi-Instance level", Results). -/
  domainChecked : Bool := true

end Kernel
