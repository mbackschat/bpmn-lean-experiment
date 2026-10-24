module

public import BpmnSemantics.ParallelUserTaskMetadataCompositionConformance
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity

/-! # Exact balanced parallel topology admission conformance

This module distinguishes the admitted balanced two-branch Parallel Gateway chain from a same-cardinality acyclic graph that places one User Task before the split and routes the other branch directly to the join.
-/

@[expose] public section

namespace BpmnSemantics.ParallelBalancedTopologyConformance

open BpmnSemantics.SemanticProcess
open BpmnSemantics.ParallelUserTaskMetadataCompositionConformance

def sequentialBeforeSplitFlows : List CheckedSequenceFlow :=
  [ { id := ⟨"Flow_StartToFork"⟩
      sourceId := ⟨"StartEvent_1"⟩
      targetId := ⟨"UserTask_ContentReview"⟩ }
  , { id := ⟨"Flow_ForkToContent"⟩
      sourceId := ⟨"UserTask_ContentReview"⟩
      targetId := ⟨"Gateway_Fork"⟩ }
  , { id := ⟨"Flow_ForkToRisk"⟩
      sourceId := ⟨"Gateway_Fork"⟩
      targetId := ⟨"UserTask_RiskReview"⟩ }
  , { id := ⟨"Flow_ContentToJoin"⟩
      sourceId := ⟨"Gateway_Fork"⟩
      targetId := ⟨"Gateway_Join"⟩ }
  , { id := ⟨"Flow_RiskToJoin"⟩
      sourceId := ⟨"UserTask_RiskReview"⟩
      targetId := ⟨"Gateway_Join"⟩ }
  , { id := ⟨"Flow_JoinToEnd"⟩
      sourceId := ⟨"Gateway_Join"⟩
      targetId := ⟨"EndEvent_1"⟩ } ]

def checkpointSequentialBeforeSplit : CheckedProcess :=
  { compositionCheckedProcess with sequenceFlows := sequentialBeforeSplitFlows }

def predecessorSequentialBeforeSplit : CheckedProcess :=
  { erasedCheckedProcess with sequenceFlows := sequentialBeforeSplitFlows }

/-- Balanced admission is retained for both profiles while the same-cardinality sequential-before-split topology is rejected at both representations. -/
theorem exact_balanced_topology_is_required_for_both_profiles :
    checkedProfileCapabilitiesValid compositionCheckedProcess = true ∧
      programProfileCapabilitiesValid compositionProgram = true ∧
      checkedProfileCapabilitiesValid erasedCheckedProcess = true ∧
      programProfileCapabilitiesValid erasedProgram = true ∧
      checkedProfileCapabilitiesValid checkpointSequentialBeforeSplit = false ∧
      programProfileCapabilitiesValid
          (lowerCheckedProcess checkpointSequentialBeforeSplit) = false ∧
      checkedProfileCapabilitiesValid predecessorSequentialBeforeSplit = false ∧
      programProfileCapabilitiesValid
          (lowerCheckedProcess predecessorSequentialBeforeSplit) = false := by
  decide +kernel

end BpmnSemantics.ParallelBalancedTopologyConformance
