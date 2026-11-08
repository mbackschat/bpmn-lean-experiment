module

public import Kernel.Hooks

/-! # Publish

The one generic projection from runtime state to the public state observation of the
[canonical result](../contracts/schemas/canonical-result.schema.json). Owns matching on `OpenKind` with `Step`.
User tasks and effects are ordered by occurrence (process instance id, element id, then activation), and enabled
interactions by their kind's wait rank and then occurrence, as every retained baseline state orders them
(2026-11-08); every other list keeps the order in which its items opened. Evaluation requests are internal and never
published.
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
  inputs : List (String × Value)
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

/-- A compensation handler's failure as the failed state publishes it. -/
structure PublishedFailure where
  trigger : OccurrenceId
  handler : OccurrenceId
  effect : OccurrenceId
  code : String
  message : Option String
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
  failure : Option PublishedFailure
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
  { processInstanceId := state.instanceOf item.scope, elementId := item.element.value, activation := item.activation }

def effect (id : OccurrenceId) (detail : EffectDetail) : OpenEffect :=
  { id, protocol := detail.protocol, operation := detail.operation, arguments := detail.arguments }

def userTask? (state : State) (item : OpenItem) : Option OpenUserTask :=
  match item.kind with
  | .userTask detail =>
    some { id := occurrenceId state item, name := detail.name, candidateGroups := detail.candidateGroups,
           formFields := detail.formFields, inputs := detail.inputs }
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

/-- The sort key of an enabled interaction: its kind's wait rank, then its occurrence. -/
def EnabledInteraction.key : EnabledInteraction → Nat × OccurrenceId
  | .completeUserTask id => (0, id)
  | .deliverMessage id _ => (1, id)
  | .deliverPayloadMessage id _ => (1, id)
  | .retryIncident id _ => (4, id)
  | .cancelIncidentProcess id _ => (4, id)

def OccurrenceId.le (left right : OccurrenceId) : Bool :=
  decide (left.processInstanceId < right.processInstanceId) || (left.processInstanceId == right.processInstanceId &&
    (decide (left.elementId < right.elementId) ||
      (left.elementId == right.elementId && left.activation ≤ right.activation)))

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

def reference (ref : OccurrenceRef) : OccurrenceId :=
  { processInstanceId := ref.processInstanceId, elementId := ref.element.value, activation := ref.activation }

/-- A trigger is published under an identity distinct from its throwing element's, `operation:<element>`: "each
trigger has an identity distinct from its throw Event" in the
[trigger account](../docs/capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md), whose name the retained baselines
publish (`compensation-failure-*`, `transaction-cancellation-handler-failed`). -/
def failure (record : CompensationFailure) : PublishedFailure :=
  let trigger := reference record.trigger
  { trigger := { trigger with elementId := s!"operation:{trigger.elementId}" }, handler := reference record.handler
    effect := reference record.effect, code := record.code, message := record.message }

def observe (state : State) : Observation :=
  let items := state.openItems
  { instanceId := state.instanceId
    status := statusName state.status
    activeWaits := activeWaits items
    openUserTasks := (items.filterMap (userTask? state)).mergeSort fun left right => left.id.le right.id
    openMessageSubscriptions := items.filterMap (messageSubscription? state)
    openTimers := items.filterMap (timer? state)
    openEffects := (items.filterMap (effect? state)).mergeSort fun left right => left.id.le right.id
    openIncidents := items.filterMap (incident? state)
    variables := (((state.variables.find? (·.scope == State.root)).map (·.entries)).getD []).mergeSort
      fun left right => decide (left.1 ≤ right.1)
    enabledInteractions := (items.flatMap (interactions state)).mergeSort fun left right =>
      left.key.1 < right.key.1 || (left.key.1 == right.key.1 && left.key.2.le right.key.2)
    logicalTimeMs := state.logicalTimeMs
    failure := state.failure.map failure }

/-! ## Multi-Instance Activities -/

/-- An open instance: its zero-based position in the input collection, its User Task, the input data item it was
given and the output data item its completion submits. -/
structure OpenIteration where
  loopCounter : Nat
  taskId : OccurrenceId
  taskInput : String × Value
  completionBindingName : String
  deriving Repr

/-- The schema's `openSequentialMultiInstance` and `openParallelMultiInstance`: the Activity's occurrence, its mode,
and the instance counts of BPMN 2.0.2 Table 10.30; an instance is never terminated in a state that keeps it. -/
structure OpenMultiInstance where
  processInstanceId : String
  activityElementId : String
  activation : Nat
  mode : String
  plannedInstanceCount : Nat
  pendingItemCount : Nat
  numberOfInstances : Nat
  numberOfActiveInstances : Nat
  numberOfCompletedInstances : Nat
  activeIterations : List OpenIteration
  deriving Repr

/-- A program publishes `openMultiInstances`, in every state, exactly when it declares a Multi-Instance Activity or
Scope, as the frozen evaluator does (`BpmnSemantics.SemanticProcess.hasMultiInstanceDefinitions`). -/
def publishesMultiInstances (program : Program) : Bool :=
  program.elements.any fun element => element.envelope?.any (·.multiInstance.isSome)

def isCompleted : Iteration → Bool
  | .completed _ => true
  | .waiting => false
  | .active _ => false

/-- The open Multi-Instance Activities in the order they were entered; `modeName` is `Hooks.multiInstanceMode`. -/
def multiInstances (modeName : MultiInstanceMode → String) (program : Program) (state : State) :
    List OpenMultiInstance :=
  state.slots.multiInstances.runs.filterMap fun run => do
    let loop ← ((program.element? run.element).bind (·.envelope?)).bind (·.multiInstance)
    let input ← loop.inputDataItem
    let output ← loop.outputDataItem
    let items ← run.items
    let iterations := run.instances.zipIdx.filterMap fun (slot, index) =>
      match slot with
      | .active id => do
        let item ← state.openItems.find? (·.id == id)
        let value ← items[index]?
        some { loopCounter := index, taskId := occurrenceId state item, taskInput := (input, value),
               completionBindingName := output }
      | .waiting => none
      | .completed _ => none
    let completed := (run.instances.filter isCompleted).length
    let generated := iterations.length + completed
    some { processInstanceId := state.instanceOf run.scope, activityElementId := run.element.value
           activation := run.activation, mode := modeName loop.mode
           plannedInstanceCount := run.instances.length, pendingItemCount := run.instances.length - generated
           numberOfInstances := generated, numberOfActiveInstances := iterations.length
           numberOfCompletedInstances := completed, activeIterations := iterations }

end Kernel.Publish
