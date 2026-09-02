import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerTransition

/-! # Compensation trigger construction and frontier conformance -/

namespace BpmnSemantics.CompensationTriggerHandlerTransitionConformance

open BpmnSemantics
open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
open BpmnSemantics.SemanticProcess

theorem pretrigger_sources_and_execution_state_are_independently_valid :
    compensationActivityRetentionStateValid program preTriggerState = true ∧
      compensationEventSubProcessSnapshotStateValid program preTriggerState = true ∧
      compensationExecutionStateValid program preTriggerState = true := by
  decide +kernel

theorem trigger_atomically_consumes_sources_and_starts_the_complete_maximal_frontier :
    attemptCompensationTrigger program triggerOperation preTriggerState =
      .applied triggeredState := by
  decide +kernel

theorem trigger_evaluator_is_sound_for_the_declarative_relation :
    CompensationTriggerStep program triggerOperation preTriggerState triggeredState := by
  apply attemptCompensationTrigger_sound
  decide +kernel

theorem frontier_keeps_a_pending_while_b_and_c_start_from_the_frozen_snapshot :
    activeTrigger.handlers =
        [pendingHandlerA, compensatingHandlerB, compensatingHandlerC] ∧
      triggeredState.compensationHandlerEffectWaits = [waitB, waitC] ∧
      triggeredState.compensationActivityRetentions =
        [{ owner := rootOwner, nextCompletionOrdinal := 3, records := [] }] ∧
      triggeredState.compensationParentContextRetentions = [] ∧
      triggeredState.tokens = [] := by
  decide +kernel

theorem active_trigger_refusal_precedes_both_empty_and_eligible_source_selection :
    attemptCompensationTrigger program triggerOperation secondTriggerEmptySourceState =
        .refused .activeTriggerExists ∧
      attemptCompensationTrigger program triggerOperation secondTriggerEligibleSourceState =
        .refused .activeTriggerExists := by
  decide +kernel

private def programBelowFirstFrontierBytes : Program :=
  { program with
    compensationExecution := some
      { executionDeclaration with
        limits := { executionDeclaration.limits with maxCanonicalBytes := 3030 } } }

theorem first_frontier_capacity_refusal_precedes_every_source_mutation :
    attemptCompensationTrigger programBelowFirstFrontierBytes triggerOperation preTriggerState =
      .refused (.capacity .canonicalBytes 3030 3031) := by
  decide +kernel

theorem zero_subject_throw_uses_no_retained_trigger_capacity_and_releases_one_continuation :
    compensationExecutionStateValid zeroSubjectProgram zeroSubjectAtRetainedLimitState = true ∧
      attemptCompensationTrigger zeroSubjectProgram triggerOperation
        zeroSubjectAtRetainedLimitState = .applied zeroSubjectAtRetainedLimitSuccessor := by
  decide +kernel

end BpmnSemantics.CompensationTriggerHandlerTransitionConformance
