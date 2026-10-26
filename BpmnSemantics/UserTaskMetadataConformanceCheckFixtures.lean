module

public import BpmnSemantics.SemanticProcessJson.CheckedProcess
public import BpmnSemantics.SemanticProcessJson.Program
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
import all Lean.Data.Json.Elab
import all Lean.Data.Json.FromToJson
import all Lean.Data.Json.FromToJson.Basic
import all Lean.Data.Json.FromToJson.Extra
import all Lean.Data.Json.Parser
import all Lean.Data.Json.Printer
import all Lean.Data.Json.Stream
public import BpmnSemantics.BooleanProcessDataConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.ControlPosition
public import BpmnSemantics.SemanticProcessJson.Observation

/-! # UserTaskMetadataConformance check fixtures

The fixture definitions and executable checks of [`UserTaskMetadataConformance`](UserTaskMetadataConformance.lean), apart from its proofs, so the conformance check driver runs them without loading a proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)).
-/

@[expose] public section

namespace BpmnSemantics.UserTaskMetadataConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson
open Lean

def exactMetadata : UserTaskMetadata :=
  { assignment :=
      { candidates := [{ kind := .group, id := "reviewers" }] }
    form :=
      some ({ fields := [{ key := "approved", type := .boolean }] } :
        UserTaskFormMetadata) }

def changedCandidateMetadata : UserTaskMetadata :=
  { exactMetadata with
    assignment :=
      { candidates := [{ kind := .group, id := "reviewers-east" }] } }

def changedFieldKeyMetadata : UserTaskMetadata :=
  { exactMetadata with
    form := some ({ fields := [{ key := "decision", type := .boolean }] } :
      UserTaskFormMetadata) }

def changedFieldTypeMetadata : UserTaskMetadata :=
  { exactMetadata with
    form := some ({ fields := [{ key := "approved", type := .string }] } :
      UserTaskFormMetadata) }

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

def decodingRejected (result : Except String α) : Bool :=
  match result with
  | .ok _ => false
  | .error _ => true

def decodingAccepted [DecidableEq α]
    (result : Except String α) (expected : α) : Bool :=
  match result with
  | .ok actual => decide (actual = expected)
  | .error _ => false

def optionalFieldAbsent (json : Json) (key : String) : Bool :=
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
def exact_metadata_is_well_formed : Bool := decide <|
    exactMetadata.wellFormed = true
/-- The boundary-space predicate is the exact selected code-point union, including non-ASCII spaces. -/
def boundary_space_set_has_exact_representative_edges : Bool := decide <|
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
      UserTaskMetadata.boundarySpaceCodePoint 0xff00 = false
/-- Empty, multiple, comma-list, expression, and incomplete metadata shapes refuse uniformly. -/
def strict_metadata_shape_rejects_broader_values : Bool := decide <|
    ({ exactMetadata with assignment := { candidates := [] }} : UserTaskMetadata).wellFormed = false ∧
      ({ exactMetadata with assignment :=
          { candidates :=
              [{ kind := .group, id := "a" }, { kind := .group, id := "b" }] }} :
        UserTaskMetadata).wellFormed = false ∧
      UserTaskMetadata.candidateIdWellFormed "a,b" = false ∧
      UserTaskMetadata.candidateIdWellFormed "${group}" = false ∧
      UserTaskMetadata.candidateIdWellFormed "#{group}" = false ∧
      ({ exactMetadata with form :=
          (some ({ fields := [] } : UserTaskFormMetadata)) } :
        UserTaskMetadata).wellFormed = false ∧
      ({ exactMetadata with form :=
          (some ({ fields :=
              [{ key := "a", type := .string },
                { key := "b", type := .boolean }] } :
            UserTaskFormMetadata)) } :
        UserTaskMetadata).wellFormed = false
/-- Leading U+00A0 refuses as decoded content rather than being trimmed into another identity. -/
def nonbreaking_space_boundary_refuses_without_normalization : Bool := decide <|
    UserTaskMetadata.candidateIdWellFormed "\u00a0reviewers" = false ∧
      let metadata :=
        { exactMetadata with assignment :=
            { candidates := [{ kind := .group, id := "\u00a0reviewers" }] } }
      metadata.wellFormed = false ∧
        decodingRejected (decodeUserTaskMetadata (encodeUserTaskMetadata metadata)) = true
/-- The checkpoint profile admits the exact sequential checked graph and lowered acyclic program. -/
def checkpoint_profile_admits_exact_checked_and_program_shapes : Bool := decide <|
    checkedWellFormed (checkedProcessFor exactMetadata) = true ∧
      programWellFormed (programFor exactMetadata) = true ∧
      checkedProfileCapabilitiesValid (checkedProcessFor exactMetadata) = true ∧
      programProfileCapabilitiesValid (programFor exactMetadata) = true ∧
      profileGraphPolicy? userTaskAssignmentFormMetadataProfileId.value = some .acyclic
/-- The same metadata-bearing definitions are excluded from every earlier data-only profile. -/
def old_profile_excludes_metadata_at_both_definition_boundaries : Bool := decide <|
    let checked :=
      { checkedProcessFor exactMetadata with
        identity := sequentialCheckedProcess.identity }
    let program := lowerCheckedProcess checked
    checkedWellFormed checked = false ∧
      checkedProfileCapabilitiesValid checked = false ∧
      programProfileCapabilitiesValid program = false
/-- Runtime activation copies metadata into both the task definition and semantic wait. -/
def wait_creation_copies_exact_metadata : Bool := decide <|
    applyStimulus scenarioClosureLimit (programFor exactMetadata) initialState startStimulus =
      { outcome := .committed
        state := waitingStateFor exactMetadata
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }
/-- Candidate identity remains structurally unequal through checked, IL, wait, and observation values. -/
def candidate_identity_mutation_remains_unequal : Bool := decide <|
    exactMetadata ≠ changedCandidateMetadata ∧
      metadataCheckedTask exactMetadata ≠
        metadataCheckedTask changedCandidateMetadata ∧
      operationFor exactMetadata ≠ operationFor changedCandidateMetadata ∧
      waitFor exactMetadata ≠ waitFor changedCandidateMetadata ∧
      openTaskFor exactMetadata ≠ openTaskFor changedCandidateMetadata
/-- Field identity remains structurally unequal through checked, IL, wait, and observation values. -/
def field_key_mutation_remains_unequal : Bool := decide <|
    exactMetadata ≠ changedFieldKeyMetadata ∧
      metadataCheckedTask exactMetadata ≠ metadataCheckedTask changedFieldKeyMetadata ∧
      operationFor exactMetadata ≠ operationFor changedFieldKeyMetadata ∧
      waitFor exactMetadata ≠ waitFor changedFieldKeyMetadata ∧
      openTaskFor exactMetadata ≠ openTaskFor changedFieldKeyMetadata
/-- Field type remains structurally unequal through checked, IL, wait, and observation values. -/
def field_type_mutation_remains_unequal : Bool := decide <|
    exactMetadata ≠ changedFieldTypeMetadata ∧
      metadataCheckedTask exactMetadata ≠ metadataCheckedTask changedFieldTypeMetadata ∧
      operationFor exactMetadata ≠ operationFor changedFieldTypeMetadata ∧
      waitFor exactMetadata ≠ waitFor changedFieldTypeMetadata ∧
      openTaskFor exactMetadata ≠ openTaskFor changedFieldTypeMetadata
/-- Strict checked, IL, and metadata decoders accept only the complete exact-key shape. -/
def strict_json_accepts_exact_metadata_shape : Bool := decide <|
    decodingAccepted (decodeUserTaskMetadata exactMetadataJson) exactMetadata = true ∧
      decodingAccepted (decodeCheckedUserTask checkedTaskJson)
        (metadataCheckedTask exactMetadata) = true ∧
      decodingAccepted (decodeTaskDefinition taskDefinitionJson)
        (taskDefinitionFor exactMetadata) = true
/-- A Boolean inadmissible under the earlier profile preserves the complete metadata-bearing state. -/
def inadmissible_boolean_profile_preserves_full_metadata_state : Bool := decide <|
    let oldProgram :=
      { programFor exactMetadata with identity := sequentialProgram.identity }
    applyStimulus scenarioClosureLimit oldProgram
        (waitingStateFor exactMetadata) booleanCompletion =
      { outcome := .rejected
        state := waitingStateFor exactMetadata
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }
/-- The metadata profile composes the existing Boolean completion value policy and unchanged closure. -/
def boolean_completion_result_and_finite_closure_are_unchanged : Bool := decide <|
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
          (waitingStateFor exactMetadata) booleanCompletion).ambiguousInternalChoice = false

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("exact_metadata_is_well_formed", exact_metadata_is_well_formed),
  ("boundary_space_set_has_exact_representative_edges", boundary_space_set_has_exact_representative_edges),
  ("strict_metadata_shape_rejects_broader_values", strict_metadata_shape_rejects_broader_values),
  ("nonbreaking_space_boundary_refuses_without_normalization", nonbreaking_space_boundary_refuses_without_normalization),
  ("checkpoint_profile_admits_exact_checked_and_program_shapes", checkpoint_profile_admits_exact_checked_and_program_shapes),
  ("old_profile_excludes_metadata_at_both_definition_boundaries", old_profile_excludes_metadata_at_both_definition_boundaries),
  ("wait_creation_copies_exact_metadata", wait_creation_copies_exact_metadata),
  ("candidate_identity_mutation_remains_unequal", candidate_identity_mutation_remains_unequal),
  ("field_key_mutation_remains_unequal", field_key_mutation_remains_unequal),
  ("field_type_mutation_remains_unequal", field_type_mutation_remains_unequal),
  ("strict_json_accepts_exact_metadata_shape", strict_json_accepts_exact_metadata_shape),
  ("inadmissible_boolean_profile_preserves_full_metadata_state", inadmissible_boolean_profile_preserves_full_metadata_state),
  ("boolean_completion_result_and_finite_closure_are_unchanged", boolean_completion_result_and_finite_closure_are_unchanged)
]

end BpmnSemantics.UserTaskMetadataConformance
