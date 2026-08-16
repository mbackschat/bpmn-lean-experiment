import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.TransitionTrace

/-! # Parallel User Task metadata composition conformance

This module owns the proved composition checkpoint for the existing exact balanced two-branch Parallel Gateway control account and passive User Task assignment/form metadata. It proves exact admission, task-to-metadata binding, runtime preservation, control equivalence after metadata erasure, bounded closure, and the limited data-order claim without adding a transition constructor, runtime field, or completion rule.
-/

namespace BpmnSemantics.ParallelUserTaskMetadataCompositionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def processId : ProcessId := ⟨"Process_ParallelUserTaskMetadata"⟩

def instanceId : SemanticId := ⟨"Instance_ParallelUserTaskMetadata"⟩

def contentTaskId : TaskDefinitionId := ⟨"UserTask_ContentReview"⟩

def riskTaskId : TaskDefinitionId := ⟨"UserTask_RiskReview"⟩

def contentMetadata : UserTaskMetadata :=
  { assignment :=
      { candidates := [{ kind := .group, id := "reviewers" }] }
    form :=
      some ({ fields := [{ key := "contentApproved", type := .boolean }] } :
        UserTaskFormMetadata) }

def riskMetadata : UserTaskMetadata :=
  { assignment :=
      { candidates := [{ kind := .group, id := "reviewers" }] }
    form :=
      some ({ fields := [{ key := "riskApproved", type := .boolean }] } :
        UserTaskFormMetadata) }

def contentTask : UserTaskDefinition :=
  { id := contentTaskId
    name := some "Review content"
    metadata := some contentMetadata }

def riskTask : UserTaskDefinition :=
  { id := riskTaskId
    name := some "Review risk"
    metadata := some riskMetadata }

def compositionCheckedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := parallelUserTaskMetadataCheckpointProfileId
        sourceId := ⟨"parallel-user-task-metadata-composition"⟩
        sourceSha256 :=
          "91494fe36496b343d50e1851f1d0b6dda8212ac358f3a1f9bc0833af2ea6c605" }
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [ ⟨"EndEvent_1"⟩, ⟨"Gateway_Fork"⟩, ⟨"Gateway_Join"⟩
      , ⟨"StartEvent_1"⟩, ⟨"UserTask_ContentReview"⟩
      , ⟨"UserTask_RiskReview"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"Flow_ContentToJoin"⟩, ⟨"Flow_ForkToContent"⟩
      , ⟨"Flow_ForkToRisk"⟩, ⟨"Flow_JoinToEnd"⟩
      , ⟨"Flow_RiskToJoin"⟩, ⟨"Flow_StartToFork"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_1"⟩
      , .parallelGateway ⟨"Gateway_Fork"⟩ .diverging
      , .parallelGateway ⟨"Gateway_Join"⟩ .converging
      , .noneStartEvent ⟨"StartEvent_1"⟩
      , .userTask ⟨"UserTask_ContentReview"⟩
          (some "Review content") (some contentMetadata)
      , .userTask ⟨"UserTask_RiskReview"⟩
          (some "Review risk") (some riskMetadata) ]
    sequenceFlows :=
      [ { id := ⟨"Flow_ContentToJoin"⟩
          sourceId := ⟨"UserTask_ContentReview"⟩
          targetId := ⟨"Gateway_Join"⟩ }
      , { id := ⟨"Flow_ForkToContent"⟩
          sourceId := ⟨"Gateway_Fork"⟩
          targetId := ⟨"UserTask_ContentReview"⟩ }
      , { id := ⟨"Flow_ForkToRisk"⟩
          sourceId := ⟨"Gateway_Fork"⟩
          targetId := ⟨"UserTask_RiskReview"⟩ }
      , { id := ⟨"Flow_JoinToEnd"⟩
          sourceId := ⟨"Gateway_Join"⟩
          targetId := ⟨"EndEvent_1"⟩ }
      , { id := ⟨"Flow_RiskToJoin"⟩
          sourceId := ⟨"UserTask_RiskReview"⟩
          targetId := ⟨"Gateway_Join"⟩ }
      , { id := ⟨"Flow_StartToFork"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"Gateway_Fork"⟩ } ] }

def compositionProgram : Program :=
  lowerCheckedProcess compositionCheckedProcess

private def eraseCheckedMetadata (source : CheckedProcess) : CheckedProcess :=
  { source with
    identity :=
      { source.identity with semanticProfile := ⟨"parallel-fork-join-draft"⟩ }
    nodes := source.nodes.map fun
      | .userTask id name _ => .userTask id name none
      | node => node }

def erasedCheckedProcess : CheckedProcess :=
  eraseCheckedMetadata compositionCheckedProcess

def erasedProgram : Program :=
  lowerCheckedProcess erasedCheckedProcess

private def eraseOperationMetadata : SemanticOperation → SemanticOperation
  | .awaitUserTask id origin input output task =>
      .awaitUserTask id origin input output { task with metadata := none }
  | operation => operation

private def eraseProgramMetadata (program : Program) : Program :=
  { program with
    identity :=
      { program.identity with semanticProfile := ⟨"parallel-fork-join-draft"⟩ }
    operations := program.operations.map eraseOperationMetadata }

private def eraseWaitMetadata (wait : UserTaskWait) : UserTaskWait :=
  { wait with
    task := { wait.task with metadata := none }
    metadata := none }

private def eraseRuntimeMetadata (state : RuntimeState) : RuntimeState :=
  { state with waits := state.waits.map eraseWaitMetadata }

private def eraseResultMetadata (result : StimulusResult) : StimulusResult :=
  { result with state := eraseRuntimeMetadata result.state }

private def committedOperationKinds (result : TracedStimulusResult) :
    List SemanticOperationKind :=
  result.committedTransitions.filterMap fun
    | .externalStimulus _ => none
    | .internalOperation record => some record.operationKind

def startStimulus : Stimulus :=
  .startProcess ⟨"start-parallel-metadata"⟩ ⟨processId.value⟩ instanceId []

def taskInstanceId (taskId : TaskDefinitionId) : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨taskId.value⟩
    activation := 1 }

def completionStimulus (commandId : String) (taskId : TaskDefinitionId)
    (submittedValues : List VariableBinding) : Stimulus :=
  .completeUserTaskInstance ⟨commandId⟩ (taskInstanceId taskId) submittedValues

def contentPatch : List VariableBinding :=
  [{ name := "contentApproved", value := .boolean true }]

def riskPatch : List VariableBinding :=
  [{ name := "riskApproved", value := .boolean true }]

def compositionStarted : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram initialState startStimulus

def erasedStarted : StimulusResult :=
  applyStimulus scenarioClosureLimit erasedProgram initialState startStimulus

def contentWait : UserTaskWait :=
  { processInstanceId := instanceId
    owner := rootScopeOccurrenceId instanceId processId
    task := contentTask
    activation := 1
    output := ⟨"place:Flow_ContentToJoin"⟩
    metadata := some contentMetadata }

def riskWait : UserTaskWait :=
  { processInstanceId := instanceId
    owner := rootScopeOccurrenceId instanceId processId
    task := riskTask
    activation := 1
    output := ⟨"place:Flow_RiskToJoin"⟩
    metadata := some riskMetadata }

def contentFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
    (completionStimulus "complete-content" contentTaskId contentPatch)

def riskFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
    (completionStimulus "complete-risk" riskTaskId riskPatch)

def contentThenRisk : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram contentFirst.state
    (completionStimulus "complete-risk" riskTaskId riskPatch)

def riskThenContent : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram riskFirst.state
    (completionStimulus "complete-content" contentTaskId contentPatch)

private def emptyContentFirst (program : Program) (started : StimulusResult) :
    StimulusResult :=
  applyStimulus scenarioClosureLimit program started.state
    (completionStimulus "complete-content-empty" contentTaskId [])

private def emptyRiskFirst (program : Program) (started : StimulusResult) :
    StimulusResult :=
  applyStimulus scenarioClosureLimit program started.state
    (completionStimulus "complete-risk-empty" riskTaskId [])

private def emptyContentThenRisk (program : Program) (started : StimulusResult) :
    StimulusResult :=
  let afterContent := emptyContentFirst program started
  applyStimulus scenarioClosureLimit program afterContent.state
    (completionStimulus "complete-risk-empty" riskTaskId [])

private def emptyRiskThenContent (program : Program) (started : StimulusResult) :
    StimulusResult :=
  let afterRisk := emptyRiskFirst program started
  applyStimulus scenarioClosureLimit program afterRisk.state
    (completionStimulus "complete-content-empty" contentTaskId [])

private def submittedKeysDisjoint
    (left right : List VariableBinding) : Bool :=
  left.all fun leftBinding =>
    right.all fun rightBinding => decide (leftBinding.name ≠ rightBinding.name)

private def exactTaskMetadataPairing (source : CheckedProcess) : Bool :=
  source.nodes.contains
      (.userTask ⟨"UserTask_ContentReview"⟩
        (some "Review content") (some contentMetadata)) &&
    source.nodes.contains
      (.userTask ⟨"UserTask_RiskReview"⟩
        (some "Review risk") (some riskMetadata))

private def missingRiskMetadataProcess : CheckedProcess :=
  { compositionCheckedProcess with
    nodes := compositionCheckedProcess.nodes.map fun
      | .userTask id name metadata =>
          if id = ⟨"UserTask_RiskReview"⟩ then .userTask id name none
          else .userTask id name metadata
      | node => node }

private def swappedMetadataProcess : CheckedProcess :=
  { compositionCheckedProcess with
    nodes := compositionCheckedProcess.nodes.map fun
      | .userTask id name _ =>
          if id = ⟨"UserTask_ContentReview"⟩ then
            .userTask id name (some riskMetadata)
          else
            .userTask id name (some contentMetadata)
      | node => node }

private def oldProfileComposition : CheckedProcess :=
  { compositionCheckedProcess with
    identity :=
      { compositionCheckedProcess.identity with
        semanticProfile := userTaskAssignmentFormMetadataProfileId } }

/-- The checkpoint profile identity is exact and does not widen either predecessor profile. -/
theorem checkpoint_profile_identity_is_exact :
    parallelUserTaskMetadataCheckpointProfileId.value =
      "cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft" ∧
      parallelUserTaskMetadataCheckpointProfileId ≠
        userTaskAssignmentFormMetadataProfileId ∧
      parallelUserTaskMetadataCheckpointProfileId.value ≠
        "parallel-fork-join-draft" := by
  decide +kernel

/-- The exact six-node graph and its lowered program satisfy both structural and profile admission. -/
theorem exact_two_task_metadata_composition_is_admitted :
    checkedWellFormed compositionCheckedProcess = true ∧
      programWellFormed compositionProgram = true ∧
      checkedProfileCapabilitiesValid compositionCheckedProcess = true ∧
      programProfileCapabilitiesValid compositionProgram = true ∧
      definitionBindingValid compositionCheckedProcess compositionProgram = true ∧
      profileGraphPolicy? parallelUserTaskMetadataCheckpointProfileId.value =
        some .acyclic := by
  decide +kernel

/-- Lowering keeps each complete metadata block attached to its source element identity. -/
theorem lowering_preserves_both_exact_task_metadata_bindings :
    compositionProgram.operations.contains
        (.awaitUserTask ⟨"operation:UserTask_ContentReview"⟩
          { elementId := ⟨"UserTask_ContentReview"⟩ }
          ⟨"place:Flow_ForkToContent"⟩ ⟨"place:Flow_ContentToJoin"⟩
          contentTask) = true ∧
      compositionProgram.operations.contains
        (.awaitUserTask ⟨"operation:UserTask_RiskReview"⟩
          { elementId := ⟨"UserTask_RiskReview"⟩ }
          ⟨"place:Flow_ForkToRisk"⟩ ⟨"place:Flow_RiskToJoin"⟩
          riskTask) = true := by
  decide +kernel

/-- Metadata erasure produces the existing metadata-free profile without changing the lowered control program. -/
theorem program_metadata_erasure_is_exact :
    checkedWellFormed erasedCheckedProcess = true ∧
      programWellFormed erasedProgram = true ∧
      eraseProgramMetadata compositionProgram = erasedProgram := by
  decide +kernel

/-- Start closes to exactly two distinct metadata-bearing waits with the unchanged legal activation pair. -/
theorem start_creates_exact_two_metadata_waits_and_activations :
    compositionStarted.outcome = .committed ∧
      compositionStarted.state.waits = [contentWait, riskWait] ∧
      compositionStarted.state.tokens = [] ∧
      compositionStarted.state.activations =
        [ { taskId := contentTaskId, count := 1 }
        , { taskId := riskTaskId, count := 1 } ] ∧
      compositionStarted.internalStepBoundExceeded = false ∧
      compositionStarted.ambiguousInternalChoice = false := by
  decide +kernel

/-- Exact completion of content removes only that occurrence and preserves the risk wait byte-for-byte. -/
theorem content_completion_preserves_exact_risk_sibling :
    contentFirst.outcome = .committed ∧
      contentFirst.state.waits = [riskWait] ∧
      contentFirst.state.variables.process.bindings = contentPatch ∧
      contentFirst.state.control = .running instanceId := by
  decide +kernel

/-- Exact completion of risk removes only that occurrence and preserves the content wait byte-for-byte. -/
theorem risk_completion_preserves_exact_content_sibling :
    riskFirst.outcome = .committed ∧
      riskFirst.state.waits = [contentWait] ∧
      riskFirst.state.variables.process.bindings = riskPatch ∧
      riskFirst.state.control = .running instanceId := by
  decide +kernel

/-- A wrong activation is rejected before value installation and preserves both complete waits. -/
theorem wrong_occurrence_preserves_both_metadata_waits :
    applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
        (.completeUserTaskInstance ⟨"wrong-activation"⟩
          { taskInstanceId contentTaskId with activation := 2 } contentPatch) =
      { outcome := .rejected
        state := compositionStarted.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- Repeating an already committed content occurrence is stale and preserves the exact remaining sibling. -/
theorem stale_content_occurrence_preserves_exact_risk_sibling :
    applyStimulus scenarioClosureLimit compositionProgram contentFirst.state
        (completionStimulus "stale-content" contentTaskId contentPatch) =
      { outcome := .rejected
        state := contentFirst.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- Erasing metadata commutes with start, either first completion, and both synchronization-to-closure orders. -/
theorem metadata_erasure_preserves_parallel_control_through_closure :
    eraseResultMetadata compositionStarted = erasedStarted ∧
      eraseResultMetadata
          (emptyContentFirst compositionProgram compositionStarted) =
        emptyContentFirst erasedProgram erasedStarted ∧
      eraseResultMetadata
          (emptyRiskFirst compositionProgram compositionStarted) =
        emptyRiskFirst erasedProgram erasedStarted ∧
      eraseResultMetadata
          (emptyContentThenRisk compositionProgram compositionStarted) =
        emptyContentThenRisk erasedProgram erasedStarted ∧
      eraseResultMetadata
          (emptyRiskThenContent compositionProgram compositionStarted) =
        emptyRiskThenContent erasedProgram erasedStarted := by
  decide +kernel

/-- The composed start and terminal closure use only the existing initiate, duplicate, await, synchronize, None End, and complete-scope relations. -/
theorem committed_relation_families_are_the_existing_parallel_account :
    committedOperationKinds
        (applyStimulusTraced scenarioClosureLimit compositionProgram
          initialState startStimulus) =
      [ .initiate, .duplicate, .awaitUserTask, .awaitUserTask ] ∧
      committedOperationKinds
        (applyStimulusTraced scenarioClosureLimit compositionProgram
          contentFirst.state
          (completionStimulus "complete-risk-traced" riskTaskId riskPatch)) =
      [ .synchronize, .reachNoneEnd, .completeScope ] := by
  decide +kernel

/-- Both completion orders reach the same terminal control state independently of their disjoint data proof. -/
theorem both_completion_orders_reach_same_terminal_control :
    contentThenRisk.state.control = .completed instanceId ∧
      riskThenContent.state.control = .completed instanceId ∧
      contentThenRisk.state.control = riskThenContent.state.control ∧
      contentThenRisk.internalStepBoundExceeded = false ∧
      riskThenContent.internalStepBoundExceeded = false := by
  decide +kernel

/-- Final Process data agrees for the exact catalog patches only under their explicit disjoint-key premise. -/
theorem disjoint_catalog_patches_reach_equal_final_process_data
    (_disjoint : submittedKeysDisjoint contentPatch riskPatch = true) :
    contentThenRisk.state.variables.process =
      riskThenContent.state.variables.process := by
  decide +kernel

private def overlappingContentPatch : List VariableBinding :=
  [{ name := "decision", value := .boolean true }]

private def overlappingRiskPatch : List VariableBinding :=
  [{ name := "decision", value := .boolean false }]

private def overlappingContentFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
    (completionStimulus "complete-content-overlap" contentTaskId
      overlappingContentPatch)

private def overlappingRiskFirst : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram compositionStarted.state
    (completionStimulus "complete-risk-overlap" riskTaskId overlappingRiskPatch)

private def overlappingContentThenRisk : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram overlappingContentFirst.state
    (completionStimulus "complete-risk-overlap" riskTaskId overlappingRiskPatch)

private def overlappingRiskThenContent : StimulusResult :=
  applyStimulus scenarioClosureLimit compositionProgram overlappingRiskFirst.state
    (completionStimulus "complete-content-overlap" contentTaskId
      overlappingContentPatch)

/-- Overlapping submitted keys retain accepted command order, so no arbitrary commutativity claim is available. -/
theorem overlapping_patches_have_ordered_unequal_final_data :
    submittedKeysDisjoint overlappingContentPatch overlappingRiskPatch = false ∧
      overlappingContentThenRisk.state.variables.process ≠
        overlappingRiskThenContent.state.variables.process := by
  decide +kernel

/-- The start and post-completion closure thresholds are exactly those of the erased parallel account. -/
theorem closure_bounds_are_unchanged_by_metadata :
    (applyStimulus 3 compositionProgram initialState startStimulus).internalStepBoundExceeded =
        (applyStimulus 3 erasedProgram initialState startStimulus).internalStepBoundExceeded ∧
      (applyStimulus 4 compositionProgram initialState startStimulus).internalStepBoundExceeded =
        (applyStimulus 4 erasedProgram initialState startStimulus).internalStepBoundExceeded ∧
      (applyStimulus 3 compositionProgram initialState startStimulus).internalStepBoundExceeded = true ∧
      (applyStimulus 4 compositionProgram initialState startStimulus).internalStepBoundExceeded = false ∧
      (applyStimulus 2 compositionProgram contentFirst.state
        (completionStimulus "complete-risk-bound" riskTaskId riskPatch)).internalStepBoundExceeded = true ∧
      (applyStimulus 3 compositionProgram contentFirst.state
        (completionStimulus "complete-risk-bound" riskTaskId riskPatch)).internalStepBoundExceeded = false := by
  decide +kernel

/-- Missing one metadata block rejects the profile while a complete pairing mutation cannot masquerade as the exact checkpoint fixture. -/
theorem missing_or_mispaired_metadata_refuses_exact_checkpoint_evidence :
    checkedProfileCapabilitiesValid missingRiskMetadataProcess = false ∧
      programProfileCapabilitiesValid
        (lowerCheckedProcess missingRiskMetadataProcess) = false ∧
      exactTaskMetadataPairing compositionCheckedProcess = true ∧
      exactTaskMetadataPairing swappedMetadataProcess = false ∧
      swappedMetadataProcess ≠ compositionCheckedProcess := by
  decide +kernel

/-- Neither predecessor profile admits the composed metadata-bearing parallel shape. -/
theorem predecessor_profiles_remain_narrow :
    checkedProfileCapabilitiesValid oldProfileComposition = false ∧
      programProfileCapabilitiesValid
        (lowerCheckedProcess oldProfileComposition) = false ∧
      checkedProfileCapabilitiesValid
        { erasedCheckedProcess with
          identity :=
            { erasedCheckedProcess.identity with
              semanticProfile := userTaskAssignmentFormMetadataProfileId } } = false := by
  decide +kernel

/-- List-level Process Start admission for the checkpoint succeeds exactly for an empty binding map. -/
theorem process_start_admits_exactly_the_empty_binding_map
    (bindings : List VariableBinding) :
    processDataBindingsAdmitted parallelUserTaskMetadataCheckpointProfileId
      .processStart bindings = true ↔ bindings = [] := by
  cases bindings with
  | nil => simp [processDataBindingsAdmitted]
  | cons binding remaining =>
      have firstRejected :
          variableValueAdmitted parallelUserTaskMetadataCheckpointProfileId
            .processStart binding.value = false := by
        cases binding.value <;>
          simp [variableValueAdmitted,
            parallelUserTaskMetadataCheckpointProfileId]
      simp [processDataBindingsAdmitted, firstRejected]

/-- Process Start admits only the empty binding map while completion admits string, null, and Boolean values for this exact profile. -/
theorem value_domain_extension_is_completion_only :
    variableValueAdmitted parallelUserTaskMetadataCheckpointProfileId
        .processStart (.string "pending") = false ∧
      variableValueAdmitted parallelUserTaskMetadataCheckpointProfileId
        .processStart .null = false ∧
      variableValueAdmitted parallelUserTaskMetadataCheckpointProfileId
        .processStart (.boolean true) = false ∧
      processDataBindingsAdmitted parallelUserTaskMetadataCheckpointProfileId
        .processStart [] = true ∧
      variableValueAdmitted parallelUserTaskMetadataCheckpointProfileId
        .userTaskCompletion (.string "approved") = true ∧
      variableValueAdmitted parallelUserTaskMetadataCheckpointProfileId
        .userTaskCompletion .null = true ∧
      variableValueAdmitted parallelUserTaskMetadataCheckpointProfileId
        .userTaskCompletion (.boolean true) = true ∧
      applyStimulus scenarioClosureLimit compositionProgram initialState
          (.startProcess ⟨"boolean-start"⟩ ⟨processId.value⟩ instanceId
            [{ name := "contentApproved", value := .boolean true }]) =
        { outcome := .rejected
          state := initialState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  decide +kernel

end BpmnSemantics.ParallelUserTaskMetadataCompositionConformance
