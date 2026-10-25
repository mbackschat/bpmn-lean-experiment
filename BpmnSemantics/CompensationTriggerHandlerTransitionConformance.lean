module

public import BpmnSemantics.CompensationTriggerHandlerTransitionConformanceCheckFixtures
public import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
public import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
public import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRefusalSoundness
public import BpmnSemantics.SemanticProcess.Transition
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
/-! # Compensation trigger construction and frontier conformance -/

@[expose] public section

namespace BpmnSemantics.CompensationTriggerHandlerTransitionConformance

open BpmnSemantics
open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
open BpmnSemantics.SemanticProcess
theorem trigger_evaluator_is_sound_for_the_declarative_relation :
    CompensationTriggerStep program triggerOperation preTriggerState triggeredState := by
  apply attemptCompensationTrigger_sound
  decide +kernel

theorem active_trigger_refusal_precedes_both_empty_and_eligible_source_selection :
    attemptCompensationTrigger program triggerOperation secondTriggerEmptySourceState =
        .refused .activeTriggerExists ∧
      attemptCompensationTrigger program triggerOperation secondTriggerEligibleSourceState =
        .refused .activeTriggerExists := by
  decide +kernel

theorem active_trigger_refusal_is_covered_by_the_declarative_relation :
    CompensationTriggerRefusalStep program triggerOperation secondTriggerEmptySourceState
      .activeTriggerExists := by
  apply attemptCompensationTrigger_refusal_sound
  exact active_trigger_refusal_precedes_both_empty_and_eligible_source_selection.1

theorem first_frontier_capacity_refusal_precedes_every_source_mutation :
    attemptCompensationTrigger programBelowFirstFrontierBytes triggerOperation preTriggerState =
      .refused (.capacity .canonicalBytes 3030 3031) := by
  decide +kernel

theorem first_frontier_capacity_refusal_is_covered_by_the_declarative_relation :
    CompensationTriggerRefusalStep programBelowFirstFrontierBytes triggerOperation
      preTriggerState (.capacity .canonicalBytes 3030 3031) := by
  apply attemptCompensationTrigger_refusal_sound
  exact first_frontier_capacity_refusal_precedes_every_source_mutation

end BpmnSemantics.CompensationTriggerHandlerTransitionConformance
