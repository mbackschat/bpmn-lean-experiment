import BpmnSemantics.SemanticProcess.WaitActivation
import BpmnSemantics.SemanticProcess.ActivityOccurrence

/-! # Interrupting Activity boundary Message

This module owns the private atomic account for one User Task with one payload-free,
operation-addressed interrupting Message handler. Arming and either victory resolve through the
same Activity occurrence; the handler tag is part of that resolution, so an identically shaped
Timer identity cannot stand in for the Message subscription.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def messageBoundedRunningInstance? (state : RuntimeState) : Option SemanticId :=
  match state.control with
  | .running instanceId => some instanceId
  | _ => none

/-- Atomically consumes the input and mints the task, subscription, and Activity identities from
their independent high-water marks. -/
def activateMessageBoundedUserTask (state : RuntimeState) (instanceId : SemanticId)
    (owner : ScopeOccurrenceId) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundaryMessage : BoundaryMessageArm) : RuntimeState :=
  let taskActivation := activationCount state task.id + 1
  let messageActivation := messageActivationCount state boundaryMessage.elementId + 1
  let activityActivation := activityActivationCount state task.id + 1
  { state with
    tokens := removeToken state.tokens input owner
    waits := insertUserTaskWait
      { processInstanceId := instanceId
        owner
        task := { id := task.id, name := task.name }
        activation := taskActivation
        output := task.output
        metadata := none } state.waits
    messageWaits := insertMessageWait
      { processInstanceId := instanceId
        owner
        elementId := boundaryMessage.elementId
        activation := messageActivation
        channel := boundaryMessage.channel
        output := boundaryMessage.output } state.messageWaits
    activations := setActivationCount state.activations task.id taskActivation
    messageActivations := setMessageActivationCount state.messageActivations
      boundaryMessage.elementId messageActivation
    activityOccurrences := insertActivityOccurrence
      { processInstanceId := instanceId
        activityElementId := { value := task.id.value }
        activation := activityActivation
        owner
        body := .userTask
          { processInstanceId := instanceId
            elementId := { value := task.id.value }
            activation := taskActivation }
        attachedHandlers :=
          [.message
            { processInstanceId := instanceId
              elementId := { value := boundaryMessage.elementId.value }
              activation := messageActivation }] } state.activityOccurrences
    activityActivations := setActivationCount state.activityActivations task.id
      activityActivation }

/-- Arming issues its Activity identity strictly above that element's predecessor high-water mark. -/
theorem activateMessageBoundedUserTask_issues_fresh_activity (state : RuntimeState)
    (instanceId : SemanticId) (owner : ScopeOccurrenceId) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundaryMessage : BoundaryMessageArm) :
    activityIdentityIssuingDiscipline state
      (activateMessageBoundedUserTask state instanceId owner input task boundaryMessage) = true := by
  apply activityIdentityIssuingDiscipline_insertActivityOccurrence state
    { processInstanceId := instanceId
      activityElementId := { value := task.id.value }
      activation := activityActivationCount state task.id + 1
      owner
      body := .userTask
        { processInstanceId := instanceId
          elementId := { value := task.id.value }
          activation := activationCount state task.id + 1 }
      attachedHandlers :=
        [.message
          { processInstanceId := instanceId
            elementId := { value := boundaryMessage.elementId.value }
            activation := messageActivationCount state boundaryMessage.elementId + 1 }] }
  simp

def armMessageBoundedUserTaskState? (state : RuntimeState) (input : ControlPlaceId)
    (task : BoundedTaskArm) (boundaryMessage : BoundaryMessageArm) : Option RuntimeState := do
  if task.output = boundaryMessage.output then none else
  match boundaryMessage.channel with
  | .directMessage _ => none
  | .operationMessage .. =>
      let owner ← onlyTokenOwner? state input
      let instanceId ← messageBoundedRunningInstance? state
      pure (activateMessageBoundedUserTask state instanceId owner input task boundaryMessage)

/-- Declarative arming account independent of the operation dispatcher. -/
inductive MessageBoundedTaskArmingStep : RuntimeState → ControlPlaceId →
    BoundedTaskArm → BoundaryMessageArm → RuntimeState → Prop where
  | arm (before : RuntimeState) (input : ControlPlaceId)
      (task : BoundedTaskArm) (boundaryMessage : BoundaryMessageArm)
      (owner : ScopeOccurrenceId) (instanceId : SemanticId)
      (distinctOutputs : task.output ≠ boundaryMessage.output)
      (operationAddressed : ∃ interfaceId operationId messageId,
        boundaryMessage.channel = .operationMessage interfaceId operationId messageId)
      (owned : onlyTokenOwner? before input = some owner)
      (running : messageBoundedRunningInstance? before = some instanceId) :
      MessageBoundedTaskArmingStep before input task boundaryMessage
        (activateMessageBoundedUserTask before instanceId owner input task boundaryMessage)

theorem armMessageBoundedUserTaskState_sound (before after : RuntimeState)
    (input : ControlPlaceId) (task : BoundedTaskArm)
    (boundaryMessage : BoundaryMessageArm)
    (success : armMessageBoundedUserTaskState? before input task boundaryMessage = some after) :
    MessageBoundedTaskArmingStep before input task boundaryMessage after := by
  unfold armMessageBoundedUserTaskState? at success
  by_cases distinctOutputs : task.output = boundaryMessage.output
  · simp [distinctOutputs] at success
  · cases channelEq : boundaryMessage.channel with
    | directMessage messageId => simp [distinctOutputs, channelEq] at success
    | operationMessage interfaceId operationId messageId =>
        cases owned : onlyTokenOwner? before input with
        | none => simp [distinctOutputs, channelEq, owned] at success
        | some owner =>
            cases running : messageBoundedRunningInstance? before with
            | none => simp [distinctOutputs, channelEq, owned, running] at success
            | some instanceId =>
                simp [distinctOutputs, channelEq, owned, running] at success
                cases success
                exact .arm before input task boundaryMessage owner instanceId distinctOutputs
                  ⟨interfaceId, operationId, messageId, channelEq⟩ owned running

/-- Every committed operation in this exact family. -/
def messageBoundedTaskOperations (program : Program) :
    List (ControlPlaceId × BoundedTaskArm × BoundaryMessageArm) :=
  program.operations.filterMap fun
    | .awaitMessageBoundedUserTask _ _ input task boundaryMessage =>
        some (input, task, boundaryMessage)
    | _ => none

def isMessageBoundedTaskDefinition (program : Program) (taskId : TaskDefinitionId) : Bool :=
  (messageBoundedTaskOperations program).any fun operation =>
    decide (operation.2.1.id = taskId)

def isMessageBoundaryDefinition (program : Program) (elementId : NodeId) : Bool :=
  (messageBoundedTaskOperations program).any fun operation =>
    decide (operation.2.2.elementId = elementId)

/-- The carried Activity record joins the exact task and Message subscription families. -/
def MessageBoundedRecordJoins (records : List ActivityOccurrence)
    (record : ActivityOccurrence) (task : UserTaskWait) (message : MessageWait) : Prop :=
  record ∈ records ∧
    (∃ body, activityBodyTask? record = some body ∧ taskIdNamesWait body task = true) ∧
    ∃ subscription ∈ record.messageHandlerOccurrences,
      messageIdNamesWait subscription message = true

structure MessageBoundedPair where
  record : ActivityOccurrence
  task : UserTaskWait
  message : MessageWait
  taskOutput : ControlPlaceId
  messageOutput : ControlPlaceId

/-- Program definition and recorded ownership agree on one exact pair and both routes. -/
def MessageBoundedPairing (program : Program) (records : List ActivityOccurrence)
    (record : ActivityOccurrence) (task : UserTaskWait) (message : MessageWait)
    (taskOutput messageOutput : ControlPlaceId) : Prop :=
  ∃ operation ∈ messageBoundedTaskOperations program,
    operation.2.1.id = task.task.id ∧
    operation.2.2.elementId = message.elementId ∧
    operation.2.2.channel = message.channel ∧
    operation.2.1.output = taskOutput ∧
    operation.2.2.output = messageOutput ∧
    MessageBoundedRecordJoins records record task message

def messageBoundedPairForTask? (program : Program) (state : RuntimeState)
    (task : UserTaskWait) : Option MessageBoundedPair := do
  let operation ← (messageBoundedTaskOperations program).find? fun candidate =>
    decide (candidate.2.1.id = task.task.id)
  let record ← activityOccurrenceForTaskWait? state.activityOccurrences task
  if record.attachedHandlers.length ≠ 1 then none else
  let subscription ← record.messageHandlerOccurrences.head?
  let message ← state.messageWaits.find? fun candidate =>
    messageIdNamesWait subscription candidate &&
      decide (candidate.elementId = operation.2.2.elementId) &&
      decide (candidate.channel = operation.2.2.channel) &&
      decide (candidate.output = operation.2.2.output) &&
      decide (candidate.owner = record.owner)
  pure (MessageBoundedPair.mk record task message operation.2.1.output
    operation.2.2.output)

def messageBoundedPairForSubscription? (program : Program) (state : RuntimeState)
    (subscriptionId : MessageSubscriptionId) : Option MessageBoundedPair := do
  let message ← state.messageWaits.find? fun candidate =>
    decide (candidate.processInstanceId = subscriptionId.processInstanceId) &&
      decide (candidate.elementId.value = subscriptionId.elementId.value) &&
      decide (candidate.activation = subscriptionId.activation)
  let operation ← (messageBoundedTaskOperations program).find? fun candidate =>
    decide (candidate.2.2.elementId = message.elementId)
  let record ← activityOccurrenceForMessageWait? state.activityOccurrences message
  if record.attachedHandlers.length ≠ 1 then none else
  let body ← activityBodyTask? record
  let task ← state.waits.find? fun candidate =>
    taskIdNamesWait body candidate &&
      decide (candidate.task.id = operation.2.1.id) &&
      decide (candidate.output = operation.2.1.output) &&
      decide (candidate.owner = record.owner)
  if message.channel ≠ operation.2.2.channel ||
      message.output ≠ operation.2.2.output then none else
  pure (MessageBoundedPair.mk record task message operation.2.1.output
    operation.2.2.output)

private theorem messageBoundedPairForTask_pairing (program : Program)
    (state : RuntimeState) (task : UserTaskWait) (pair : MessageBoundedPair)
    (found : messageBoundedPairForTask? program state task = some pair) :
    MessageBoundedPairing program state.activityOccurrences pair.record pair.task pair.message
        pair.taskOutput pair.messageOutput ∧
      pair.task = task ∧ pair.message ∈ state.messageWaits ∧
      pair.record ∈ state.activityOccurrences := by
  unfold messageBoundedPairForTask? at found
  cases opFound : (messageBoundedTaskOperations program).find? (fun candidate =>
      decide (candidate.2.1.id = task.task.id)) with
  | none => simp [opFound] at found
  | some operation =>
      cases recFound : activityOccurrenceForTaskWait? state.activityOccurrences task with
      | none => simp [opFound, recFound] at found
      | some record =>
          by_cases sole : record.attachedHandlers.length = 1
          · cases subFound : record.messageHandlerOccurrences.head? with
            | none => simp [opFound, recFound, sole, subFound] at found
            | some subscription =>
                cases msgFound : state.messageWaits.find? (fun candidate =>
                    messageIdNamesWait subscription candidate &&
                      decide (candidate.elementId = operation.2.2.elementId) &&
                      decide (candidate.channel = operation.2.2.channel) &&
                      decide (candidate.output = operation.2.2.output) &&
                      decide (candidate.owner = record.owner)) with
                | none => simp [opFound, recFound, sole, subFound, msgFound] at found
                | some message =>
                    simp [opFound, recFound, sole, subFound, msgFound] at found
                    cases found
                    obtain ⟨recordMem, body, bodyEq, bodyNames⟩ :=
                      activityOccurrenceForTaskWait_sound recFound
                    have opProperty : operation.2.1.id = task.task.id := by
                      simpa using List.find?_some opFound
                    obtain ⟨⟨⟨⟨messageNames, messageElement⟩, messageChannel⟩,
                        messageOutput⟩, _⟩ := by
                      simpa [Bool.and_eq_true, decide_eq_true_eq] using List.find?_some msgFound
                    have subMem : subscription ∈ record.messageHandlerOccurrences := by
                      cases handlers : record.messageHandlerOccurrences with
                      | nil => simp [handlers] at subFound
                      | cons head tail =>
                          simp [handlers] at subFound
                          cases subFound
                          simp
                    exact ⟨⟨operation, List.mem_of_find?_eq_some opFound, opProperty,
                        messageElement.symm, messageChannel.symm, rfl, rfl,
                        recordMem, ⟨body, bodyEq, bodyNames⟩,
                        subscription, subMem, messageNames⟩,
                      rfl, List.mem_of_find?_eq_some msgFound, recordMem⟩
          · simp [opFound, recFound, sole] at found

private theorem messageBoundedPairForSubscription_pairing (program : Program)
    (state : RuntimeState) (subscriptionId : MessageSubscriptionId)
    (pair : MessageBoundedPair)
    (found : messageBoundedPairForSubscription? program state subscriptionId = some pair) :
    MessageBoundedPairing program state.activityOccurrences pair.record pair.task pair.message
        pair.taskOutput pair.messageOutput ∧
      pair.message ∈ state.messageWaits ∧ pair.task ∈ state.waits ∧
      pair.record ∈ state.activityOccurrences := by
  unfold messageBoundedPairForSubscription? at found
  cases msgFound : state.messageWaits.find? (fun candidate =>
      decide (candidate.processInstanceId = subscriptionId.processInstanceId) &&
        decide (candidate.elementId.value = subscriptionId.elementId.value) &&
        decide (candidate.activation = subscriptionId.activation)) with
  | none => simp [msgFound] at found
  | some message =>
      cases opFound : (messageBoundedTaskOperations program).find? (fun candidate =>
          decide (candidate.2.2.elementId = message.elementId)) with
      | none => simp [msgFound, opFound] at found
      | some operation =>
          cases recFound : activityOccurrenceForMessageWait?
              state.activityOccurrences message with
          | none => simp [msgFound, opFound, recFound] at found
          | some record =>
              by_cases sole : record.attachedHandlers.length = 1
              · cases bodyFound : activityBodyTask? record with
                | none => simp [msgFound, opFound, recFound, sole, bodyFound] at found
                | some body =>
                    cases taskFound : state.waits.find? (fun candidate =>
                        taskIdNamesWait body candidate &&
                          decide (candidate.task.id = operation.2.1.id) &&
                          decide (candidate.output = operation.2.1.output) &&
                          decide (candidate.owner = record.owner)) with
                    | none =>
                        simp [msgFound, opFound, recFound, sole, bodyFound, taskFound] at found
                    | some task =>
                        by_cases channel : message.channel = operation.2.2.channel
                        · by_cases output : message.output = operation.2.2.output
                          · simp [msgFound, opFound, recFound, sole, bodyFound, taskFound,
                              channel, output] at found
                            cases found
                            obtain ⟨recordMem, subscription, subscriptionMem,
                                subscriptionNames⟩ :=
                              activityOccurrenceForMessageWait_sound recFound
                            have opProperty : operation.2.2.elementId = message.elementId := by
                              simpa using List.find?_some opFound
                            obtain ⟨⟨⟨taskNames, taskId⟩, taskOutput⟩, _⟩ := by
                              simpa [Bool.and_eq_true, decide_eq_true_eq] using
                                List.find?_some taskFound
                            exact ⟨⟨operation, List.mem_of_find?_eq_some opFound,
                                taskId.symm, opProperty, channel.symm, rfl, rfl,
                                recordMem, ⟨body, bodyFound, taskNames⟩,
                                subscription, subscriptionMem, subscriptionNames⟩,
                              List.mem_of_find?_eq_some msgFound,
                              List.mem_of_find?_eq_some taskFound, recordMem⟩
                          · simp [msgFound, opFound, recFound, sole, bodyFound, taskFound,
                              channel, output] at found
                        · simp [msgFound, opFound, recFound, sole, bodyFound, taskFound,
                            channel] at found
              · simp [msgFound, opFound, recFound, sole] at found

private def commitMessageBoundedVictory (state : RuntimeState)
    (pair : MessageBoundedPair) (output : ControlPlaceId) : Option RuntimeState :=
  match state.control with
  | .running _ =>
      some
        { state with
          waits := state.waits.erase pair.task
          messageWaits := state.messageWaits.erase pair.message
          activityOccurrences := state.activityOccurrences.erase pair.record
          tokens := addToken state.tokens output pair.task.owner }
  | _ => none

/-- Evaluator commitment is pure Activity-record removal, so it issues no new identity. -/
theorem commitMessageBoundedVictory_activity_identity_discipline
    (before after : RuntimeState) (pair : MessageBoundedPair) (output : ControlPlaceId)
    (success : commitMessageBoundedVictory before pair output = some after) :
    activityIdentityIssuingDiscipline before after = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  intro record present
  unfold commitMessageBoundedVictory at success
  cases running : before.control <;> simp [running] at success
  rename_i instanceId
  cases success
  exact List.mem_of_mem_erase present

def completeMessageBoundedUserTask? (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (taskId : TaskDefinitionId)
    (activation : Nat) (submittedValues : List VariableBinding) : Option RuntimeState := do
  if !submittedValues.isEmpty then none else
  let task ← state.waits.find? fun wait =>
    decide (wait.processInstanceId = processInstanceId) &&
      decide (wait.task.id = taskId) && decide (wait.activation = activation)
  let pair ← messageBoundedPairForTask? program state task
  commitMessageBoundedVictory state pair pair.taskOutput

def interruptMessageBoundedUserTask? (program : Program) (state : RuntimeState)
    (subscriptionId : MessageSubscriptionId) (channel : MessageChannel) : Option RuntimeState := do
  let pair ← messageBoundedPairForSubscription? program state subscriptionId
  if pair.message.channel ≠ channel then none else
  commitMessageBoundedVictory state pair pair.messageOutput

/-- The two exclusive victory routes. Each removes the complete owned triple. -/
inductive MessageBoundedTaskVictoryStep (program : Program) :
    RuntimeState → RuntimeState → Prop where
  | activity (before : RuntimeState) (instanceId : SemanticId)
      (pair : MessageBoundedPair)
      (running : before.control = .running instanceId)
      (taskLive : pair.task ∈ before.waits)
      (messageLive : pair.message ∈ before.messageWaits)
      (recordLive : pair.record ∈ before.activityOccurrences)
      (paired : MessageBoundedPairing program before.activityOccurrences pair.record pair.task
        pair.message pair.taskOutput pair.messageOutput) :
      MessageBoundedTaskVictoryStep program before
        { before with
          waits := before.waits.erase pair.task
          messageWaits := before.messageWaits.erase pair.message
          activityOccurrences := before.activityOccurrences.erase pair.record
          tokens := addToken before.tokens pair.taskOutput pair.task.owner }
  | message (before : RuntimeState) (instanceId : SemanticId)
      (pair : MessageBoundedPair)
      (running : before.control = .running instanceId)
      (taskLive : pair.task ∈ before.waits)
      (messageLive : pair.message ∈ before.messageWaits)
      (recordLive : pair.record ∈ before.activityOccurrences)
      (paired : MessageBoundedPairing program before.activityOccurrences pair.record pair.task
        pair.message pair.taskOutput pair.messageOutput) :
      MessageBoundedTaskVictoryStep program before
        { before with
          waits := before.waits.erase pair.task
          messageWaits := before.messageWaits.erase pair.message
          activityOccurrences := before.activityOccurrences.erase pair.record
          tokens := addToken before.tokens pair.messageOutput pair.task.owner }

/-- Both declarative victories are pure Activity-record removal and satisfy identity discipline. -/
theorem messageBoundedTaskVictory_activity_identity_discipline (program : Program)
    (before after : RuntimeState)
    (victory : MessageBoundedTaskVictoryStep program before after) :
    activityIdentityIssuingDiscipline before after = true := by
  apply activityIdentityIssuingDiscipline_of_subset
  intro record present
  cases victory <;> exact List.mem_of_mem_erase present

theorem completeMessageBoundedUserTask_sound (program : Program)
    (before after : RuntimeState) (processInstanceId : SemanticId)
    (taskId : TaskDefinitionId) (activation : Nat)
    (submittedValues : List VariableBinding)
    (success : completeMessageBoundedUserTask? program before processInstanceId taskId
      activation submittedValues = some after) :
    MessageBoundedTaskVictoryStep program before after := by
  unfold completeMessageBoundedUserTask? at success
  by_cases empty : submittedValues.isEmpty
  · cases taskFound : before.waits.find? (fun wait =>
        decide (wait.processInstanceId = processInstanceId) &&
          decide (wait.task.id = taskId) && decide (wait.activation = activation)) with
    | none => simp [empty, taskFound] at success
    | some task =>
        cases pairFound : messageBoundedPairForTask? program before task with
        | none => simp [empty, taskFound, pairFound] at success
        | some pair =>
            obtain ⟨pairing, taskEq, messageLive, recordLive⟩ :=
              messageBoundedPairForTask_pairing program before task pair pairFound
            have taskLive : pair.task ∈ before.waits := by
              rw [taskEq]; exact List.mem_of_find?_eq_some taskFound
            simp [empty, taskFound, pairFound] at success
            unfold commitMessageBoundedVictory at success
            cases running : before.control with
            | running instanceId =>
                simp only [running, Option.some.injEq] at success
                cases success
                rw [← running]
                exact .activity before instanceId pair running taskLive messageLive
                  recordLive pairing
            | completed => simp [running] at success
            | cancelled => simp [running] at success
            | failed => simp [running] at success
            | notStarted => simp [running] at success
  · simp [empty] at success

theorem interruptMessageBoundedUserTask_sound (program : Program)
    (before after : RuntimeState) (subscriptionId : MessageSubscriptionId)
    (channel : MessageChannel)
    (success : interruptMessageBoundedUserTask? program before subscriptionId channel =
      some after) :
    MessageBoundedTaskVictoryStep program before after := by
  unfold interruptMessageBoundedUserTask? at success
  cases pairFound : messageBoundedPairForSubscription? program before subscriptionId with
  | none => simp [pairFound] at success
  | some pair =>
      obtain ⟨pairing, messageLive, taskLive, recordLive⟩ :=
        messageBoundedPairForSubscription_pairing program before subscriptionId pair pairFound
      by_cases exactChannel : pair.message.channel = channel
      · simp [pairFound, exactChannel] at success
        unfold commitMessageBoundedVictory at success
        cases running : before.control with
        | running instanceId =>
            simp only [running, Option.some.injEq] at success
            cases success
            rw [← running]
            exact .message before instanceId pair running taskLive messageLive recordLive pairing
        | completed => simp [running] at success
        | cancelled => simp [running] at success
        | failed => simp [running] at success
        | notStarted => simp [running] at success
      · simp [pairFound, exactChannel] at success

end BpmnSemantics.SemanticProcess
