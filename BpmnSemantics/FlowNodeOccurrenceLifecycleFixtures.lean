module

public import BpmnSemantics.FlowNodeOccurrenceLifecycleDeltaConformance
public import BpmnSemantics.SequentialUserTask

/-! # Flow-node occurrence lifecycle fixtures

This module owns the shared admitted Sequential User Task occurrence anchor used by independent witness leaves.
-/

@[expose] public section

namespace BpmnSemantics.FlowNodeOccurrenceLifecycleConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def sequentialTaskAnchor : SemanticFlowNodeOccurrenceAnchor :=
  .wait SequentialUserTask.exactTaskInstanceId

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance
