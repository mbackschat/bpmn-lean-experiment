module

public import BpmnSemantics.SemanticProcess.CallDataAdmission
public import BpmnSemantics.SemanticProcess.JsonSupport
public import BpmnSemantics.SemanticProcess.MessageKeyCorrelationProfileAdmission
public import BpmnSemantics.SemanticProcess.StructuredCompositionAdmission
public import BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
public import BpmnSemantics.SemanticProcess.PropertyPathValuePolicy
public import BpmnSemantics.SemanticProcess.EffectMappingValuePolicy

/-! # Semantic Process value-domain admission

This module owns the profile-sensitive boundary between the shared typed variable domain and the two external Process-data ingress surfaces. It does not define variable merge, effect mapping, or control-flow expression behavior.
-/

@[expose] public section

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

/-- Runtime-frozen identity of the structured Message-payload profile: the payload-catch source with a
`SingletonBusinessItem` payload port (PBV-MSG-01). -/
abbrev portableMessagePayloadProfileId : ProfileId :=
  ⟨"bpmn-2.0.2-portable-business-message-payload-draft"⟩

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

inductive ProcessDataValueDomain where
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

@[simp] abbrev profileIsOneOf (profile : ProfileId) (ids : List String) : Bool :=
  ids.any fun id => profile.value == id

/-- Closed profile-by-surface value-domain selection. Unlisted and unknown profiles admit only an empty patch. -/
@[simp] abbrev profileValueDomain (profile : ProfileId) :
    ProcessDataIngress → ProcessDataValueDomain
  | .processStart =>
      if profile = portableHandoffProfileId ∨ profile = nestedScopeDataProfileId then
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
      if profile = portableHandoffProfileId ∨ profile = nestedScopeDataProfileId then
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
      if profile = portableMessagePayloadProfileId then .singletonBusinessItem
      else if profile = messagePayloadCatchProfileId ||
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
    (other : profile ≠ portableHandoffProfileId) (otherNested : profile ≠ nestedScopeDataProfileId) :
    profileValueDomain profile .processStart ≠ .singletonBusinessItem := by
  simp only [profileValueDomain, other, otherNested, or_self, ↓reduceIte] <;> repeat' split
  all_goals exact fun same => by cases same

private theorem userTaskCompletion_domain_ne_singleton (profile : ProfileId)
    (other : profile ≠ portableHandoffProfileId) (otherNested : profile ≠ nestedScopeDataProfileId) :
    profileValueDomain profile .userTaskCompletion ≠ .singletonBusinessItem := by
  simp only [profileValueDomain, other, otherNested, or_self, ↓reduceIte] <;> repeat' split
  all_goals exact fun same => by cases same

private theorem messagePayload_domain_ne_singleton (profile : ProfileId)
    (other : profile ≠ portableMessagePayloadProfileId) :
    profileValueDomain profile .messagePayload ≠ .singletonBusinessItem := by
  simp only [profileValueDomain, other, ↓reduceIte] <;> repeat' split
  all_goals exact fun same => by cases same

/-- PBV-INGRESS-01: no profile domain other than the portable handoff's, the nested scope-data
profile's and the structured Message-payload profile's admits a portable Decimal, List or Map at any
Process-data ingress surface, so schema recognition alone cannot widen an existing profile. Effect
results are outside `ProcessDataIngress` and governed by `EffectMappingValuePolicy`. -/
theorem portable_arms_not_admitted_by_current_profiles (profile : ProfileId)
    (other : profile ≠ portableHandoffProfileId)
    (otherNested : profile ≠ nestedScopeDataProfileId)
    (otherPayload : profile ≠ portableMessagePayloadProfileId)
    (surface : ProcessDataIngress) (coefficient : Int) (scale : Nat)
    (members : List BusinessValue) (entries : List (String × BusinessValue)) :
    variableValueAdmitted profile surface (.decimal coefficient scale) = false ∧
      variableValueAdmitted profile surface (.list members) = false ∧
      variableValueAdmitted profile surface (.map entries) = false := by
  have selected : profileValueDomain profile surface ≠ .singletonBusinessItem := by
    cases surface
    · exact processStart_domain_ne_singleton profile other otherNested
    · exact userTaskCompletion_domain_ne_singleton profile other otherNested
    · exact messagePayload_domain_ne_singleton profile otherPayload
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
    messagePayloadCatchProfileId, messageKeyCorrelationProfileId, portableMessagePayloadProfileId]

/-- PBV-MSG-01: the structured Message-payload profile selects `SingletonBusinessItem` at Message
ingress alone: a well-formed value whose root the port admits, so a root List, a root `stringList`
and a root String over 1,024 UTF-8 bytes are refused, while Start and User Task completion stay
empty. -/
theorem portableMessagePayload_value_domain (value : VariableValue) :
    variableValueAdmitted portableMessagePayloadProfileId .messagePayload value =
        (PropertyPathValuePolicy.singletonBusinessItem.admits value &&
          BpmnSemantics.SemanticProcessJson.variableValueWellFormed value) ∧
      variableValueAdmitted portableMessagePayloadProfileId .processStart value = false ∧
      variableValueAdmitted portableMessagePayloadProfileId .userTaskCompletion value = false := by
  unfold variableValueAdmitted
  refine ⟨?_, ?_, ?_⟩ <;> simp [profileValueDomain, portableHandoffProfileId, nestedScopeDataProfileId,
    portableMessagePayloadProfileId]

end BpmnSemantics.SemanticProcess
