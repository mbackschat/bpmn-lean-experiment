import BpmnSemantics.SemanticProcess.MessageBoundedTask

/-! ESL-MESSAGE-01 and ESL-CLOSE-01 select a persistent Message subscription and exact host
completion. Only atomic arming is shared with the interrupting family; definition selection and
both lifetime transitions are separate, without changing the Program or runtime representation. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

structure MessageMonitoredDefinition where
  id : OperationId
  origin : BpmnElementOrigin
  input : ControlPlaceId
  task : BoundedTaskArm
  boundary : BoundaryMessageArm
  deriving DecidableEq

def messageMonitoredTaskDefinitions (program : Program) : List MessageMonitoredDefinition :=
  program.operations.filterMap fun
    | .awaitMessageMonitoredUserTask id origin input task boundary =>
        some { id, origin, input, task, boundary }
    | _ => none

def isMessageMonitoredTaskDefinition (program : Program) (taskId : TaskDefinitionId) : Bool :=
  (messageMonitoredTaskDefinitions program).any fun definition => decide (definition.task.id = taskId)

def isMonitoredMessageBoundaryDefinition (program : Program) (elementId : NodeId) : Bool :=
  (messageMonitoredTaskDefinitions program).any fun definition => decide (definition.boundary.elementId = elementId)

abbrev armMessageMonitoredUserTaskState? := armMessageBoundedUserTaskState?
abbrev MessageMonitoredTaskArmingStep := MessageBoundedTaskArmingStep

theorem armMessageMonitoredUserTaskState_sound (before after : RuntimeState)
    (input : ControlPlaceId) (task : BoundedTaskArm) (boundary : BoundaryMessageArm)
    (success : armMessageMonitoredUserTaskState? before input task boundary = some after) :
    MessageMonitoredTaskArmingStep before input task boundary after :=
  armMessageBoundedUserTaskState_sound before after input task boundary success

structure MessageMonitoredPair where
  definition : MessageMonitoredDefinition
  record : ActivityOccurrence
  task : UserTaskWait
  message : MessageWait

def messageMonitoredTaskIdentity (task : UserTaskWait) : OccurrenceId :=
  { processInstanceId := task.processInstanceId, elementId := ⟨task.task.id.value⟩,
    activation := task.activation }

def messageMonitoredSubscriptionIdentity (message : MessageWait) : OccurrenceId :=
  { processInstanceId := message.processInstanceId, elementId := ⟨message.elementId.value⟩,
    activation := message.activation }

def messageMonitoredOperationAddressed (channel : MessageChannel) : Bool :=
  match channel with | .operationMessage .. => true | _ => false

/-- Singleton censuses are over complete occurrence keys, before checking declaration fields.
Thus an additional malformed claim or wait cannot be hidden by selecting the first valid match. -/
def MessageMonitoredCensus (state : RuntimeState) (pair : MessageMonitoredPair) : Prop :=
  state.waits.filter (taskIdNamesWait (messageMonitoredTaskIdentity pair.task)) = [pair.task] ∧
  state.messageWaits.filter (messageIdNamesWait (messageMonitoredSubscriptionIdentity pair.message)) = [pair.message] ∧
  state.activityOccurrences.filter (recordBodyNamesWait pair.task) = [pair.record] ∧
  state.activityOccurrences.filter (fun record =>
    anyMessageIdNamesWait record.messageHandlerOccurrences pair.message) = [pair.record] ∧
  state.activityOccurrences.filter (sameActivityOccurrence pair.record) = [pair.record]

/-- The Activity element identifies one new-family declaration; its operation scope must agree
with the recorded runtime owner. Independent activation counters are never compared to each other. -/
def MessageMonitoredDefinitionBinding (program : Program) (pair : MessageMonitoredPair) : Prop :=
  (messageMonitoredTaskDefinitions program).filter (fun definition =>
    decide (definition.task.id.value = pair.record.activityElementId.value)) = [pair.definition] ∧
  operationOwningScope? program pair.definition.id = some pair.record.owner.definitionScopeId ∧
  pair.definition.origin.elementId = pair.record.activityElementId ∧
  pair.record.activityElementId.value = pair.definition.task.id.value ∧
  pair.task.task = { id := pair.definition.task.id, name := pair.definition.task.name } ∧
  pair.task.metadata = none ∧ pair.task.output = pair.definition.task.output ∧
  pair.message.elementId = pair.definition.boundary.elementId ∧
  pair.message.channel = pair.definition.boundary.channel ∧
  pair.message.output = pair.definition.boundary.output ∧
  pair.definition.task.output ≠ pair.definition.boundary.output ∧
  messageMonitoredOperationAddressed pair.definition.boundary.channel = true

/-- Complete declarative ownership, tagged attachment, live identity, definition and running-state
facts. This predicate contains no transition evaluator or desired successor-state hypothesis. -/
def MessageMonitoredBinding (program : Program) (state : RuntimeState)
    (pair : MessageMonitoredPair) : Prop :=
  MessageMonitoredCensus state pair ∧ MessageMonitoredDefinitionBinding program pair ∧
  pair.record.body = .userTask (messageMonitoredTaskIdentity pair.task) ∧
  pair.record.attachedHandlers = [.message (messageMonitoredSubscriptionIdentity pair.message)] ∧
  pair.task.owner = pair.record.owner ∧ pair.message.owner = pair.record.owner ∧
  pair.task.processInstanceId = pair.record.processInstanceId ∧
  pair.message.processInstanceId = pair.record.processInstanceId ∧
  pair.record.owner.processInstanceId = pair.record.processInstanceId ∧
  state.control = .running pair.record.processInstanceId

instance (program : Program) (state : RuntimeState) (pair : MessageMonitoredPair) :
    Decidable (MessageMonitoredBinding program state pair) := by
  unfold MessageMonitoredBinding MessageMonitoredCensus MessageMonitoredDefinitionBinding
  infer_instance

private def monitoredOnly? (values : List α) : Option α :=
  match values with | [value] => some value | _ => none

private def messageMonitoredCandidate? (program : Program) (state : RuntimeState)
    (record : ActivityOccurrence) : Option MessageMonitoredPair := do
  let definition ← monitoredOnly? ((messageMonitoredTaskDefinitions program).filter fun definition =>
    decide (definition.task.id.value = record.activityElementId.value))
  let .userTask body := record.body | none
  let [.message subscription] := record.attachedHandlers | none
  let task ← monitoredOnly? (state.waits.filter (taskIdNamesWait body))
  let message ← monitoredOnly? (state.messageWaits.filter (messageIdNamesWait subscription))
  pure { definition, record, task, message }

-- The finite declaration predicate is also the final validation boundary. Its proof is erased;
-- the selector's returned certificate supplies the declarative facts to each soundness bridge.
def messageMonitoredPairForRecord? (program : Program) (state : RuntimeState)
    (record : ActivityOccurrence) : Option { pair : MessageMonitoredPair // MessageMonitoredBinding program state pair } := do
  let pair ← messageMonitoredCandidate? program state record
  if bound : MessageMonitoredBinding program state pair then some ⟨pair, bound⟩ else none

def messageMonitoredPairForTask? (program : Program) (state : RuntimeState)
    (identity : OccurrenceId) : Option { pair : MessageMonitoredPair // MessageMonitoredBinding program state pair } := do
  let record ← monitoredOnly? (state.activityOccurrences.filter fun record =>
    decide (record.body = .userTask identity))
  messageMonitoredPairForRecord? program state record

def messageMonitoredPairForSubscription? (program : Program) (state : RuntimeState)
    (identity : OccurrenceId) : Option { pair : MessageMonitoredPair // MessageMonitoredBinding program state pair } := do
  let record ← monitoredOnly? (state.activityOccurrences.filter fun record =>
    record.messageHandlerOccurrences.contains identity)
  messageMonitoredPairForRecord? program state record

def spawnMessageMonitoredPair (state : RuntimeState) (pair : MessageMonitoredPair) : RuntimeState :=
  { state with tokens := addToken state.tokens pair.definition.boundary.output pair.record.owner }

def completeMessageMonitoredPair (state : RuntimeState) (pair : MessageMonitoredPair) : RuntimeState :=
  { state with
    waits := state.waits.erase pair.task
    messageWaits := state.messageWaits.erase pair.message
    activityOccurrences := state.activityOccurrences.erase pair.record
    tokens := addToken state.tokens pair.definition.task.output pair.record.owner }

/-- ESL-SPAWN-01 changes only tokens, retaining the exact host and long-lived subscription. -/
inductive MessageMonitoredSpawnStep (program : Program) (identity : MessageSubscriptionId)
    (channel : MessageChannel) : RuntimeState → RuntimeState → Prop where
  | spawn (before : RuntimeState) (pair : MessageMonitoredPair)
      (bound : MessageMonitoredBinding program before pair)
      (addressed : messageMonitoredSubscriptionIdentity pair.message = identity)
      (channelMatches : pair.message.channel = channel) :
      MessageMonitoredSpawnStep program identity channel before (spawnMessageMonitoredPair before pair)

/-- ESL-CLOSE-01 withdraws exactly the selected triple. Existing handler work has independent
occurrence identities and is never selected by an element-wide filter. -/
inductive MessageMonitoredCompletionStep (program : Program) (instanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat) (values : List VariableBinding) :
    RuntimeState → RuntimeState → Prop where
  | complete (before : RuntimeState) (pair : MessageMonitoredPair)
      (bound : MessageMonitoredBinding program before pair)
      (addressed : messageMonitoredTaskIdentity pair.task =
        { processInstanceId := instanceId, elementId := ⟨taskId.value⟩, activation })
      (empty : values = []) :
      MessageMonitoredCompletionStep program instanceId taskId activation values before
        (completeMessageMonitoredPair before pair)

def spawnFromMessageMonitoredUserTask? (program : Program) (state : RuntimeState)
    (subscriptionId : MessageSubscriptionId) (channel : MessageChannel) : Option RuntimeState := do
  let pair ← messageMonitoredPairForSubscription? program state subscriptionId
  if messageMonitoredSubscriptionIdentity pair.val.message = subscriptionId ∧ pair.val.message.channel = channel then
    some (spawnMessageMonitoredPair state pair.val)
  else none

def completeMessageMonitoredUserTask? (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (submittedValues : List VariableBinding) : Option RuntimeState := do
  if submittedValues ≠ [] then none else
  let identity : OccurrenceId :=
    { processInstanceId, elementId := ⟨taskId.value⟩, activation }
  let pair ← messageMonitoredPairForTask? program state identity
  if messageMonitoredTaskIdentity pair.val.task = identity then
    some (completeMessageMonitoredPair state pair.val)
  else none

theorem spawnFromMessageMonitoredUserTask_sound (program : Program) (before after : RuntimeState)
    (subscriptionId : MessageSubscriptionId) (channel : MessageChannel)
    (success : spawnFromMessageMonitoredUserTask? program before subscriptionId channel = some after) :
    MessageMonitoredSpawnStep program subscriptionId channel before after := by
  unfold spawnFromMessageMonitoredUserTask? at success
  obtain ⟨pair, _, success⟩ := Option.bind_eq_some_iff.mp success
  split at success
  · next accepted =>
      cases success
      exact .spawn before pair.val pair.property accepted.1 accepted.2
  · contradiction

theorem completeMessageMonitoredUserTask_sound (program : Program) (before after : RuntimeState)
    (instanceId : SemanticId) (taskId : TaskDefinitionId) (activation : Nat)
    (values : List VariableBinding)
    (success : completeMessageMonitoredUserTask? program before instanceId taskId activation values = some after) :
    MessageMonitoredCompletionStep program instanceId taskId activation values before after := by
  unfold completeMessageMonitoredUserTask? at success
  split at success
  · contradiction
  · next empty =>
      obtain ⟨pair, _, success⟩ := Option.bind_eq_some_iff.mp success
      split at success
      · next accepted =>
          cases success
          exact .complete before pair.val pair.property accepted (by simpa using empty)
      · contradiction

end BpmnSemantics.SemanticProcess
