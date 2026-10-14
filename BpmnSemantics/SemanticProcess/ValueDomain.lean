import BpmnSemantics.SemanticProcess.CallDataAdmission
import BpmnSemantics.SemanticProcess.JsonSupport
import BpmnSemantics.SemanticProcess.MessageKeyCorrelationProfileAdmission
import BpmnSemantics.SemanticProcess.StructuredCompositionAdmission
import BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import BpmnSemantics.SemanticProcess.PropertyPathValuePolicy
import BpmnSemantics.SemanticProcess.EffectMappingValuePolicy

/-! # Semantic Process value-domain admission

This module owns the profile-sensitive boundary between the shared typed variable domain and the two external Process-data ingress surfaces. It does not define variable merge, effect mapping, or control-flow expression behavior.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Runtime-frozen profile identity used only by the owner-approved Boolean Process-data semantic checkpoint. -/
abbrev booleanProcessDataCheckpointProfileId : ProfileId :=
  ⟨"cibseven-2.2.0-user-task-boolean-completion-data-draft"⟩

/-- Runtime-frozen identity for the registered User Task assignment/form metadata profile. -/
abbrev userTaskAssignmentFormMetadataProfileId : ProfileId :=
  ⟨"cibseven-2.2.0-user-task-assignment-form-metadata-draft"⟩

/-- Runtime-frozen identity for the owner-approved parallel User Task metadata checkpoint. -/
abbrev parallelUserTaskMetadataCheckpointProfileId : ProfileId :=
  ⟨"cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft"⟩

/-- Runtime-frozen identity of the owner-approved Activity data-input checkpoint. -/
abbrev activityDataInputUserTaskProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-activity-data-input-user-task-draft"⟩

/-- Runtime-frozen identity of the approved composed Activity data checkpoint. -/
abbrev activityDataInputOutputUserTaskProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-activity-data-input-output-user-task-draft"⟩

/-- Runtime-frozen identity of the owner-approved Activity data-output checkpoint. -/
abbrev activityDataOutputUserTaskProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-activity-data-output-user-task-draft"⟩

/-- Runtime-frozen identity of the approved Message payload Catch Event profile. -/
abbrev messagePayloadCatchProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-message-payload-catch-draft"⟩

/-- Runtime-frozen identity of the owner-approved Compensation source checkpoint. -/
abbrev compensationSourceCheckpointProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-compensation-source-checkpoint-draft"⟩

/-- Runtime-frozen identity for the owner-approved structured Human Work profile. -/
abbrev structuredHumanWorkProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-bpmn-lean-structured-human-work-draft"⟩

/-- Runtime-frozen identity for Process data composed with preserved standard notation. -/
abbrev userTaskProcessDataPreservedNotationProfileId : ProfileId :=
  ⟨"cibseven-2.2.0-user-task-process-data-preserved-notation-draft"⟩

/-- External Process-data surfaces whose admitted value domains differ in the selected checkpoint. -/
inductive ProcessDataIngress where
  | processStart
  | userTaskCompletion
  | messagePayload
  deriving Repr, DecidableEq

private inductive ProcessDataValueDomain where
  | empty
  | stringOnly
  | stringListOnly
  | stringNull
  | stringNullBoolean
  | stringNullBooleanList
  | scalar
  | structuredHumanWork
  | singletonBusinessItem
  /-- Start of the structured effect-data profile: String or Null under the item policy's root String bound. -/
  | stringNullItemBound

@[simp] private abbrev profileIsOneOf (profile : ProfileId) (ids : List String) : Bool :=
  ids.any fun id => profile.value == id

/-- Closed profile-by-surface value-domain selection. Unlisted and unknown profiles admit only an empty patch. -/
@[simp] private abbrev profileValueDomain (profile : ProfileId) :
    ProcessDataIngress → ProcessDataValueDomain
  | .processStart =>
      if profile = portableHandoffProfileId then
        .singletonBusinessItem
      else if profile.value = "cibseven-2.2.0-sequential-multi-instance-subprocess-draft" then
        .stringNullBooleanList
      else if profile = compensationSourceCheckpointProfileId then
        .stringOnly
      else if profile.value =
          "bpmn-2.0.2-sequential-multi-instance-user-task-draft" then
        .stringListOnly
      else if profile.value =
          "cibseven-2.2.0-service-task-incident-cancellation-draft" then
        .stringOnly
      else if profileIsOneOf profile
          [ "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft"
          , "bpmn-2.0.2-inclusive-gateway-selected-branches-draft"
          , "cibseven-2.2.0-user-task-process-data-draft"
          , userTaskProcessDataPreservedNotationProfileId.value
          , booleanProcessDataCheckpointProfileId.value
          , userTaskAssignmentFormMetadataProfileId.value
          -- Explicit null is admitted here because absence and null are different pre-states for a
          -- required Data Input, and the completion surface stays empty because this profile's
          -- OutputSet selects no output mediation at all.
          , activityDataInputUserTaskProfileId.value
          , activityDataInputOutputUserTaskProfileId.value
          , callDataCheckpointProfileId.value
          , mixedTaskControlFlowProfileId.value
          , mixedTaskBusinessErrorProfileId.value
          , serialBusinessTaskProfileId.value
          , structuredCompositionCheckpointProfileId.value
          , structuredHumanWorkProfileId.value ] then
        .stringNull
      else if profile = portableEffectDataProfileId then
        .stringNullItemBound
      else
        .empty
  | .userTaskCompletion =>
      if profile = portableHandoffProfileId then
        .singletonBusinessItem
      else if profileIsOneOf profile
          [ "cibseven-2.2.0-user-task-process-data-draft"
          , userTaskProcessDataPreservedNotationProfileId.value
          -- A supplied null makes the single required Data Output available exactly as a supplied
          -- String does, and the start surface stays empty because this profile declares no input
          -- mediation at all.
          , activityDataOutputUserTaskProfileId.value
          , activityDataInputOutputUserTaskProfileId.value
          , callDataCheckpointProfileId.value
          , mixedTaskControlFlowProfileId.value
          , mixedTaskBusinessErrorProfileId.value
          , serialBusinessTaskProfileId.value
          , structuredCompositionCheckpointProfileId.value
          , "bpmn-2.0.2-user-task-cycle-draft" ] then
        .stringNull
      else if profileIsOneOf profile
          [ booleanProcessDataCheckpointProfileId.value
          , "cibseven-2.2.0-sequential-multi-instance-subprocess-draft"
          , userTaskAssignmentFormMetadataProfileId.value
          , parallelUserTaskMetadataCheckpointProfileId.value ] then
        .stringNullBoolean
      else if profile = structuredHumanWorkProfileId then
        .structuredHumanWork
      else
        .empty
  | .messagePayload =>
      if profile = messagePayloadCatchProfileId ||
          profile = messageKeyCorrelationProfileId then .scalar else .empty

/-- Decide whether one typed value is admitted at an external Process-data surface under an exact profile. -/
def variableValueAdmitted (profile : ProfileId) (surface : ProcessDataIngress)
    (value : VariableValue) : Bool :=
  match profileValueDomain profile surface, value with
  | .empty, _ => false
  | .stringOnly, .string _ => true
  | .stringListOnly, .stringList _ => true
  | .stringNull, .string _
  | .stringNull, .null => true
  | .stringNullBoolean, .string _
  | .stringNullBoolean, .null
  | .stringNullBoolean, .boolean _ => true
  | .stringNullBooleanList, .string _
  | .stringNullBooleanList, .null
  | .stringNullBooleanList, .boolean _
  | .stringNullBooleanList, .stringList _ => true
  | .scalar, .string _
  | .scalar, .boolean _
  | .scalar, .integer _
  | .scalar, .null => true
  | .structuredHumanWork, .string _
  | .structuredHumanWork, .null
  | .structuredHumanWork, .boolean _ => true
  | .structuredHumanWork, value@(.integer _)
  | .structuredHumanWork, value@(.stringList _) =>
      BpmnSemantics.SemanticProcessJson.variableValueWellFormed value
  | .singletonBusinessItem, value =>
      PropertyPathValuePolicy.singletonBusinessItem.admits value &&
        BpmnSemantics.SemanticProcessJson.variableValueWellFormed value
  | .stringNullItemBound, value@(.string _)
  | .stringNullItemBound, value@.null => EffectMappingValuePolicy.singletonBusinessItem.admits true value
  | _, _ => false

/-- A submitted patch is admitted only when every value belongs to the exact surface/profile domain. -/
def processDataBindingsAdmitted (profile : ProfileId)
    (surface : ProcessDataIngress) (bindings : List VariableBinding) : Bool :=
  bindings.all fun binding => variableValueAdmitted profile surface binding.value

/-- Each surface's chain is a separate lemma so that a new profile row costs one chain's elaboration, not three. -/
private theorem processStart_domain_ne_singleton (profile : ProfileId)
    (other : profile ≠ portableHandoffProfileId) :
    profileValueDomain profile .processStart ≠ .singletonBusinessItem := by
  simp only [profileValueDomain, other, ↓reduceIte] <;> repeat' split
  all_goals exact fun same => by cases same

private theorem userTaskCompletion_domain_ne_singleton (profile : ProfileId)
    (other : profile ≠ portableHandoffProfileId) :
    profileValueDomain profile .userTaskCompletion ≠ .singletonBusinessItem := by
  simp only [profileValueDomain, other, ↓reduceIte] <;> repeat' split
  all_goals exact fun same => by cases same

private theorem messagePayload_domain_ne_singleton (profile : ProfileId) :
    profileValueDomain profile .messagePayload ≠ .singletonBusinessItem := by
  simp only [profileValueDomain] <;> repeat' split
  all_goals exact fun same => by cases same

/-- PBV-INGRESS-01: no profile domain other than the portable handoff's admits a portable Decimal,
List or Map at any surface, so schema recognition alone cannot widen an existing profile. -/
theorem portable_arms_not_admitted_by_current_profiles (profile : ProfileId)
    (other : profile ≠ portableHandoffProfileId)
    (surface : ProcessDataIngress) (coefficient : Int) (scale : Nat)
    (members : List BusinessValue) (entries : List (String × BusinessValue)) :
    variableValueAdmitted profile surface (.decimal coefficient scale) = false ∧
      variableValueAdmitted profile surface (.list members) = false ∧
      variableValueAdmitted profile surface (.map entries) = false := by
  have selected : profileValueDomain profile surface ≠ .singletonBusinessItem := by
    cases surface
    · exact processStart_domain_ne_singleton profile other
    · exact userTaskCompletion_domain_ne_singleton profile other
    · exact messagePayload_domain_ne_singleton profile
  unfold variableValueAdmitted
  -- `profileValueDomain` is a simp abbreviation, so it is abstracted before simp can expand every row.
  generalize profileValueDomain profile surface = domain at selected ⊢
  cases domain <;> first | exact absurd rfl selected | simp

/-- The handoff profile selects `SingletonBusinessItem` at Start and User Task completion only: a
well-formed value whose root the Property-path policy admits. A root List is refused there and every
value is refused at Message ingress. -/
theorem portableHandoff_value_domain (value : VariableValue) :
    variableValueAdmitted portableHandoffProfileId .processStart value =
        (PropertyPathValuePolicy.singletonBusinessItem.admits value &&
          BpmnSemantics.SemanticProcessJson.variableValueWellFormed value) ∧
      variableValueAdmitted portableHandoffProfileId .userTaskCompletion value =
        (PropertyPathValuePolicy.singletonBusinessItem.admits value &&
          BpmnSemantics.SemanticProcessJson.variableValueWellFormed value) ∧
      variableValueAdmitted portableHandoffProfileId .messagePayload value = false := by
  unfold variableValueAdmitted
  refine ⟨?_, ?_, ?_⟩ <;> simp [profileValueDomain, portableHandoffProfileId,
    messagePayloadCatchProfileId, messageKeyCorrelationProfileId]

end BpmnSemantics.SemanticProcess
