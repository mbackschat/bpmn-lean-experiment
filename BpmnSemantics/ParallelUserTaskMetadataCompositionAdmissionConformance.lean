import BpmnSemantics.ParallelUserTaskMetadataCompositionFixtures

/-! # Parallel User Task metadata composition admission conformance

Proved exact profile identity, structural admission, task-to-metadata binding, metadata erasure, negative profile boundaries, and data-value admission for the composition checkpoint.
-/

namespace BpmnSemantics.ParallelUserTaskMetadataCompositionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def eraseOperationMetadata : SemanticOperation → SemanticOperation
  | .awaitUserTask id origin input output task =>
      .awaitUserTask id origin input output { task with metadata := none }
  | operation => operation

private def eraseProgramMetadata (program : Program) : Program :=
  { program with
    identity :=
      { program.identity with semanticProfile := ⟨"parallel-fork-join-draft"⟩ }
    operations := program.operations.map eraseOperationMetadata }

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
        cases binding.value <;> simp [variableValueAdmitted]
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
