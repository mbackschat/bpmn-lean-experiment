import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Root-scope fixture construction

This module owns reusable constructors for root definition ownership, root runtime ownership, and root-owned control tokens. It deliberately contains no retained model, scenario runner, profile admission, lowering, or conformance claim.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def rootDefinitionScopeId (processId : ProcessId) : DefinitionScopeId :=
  ⟨"scope:" ++ processId.value⟩

def rootDefinitionScope (processId : ProcessId) : DefinitionScope :=
  { id := rootDefinitionScopeId processId
    parentScopeId := none
    originElementId := ⟨processId.value⟩ }

def rootNodeScopes (processId : ProcessId) (nodeIds : List NodeId) :
    List NodeScopeOwnership :=
  nodeIds.map fun nodeId => { nodeId, scopeId := rootDefinitionScopeId processId }

def rootSequenceFlowScopes (processId : ProcessId)
    (flowIds : List SequenceFlowId) : List SequenceFlowScopeOwnership :=
  flowIds.map fun sequenceFlowId =>
    { sequenceFlowId, scopeId := rootDefinitionScopeId processId }

def rootScopeOccurrenceId (instanceId : SemanticId) (processId : ProcessId) :
    ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := rootDefinitionScopeId processId
    activation := 1 }

def rootToken (instanceId : SemanticId) (processId : ProcessId)
    (placeId : ControlPlaceId) : ControlToken :=
  { placeId, owner := rootScopeOccurrenceId instanceId processId }

end BpmnSemantics.SemanticProcess
