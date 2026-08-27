import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario
import BpmnSemantics.SemanticProcess.SequentialMultiInstanceTransition

/-! # Sequential Multi-Instance program binding conformance

The checked fixture preserves the complete reviewed data-role graph and lowers it to the distinct
`awaitSequentialMultiInstanceUserTask` operation. These facts bind exact profile admission, canonical
lowering, public command dispatch, strict trace replay, and the reference identities used at runtime.
-/

namespace BpmnSemantics.SequentialMultiInstanceProgramBindingConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

set_option synthInstance.maxSize 2000

def dataDefinition : SequentialMultiInstanceDataDefinition :=
  { input :=
      { collectionItemDefinitionId := "ItemDefinition_StringList"
        scalarItemDefinitionId := "ItemDefinition_String"
        dataObjectId := "DataObject_InputItems"
        dataObjectReferenceId := "DataObjectReference_InputItems"
        loopDataInputId := "DataInput_Items"
        inputDataItemId := "InputDataItem_CurrentItem"
        taskDataInputId := "DataInput_CurrentItem"
        collectionAssociationId := "DataInputAssociation_Items"
        itemAssociationId := "DataInputAssociation_CurrentItem" }
    output :=
      { dataObjectId := "DataObject_OutputResults"
        dataObjectReferenceId := "DataObjectReference_OutputResults"
        taskDataOutputId := "DataOutput_CurrentResult"
        outputDataItemId := "OutputDataItem_CurrentResult"
        loopDataOutputId := "DataOutput_Results"
        itemAssociationId := "DataOutputAssociation_CurrentResult"
        collectionAssociationId := "DataOutputAssociation_Results" } }

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := sequentialMultiInstanceUserTaskProfileId
        sourceId := ⟨"sequential-multi-instance"⟩
        sourceSha256 :=
          "9161c134984d42a04cd57d5ea161938a774705be2e955ade5302d5dde2afa6f4" }
    processId := ⟨"Process_SequentialMultiInstanceReview"⟩
    definitionScopes :=
      [rootDefinitionScope ⟨"Process_SequentialMultiInstanceReview"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_SequentialMultiInstanceReview"⟩
      [ ⟨"EndEvent_Completed"⟩, ⟨"EndEvent_Interrupted"⟩, ⟨"StartEvent_Review"⟩
      , ⟨"UserTask_Escalation"⟩, ⟨"UserTask_Review"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes
      ⟨"Process_SequentialMultiInstanceReview"⟩
      [ ⟨"Flow_Escalation_End"⟩, ⟨"Flow_Review_Completed"⟩
      , ⟨"Flow_Start_Review"⟩, ⟨"Flow_Timer_Escalation"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_Completed"⟩
      , .noneEndEvent ⟨"EndEvent_Interrupted"⟩
      , .noneStartEvent ⟨"StartEvent_Review"⟩
      , .userTask ⟨"UserTask_Escalation"⟩ (some "Handle interrupted review")
      , .sequentialMultiInstanceUserTask ⟨"UserTask_Review"⟩ (some "Review item")
          dataDefinition.input dataDefinition.output ⟨"Flow_Review_Completed"⟩
          { elementId := ⟨"BoundaryTimer_Review"⟩
            durationLiteral := "PT1S"
            outputFlowId := ⟨"Flow_Timer_Escalation"⟩ } ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Escalation_End"⟩
          sourceId := ⟨"UserTask_Escalation"⟩
          targetId := ⟨"EndEvent_Interrupted"⟩ }
      , { id := ⟨"Flow_Review_Completed"⟩
          sourceId := ⟨"UserTask_Review"⟩
          targetId := ⟨"EndEvent_Completed"⟩ }
      , { id := ⟨"Flow_Start_Review"⟩
          sourceId := ⟨"StartEvent_Review"⟩
          targetId := ⟨"UserTask_Review"⟩ }
      , { id := ⟨"Flow_Timer_Escalation"⟩
          sourceId := ⟨"BoundaryTimer_Review"⟩
          targetId := ⟨"UserTask_Escalation"⟩ } ] }

def program : Program := lowerCheckedProcess checkedProcess

def instanceId : SemanticId := ⟨"SequentialMultiInstance_Natural"⟩

def profileLimits : SequentialMultiInstanceLimits :=
  { maximumItems := 16
    maximumItemUtf8Bytes := 512
    maximumCanonicalCollectionUtf8Bytes := 8192 }

private def ordinaryTaskWithSequentialTaskIdentity : SemanticOperation :=
  .awaitUserTask ⟨"operation:Ordinary_Review"⟩ { elementId := ⟨"UserTask_Review"⟩ }
    ⟨"place:Ordinary_Input"⟩ ⟨"place:Ordinary_Output"⟩
    { id := ⟨"UserTask_Review"⟩, name := some "Ordinary review" }

/-- Standalone Program admission rejects an ordinary User Task that collides with the sequential
Multi-Instance entry's User Task declaration. -/
theorem sequential_multi_instance_same_task_declarer_is_rejected :
    programWaitDeclarersUnique (ordinaryTaskWithSequentialTaskIdentity :: program.operations) =
      false := by
  decide +kernel

def arm? : Option SequentialMultiInstanceArm :=
  match program.operations.filterMap SequentialMultiInstanceArm.ofOperation? with
  | [arm] => some arm
  | _ => none

theorem checked_process_is_well_formed : checkedWellFormed checkedProcess = true := by
  decide +kernel

theorem lowered_program_is_well_formed : programWellFormed program = true := by
  decide +kernel

theorem exact_registered_profile_shape_is_admitted :
    programProfileCapabilitiesValid program = true := by
  decide +kernel

theorem checked_data_role_graph_is_preserved_by_lowering :
    program.operations.filterMap (fun
      | .awaitSequentialMultiInstanceUserTask _ _ _ _ data _ _ _ => some data
      | _ => none) = [dataDefinition] := by
  decide +kernel

theorem exact_root_operation_multiset_is_preserved :
    let kinds := program.operations.map SemanticOperation.kind
    (kinds.count .initiate, kinds.count .awaitSequentialMultiInstanceUserTask,
      kinds.count .awaitUserTask, kinds.count .reachNoneEnd,
      kinds.count .completeScope, kinds.length) = (1, 1, 1, 2, 1, 6) := by
  decide +kernel

private def mapSequentialMultiInstanceOperation
    (rewrite : SequentialMultiInstanceDataDefinition →
      SequentialMultiInstanceDataDefinition) : Program :=
  { program with
    operations := program.operations.map fun
      | .awaitSequentialMultiInstanceUserTask id origin input task data normalOutput
          boundaryTimer limits =>
          .awaitSequentialMultiInstanceUserTask id origin input task (rewrite data) normalOutput
            boundaryTimer limits
      | operation => operation }

def dataObjectInputProgram : Program :=
  mapSequentialMultiInstanceOperation fun data =>
    { data with input := { data.input with dataObjectReferenceId := data.input.dataObjectId } }

def dataObjectOutputProgram : Program :=
  mapSequentialMultiInstanceOperation fun data =>
    { data with output := { data.output with dataObjectReferenceId := data.output.dataObjectId } }

theorem object_id_substitution_is_not_the_checked_program_binding :
    definitionBindingValid checkedProcess dataObjectInputProgram = false ∧
      definitionBindingValid checkedProcess dataObjectOutputProgram = false := by
  decide +kernel

def programForProfile (profile : ProfileId) : Program :=
  { program with identity := { program.identity with semanticProfile := profile } }

def omittedSequentialMultiInstanceProgram : Program :=
  { program with
    operations := program.operations.filter fun
      | .awaitSequentialMultiInstanceUserTask .. => false
      | _ => true }

def duplicatedSequentialMultiInstanceProgram : Program :=
  { program with
    operations := program.operations ++
      program.operations.filter fun
        | .awaitSequentialMultiInstanceUserTask .. => true
        | _ => false }

def substitutedSequentialMultiInstanceProgram : Program :=
  { program with
    operations := program.operations.map fun
      | .awaitSequentialMultiInstanceUserTask id origin input task _ normalOutput _ _ =>
          .awaitUserTask id origin input normalOutput { id := task.id, name := task.name }
      | operation => operation }

theorem every_other_profile_refuses_the_distinct_sequential_multi_instance_operation
    (profile : ProfileId) (different : profile ≠ sequentialMultiInstanceUserTaskProfileId) :
    programProfileCapabilitiesValid (programForProfile profile) = false := by
  have exactProfileMatch : programSequentialMultiInstanceProfileMatches program = true :=
    (Bool.and_eq_true_iff.mp exact_registered_profile_shape_is_admitted).1
  have programProfile : program.identity.semanticProfile =
      sequentialMultiInstanceUserTaskProfileId := by
    rfl
  have operationPresent : program.operations.any (fun
      | .awaitSequentialMultiInstanceUserTask .. => true
      | _ => false) = true := by
    unfold programSequentialMultiInstanceProfileMatches at exactProfileMatch
    have equalBooleans := beq_iff_eq.mp exactProfileMatch
    exact equalBooleans.trans (by simp only [programProfile, decide_true])
  have mismatched :
      programSequentialMultiInstanceProfileMatches (programForProfile profile) = false := by
    unfold programSequentialMultiInstanceProfileMatches programForProfile
    change ((program.operations.any (fun
      | .awaitSequentialMultiInstanceUserTask .. => true
      | _ => false)) == decide (profile = sequentialMultiInstanceUserTaskProfileId)) = false
    rw [operationPresent]
    simp only [different, decide_false, Bool.true_beq]
  unfold programProfileCapabilitiesValid
  rw [mismatched]
  rfl

theorem profile_admission_refuses_omitted_duplicated_and_substituted_programs :
    (
      programProfileCapabilitiesValid omittedSequentialMultiInstanceProgram,
      programProfileCapabilitiesValid duplicatedSequentialMultiInstanceProgram,
      programProfileCapabilitiesValid substitutedSequentialMultiInstanceProgram) =
      (false, false, false) := by
  decide +kernel

theorem arm_is_the_declared_activity_and_its_boundary_deadline :
    arm?.map (fun arm =>
      (arm.input.value, arm.taskId.value, arm.normalOutput.value,
        arm.boundaryTimer.elementId.value, arm.boundaryTimer.durationMs,
        arm.boundaryTimer.output.value, arm.limits)) =
      some ("place:Flow_Start_Review", "UserTask_Review", "place:Flow_Review_Completed",
        "BoundaryTimer_Review", 1000, "place:Flow_Timer_Escalation", profileLimits) := by
  decide +kernel

def preEntryWith (items : List String) : Option RuntimeState := do
  let arm ← arm?
  let started ← runningProgramStartState? program instanceId
    [{ name := arm.data.inputDataObjectReferenceId, value := .stringList items }]
  let owner ← rootScopeOccurrence? started
  pure
    { started with
      initiationPending := false
      tokens := [{ placeId := arm.input, owner }] }

def batch : List String := ["Invoice_1", "Invoice_2", "Invoice_3"]

def preEntry? : Option RuntimeState := preEntryWith batch

theorem pre_entry_state_is_well_formed_and_publishes_no_output :
    preEntry?.map (fun state =>
      (runtimeStateWellFormed program instanceId state,
        state.variables.process.bindings.map (·.name),
        state.tokens.map (·.placeId.value))) =
      some (true, ["DataObjectReference_InputItems"], ["place:Flow_Start_Review"]) := by
  decide +kernel

def entered? : Option RuntimeState := do
  let arm ← arm?
  let state ← preEntry?
  enterSequentialMultiInstance? arm state

def startStimulus : Stimulus :=
  .startProcess ⟨"start-sequential-review-natural"⟩
    ⟨"Process_SequentialMultiInstanceReview"⟩ instanceId
    [{ name := "DataObjectReference_InputItems", value := .stringList batch }]

def publicStartResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState startStimulus

def taskOccurrence (activation : Nat) : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨"UserTask_Review"⟩
    activation }

def completionStimulus (activation : Nat) (result : String) : Stimulus :=
  .completeUserTaskInstance ⟨"complete-review-" ++ result⟩
    (taskOccurrence activation)
    [{ name := "DataOutput_CurrentResult", value := .string result }]

def publicAfterFirstResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program publicStartResult.state
    (completionStimulus 1 "Reviewed_1")

def publicAfterSecondResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program publicAfterFirstResult.state
    (completionStimulus 2 "Reviewed_2")

def publicAfterThirdResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program publicAfterSecondResult.state
    (completionStimulus 3 "Reviewed_3")

def publicTimerResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program publicAfterFirstResult.state
    (.fireTimer ⟨"fire-review-deadline"⟩
      { processInstanceId := instanceId
        elementId := ⟨"BoundaryTimer_Review"⟩
        activation := 1 }
      1000)

theorem public_start_enters_through_the_distinct_operation :
    publicStartResult.outcome = .committed ∧
      publicStartResult.internalStepBoundExceeded = false ∧
      some publicStartResult.state = entered? := by
  decide +kernel

def publicStartTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit program initialState startStimulus

theorem distinct_operation_is_retained_and_strictly_replayed_in_the_start_trace :
    publicStartTrace.committedTransitions.filterMap (fun
      | .internalOperation record => some record.operationKind
      | .externalStimulus _ => none) =
        [.initiate, .awaitSequentialMultiInstanceUserTask] ∧
      replayCommittedTransitions program initialState
        publicStartTrace.committedTransitions = some publicStartResult.state := by
  decide +kernel

theorem public_user_task_completion_dispatches_to_iteration_before_ordinary_completion :
    (publicAfterFirstResult.outcome, publicAfterSecondResult.outcome,
      publicAfterFirstResult.state.waits.map (fun wait => wait.activation),
      publicAfterSecondResult.state.waits.map (fun wait => wait.activation),
      publicAfterSecondResult.state.sequentialMultiInstanceControllers.map
        (fun controller => controller.outputSlots)) =
      (.committed, .committed, [2], [3], [["Reviewed_1", "Reviewed_2"]]) := by
  decide +kernel

theorem public_final_completion_publishes_and_closes_the_process :
    (publicAfterThirdResult.outcome, publicAfterThirdResult.state.control,
      publicAfterThirdResult.state.variables.process.bindings,
      publicAfterThirdResult.internalStepBoundExceeded) =
      (.committed, .completed instanceId,
        [{ name := "DataObjectReference_InputItems", value := .stringList batch },
          { name := "DataObjectReference_OutputResults",
            value := .stringList ["Reviewed_1", "Reviewed_2", "Reviewed_3"] }], false) := by
  decide +kernel

theorem public_timer_dispatches_to_multi_instance_interruption_before_ordinary_timer_firing :
    (publicTimerResult.outcome,
      publicTimerResult.state.waits.map fun wait => wait.task.id.value,
      publicTimerResult.state.timerWaits.length,
      publicTimerResult.state.sequentialMultiInstanceControllers.length,
      publicTimerResult.state.variables.process.bindings.map (fun binding => binding.name),
      publicTimerResult.state.logicalTimeMs) =
      (.committed, ["UserTask_Escalation"], 0, 0,
        ["DataObjectReference_InputItems"], 1000) := by
  decide +kernel

private def submittedResult (result : String) : List VariableBinding :=
  [{ name := "DataOutput_CurrentResult", value := .string result }]

private def rejectedWithExactState (before : RuntimeState) (stimulus : Stimulus) : Bool :=
  let result := applyStimulus scenarioClosureLimit program before stimulus
  decide (result.outcome = .rejected ∧ result.state = before ∧
    result.internalStepBoundExceeded = false ∧ result.ambiguousInternalChoice = false)

def mismatchedTaskStimuli : List Stimulus :=
  [ .completeUserTaskInstance ⟨"wrong-task-process"⟩
      { taskOccurrence 1 with processInstanceId := ⟨"Other_Instance"⟩ }
      (submittedResult "Reviewed_1")
  , .completeUserTaskInstance ⟨"wrong-task-element"⟩
      { taskOccurrence 1 with elementId := ⟨"Other_Task"⟩ }
      (submittedResult "Reviewed_1")
  , .completeUserTaskInstance ⟨"wrong-task-activation"⟩
      (taskOccurrence 2) (submittedResult "Reviewed_1") ]

def staleCompletionStimulus : Stimulus :=
  .completeUserTaskInstance ⟨"stale-task-activation"⟩
    (taskOccurrence 1) (submittedResult "Reviewed_2")

def extraStartBindingStimulus : Stimulus :=
  .startProcess ⟨"start-with-prepublished-output"⟩
    ⟨"Process_SequentialMultiInstanceReview"⟩ instanceId
    [ { name := "DataObjectReference_InputItems", value := .stringList batch }
    , { name := "DataObjectReference_OutputResults",
        value := .stringList ["must-not-publish"] } ]

def escalationTaskOccurrence : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨"UserTask_Escalation"⟩
    activation := 1 }

def escalationWithDataStimulus : Stimulus :=
  .completeUserTaskInstance ⟨"complete-escalation-with-data"⟩
    escalationTaskOccurrence
    [{ name := "unexpected", value := .string "must-not-merge" }]

def escalationWithoutDataStimulus : Stimulus :=
  .completeUserTaskInstance ⟨"complete-escalation-without-data"⟩
    escalationTaskOccurrence []

def timerOccurrence (activation : Nat) : TimerOccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨"BoundaryTimer_Review"⟩
    activation }

def mismatchedTimerStimuli : List Stimulus :=
  [ .fireTimer ⟨"wrong-timer-process"⟩
      { timerOccurrence 1 with processInstanceId := ⟨"Other_Instance"⟩ } 1000
  , .fireTimer ⟨"wrong-timer-element"⟩
      { timerOccurrence 1 with elementId := ⟨"Other_Timer"⟩ } 1000
  , .fireTimer ⟨"wrong-timer-activation"⟩ (timerOccurrence 2) 1000
  , .fireTimer ⟨"wrong-timer-time"⟩ (timerOccurrence 1) 999 ]

theorem public_smi_dispatch_refuses_task_timer_and_stale_identity_mismatches_without_state_change :
    rejectedWithExactState initialState extraStartBindingStimulus = true ∧
      mismatchedTaskStimuli.all (rejectedWithExactState publicStartResult.state) = true ∧
      rejectedWithExactState publicAfterFirstResult.state staleCompletionStimulus = true ∧
      mismatchedTimerStimuli.all
        (rejectedWithExactState publicAfterFirstResult.state) = true ∧
      rejectedWithExactState publicTimerResult.state escalationWithDataStimulus = true ∧
      (applyStimulus scenarioClosureLimit program publicTimerResult.state
        escalationWithoutDataStimulus).outcome = .committed := by
  decide +kernel

end BpmnSemantics.SequentialMultiInstanceProgramBindingConformance
