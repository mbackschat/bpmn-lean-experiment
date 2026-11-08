module

public import Kernel.Hooks

/-! # Publish

The one generic projection from runtime state to the public state observation of the
[canonical result](../contracts/schemas/canonical-result.schema.json). Owns matching on `OpenKind` with `Step`.
Every list keeps the order in which its items opened; each open item contributes its enabled interactions in that
same order. Evaluation requests are internal and never published.
-/

public section

namespace Kernel.Publish

/-- The schema's `occurrenceId`: an element and its activation in the process instance. -/
structure OccurrenceId where
  processInstanceId : String
  elementId : String
  activation : Nat
  deriving Repr

structure ActiveWait where
  elementId : String
  kind : String
  rank : Nat
  multiplicity : Nat
  deriving Repr

structure OpenUserTask where
  id : OccurrenceId
  name : Option String
  candidateGroups : List String
  formFields : List (String × String)
  deriving Repr

structure OpenMessageSubscription where
  id : OccurrenceId
  channel : MessageChannel
  deriving Repr

structure OpenTimer where
  id : OccurrenceId
  deadlineMs : Nat
  deriving Repr

structure OpenEffect where
  id : OccurrenceId
  protocol : String
  operation : String
  arguments : List (String × Value)
  deriving Repr

structure OpenIncident where
  effect : OpenEffect
  generation : Nat
  deriving Repr

inductive EnabledInteraction where
  | completeUserTask (task : OccurrenceId)
  | deliverMessage (subscription : OccurrenceId) (channel : MessageChannel)
  | deliverPayloadMessage (subscription : OccurrenceId) (channel : MessageChannel)
  | retryIncident (effect : OccurrenceId) (generation : Nat)
  | cancelIncidentProcess (effect : OccurrenceId) (generation : Nat)
  deriving Repr

structure Observation where
  instanceId : String
  status : String
  activeWaits : List ActiveWait
  openUserTasks : List OpenUserTask
  openMessageSubscriptions : List OpenMessageSubscription
  openTimers : List OpenTimer
  openEffects : List OpenEffect
  openIncidents : List OpenIncident
  variables : List (String × Value)
  enabledInteractions : List EnabledInteraction
  logicalTimeMs : Nat
  deriving Repr

/-- The published wait kind of an open item and its rank in `activeWaits`; evaluation requests are not waits. -/
def waitKind : OpenKind → Option (String × Nat)
  | .userTask _ => some ("userTask", 0)
  | .message _ => some ("message", 1)
  | .timer _ => some ("timer", 2)
  | .effect _ => some ("effect", 3)
  | .incident _ => some ("incident", 4)
  | .evaluation _ => none

def statusName : InstanceStatus → String
  | .running => "running"
  | .completed => "completed"
  | .cancelled => "cancelled"
  | .failed => "failed"

/-- One wait per element and kind, counting its open items, in the order the first of them opened. -/
def activeWaitsInOpenOrder (items : List OpenItem) : List ActiveWait :=
  items.foldl (fun waits item =>
    match waitKind item.kind with
    | none => waits
    | some (kind, rank) =>
      if waits.any (fun wait => wait.elementId == item.element.value && wait.kind == kind) then
        waits.map fun wait =>
          if wait.elementId == item.element.value && wait.kind == kind then
            { wait with multiplicity := wait.multiplicity + 1 }
          else wait
      else waits ++ [{ elementId := item.element.value, kind, rank, multiplicity := 1 }]) []

/-- One wait per element and kind, counting its open items, ordered by kind (user task, message, timer, effect,
incident) and then by element id, as every retained baseline state orders them (994 of 994, 2026-11-08). -/
def activeWaits (items : List OpenItem) : List ActiveWait :=
  (activeWaitsInOpenOrder items).mergeSort fun left right =>
    left.rank < right.rank || (left.rank == right.rank && decide (left.elementId ≤ right.elementId))

def occurrenceId (state : State) (item : OpenItem) : OccurrenceId :=
  { processInstanceId := state.instanceId, elementId := item.element.value, activation := item.activation }

def effect (id : OccurrenceId) (detail : EffectDetail) : OpenEffect :=
  { id, protocol := detail.protocol, operation := detail.operation, arguments := detail.arguments }

def userTask? (state : State) (item : OpenItem) : Option OpenUserTask :=
  match item.kind with
  | .userTask detail =>
    some { id := occurrenceId state item, name := detail.name, candidateGroups := detail.candidateGroups,
           formFields := detail.formFields }
  | .message _ => none
  | .timer _ => none
  | .effect _ => none
  | .incident _ => none
  | .evaluation _ => none

def messageSubscription? (state : State) (item : OpenItem) : Option OpenMessageSubscription :=
  match item.kind with
  | .message detail => some { id := occurrenceId state item, channel := detail.channel }
  | .userTask _ => none
  | .timer _ => none
  | .effect _ => none
  | .incident _ => none
  | .evaluation _ => none

def timer? (state : State) (item : OpenItem) : Option OpenTimer :=
  match item.kind with
  | .timer detail => some { id := occurrenceId state item, deadlineMs := detail.deadlineMs }
  | .userTask _ => none
  | .message _ => none
  | .effect _ => none
  | .incident _ => none
  | .evaluation _ => none

def effect? (state : State) (item : OpenItem) : Option OpenEffect :=
  match item.kind with
  | .effect detail => some (effect (occurrenceId state item) detail)
  | .userTask _ => none
  | .message _ => none
  | .timer _ => none
  | .incident _ => none
  | .evaluation _ => none

def incident? (state : State) (item : OpenItem) : Option OpenIncident :=
  match item.kind with
  | .incident detail =>
    some { effect := effect (occurrenceId state item) detail.effect, generation := detail.generation }
  | .userTask _ => none
  | .message _ => none
  | .timer _ => none
  | .effect _ => none
  | .evaluation _ => none

def interactions (state : State) (item : OpenItem) : List EnabledInteraction :=
  let id := occurrenceId state item
  match item.kind with
  | .userTask _ => [.completeUserTask id]
  | .message detail =>
    [if detail.payload then .deliverPayloadMessage id detail.channel else .deliverMessage id detail.channel]
  | .incident detail =>
    .retryIncident id detail.generation ::
      (if detail.cancellable then [.cancelIncidentProcess id detail.generation] else [])
  | .timer _ => []
  | .effect _ => []
  | .evaluation _ => []

def observe (state : State) : Observation :=
  let items := state.openItems
  { instanceId := state.instanceId
    status := statusName state.status
    activeWaits := activeWaits items
    openUserTasks := items.filterMap (userTask? state)
    openMessageSubscriptions := items.filterMap (messageSubscription? state)
    openTimers := items.filterMap (timer? state)
    openEffects := items.filterMap (effect? state)
    openIncidents := items.filterMap (incident? state)
    variables := (((state.variables.find? (·.scope == State.root)).map (·.entries)).getD []).mergeSort
      fun left right => decide (left.1 ≤ right.1)
    enabledInteractions := items.flatMap (interactions state)
    logicalTimeMs := state.logicalTimeMs }

end Kernel.Publish
