module

public import BpmnSemantics.CompensationTriggerHandlerCompletionConformanceCheckFixtures
public import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
public import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerCompletionSoundness
public import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotCommandAdmission
public import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
/-! # Compensation handler completion and failure conformance -/

@[expose] public section

namespace BpmnSemantics.CompensationTriggerHandlerCompletionConformance

open BpmnSemantics
open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
open BpmnSemantics.SemanticProcess
theorem handler_error_fails_the_process_and_removes_every_live_compensation_region :
    attemptCompensationHandlerEffectCompletion program triggeredState waitC.id failureResult =
        .applied failedState ∧
      compensationExecutionStateValid program failedState = true ∧
      failedState.scopeOccurrences = [] ∧
      failedState.compensationActivityRetentions = [] ∧
      failedState.compensationParentContextRetentions = [] ∧
      failedState.compensationHandlerEffectWaits = [] ∧
      failedState.tokens = [] ∧
      failedState.activityOccurrences = [] ∧
      failedState.variables.activities = [] := by
  decide +kernel

/-- AA-12 preserves the existing inherited listener behavior; it is outside fail-fast cleanup. -/
theorem populated_completeFailure_preserves_listener_and_clears_its_listed_work :
    compensationTriggerHandlerStateValid program populatedFailureBefore = true ∧
      selectCompensationHandler? populatedFailureBefore waitC.id = some selectedC ∧
      completeFailure program populatedFailureBefore selectedC "compensation-rejected"
        (some "downstream rejected the reversal") = .applied expectedPopulatedFailure ∧
      attemptCompensationHandlerEffectCompletion program populatedFailureBefore waitC.id failureResult =
        .applied expectedPopulatedFailure := by
  exact ⟨by decide +kernel, rfl, by decide +kernel, by decide +kernel⟩

theorem terminal_stale_result_and_nonempty_patch_are_refused_without_a_successor :
    attemptCompensationHandlerEffectCompletion program failedState waitB.id (.success []) =
        .refused .invalidState ∧
      attemptCompensationHandlerEffectCompletion program triggeredState waitB.id
          (.success [{ name := "forbidden", value := .string "mutation" }]) =
        .refused .nonemptyPatch := by
  decide +kernel

theorem terminal_and_nonempty_patch_refusals_are_declarative :
    CompensationHandlerCompletionRefusalStep program failedState waitB.id (.success [])
        .invalidState ∧
      CompensationHandlerCompletionRefusalStep program triggeredState waitB.id
        (.success [{ name := "forbidden", value := .string "mutation" }]) .nonemptyPatch := by
  constructor
  · apply attemptCompensationHandlerEffectCompletion_refusal_sound
    exact terminal_stale_result_and_nonempty_patch_are_refused_without_a_successor.1
  · apply attemptCompensationHandlerEffectCompletion_refusal_sound
    exact terminal_stale_result_and_nonempty_patch_are_refused_without_a_successor.2

theorem prospective_frontier_capacity_refusal_precedes_wait_or_context_mutation :
    delayedCurrentBytes < delayedSuccessorBytes ∧
      compensationExecutionStateValid delayedProgramBelowSuccessor delayedTriggeredState = true ∧
      attemptCompensationHandlerEffectCompletion delayedProgramBelowSuccessor
          delayedTriggeredState delayedWaitC.id (.success []) =
        .refused (.capacity .canonicalBytes (delayedSuccessorBytes - 1)
          delayedSuccessorBytes) := by
  decide +kernel

theorem prospective_frontier_capacity_refusal_is_declarative :
    CompensationHandlerCompletionRefusalStep delayedProgramBelowSuccessor
      delayedTriggeredState delayedWaitC.id (.success [])
      (.capacity .canonicalBytes (delayedSuccessorBytes - 1) delayedSuccessorBytes) := by
  apply attemptCompensationHandlerEffectCompletion_refusal_sound
  exact prospective_frontier_capacity_refusal_precedes_wait_or_context_mutation.2.2

theorem completion_evaluator_is_sound_for_the_declarative_relation :
    CompensationHandlerCompletionStep program triggeredState waitB.id (.success [])
      afterBState := by
  apply attemptCompensationHandlerEffectCompletion_sound
  decide +kernel

theorem handler_failure_is_sound_for_the_declarative_relation :
    CompensationHandlerCompletionStep program triggeredState waitC.id failureResult
      failedState := by
  apply attemptCompensationHandlerEffectCompletion_sound
  exact handler_error_fails_the_process_and_removes_every_live_compensation_region.1

private theorem complete_b_trace_has_exact_publication :
    completeBTrace.committedTransitions = [.externalStimulus completeBStimulus] ∧
      completeBTrace.flowNodeOccurrenceLifecycles = [expectedBSuccessLifecycle] := by
  decide +kernel

private theorem fail_c_trace_has_exact_state : failCTrace.result.state = failedState := by
  decide +kernel

private theorem fail_c_trace_has_exact_transition :
    failCTrace.committedTransitions = [.externalStimulus failCStimulus] := by
  decide +kernel

private theorem fail_c_trace_has_exact_lifecycle :
    failCTrace.flowNodeOccurrenceLifecycles = [expectedCFailureLifecycle] := by
  decide +kernel

theorem traced_completion_publishes_success_or_failure_without_an_internal_phantom_step :
    completeBTrace.committedTransitions = [.externalStimulus completeBStimulus] ∧
      completeBTrace.flowNodeOccurrenceLifecycles = [expectedBSuccessLifecycle] ∧
      failCTrace.result.state = failedState ∧
      failCTrace.committedTransitions = [.externalStimulus failCStimulus] ∧
      failCTrace.flowNodeOccurrenceLifecycles = [expectedCFailureLifecycle] :=
  ⟨complete_b_trace_has_exact_publication.1, complete_b_trace_has_exact_publication.2,
    fail_c_trace_has_exact_state, fail_c_trace_has_exact_transition,
    fail_c_trace_has_exact_lifecycle⟩

end BpmnSemantics.CompensationTriggerHandlerCompletionConformance
