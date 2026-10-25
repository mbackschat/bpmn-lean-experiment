module

public import BpmnSemantics.FlowNodeOccurrenceLifecycleHappyPathConformanceCheckFixtures
public import BpmnSemantics.FlowNodeOccurrenceLifecycleFixtures
public import BpmnSemantics.CallActivityConformanceFixtures
public import BpmnSemantics.EmbeddedSubProcessCompletionConformance
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
/-! # Flow-node occurrence lifecycle happy-path conformance

This module owns the executable witnesses for exact sequential, Call Activity, and embedded Sub-Process lifecycle pairing.
-/

@[expose] public section

namespace BpmnSemantics.FlowNodeOccurrenceLifecycleConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
/-- Both real sequential command prefixes fold to their independently projected exact heads. -/
theorem sequential_lifecycle_fold_matches_independent_projection :
    foldFlowNodeOccurrenceDeltas [] sequentialStartTrace.flowNodeOccurrenceLifecycles =
        projectOpenFlowNodeOccurrences? SequentialUserTask.program
          sequentialStartTrace.result.state ∧
      foldFlowNodeOccurrenceDeltas
          ((projectOpenFlowNodeOccurrences? SequentialUserTask.program
            SequentialUserTask.afterStartState).getD [])
          sequentialCompletionTrace.flowNodeOccurrenceLifecycles =
        projectOpenFlowNodeOccurrences? SequentialUserTask.program
          sequentialCompletionTrace.result.state := by
  decide +kernel

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance
