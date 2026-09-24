import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceWaitProgramValidity

/-! # Flow-node occurrence Program validity

This module composes structural, wait-family, selected-branch, and event-race correspondence for lifecycle projection. It also owns exact Message-boundary host/subscription pairing. Other family validators and the private Boundary Timer matcher remain at their lower owners.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Shared exact Message-host matcher for projection and atomic insertion preservation. -/
def messageBoundedProjectionPairMatches (program : Program)
    (operation : SemanticOperation) (record : ActivityOccurrence)
    (taskWait : UserTaskWait) (messageWait : MessageWait) : Bool :=
  match operation with
  | .awaitMessageBoundedUserTask _ _ _ task boundary
  | .awaitMessageMonitoredUserTask _ _ _ task boundary =>
      FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program operation record.owner &&
        decide (record.processInstanceId = record.owner.processInstanceId &&
          record.activityElementId.value = task.id.value &&
          taskWait.processInstanceId = record.processInstanceId && taskWait.owner = record.owner &&
          taskWait.task.id = task.id && taskWait.task.name = task.name &&
          taskWait.task.metadata = none && taskWait.metadata = none && taskWait.output = task.output &&
          record.body = .userTask
            { processInstanceId := taskWait.processInstanceId
              elementId := ⟨taskWait.task.id.value⟩
              activation := taskWait.activation } &&
          messageWait.processInstanceId = record.processInstanceId &&
          messageWait.owner = record.owner && messageWait.elementId = boundary.elementId &&
          messageWait.channel = boundary.channel && messageWait.output = boundary.output &&
          record.attachedHandlers = [.message
            { processInstanceId := messageWait.processInstanceId
              elementId := ⟨messageWait.elementId.value⟩
              activation := messageWait.activation }])
  | _ => false

/-- Exact body and tagged-handler identities separate a new pair from every predecessor pair. -/
theorem messageBoundedProjectionPairMatches_identities (program : Program)
    (operation : SemanticOperation) (record : ActivityOccurrence)
    (task : UserTaskWait) (message : MessageWait)
    (matched : messageBoundedProjectionPairMatches program operation record task message = true) :
    record.body = .userTask
        { processInstanceId := task.processInstanceId, elementId := ⟨task.task.id.value⟩, activation := task.activation } ∧
      record.attachedHandlers = [.message
        { processInstanceId := message.processInstanceId, elementId := ⟨message.elementId.value⟩, activation := message.activation }] := by
  cases operation <;> simp only [messageBoundedProjectionPairMatches] at matched
  all_goals first
    | contradiction
    | (simp only [Bool.and_eq_true, decide_eq_true_eq, and_assoc] at matched
       exact ⟨matched.2.2.2.2.2.2.2.2.2.2.1, matched.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2⟩)

def messageBoundedOperationProjectionValid (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Bool :=
  match operation with
  | .awaitMessageBoundedUserTask _ _ _ task boundary
  | .awaitMessageMonitoredUserTask _ _ _ task boundary =>
      let owned := FlowNodeOccurrenceProgramValidity.Internal.operationOwnedBy program operation
      let tasks := state.waits.filter fun wait =>
        owned wait.owner && decide (wait.task.id = task.id)
      let messages := state.messageWaits.filter fun wait =>
        owned wait.owner && decide (wait.elementId = boundary.elementId)
      let records := state.activityOccurrences.filter fun record =>
        owned record.owner && decide (record.activityElementId.value = task.id.value)
      let paired := messageBoundedProjectionPairMatches program operation
      (tasks.all fun taskWait =>
        (records.filter fun record =>
          (messages.filter fun messageWait => paired record taskWait messageWait).length = 1).length = 1) &&
      (messages.all fun messageWait =>
        (records.filter fun record =>
          (tasks.filter fun taskWait => paired record taskWait messageWait).length = 1).length = 1) &&
      (records.all fun record =>
        (tasks.filter fun taskWait =>
          (messages.filter fun messageWait => paired record taskWait messageWait).length = 1).length = 1)
  | _ => true

def messageBoundedProjectionValid (program : Program) (state : RuntimeState) : Bool :=
  program.operations.all (messageBoundedOperationProjectionValid program state)

/-- Exact immutable-Program correspondence for every runtime occurrence family used by open projection. -/
def flowNodeOccurrenceProgramValidity (program : Program) (state : RuntimeState) : Bool :=
  flowNodeOccurrenceStructuralProgramValidity program state &&
    flowNodeOccurrenceWaitProgramValidity program state &&
    state.selectedBranchSets.all (fun record =>
      flowNodeOccurrenceOwnerLiveUnique state record.owner) &&
    state.eventRaces.all (fun race => flowNodeOccurrenceOwnerLiveUnique state race.owner)

/-- Every projected wait stores the same process identity as its live owner. -/
theorem flowNodeOccurrenceProgramValidity_wait_owner_ids (program : Program) (state : RuntimeState)
    (valid : flowNodeOccurrenceProgramValidity program state = true) :
    (∀ wait ∈ state.waits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ wait ∈ state.messageWaits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ wait ∈ state.timerWaits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ wait ∈ state.effectWaits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ incident ∈ state.effectIncidents,
      incident.wait.processInstanceId = incident.wait.owner.processInstanceId) := by
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at valid
  exact flowNodeOccurrenceWaitProgramValidity_wait_owner_ids program state valid.1.1.2

/-- Reconstruct full Program validity from one wait-family preservation and unchanged structural fields. -/
theorem flowNodeOccurrenceProgramValidity_of_wait_frame (program : Program)
    (before after : RuntimeState) (prior : flowNodeOccurrenceProgramValidity program before = true)
    (waits : flowNodeOccurrenceWaitProgramValidity program after = true)
    (control : after.control = before.control)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (calls : after.calledProcessOccurrences = before.calledProcessOccurrences)
    (selected : after.selectedBranchSets = before.selectedBranchSets)
    (races : after.eventRaces = before.eventRaces) :
    flowNodeOccurrenceProgramValidity program after = true := by
  simp only [flowNodeOccurrenceProgramValidity, Bool.and_eq_true] at prior ⊢
  obtain ⟨h3, racesBefore⟩ := prior
  obtain ⟨h2, selectedBefore⟩ := h3
  obtain ⟨structuralBefore, waitsBefore⟩ := h2
  have structuralAfter : flowNodeOccurrenceStructuralProgramValidity program after = true := by
    rw [flowNodeOccurrenceStructuralProgramValidity_frame program before after control scopes calls]
    exact structuralBefore
  have selectedAfter :
      (after.selectedBranchSets.all fun record =>
        flowNodeOccurrenceOwnerLiveUnique after record.owner) = true := by
    simpa [flowNodeOccurrenceOwnerLiveUnique, scopes, selected] using selectedBefore
  have racesAfter :
      (after.eventRaces.all fun race => flowNodeOccurrenceOwnerLiveUnique after race.owner) = true := by
    simpa [flowNodeOccurrenceOwnerLiveUnique, scopes, races] using racesBefore
  exact ⟨⟨⟨structuralAfter, waits⟩, selectedAfter⟩, racesAfter⟩

end BpmnSemantics.SemanticProcess
