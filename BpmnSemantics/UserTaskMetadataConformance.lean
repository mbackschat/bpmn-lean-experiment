import BpmnSemantics.BooleanProcessDataConformance
import BpmnSemantics.SemanticProcessJson.CheckedProcess
import BpmnSemantics.SemanticProcessJson.Program
import BpmnSemantics.SemanticProcessJsonMain

/-! # User Task assignment and form metadata conformance

This module proves passive User Task metadata preservation across the approved checked, lowered,
runtime, public-observation, and strict-wire boundaries. It adds no transition family and proves no
assignment authorization, form validation, or broader BPMN resource/rendering meaning.
-/

namespace BpmnSemantics.UserTaskMetadataConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson
open Lean

def exactMetadata : UserTaskMetadata :=
  { assignment :=
      { candidates := [{ kind := .group, id := "reviewers" }] }
    form :=
      { fields := [{ key := "approved", type := .boolean }] } }

def changedCandidateMetadata : UserTaskMetadata :=
  { exactMetadata with
    assignment :=
      { candidates := [{ kind := .group, id := "reviewers-east" }] } }

def changedFieldKeyMetadata : UserTaskMetadata :=
  { exactMetadata with
    form := { fields := [{ key := "decision", type := .boolean }] } }

def changedFieldTypeMetadata : UserTaskMetadata :=
  { exactMetadata with
    form := { fields := [{ key := "approved", type := .string }] } }

def metadataCheckedTask (metadata : UserTaskMetadata) : CheckedNode :=
  .userTask ⟨"UserTask_Approve"⟩ (some "Approve") (some metadata)

def checkedProcessFor (metadata : UserTaskMetadata) : CheckedProcess :=
  { sequentialCheckedProcess with
    identity :=
      { sequentialCheckedProcess.identity with
        semanticProfile := userTaskAssignmentFormMetadataProfileId }
    nodes := sequentialCheckedProcess.nodes.map fun
      | .userTask id name _ => .userTask id name (some metadata)
      | node => node }

def programFor (metadata : UserTaskMetadata) : Program :=
  lowerCheckedProcess (checkedProcessFor metadata)

def taskDefinitionFor (metadata : UserTaskMetadata) : UserTaskDefinition :=
  { id := ⟨"UserTask_Approve"⟩
    name := some "Approve"
    metadata := some metadata }

def operationFor (metadata : UserTaskMetadata) : SemanticOperation :=
  .awaitUserTask
    ⟨"operation:UserTask_Approve"⟩
    { elementId := ⟨"UserTask_Approve"⟩ }
    ⟨"place:Flow_StartToTask"⟩
    ⟨"place:Flow_TaskToEnd"⟩
    (taskDefinitionFor metadata)

def waitFor (metadata : UserTaskMetadata) : UserTaskWait :=
  { SequentialUserTask.exactWait with
    task := taskDefinitionFor metadata
    metadata := some metadata }

def waitingStateFor (metadata : UserTaskMetadata) : RuntimeState :=
  { BooleanProcessDataConformance.waitingState with
    waits := [waitFor metadata] }

def openTaskFor (metadata : UserTaskMetadata) : OpenUserTask :=
  { id := SequentialUserTask.exactTaskInstanceId
    name := some "Approve"
    state := .active
    metadata := some metadata }

def startStimulus : Stimulus :=
  .startProcess ⟨"start-metadata"⟩
    ⟨(programFor exactMetadata).processId.value⟩
    ⟨"Instance_1"⟩
    BooleanProcessDataConformance.waitingBindings

def booleanCompletion : Stimulus :=
  BooleanProcessDataConformance.completionStimulus (.boolean true)

private def decodingRejected (result : Except String α) : Bool :=
  match result with
  | .ok _ => false
  | .error _ => true

private def decodingAccepted [DecidableEq α]
    (result : Except String α) (expected : α) : Bool :=
  match result with
  | .ok actual => decide (actual = expected)
  | .error _ => false

private def optionalFieldAbsent (json : Json) (key : String) : Bool :=
  match optionalField json key with
  | .ok none => true
  | .ok (some _)
  | .error _ => false

def exactMetadataJson : Json :=
  encodeUserTaskMetadata exactMetadata

def checkedTaskJson : Json :=
  Json.mkObj
    [ ("kind", toJson "userTask")
    , ("id", toJson "UserTask_Approve")
    , ("name", toJson (some "Approve" : Option String))
    , ("metadata", exactMetadataJson) ]

def taskDefinitionJson : Json :=
  Json.mkObj
    [ ("elementId", toJson "UserTask_Approve")
    , ("name", toJson (some "Approve" : Option String))
    , ("metadata", exactMetadataJson) ]

/-- The explicit predicate admits the selected singleton and no normalization is involved. -/
theorem exact_metadata_is_well_formed :
    exactMetadata.wellFormed = true := by
  decide +kernel

/-- The boundary-space predicate is the exact selected code-point union, including non-ASCII spaces. -/
theorem boundary_space_set_has_exact_representative_edges :
    UserTaskMetadata.boundarySpaceCodePoint 0x8 = false ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x9 = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0xd = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0xe = false ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x20 = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x85 = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0xa0 = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x1680 = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x1fff = false ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x2000 = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x200a = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x200b = false ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x2028 = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x2029 = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x202f = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x205f = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0x3000 = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0xfeff = true ∧
      UserTaskMetadata.boundarySpaceCodePoint 0xff00 = false := by
  decide +kernel

/-- Empty, multiple, comma-list, expression, and incomplete metadata shapes refuse uniformly. -/
theorem strict_metadata_shape_rejects_broader_values :
    ({ exactMetadata with assignment := { candidates := [] }} : UserTaskMetadata).wellFormed = false ∧
      ({ exactMetadata with assignment :=
          { candidates :=
              [{ kind := .group, id := "a" }, { kind := .group, id := "b" }] }} :
        UserTaskMetadata).wellFormed = false ∧
      UserTaskMetadata.candidateIdWellFormed "a,b" = false ∧
      UserTaskMetadata.candidateIdWellFormed "${group}" = false ∧
      UserTaskMetadata.candidateIdWellFormed "#{group}" = false ∧
      ({ exactMetadata with form := { fields := [] }} : UserTaskMetadata).wellFormed = false ∧
      ({ exactMetadata with form :=
          { fields :=
              [{ key := "a", type := .string },
                { key := "b", type := .boolean }] }} :
        UserTaskMetadata).wellFormed = false := by
  decide +kernel

/-- Leading U+00A0 refuses as decoded content rather than being trimmed into another identity. -/
theorem nonbreaking_space_boundary_refuses_without_normalization :
    UserTaskMetadata.candidateIdWellFormed "\u00a0reviewers" = false ∧
      let metadata :=
        { exactMetadata with assignment :=
            { candidates := [{ kind := .group, id := "\u00a0reviewers" }] } }
      metadata.wellFormed = false ∧
        decodingRejected (decodeUserTaskMetadata (encodeUserTaskMetadata metadata)) = true := by
  decide +kernel

/-- Exact checked metadata lowers into the ordinary `awaitUserTask.task` unchanged. -/
theorem exact_metadata_survives_checked_to_il_lowering :
    (checkedProcessFor exactMetadata).nodes.contains
        (metadataCheckedTask exactMetadata) = true ∧
      (programFor exactMetadata).operations.contains (operationFor exactMetadata) = true := by
  decide +kernel

/-- The checkpoint profile admits the exact sequential checked graph and lowered acyclic program. -/
theorem checkpoint_profile_admits_exact_checked_and_program_shapes :
    checkedWellFormed (checkedProcessFor exactMetadata) = true ∧
      programWellFormed (programFor exactMetadata) = true ∧
      checkedProfileCapabilitiesValid (checkedProcessFor exactMetadata) = true ∧
      programProfileCapabilitiesValid (programFor exactMetadata) = true ∧
      profileGraphPolicy? userTaskAssignmentFormMetadataProfileId.value = some .acyclic := by
  decide +kernel

/-- The same metadata-bearing definitions are excluded from every earlier data-only profile. -/
theorem old_profile_excludes_metadata_at_both_definition_boundaries :
    let checked :=
      { checkedProcessFor exactMetadata with
        identity := sequentialCheckedProcess.identity }
    let program := lowerCheckedProcess checked
    checkedWellFormed checked = false ∧
      checkedProfileCapabilitiesValid checked = false ∧
      programProfileCapabilitiesValid program = false := by
  decide +kernel

/-- Runtime activation copies metadata into both the task definition and semantic wait. -/
theorem wait_creation_copies_exact_metadata :
    applyStimulus scenarioClosureLimit (programFor exactMetadata) initialState startStimulus =
      { outcome := .committed
        state := waitingStateFor exactMetadata
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- Public projection copies the semantic wait's exact metadata without constructing identity. -/
theorem public_projection_copies_exact_metadata :
    (observeStableState (programFor exactMetadata)
      (waitingStateFor exactMetadata)).map (·.openUserTasks) =
        some [openTaskFor exactMetadata] := by
  decide +kernel

/-- Candidate identity remains structurally unequal through checked, IL, wait, and observation values. -/
theorem candidate_identity_mutation_remains_unequal :
    exactMetadata ≠ changedCandidateMetadata ∧
      metadataCheckedTask exactMetadata ≠
        metadataCheckedTask changedCandidateMetadata ∧
      operationFor exactMetadata ≠ operationFor changedCandidateMetadata ∧
      waitFor exactMetadata ≠ waitFor changedCandidateMetadata ∧
      openTaskFor exactMetadata ≠ openTaskFor changedCandidateMetadata := by
  decide +kernel

/-- Field identity remains structurally unequal through checked, IL, wait, and observation values. -/
theorem field_key_mutation_remains_unequal :
    exactMetadata ≠ changedFieldKeyMetadata ∧
      metadataCheckedTask exactMetadata ≠ metadataCheckedTask changedFieldKeyMetadata ∧
      operationFor exactMetadata ≠ operationFor changedFieldKeyMetadata ∧
      waitFor exactMetadata ≠ waitFor changedFieldKeyMetadata ∧
      openTaskFor exactMetadata ≠ openTaskFor changedFieldKeyMetadata := by
  decide +kernel

/-- Field type remains structurally unequal through checked, IL, wait, and observation values. -/
theorem field_type_mutation_remains_unequal :
    exactMetadata ≠ changedFieldTypeMetadata ∧
      metadataCheckedTask exactMetadata ≠ metadataCheckedTask changedFieldTypeMetadata ∧
      operationFor exactMetadata ≠ operationFor changedFieldTypeMetadata ∧
      waitFor exactMetadata ≠ waitFor changedFieldTypeMetadata ∧
      openTaskFor exactMetadata ≠ openTaskFor changedFieldTypeMetadata := by
  decide +kernel

/-- Strict checked, IL, and metadata decoders accept only the complete exact-key shape. -/
theorem strict_json_accepts_exact_metadata_shape :
    decodingAccepted (decodeUserTaskMetadata exactMetadataJson) exactMetadata = true ∧
      decodingAccepted (decodeCheckedUserTask checkedTaskJson)
        (metadataCheckedTask exactMetadata) = true ∧
      decodingAccepted (decodeTaskDefinition taskDefinitionJson)
        (taskDefinitionFor exactMetadata) = true := by
  decide +kernel

/-- Unknown, null, and extra nested metadata fields cannot be erased by strict decoding. -/
theorem strict_json_rejects_nonexact_metadata_shapes :
    decodingRejected
        (decodeCheckedUserTask
          (Json.mkObj
            [ ("kind", toJson "userTask")
            , ("id", toJson "UserTask_Approve")
            , ("name", toJson (some "Approve" : Option String))
            , ("metadata", exactMetadataJson)
            , ("unexpected", toJson true) ])) = true ∧
      decodingRejected
        (decodeTaskDefinition
          (Json.mkObj
            [ ("elementId", toJson "UserTask_Approve")
            , ("name", toJson (some "Approve" : Option String))
            , ("metadata", Json.null) ])) = true ∧
      decodingRejected
        (decodeUserTaskMetadata
          (Json.mkObj
            [ ("assignment",
                Json.mkObj
                  [("candidates",
                    .arr #[Json.mkObj
                      [("kind", toJson "group"), ("id", toJson "reviewers"),
                        ("label", toJson "Reviewers")]])])
            , ("form", exactMetadataJson.getObjValD "form") ])) = true := by
  decide +kernel

/-- Metadata-free checked, IL, and public values retain their old shapes with no `metadata` member. -/
theorem metadata_free_values_omit_the_property_physically :
    let checkedJson :=
      Json.mkObj
        [ ("kind", toJson "userTask")
        , ("id", toJson "UserTask_Approve")
        , ("name", toJson (some "Approve" : Option String)) ]
    let taskJson :=
      Json.mkObj
        [ ("elementId", toJson "UserTask_Approve")
        , ("name", toJson (some "Approve" : Option String)) ]
    let openTask : OpenUserTask :=
      { id := SequentialUserTask.exactTaskInstanceId
        name := some "Approve"
        state := .active }
    decodingAccepted (decodeCheckedUserTask checkedJson)
        (.userTask ⟨"UserTask_Approve"⟩ (some "Approve")) = true ∧
      decodingAccepted (decodeTaskDefinition taskJson)
        { id := ⟨"UserTask_Approve"⟩, name := some "Approve" } = true ∧
      optionalFieldAbsent
          (BpmnSemantics.SemanticProcessJsonMain.encodeOpenUserTask openTask)
          "metadata" = true := by
  decide +kernel

/-- Any two admitted metadata values leave completion admission, variable merge, and continuation equal. -/
theorem completion_is_metadata_irrelevant
    (leftMetadata rightMetadata : UserTaskMetadata)
    (_leftAdmitted : leftMetadata.wellFormed = true)
    (_rightAdmitted : rightMetadata.wellFormed = true)
    (commandId : SemanticId) (submittedValues : List VariableBinding)
    (valuesAdmitted : processDataBindingsAdmitted
      userTaskAssignmentFormMetadataProfileId .userTaskCompletion submittedValues = true) :
    applyStimulus scenarioClosureLimit (programFor exactMetadata)
        (waitingStateFor leftMetadata)
        (.completeUserTaskInstance commandId SequentialUserTask.exactTaskInstanceId
          submittedValues) =
      applyStimulus scenarioClosureLimit (programFor exactMetadata)
        (waitingStateFor rightMetadata)
        (.completeUserTaskInstance commandId SequentialUserTask.exactTaskInstanceId
          submittedValues) := by
  let successor : RuntimeState :=
    { BooleanProcessDataConformance.waitingState with
      waits := []
      tokens := addToken BooleanProcessDataConformance.waitingState.tokens
        SequentialUserTask.exactWait.output SequentialUserTask.exactWait.owner }
  apply user_task_completion_with_same_successor_is_equal
    (successor := successor)
  · simpa [waitingStateFor] using
      (show BooleanProcessDataConformance.waitingState.control =
        .running SequentialUserTask.exactTaskInstanceId.processInstanceId by
        decide +kernel)
  · simpa [waitingStateFor] using
      (show BooleanProcessDataConformance.waitingState.control =
        .running SequentialUserTask.exactTaskInstanceId.processInstanceId by
        decide +kernel)
  · decide +kernel
  · decide +kernel
  · simpa [programFor, checkedProcessFor, lowerCheckedProcess] using valuesAdmitted
  · simp [completeUserTask, waitingStateFor, waitFor, taskDefinitionFor,
      SequentialUserTask.exactWait, SequentialUserTask.exactTaskInstanceId,
      successor]
  · simp [completeUserTask, waitingStateFor, waitFor, taskDefinitionFor,
      SequentialUserTask.exactWait, SequentialUserTask.exactTaskInstanceId,
      successor]

/-- A wrong occurrence preserves the complete metadata-bearing state. -/
theorem wrong_occurrence_preserves_full_metadata_state :
    applyStimulus scenarioClosureLimit (programFor exactMetadata)
        (waitingStateFor exactMetadata)
        (.completeUserTaskInstance ⟨"wrong-activation"⟩
          { SequentialUserTask.exactTaskInstanceId with activation := 2 }
          [{ name := "decision", value := .boolean true }]) =
      { outcome := .rejected
        state := waitingStateFor exactMetadata
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- A Boolean inadmissible under the earlier profile preserves the complete metadata-bearing state. -/
theorem inadmissible_boolean_profile_preserves_full_metadata_state :
    let oldProgram :=
      { programFor exactMetadata with identity := sequentialProgram.identity }
    applyStimulus scenarioClosureLimit oldProgram
        (waitingStateFor exactMetadata) booleanCompletion =
      { outcome := .rejected
        state := waitingStateFor exactMetadata
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- The metadata profile composes the existing Boolean completion value policy and unchanged closure. -/
theorem boolean_completion_result_and_finite_closure_are_unchanged :
    variableValueAdmitted userTaskAssignmentFormMetadataProfileId
        .userTaskCompletion (.boolean true) = true ∧
      applyStimulus scenarioClosureLimit (programFor exactMetadata)
          (waitingStateFor exactMetadata) booleanCompletion =
        applyStimulus scenarioClosureLimit
          BooleanProcessDataConformance.checkpointProgram
          BooleanProcessDataConformance.waitingState booleanCompletion ∧
      (applyStimulus scenarioClosureLimit (programFor exactMetadata)
          (waitingStateFor exactMetadata) booleanCompletion).internalStepBoundExceeded = false ∧
      (applyStimulus scenarioClosureLimit (programFor exactMetadata)
          (waitingStateFor exactMetadata) booleanCompletion).ambiguousInternalChoice = false := by
  decide +kernel

end BpmnSemantics.UserTaskMetadataConformance
