module

public import Kernel.Hooks

/-! # Publish

The one generic projection from runtime state to the public state observation of the
[canonical result](../contracts/schemas/canonical-result.schema.json). It reads open items through `OpenKind.view`.
User tasks and effects are ordered by occurrence (process instance id, element id, then activation), and enabled
interactions by their kind's wait rank and then occurrence; every other list keeps the order in which its items
opened. This is the project's publication contract; a Signal or conditional wait, which no admitted model opens yet, is
not published.
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
  /-- A correlated wait's definition-scoped publication; the subscription only orders it and is never published,
  since a correlated publication names no target ([specification](../docs/capsules/MESSAGE-KEY-CORRELATION-SPEC.md#global-command-and-runtime-contract)). -/
  | publishCorrelatedPayloadMessage (subscription : OccurrenceId) (channel : MessageChannel) (correlationKey : String)
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

def statusName : InstanceStatus → String
  | .running => "running"
  | .completed => "completed"
  | .cancelled => "cancelled"
  | .failed => "failed"

/-- One wait per element and kind, counting its open items, in the order the first of them opened. -/
def activeWaitsInOpenOrder (program : Program) (items : List OpenItem) : List ActiveWait :=
  items.foldl (fun waits item =>
    let elementId := (program.publicId item.element).value
    match item.kind.view.published with
    | none => waits
    | some (kind, rank) =>
      if waits.any (fun wait => wait.elementId == elementId && wait.kind == kind) then
        waits.map fun wait =>
          if wait.elementId == elementId && wait.kind == kind then
            { wait with multiplicity := wait.multiplicity + 1 }
          else wait
      else waits ++ [{ elementId, kind, rank, multiplicity := 1 }]) []

/-- One wait per element and kind, counting its open items, ordered by kind (user task, message, timer, effect,
incident) and then by element id. -/
def activeWaits (program : Program) (items : List OpenItem) : List ActiveWait :=
  (activeWaitsInOpenOrder program items).mergeSort fun left right =>
    left.rank < right.rank || (left.rank == right.rank && decide (left.elementId ≤ right.elementId))

def occurrenceId (program : Program) (state : State) (item : OpenItem) : OccurrenceId :=
  { processInstanceId := state.instanceOf item.scope, elementId := (program.publicId item.element).value
    activation := ((state.occurrence? item.occurrence).map (·.activation)).getD 0 }

def effect (id : OccurrenceId) (detail : EffectDetail) : OpenEffect :=
  { id, protocol := detail.protocol, operation := detail.operation, arguments := detail.arguments }

def userTask? (program : Program) (state : State) (item : OpenItem) : Option OpenUserTask :=
  item.kind.view.userTask.map fun detail =>
    { id := occurrenceId program state item, name := detail.name, candidateGroups := detail.candidateGroups,
      formFields := detail.formFields, inputs := detail.inputs }

def messageSubscription? (program : Program) (state : State) (item : OpenItem) : Option OpenMessageSubscription :=
  item.kind.view.channel.map fun channel => { id := occurrenceId program state item, channel }

def timer? (program : Program) (state : State) (item : OpenItem) : Option OpenTimer :=
  item.kind.view.deadlineMs.map fun deadlineMs => { id := occurrenceId program state item, deadlineMs }

def effect? (program : Program) (state : State) (item : OpenItem) : Option OpenEffect :=
  item.kind.view.effect.map (effect (occurrenceId program state item))

def incident? (program : Program) (state : State) (item : OpenItem) : Option OpenIncident :=
  item.kind.view.incident.map fun detail =>
    { effect := effect (occurrenceId program state item) detail.effect, generation := detail.generation }

/-- The sort key of an enabled interaction: its kind's wait rank, then its occurrence. -/
def EnabledInteraction.key : EnabledInteraction → Nat × OccurrenceId
  | .completeUserTask id => (0, id)
  | .deliverMessage id _ => (1, id)
  | .deliverPayloadMessage id _ => (1, id)
  | .publishCorrelatedPayloadMessage id _ _ => (1, id)
  | .retryIncident id _ => (4, id)
  | .cancelIncidentProcess id _ => (4, id)

def OccurrenceId.le (left right : OccurrenceId) : Bool :=
  decide (left.processInstanceId < right.processInstanceId) || (left.processInstanceId == right.processInstanceId &&
    (decide (left.elementId < right.elementId) ||
      (left.elementId == right.elementId && left.activation ≤ right.activation)))

/-- What an open item enables: each view field contributes its own interactions, so no field's presence is read as the
item's kind. -/
def interactions (program : Program) (state : State) (item : OpenItem) : List EnabledInteraction :=
  let id := occurrenceId program state item
  let view := item.kind.view
  let userTask : List EnabledInteraction := view.userTask.toList.map fun _ => .completeUserTask id
  let message : List EnabledInteraction := view.channel.toList.map fun channel =>
    match view.criteria with
    | key :: _ => .publishCorrelatedPayloadMessage id channel key
    | [] => if view.payload then .deliverPayloadMessage id channel else .deliverMessage id channel
  let incident : List EnabledInteraction := view.incident.toList.flatMap fun detail =>
    .retryIncident id detail.generation ::
      (if detail.cancellable then [.cancelIncidentProcess id detail.generation] else [])
  userTask ++ message ++ incident

def reference (program : Program) (ref : OccurrenceRef) : OccurrenceId :=
  { processInstanceId := ref.processInstanceId, elementId := (program.publicId ref.element).value
    activation := ref.activation }

/-- A compensation trigger is published under an identity distinct from its throwing element's, `operation:<element>`:
"each trigger has an identity distinct from its throw Event" in the
[trigger account](../docs/capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md). A failure without a trigger and handler
is not published in this form. -/
def failure (program : Program) (record : InstanceFailure) : Option PublishedFailure := do
  let related (name : String) := (record.related.find? (·.1 == name)).map (·.2)
  let trigger := reference program (← related "trigger")
  let handler := reference program (← related "handler")
  pure { trigger := { trigger with elementId := s!"operation:{trigger.elementId}" }, handler
         effect := reference program record.occurrence, code := record.code, message := record.message }

def observe (program : Program) (state : State) : Observation :=
  let items := state.openItems
  { instanceId := state.instanceId
    status := statusName state.status
    activeWaits := activeWaits program items
    openUserTasks := (items.filterMap (userTask? program state)).mergeSort fun left right => left.id.le right.id
    openMessageSubscriptions := items.filterMap (messageSubscription? program state)
    openTimers := items.filterMap (timer? program state)
    openEffects := (items.filterMap (effect? program state)).mergeSort fun left right => left.id.le right.id
    openIncidents := items.filterMap (incident? program state)
    variables := (((state.variables.find? (·.scope == State.root)).map (·.entries)).getD []).mergeSort
      fun left right => decide (left.1 ≤ right.1)
    enabledInteractions := (items.flatMap (interactions program state)).mergeSort fun left right =>
      left.key.1 < right.key.1 || (left.key.1 == right.key.1 && left.key.2.le right.key.2)
    logicalTimeMs := state.logicalTimeMs
    failure := state.failure.bind (failure program) }

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
  mode : MultiInstanceMode
  plannedInstanceCount : Nat
  pendingItemCount : Nat
  numberOfInstances : Nat
  numberOfActiveInstances : Nat
  numberOfCompletedInstances : Nat
  activeIterations : List OpenIteration
  deriving Repr

/-- A program publishes `openMultiInstances`, in every state, exactly when it declares a Multi-Instance Activity or
Scope. -/
def publishesMultiInstances (program : Program) : Bool :=
  program.elements.any fun element => element.envelope?.any (·.multiInstance.isSome)

def isCompleted : Iteration → Bool
  | .completed _ => true
  | .waiting => false
  | .active _ => false

/-- The open Multi-Instance Activities in the order they were entered. -/
def multiInstances (program : Program) (state : State) : List OpenMultiInstance :=
  state.slots.multiInstances.filterMap fun run => do
    let loop ← ((program.element? run.element).bind (·.envelope?)).bind (·.multiInstance)
    let input ← loop.inputDataItem
    let output ← loop.outputDataItem
    let items ← run.items
    let iterations := run.instances.zipIdx.filterMap fun (slot, index) =>
      match slot with
      | .active scope => do
        let item ← state.openItems.find? (·.scope == scope)
        let value ← items[index]?
        some { loopCounter := index, taskId := occurrenceId program state item, taskInput := (input, value),
               completionBindingName := output }
      | .waiting => none
      | .completed _ => none
    let completed := (run.instances.filter isCompleted).length
    let generated := iterations.length + completed
    some { processInstanceId := state.instanceOf run.scope, activityElementId := (program.publicId run.element).value
           activation := ((state.occurrence? run.occurrence).map (·.activation)).getD 0, mode := loop.mode
           plannedInstanceCount := run.instances.length, pendingItemCount := run.instances.length - generated
           numberOfInstances := generated, numberOfActiveInstances := iterations.length
           numberOfCompletedInstances := completed, activeIterations := iterations }

end Kernel.Publish
