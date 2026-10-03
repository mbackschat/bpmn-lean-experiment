import BpmnSemantics.SemanticProcess.ProcessInterfaceRuntime

/-! # Owned Activity data endpoints

These pure selectors and writers implement CDATA-OWNER-01 and CDATA-OUTPUT-01. Caller Properties
are available only to the hosting instance; Process ports belong to the complete selected scope.
No endpoint falls back to another store, and no write changes Activity-local bindings.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def activityDataPropertyOwner (state : RuntimeState) (owner : ScopeOccurrenceId) : Bool :=
  match state.control with
  | .running instanceId => decide (owner.processInstanceId = instanceId)
  | _ => false

def readActivityDataInput? (state : RuntimeState) (owner : ScopeOccurrenceId)
    (input : DirectActivityDataInput) : Option VariableBinding :=
  match input.source with
  | .property propertyId =>
      if activityDataPropertyOwner state owner then
        match state.variables.process.bindings.filter fun binding => decide (binding.name = propertyId) with
        | [binding] => if processInterfaceScalar binding.value then some binding else none
        | _ => none
      else none
  | .processDataInput dataInputId =>
      readProcessInterfaceInput? state.variables owner dataInputId

/-- The destination variables may already have their selected Activity local removed. The original
state supplies only hosting ownership; returning `none` commits neither routing nor disposal. -/
def writeActivityDataOutput? (state : RuntimeState) (owner : ScopeOccurrenceId)
    (variables : ScopedVariables) (output : DirectActivityDataOutput)
    (filled : VariableBinding) : Option ScopedVariables :=
  if processInterfaceScalar filled.value then
    match output.target with
    | .property propertyId =>
        if activityDataPropertyOwner state owner then
          some { variables with process := { bindings :=
            (mergeProcessVariableBindings variables.process.bindings
              [{ name := propertyId, value := filled.value }]) } }
        else none
    | .processDataOutput dataOutputId =>
        writeProcessInterfaceOutput? variables owner { name := dataOutputId, value := filled.value }
  else none

end BpmnSemantics.SemanticProcess
