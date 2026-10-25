module

public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
public import BpmnSemantics.SemanticProcess.SequentialMultiInstanceTransition
public import BpmnSemantics.SequentialMultiInstanceDataFixtures
public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
public import BpmnSemantics.SemanticProcess.CheckedGraphValidation
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
public import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries
import all Init.Data.List.Control
import all Init.Data.String.Basic
import all Init.Data.String.Bootstrap
import all Init.Data.String.Decode
import all Init.Data.String.Defs
import all Init.Data.String.Extra
import all Init.Data.String.FindPos
import all Init.Data.String.Hashable
import all Init.Data.String.Iter
import all Init.Data.String.Iter.Basic
import all Init.Data.String.Iter.Intercalate
import all Init.Data.String.Iterate
import all Init.Data.String.Iterator
import all Init.Data.String.Legacy
import all Init.Data.String.Length
import all Init.Data.String.Modify
import all Init.Data.String.OrderInstances
import all Init.Data.String.Pattern
import all Init.Data.String.Pattern.Basic
import all Init.Data.String.Pattern.Char
import all Init.Data.String.Pattern.Pred
import all Init.Data.String.Pattern.String
import all Init.Data.String.PosRaw
import all Init.Data.String.Search
import all Init.Data.String.Slice
import all Init.Data.String.Stream
import all Init.Data.String.Subslice
import all Init.Data.String.Substring
import all Init.Data.String.TakeDrop
import all Init.Data.String.Termination
import all Init.Data.String.ToSlice
import all Lean.Data.Json.Basic
import all Lean.Data.Json.Elab
import all Lean.Data.Json.FromToJson
import all Lean.Data.Json.FromToJson.Basic
import all Lean.Data.Json.FromToJson.Extra
import all Lean.Data.Json.Parser
import all Lean.Data.Json.Printer
import all Lean.Data.Json.Stream

/-! Fixture definitions and executable checks of [`SequentialMultiInstanceProgramBindingConformance`](SequentialMultiInstanceProgramBindingConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section
set_option Elab.async false

namespace BpmnSemantics.SequentialMultiInstanceProgramBindingConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess

set_option synthInstance.maxSize 2000

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := sequentialMultiInstanceUserTaskProfileId
        sourceId := ⟨"sequential-multi-instance"⟩
        sourceSha256 :=
          "982f77f7fcca2d01bd2357c11057c5fdb6aaf3b383ac351a93aa32ab1bbca3ff" }
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
            durationLiteral := "PT5S"
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

def ordinaryTaskWithSequentialTaskIdentity : SemanticOperation :=
  .awaitUserTask ⟨"operation:Ordinary_Review"⟩ { elementId := ⟨"UserTask_Review"⟩ }
    ⟨"place:Ordinary_Input"⟩ ⟨"place:Ordinary_Output"⟩
    { id := ⟨"UserTask_Review"⟩, name := some "Ordinary review" }

/-- Standalone Program admission rejects an ordinary User Task that collides with the sequential
Multi-Instance entry's User Task declaration. -/
def sequential_multi_instance_same_task_declarer_is_rejected : Bool := decide <|
    programWaitDeclarersUnique (ordinaryTaskWithSequentialTaskIdentity :: program.operations) =
      false

def arm? : Option SequentialMultiInstanceArm :=
  match program.operations.filterMap SequentialMultiInstanceArm.ofOperation? with
  | [arm] => some arm
  | _ => none

def exact_registered_profile_shape_is_admitted : Bool := decide <|
    programProfileCapabilitiesValid program = true

def checked_data_role_graph_is_preserved_by_lowering : Bool := decide <|
    program.operations.filterMap (fun
      | .awaitSequentialMultiInstanceUserTask _ _ _ _ data _ _ _ => some data
      | _ => none) = [dataDefinition]

def exact_root_operation_multiset_is_preserved : Bool := decide <|
    let kinds := program.operations.map SemanticOperation.kind
    (kinds.count .initiate, kinds.count .awaitSequentialMultiInstanceUserTask,
      kinds.count .awaitUserTask, kinds.count .reachNoneEnd,
      kinds.count .completeScope, kinds.length) = (1, 1, 1, 2, 1, 6)

def mapSequentialMultiInstanceOperation
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

def object_id_substitution_is_not_the_checked_program_binding : Bool := decide <|
    definitionBindingValid checkedProcess dataObjectInputProgram = false ∧
      definitionBindingValid checkedProcess dataObjectOutputProgram = false

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

def profile_admission_refuses_omitted_duplicated_and_substituted_programs : Bool := decide <|
    (
      programProfileCapabilitiesValid omittedSequentialMultiInstanceProgram,
      programProfileCapabilitiesValid duplicatedSequentialMultiInstanceProgram,
      programProfileCapabilitiesValid substitutedSequentialMultiInstanceProgram) =
      (false, false, false)

def arm_is_the_declared_activity_and_its_boundary_deadline : Bool := decide <|
    arm?.map (fun arm =>
      (arm.input.value, arm.taskId.value, arm.normalOutput.value,
        arm.boundaryTimer.elementId.value, arm.boundaryTimer.durationMs,
        arm.boundaryTimer.output.value, arm.limits)) =
      some ("place:Flow_Start_Review", "UserTask_Review", "place:Flow_Review_Completed",
        "BoundaryTimer_Review", 5000, "place:Flow_Timer_Escalation", profileLimits)

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

def pre_entry_state_is_well_formed_and_publishes_no_output : Bool := decide <|
    preEntry?.map (fun state =>
      (runtimeStateWellFormed program instanceId state,
        state.variables.process.bindings.map (·.name),
        state.tokens.map (·.placeId.value))) =
      some (true, ["DataObjectReference_InputItems"], ["place:Flow_Start_Review"])

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
      5000)

def public_start_enters_through_the_distinct_operation : Bool := decide <|
    publicStartResult.outcome = .committed ∧
      publicStartResult.internalStepBoundExceeded = false ∧
      some publicStartResult.state = entered?

def publicStartTrace : TracedStimulusResult :=
  applyStimulusTraced scenarioClosureLimit program initialState startStimulus

def distinct_operation_is_retained_and_strictly_replayed_in_the_start_trace : Bool := decide <|
    publicStartTrace.committedTransitions.filterMap (fun
      | .internalOperation record => some record.operationKind
      | .externalStimulus _ => none) =
        [.initiate, .awaitSequentialMultiInstanceUserTask] ∧
      replayCommittedTransitions program initialState
        publicStartTrace.committedTransitions = some publicStartResult.state

def public_user_task_completion_dispatches_to_iteration_before_ordinary_completion : Bool := decide <|
    (publicAfterFirstResult.outcome, publicAfterSecondResult.outcome,
      publicAfterFirstResult.state.waits.map (fun wait => wait.activation),
      publicAfterSecondResult.state.waits.map (fun wait => wait.activation),
      publicAfterSecondResult.state.sequentialMultiInstanceControllers.map
        (fun controller => controller.outputSlots)) =
      (.committed, .committed, [2], [3], [["Reviewed_1", "Reviewed_2"]])

def public_final_completion_publishes_and_closes_the_process : Bool := decide <|
    (publicAfterThirdResult.outcome, publicAfterThirdResult.state.control,
      publicAfterThirdResult.state.variables.process.bindings,
      publicAfterThirdResult.internalStepBoundExceeded) =
      (.committed, .completed instanceId,
        [{ name := "DataObjectReference_InputItems", value := .stringList batch },
          { name := "DataObjectReference_OutputResults",
            value := .stringList ["Reviewed_1", "Reviewed_2", "Reviewed_3"] }], false)

def public_timer_dispatches_to_multi_instance_interruption_before_ordinary_timer_firing : Bool := decide <|
    (publicTimerResult.outcome,
      publicTimerResult.state.waits.map fun wait => wait.task.id.value,
      publicTimerResult.state.timerWaits.length,
      publicTimerResult.state.sequentialMultiInstanceControllers.length,
      publicTimerResult.state.variables.process.bindings.map (fun binding => binding.name),
      publicTimerResult.state.logicalTimeMs) =
      (.committed, ["UserTask_Escalation"], 0, 0,
        ["DataObjectReference_InputItems"], 5000)

def submittedResult (result : String) : List VariableBinding :=
  [{ name := "DataOutput_CurrentResult", value := .string result }]

def rejectedWithExactState (before : RuntimeState) (stimulus : Stimulus) : Bool :=
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
      { timerOccurrence 1 with processInstanceId := ⟨"Other_Instance"⟩ } 5000
  , .fireTimer ⟨"wrong-timer-element"⟩
      { timerOccurrence 1 with elementId := ⟨"Other_Timer"⟩ } 5000
  , .fireTimer ⟨"wrong-timer-activation"⟩ (timerOccurrence 2) 5000
  , .fireTimer ⟨"wrong-timer-time"⟩ (timerOccurrence 1) 4999 ]

def public_smi_dispatch_refuses_task_timer_and_stale_identity_mismatches_without_state_change : Bool := decide <|
    rejectedWithExactState initialState extraStartBindingStimulus = true ∧
      mismatchedTaskStimuli.all (rejectedWithExactState publicStartResult.state) = true ∧
      rejectedWithExactState publicAfterFirstResult.state staleCompletionStimulus = true ∧
      mismatchedTimerStimuli.all
        (rejectedWithExactState publicAfterFirstResult.state) = true ∧
      rejectedWithExactState publicTimerResult.state escalationWithDataStimulus = true ∧
      (applyStimulus scenarioClosureLimit program publicTimerResult.state
        escalationWithoutDataStimulus).outcome = .committed

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("sequential_multi_instance_same_task_declarer_is_rejected", sequential_multi_instance_same_task_declarer_is_rejected),
  ("exact_registered_profile_shape_is_admitted", exact_registered_profile_shape_is_admitted),
  ("checked_data_role_graph_is_preserved_by_lowering", checked_data_role_graph_is_preserved_by_lowering),
  ("exact_root_operation_multiset_is_preserved", exact_root_operation_multiset_is_preserved),
  ("object_id_substitution_is_not_the_checked_program_binding", object_id_substitution_is_not_the_checked_program_binding),
  ("profile_admission_refuses_omitted_duplicated_and_substituted_programs", profile_admission_refuses_omitted_duplicated_and_substituted_programs),
  ("arm_is_the_declared_activity_and_its_boundary_deadline", arm_is_the_declared_activity_and_its_boundary_deadline),
  ("pre_entry_state_is_well_formed_and_publishes_no_output", pre_entry_state_is_well_formed_and_publishes_no_output),
  ("public_start_enters_through_the_distinct_operation", public_start_enters_through_the_distinct_operation),
  ("distinct_operation_is_retained_and_strictly_replayed_in_the_start_trace", distinct_operation_is_retained_and_strictly_replayed_in_the_start_trace),
  ("public_user_task_completion_dispatches_to_iteration_before_ordinary_completion", public_user_task_completion_dispatches_to_iteration_before_ordinary_completion),
  ("public_final_completion_publishes_and_closes_the_process", public_final_completion_publishes_and_closes_the_process),
  ("public_timer_dispatches_to_multi_instance_interruption_before_ordinary_timer_firing", public_timer_dispatches_to_multi_instance_interruption_before_ordinary_timer_firing),
  ("public_smi_dispatch_refuses_task_timer_and_stale_identity_mismatches_without_state_change", public_smi_dispatch_refuses_task_timer_and_stale_identity_mismatches_without_state_change)
]

end BpmnSemantics.SequentialMultiInstanceProgramBindingConformance
