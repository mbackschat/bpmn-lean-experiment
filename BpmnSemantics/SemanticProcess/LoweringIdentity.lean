import BpmnSemantics.SemanticProcessContract

/-! # Canonical lowering identity

This module owns the shared identifier mapping from checked BPMN nodes and Sequence Flows to Semantic Process operations and control places.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def nodeOperationId (id : NodeId) : OperationId :=
  ⟨"operation:" ++ id.value⟩

def parallelMultiInstanceCompletionOperationId (id : NodeId) : OperationId :=
  ⟨(nodeOperationId id).value ++ ":complete"⟩

def flowControlPlaceId (id : SequenceFlowId) : ControlPlaceId :=
  ⟨"place:" ++ id.value⟩

end BpmnSemantics.SemanticProcess
