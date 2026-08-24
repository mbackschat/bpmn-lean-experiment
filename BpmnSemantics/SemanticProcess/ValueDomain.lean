import BpmnSemantics.SemanticProcess.JsonSupport

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
  deriving Repr, DecidableEq

private inductive ProcessDataValueDomain where
  | empty
  | stringOnly
  | stringListOnly
  | stringNull
  | stringNullBoolean
  | structuredHumanWork

@[simp] private abbrev profileIsOneOf (profile : ProfileId) (ids : List String) : Bool :=
  ids.any fun id => profile.value == id

/-- Closed profile-by-surface value-domain selection. Unlisted and unknown profiles admit only an empty patch. -/
@[simp] private abbrev profileValueDomain (profile : ProfileId) :
    ProcessDataIngress → ProcessDataValueDomain
  | .processStart =>
      if profile.value =
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
          , structuredHumanWorkProfileId.value ] then
        .stringNull
      else
        .empty
  | .userTaskCompletion =>
      if profileIsOneOf profile
          [ "cibseven-2.2.0-user-task-process-data-draft"
          , userTaskProcessDataPreservedNotationProfileId.value
          , "bpmn-2.0.2-user-task-cycle-draft" ] then
        .stringNull
      else if profileIsOneOf profile
          [ booleanProcessDataCheckpointProfileId.value
          , userTaskAssignmentFormMetadataProfileId.value
          , parallelUserTaskMetadataCheckpointProfileId.value ] then
        .stringNullBoolean
      else if profile = structuredHumanWorkProfileId then
        .structuredHumanWork
      else
        .empty

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
  | .structuredHumanWork, .string _
  | .structuredHumanWork, .null
  | .structuredHumanWork, .boolean _ => true
  | .structuredHumanWork, value@(.integer _)
  | .structuredHumanWork, value@(.stringList _) =>
      BpmnSemantics.SemanticProcessJson.variableValueWellFormed value
  | _, _ => false

/-- A submitted patch is admitted only when every value belongs to the exact surface/profile domain. -/
def processDataBindingsAdmitted (profile : ProfileId)
    (surface : ProcessDataIngress) (bindings : List VariableBinding) : Bool :=
  bindings.all fun binding => variableValueAdmitted profile surface binding.value

end BpmnSemantics.SemanticProcess
