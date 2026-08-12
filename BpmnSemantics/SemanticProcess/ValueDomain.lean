import BpmnSemantics.SemanticProcessContract

/-! # Semantic Process value-domain admission

This module owns the profile-sensitive boundary between the shared typed variable domain and the two external Process-data ingress surfaces. It does not define variable merge, effect mapping, or control-flow expression behavior.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Runtime-frozen profile identity used only by the owner-approved Boolean Process-data semantic checkpoint. -/
def booleanProcessDataCheckpointProfileId : ProfileId :=
  ⟨"cibseven-2.2.0-user-task-boolean-completion-data-draft"⟩

/-- External Process-data surfaces whose admitted value domains differ in the selected checkpoint. -/
inductive ProcessDataIngress where
  | processStart
  | userTaskCompletion
  deriving Repr, DecidableEq

/-- Decide whether one typed value is admitted at an external Process-data surface under an exact profile. -/
def variableValueAdmitted (profile : ProfileId) (surface : ProcessDataIngress) :
    VariableValue → Bool
  | .string _
  | .null => true
  | .boolean _ =>
      surface = .userTaskCompletion &&
        profile = booleanProcessDataCheckpointProfileId

/-- A submitted patch is admitted only when every value belongs to the exact surface/profile domain. -/
def processDataBindingsAdmitted (profile : ProfileId)
    (surface : ProcessDataIngress) (bindings : List VariableBinding) : Bool :=
  bindings.all fun binding => variableValueAdmitted profile surface binding.value

end BpmnSemantics.SemanticProcess
