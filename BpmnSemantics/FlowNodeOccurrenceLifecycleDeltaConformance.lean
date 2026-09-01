import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.TransitionTrace

/-! # Flow-node occurrence lifecycle delta conformance

This module owns the generic executable laws for folding flow-node occurrence starts and terminals.
-/

namespace BpmnSemantics.FlowNodeOccurrenceLifecycleConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- An accepted fold proves every start anchor fresh and unique against the prior open set. -/
theorem accepted_flow_node_delta_starts_are_fresh_and_unique
    (current : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (after : List OpenSemanticFlowNodeOccurrence)
    (accepted : applyFlowNodeOccurrenceDelta? current delta = some after) :
    (current ++ delta.started).map (·.anchor) |>.Nodup := by
  unfold applyFlowNodeOccurrenceDelta? at accepted
  split at accepted <;> simp_all

/-- An accepted fold resolves each terminal anchor exactly once. -/
theorem accepted_flow_node_delta_terminals_resolve_once
    (current : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (after : List OpenSemanticFlowNodeOccurrence)
    (accepted : applyFlowNodeOccurrenceDelta? current delta = some after) :
    (delta.ended.map (·.anchor)).Nodup ∧
      (delta.ended.map (·.anchor)).all
        ((availableAfterStarts current delta).map (·.anchor)).contains = true := by
  unfold applyFlowNodeOccurrenceDelta? at accepted
  split at accepted <;> simp_all

/-- A transition-local anchor can never survive an accepted delta. -/
theorem accepted_flow_node_delta_retains_no_transition_anchor
    (current : List OpenSemanticFlowNodeOccurrence)
    (delta : UnnumberedFlowNodeOccurrenceDelta)
    (after : List OpenSemanticFlowNodeOccurrence)
    (accepted : applyFlowNodeOccurrenceDelta? current delta = some after) :
    after.all (fun occurrence => !transitionAnchor occurrence.anchor) = true := by
  unfold applyFlowNodeOccurrenceDelta? at accepted
  repeat' split at accepted <;> simp_all

def lifecycleStarts (result : TracedStimulusResult) :
    List UnnumberedFlowNodeOccurrenceStart :=
  result.flowNodeOccurrenceLifecycles.flatMap (·.started)

def lifecycleEnds (result : TracedStimulusResult) :
    List UnnumberedFlowNodeOccurrenceEnd :=
  result.flowNodeOccurrenceLifecycles.flatMap (·.ended)

end BpmnSemantics.FlowNodeOccurrenceLifecycleConformance
