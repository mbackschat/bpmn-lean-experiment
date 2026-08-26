import BpmnSemantics.SemanticProcess.LoweringIdentity

/-! # Parallel Multi-Instance lowering

Family-shaped construction of the paired entry and external child-completion operations. The root
lowerer still owns graph traversal, scope lookup, and canonical sorting.
-/

namespace BpmnSemantics.SemanticProcess

def lowerParallelMultiInstanceEntry (id : NodeId) (name : Option String)
    (input : ControlPlaceId) (data : SequentialMultiInstanceDataDefinition)
    (normalOutput : ControlPlaceId) (boundaryTimer : BoundaryTimerArm)
    (completionCondition : SimpleBooleanExpression) : SemanticOperation :=
  .awaitParallelMultiInstanceUserTask
    (nodeOperationId id) { elementId := id } input ⟨id.value⟩ name data normalOutput
    boundaryTimer completionCondition
    { maximumItems := 16
      maximumItemUtf8Bytes := 512
      maximumCanonicalCollectionUtf8Bytes := 8192 }

def lowerParallelMultiInstanceCompletion (id : NodeId)
    (normalOutput : ControlPlaceId) : SemanticOperation :=
  .completeParallelMultiInstanceUserTask
    (parallelMultiInstanceCompletionOperationId id) { elementId := id }
    (nodeOperationId id) ⟨id.value⟩ normalOutput

end BpmnSemantics.SemanticProcess
