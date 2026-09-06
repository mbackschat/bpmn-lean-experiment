import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidityCore

/-! # User Task wait Program validity

The private matcher keeps every User Task declaring family in one account; the
aggregate exposes frame and insertion facts to `FlowNodeOccurrenceWaitProgramValidity`
without duplicating that account in the other wait-family proofs.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open FlowNodeOccurrenceProgramValidity.Internal

private def userTaskWaitValid (program : Program) (state : RuntimeState)
    (wait : UserTaskWait) : Bool :=
  occurrenceOwnerValid state wait.processInstanceId wait.owner ⟨wait.task.id.value⟩ wait.activation &&
    (program.operations.filter fun operation =>
      if !operationOwnedBy program operation wait.owner then false
      else match operation with
      | .awaitUserTask _ _ _ output task =>
          output = wait.output && task = wait.task && wait.metadata = task.metadata
      | .awaitDataInputUserTask _ _ _ output taskId taskName _
      | .awaitDataInputOutputUserTask _ _ _ output taskId taskName _ _
      | .awaitDataOutputUserTask _ _ _ output taskId taskName _ =>
          taskId = wait.task.id && taskName = wait.task.name && output = wait.output &&
            wait.task.metadata.isNone && wait.metadata.isNone
      | .awaitBoundedUserTask _ _ _ task _
      | .awaitMessageBoundedUserTask _ _ _ task _
      | .awaitMonitoredUserTask _ _ _ task _ =>
          task.id = wait.task.id && task.name = wait.task.name && task.output = wait.output &&
            wait.task.metadata.isNone && wait.metadata.isNone
      | .awaitSequentialMultiInstanceUserTask _ _ _ task _ normalOutput _ _ =>
          task.id = wait.task.id && task.name = wait.task.name && normalOutput = wait.output &&
            wait.task.metadata.isNone && wait.metadata.isNone
      | .awaitParallelMultiInstanceUserTask _ _ _ taskId taskName _ normalOutput _ _ _ =>
          taskId = wait.task.id && taskName = wait.task.name && normalOutput = wait.output &&
            wait.task.metadata.isNone && wait.metadata.isNone
      | .initiate .. | .initiateMessage .. | .initiateTimer ..
      | .enterScope .. | .enterBoundedScope .. | .invokeProcess .. | .returnProcess ..
      | .completeParallelMultiInstanceUserTask .. | .awaitTimer ..
      | .awaitMessage .. | .awaitPayloadMessage .. | .awaitCorrelatedPayloadMessage ..
      | .awaitEventRace .. | .awaitEffect ..
      | .duplicate .. | .synchronize .. | .mergeExclusive ..
      | .choose .. | .selectMany .. | .synchronizeSelected ..
      | .throwError .. | .reachNoneEnd .. | .terminateScope ..
      | .completeScope .. | .triggerCompensation .. => false).length = 1

/-- Exact immutable-Program correspondence for the User Task waits used by open projection. -/
def flowNodeOccurrenceUserTaskProgramValidity (program : Program) (state : RuntimeState) : Bool :=
  state.waits.all (userTaskWaitValid program state)

theorem flowNodeOccurrenceUserTaskProgramValidity_frame (program : Program)
    (before after : RuntimeState)
    (waits : after.waits = before.waits)
    (scopes : after.scopeOccurrences = before.scopeOccurrences) :
    flowNodeOccurrenceUserTaskProgramValidity program after =
      flowNodeOccurrenceUserTaskProgramValidity program before := by
  have waitValidEq : userTaskWaitValid program after = userTaskWaitValid program before := by
    funext wait
    unfold userTaskWaitValid occurrenceOwnerValid flowNodeOccurrenceOwnerLiveUnique
    rw [scopes]
  simp only [flowNodeOccurrenceUserTaskProgramValidity, waits, waitValidEq]

/-- Every projected User Task wait stores the same Process identity as its live owner. -/
theorem flowNodeOccurrenceUserTaskProgramValidity_wait_owner_ids (program : Program)
    (state : RuntimeState)
    (valid : flowNodeOccurrenceUserTaskProgramValidity program state = true) :
    ∀ wait ∈ state.waits, wait.processInstanceId = wait.owner.processInstanceId := by
  simp only [flowNodeOccurrenceUserTaskProgramValidity, List.all_eq_true] at valid
  intro wait member
  have waitValid := valid wait member
  simp [userTaskWaitValid, occurrenceOwnerValid] at waitValid
  exact waitValid.1.1.2

/-- The four unbounded declaring families share one public User Task anchor; data arms carry no metadata. -/
inductive UnboundedUserTaskWaitDeclaration (wait : UserTaskWait) : SemanticOperation → Prop
  | ordinary (id origin input) (metadata : wait.metadata = wait.task.metadata) :
      UnboundedUserTaskWaitDeclaration wait
        (.awaitUserTask id origin input wait.output wait.task)
  | dataInput (id origin input directInput)
      (taskMetadata : wait.task.metadata = none) (metadata : wait.metadata = none) :
      UnboundedUserTaskWaitDeclaration wait
        (.awaitDataInputUserTask id origin input wait.output wait.task.id wait.task.name directInput)
  | dataOutput (id origin input directOutput)
      (taskMetadata : wait.task.metadata = none) (metadata : wait.metadata = none) :
      UnboundedUserTaskWaitDeclaration wait
        (.awaitDataOutputUserTask id origin input wait.output wait.task.id wait.task.name directOutput)
  | dataInputOutput (id origin input directInput directOutput)
      (taskMetadata : wait.task.metadata = none) (metadata : wait.metadata = none) :
      UnboundedUserTaskWaitDeclaration wait
        (.awaitDataInputOutputUserTask id origin input wait.output wait.task.id wait.task.name
          directInput directOutput)

theorem flowNodeOccurrenceUserTaskProgramValidity_insertUnboundedUserTask (program : Program)
    (state : RuntimeState) (operation : SemanticOperation) (wait : UserTaskWait)
    (declaration : UnboundedUserTaskWaitDeclaration wait operation)
    (prior : flowNodeOccurrenceUserTaskProgramValidity program state = true)
    (declarers : userTaskWaitDeclarers program wait.task.id = [operation])
    (declared : declaredByExactlyOneOwnedOperation program
      (userTaskWaitDeclarers program wait.task.id) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (ownerProcess : !wait.processInstanceId.value.isEmpty = true)
    (taskId : !wait.task.id.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId) :
    flowNodeOccurrenceUserTaskProgramValidity program
      { state with waits := insertUserTaskWait wait state.waits } = true := by
  let after : RuntimeState := { state with waits := insertUserTaskWait wait state.waits }
  change flowNodeOccurrenceUserTaskProgramValidity program after = true
  have owned := operationOwnedBy_of_exact_declaration program
    operation wait.owner _ declarers declared
  have newValid : userTaskWaitValid program after wait = true := by
    simp_all [userTaskWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
      after]
    calc
      _ = (userTaskWaitDeclarers program wait.task.id).length := by
        apply congrArg List.length
        unfold userTaskWaitDeclarers
        apply List.filter_congr
        intro candidate member
        have only : candidate ∈ userTaskWaitDeclarers program wait.task.id ↔
            candidate = operation := by
          rw [declarers]
          simp
        by_cases familyMember : candidate ∈ userTaskWaitDeclarers program wait.task.id
        · have operationEq := only.mp familyMember
          subst candidate
          cases declaration <;> simp_all
        · cases candidate with
          | awaitUserTask candidateId candidateOrigin candidateInput candidateOutput candidateTask =>
              have different : candidateTask.id ≠ wait.task.id := by
                intro same
                apply familyMember
                simp [userTaskWaitDeclarers, member, same]
              have taskDifferent : candidateTask ≠ wait.task :=
                fun same => different (congrArg UserTaskDefinition.id same)
              simp [different, taskDifferent]
          | awaitDataInputUserTask candidateId candidateOrigin candidateInput candidateOutput
              candidateTaskId candidateTaskName directInput =>
              have different : candidateTaskId ≠ wait.task.id := by
                intro same
                apply familyMember
                unfold userTaskWaitDeclarers
                rw [List.mem_filter]
                exact ⟨member, by simp [same]⟩
              simp [different]
          | awaitDataInputOutputUserTask candidateId candidateOrigin candidateInput candidateOutput
              candidateTaskId candidateTaskName directInput directOutput =>
              have different : candidateTaskId ≠ wait.task.id := by
                intro same
                apply familyMember
                unfold userTaskWaitDeclarers
                rw [List.mem_filter]
                exact ⟨member, by simp [same]⟩
              simp [different]
          | awaitDataOutputUserTask candidateId candidateOrigin candidateInput candidateOutput
              candidateTaskId candidateTaskName directOutput =>
              have different : candidateTaskId ≠ wait.task.id := by
                intro same
                apply familyMember
                unfold userTaskWaitDeclarers
                rw [List.mem_filter]
                exact ⟨member, by simp [same]⟩
              simp [different]
          | awaitBoundedUserTask candidateId candidateOrigin candidateInput candidateTask boundary =>
              have different : candidateTask.id ≠ wait.task.id := by
                intro same
                apply familyMember
                simp [userTaskWaitDeclarers, member, same]
              simp [different]
          | awaitMonitoredUserTask candidateId candidateOrigin candidateInput candidateTask boundary =>
              have different : candidateTask.id ≠ wait.task.id := by
                intro same
                apply familyMember
                simp [userTaskWaitDeclarers, member, same]
              simp [different]
          | awaitMessageBoundedUserTask candidateId candidateOrigin candidateInput candidateTask boundary =>
              have different : candidateTask.id ≠ wait.task.id := by
                intro same
                apply familyMember
                simp [userTaskWaitDeclarers, member, same]
              simp [different]
          | awaitSequentialMultiInstanceUserTask candidateId candidateOrigin candidateInput
              candidateTask data normalOutput boundary limits =>
              have different : candidateTask.id ≠ wait.task.id := by
                intro same
                apply familyMember
                simp [userTaskWaitDeclarers, member, same]
              simp [different]
          | awaitParallelMultiInstanceUserTask candidateId candidateOrigin candidateInput
              candidateTaskId candidateTaskName data normalOutput boundary condition limits =>
              have different : candidateTaskId ≠ wait.task.id := by
                intro same
                apply familyMember
                unfold userTaskWaitDeclarers
                rw [List.mem_filter]
                exact ⟨member, by simp [same]⟩
              simp [different]
          | _ => simp
      _ = 1 := by
        simpa [userTaskWaitDeclarers] using congrArg List.length declarers
  unfold flowNodeOccurrenceUserTaskProgramValidity at prior ⊢
  rw [show after.waits = insertUserTaskWait wait state.waits by rfl,
    all_insertUserTaskWait]
  simp only [Bool.and_eq_true]
  refine ⟨newValid, ?_⟩
  simpa [userTaskWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
    after] using prior

theorem flowNodeOccurrenceUserTaskProgramValidity_insertOrdinaryUserTask (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (wait : UserTaskWait)
    (prior : flowNodeOccurrenceUserTaskProgramValidity program state = true)
    (declarers : userTaskWaitDeclarers program wait.task.id =
      [.awaitUserTask id origin input wait.output wait.task])
    (declared : declaredByExactlyOneOwnedOperation program
      (userTaskWaitDeclarers program wait.task.id) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (ownerProcess : !wait.processInstanceId.value.isEmpty = true)
    (taskId : !wait.task.id.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId)
    (metadata : wait.metadata = wait.task.metadata) :
    flowNodeOccurrenceUserTaskProgramValidity program
      { state with waits := insertUserTaskWait wait state.waits } = true := by
  exact flowNodeOccurrenceUserTaskProgramValidity_insertUnboundedUserTask program state _ wait
    (.ordinary id origin input metadata) prior declarers declared live ownerProcess taskId positive
    processOwner

end BpmnSemantics.SemanticProcess
