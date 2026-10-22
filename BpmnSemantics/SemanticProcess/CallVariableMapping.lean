import BpmnSemantics.SemanticProcess.CallDataTransfer
import BpmnSemantics.SemanticProcess.NestedScopeData

/-! # CIB Call variable mappings

`camunda:in`/`camunda:out` copies across the instance boundary, per the
[Call variable mapping proposal](../../docs/capsules/CALL-VARIABLE-MAPPING-PROPOSAL.md#stable-rules).
Invocation installs the called-root frame, which stands in for the called instance's Process store;
return reads every output from that frame before the called tree is disposed and writes them by
NSD-WRITE-01 from the Call's enclosing occurrence. An absent source copies a present null, as CIB's
`VariableScope.getVariable` returns null for an unset name; a refused read disables the step.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace CallVariableMapping

/-- One target's value: `read` yields `some none` for an absent source and `none` for a refusal. -/
def copyValue? (read : String → Option (Option VariableValue)) (mapping : VariableMapping) :
    Option VariableBinding :=
  match mapping.expression with
  | .stringLiteral _ => none
  | .localVariable name | .enclosingVariable name => do
      let value ← read name
      some { name := mapping.target, value := value.getD .null }

/-- Every target's value, read before any write so no mapping observes another. -/
def copyValues? (read : String → Option (Option VariableValue)) (mappings : List VariableMapping) :
    Option (List VariableBinding) :=
  mappings.mapM (copyValue? read)

/-- The called-root frame a mapped invocation installs: exactly the input targets (CVM-IN-01). -/
def calledRootFrame (root : ScopeOccurrenceId) (bindings : List VariableBinding) : ScopeVariableScope :=
  { owner := root, bindings := mergeProcessVariableBindings [] bindings }

/-- CVM-IN-01 and CVM-ISOLATE-01: inputs read the Call's enclosing chain in the predecessor state,
and the Call record, the called root and its frame are created by one rewrite. -/
def invokeState? (program : Program) (state : RuntimeState) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (calledProcessId : ProcessId) (calledRootScopeId : DefinitionScopeId)
    (calledEntry : ControlPlaceId) (returnOperationId : OperationId) (inputs outputs : List VariableMapping) :
    Option RuntimeState := do
  if !callDataInterfaceValid (.variableMappings inputs outputs) origin.elementId.value calledProcessId.value then none
  else
    let caller ← onlyTokenOwner? state input
    let bindings ← copyValues?
      (NestedScopeData.readOutcome? program state.variables caller.processInstanceId caller.definitionScopeId) inputs
    let invoked ← invokeProcessState? state origin input calledProcessId calledRootScopeId calledEntry returnOperationId
    let root := scalarInvocationRoot state caller origin calledRootScopeId
    if invoked.variables.scopes.any (·.owner == root) then none
    else
      let scopes := canonicalInsertBy (fun left right => scopeOwnerBefore left.owner right.owner)
        (calledRootFrame root bindings) invoked.variables.scopes
      some { invoked with variables := { invoked.variables with scopes } }

/-- CVM-OUT-01 and CVM-RETIRE-01: outputs are read from the called-root frame alone before disposal,
then written from the caller after it, so validation, writes, disposal and the caller token commit
together. -/
def returnState? (program : Program) (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (calledProcessId : ProcessId) (calledRootScopeId : DefinitionScopeId) (callerOutput : ControlPlaceId)
    (inputs outputs : List VariableMapping) : Option RuntimeState := do
  if !callDataInterfaceValid (.variableMappings inputs outputs) origin.elementId.value calledProcessId.value then none
  else
    let record ← scalarReturnRecord? state id origin
    let frame ← selectScopeVariables? state.variables record.calledRoot
    let values ← copyValues? (NestedScopeData.bindingOutcome? frame.bindings) outputs
    let returned ← returnProcessState? state id origin calledProcessId calledRootScopeId callerOutput
    let variables ← NestedScopeData.writeAll? program returned.variables record.caller.processInstanceId
      record.caller.definitionScopeId values
    some { returned with variables }

end CallVariableMapping
end BpmnSemantics.SemanticProcess
