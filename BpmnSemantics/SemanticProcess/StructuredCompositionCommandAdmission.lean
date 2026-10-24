module

public import BpmnSemantics.SemanticProcess.ValueDomain

/-! SPC-AVAILABLE-01 binds starts to the independently computed input requirements. SPC-COMMAND-01 prevents the profile's scalar completion domain from granting ordinary tasks a Process-data write. Composed completion retains its existing declaration-bound output validation. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

def structuredCompositionStartBindingsAdmitted (program : Program)
    (bindings : List VariableBinding) : Bool :=
  match StructuredComposition.programAnalysis program with
  | none => false
  | some analysis =>
      analysis.maximumBurst ≤ scenarioClosureLimit &&
        SemanticProcessJson.bindingNamesStrictlyIncrease bindings &&
        bindings.all (fun binding => !binding.name.isEmpty) &&
        processDataBindingsAdmitted program.identity.semanticProfile .processStart bindings &&
        analysis.required.all (fun name => bindings.any (·.name == name))

def structuredCompositionOrdinaryCompletionAdmitted (program : Program)
    (taskId : UserTaskInstanceId) (bindings : List VariableBinding) : Bool :=
  if program.identity.semanticProfile != structuredCompositionCheckpointProfileId then true
  else bindings.isEmpty &&
    (program.operations.filter fun op => match op with
      | .awaitUserTask _ _ _ _ task => task.id.value == taskId.elementId.value
      | _ => false).length == 1

def structuredCompositionScenarioStartAdmitted (program : Program)
    (stimuli : List Stimulus) : Bool :=
  if program.identity.semanticProfile != structuredCompositionCheckpointProfileId then true
  else match stimuli with
    | .startProcess _ _ _ bindings :: _ => structuredCompositionStartBindingsAdmitted program bindings
    | _ => false

end BpmnSemantics.SemanticProcess
