import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRefusalSoundness
import BpmnSemantics.SemanticProcess.Transition

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

theorem internal_dispatch_commits_the_same_atomic_trigger_successor :
    attemptInternalOperation program triggerOperation preTriggerState =
      .applied { operation := triggerOperation, successor := triggeredState } := by
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

theorem active_trigger_refusal_is_covered_by_the_declarative_relation :
    CompensationTriggerRefusalStep program triggerOperation secondTriggerEmptySourceState
      .activeTriggerExists := by
  apply attemptCompensationTrigger_refusal_sound
  exact active_trigger_refusal_precedes_both_empty_and_eligible_source_selection.1

private def programBelowFirstFrontierBytes : Program :=
  { program with
    compensationExecution := some
      { executionDeclaration with
        limits := { executionDeclaration.limits with maxCanonicalBytes := 3030 } } }

theorem first_frontier_capacity_refusal_precedes_every_source_mutation :
    attemptCompensationTrigger programBelowFirstFrontierBytes triggerOperation preTriggerState =
      .refused (.capacity .canonicalBytes 3030 3031) := by
  decide +kernel

theorem first_frontier_capacity_refusal_is_covered_by_the_declarative_relation :
    CompensationTriggerRefusalStep programBelowFirstFrontierBytes triggerOperation
      preTriggerState (.capacity .canonicalBytes 3030 3031) := by
  apply attemptCompensationTrigger_refusal_sound
  exact first_frontier_capacity_refusal_precedes_every_source_mutation

theorem zero_subject_throw_uses_no_retained_trigger_capacity_and_releases_one_continuation :
    compensationExecutionStateValid zeroSubjectProgram zeroSubjectAtRetainedLimitState = true ∧
      attemptCompensationTrigger zeroSubjectProgram triggerOperation
        zeroSubjectAtRetainedLimitState = .applied zeroSubjectAtRetainedLimitSuccessor := by
  decide +kernel

theorem compensation_execution_without_snapshots_uses_the_attempt_aware_whole_stimulus_closure :
    applyStimulusWithCompensationSnapshots 3 zeroSubjectProgram zeroSubjectWakeState
        zeroSubjectWakeStimulus =
      { outcome := .committed
        state := zeroSubjectWakeSuccessor
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

def zeroSubjectWakeTrace : TracedStimulusResult :=
  applyStimulusTracedWithCompensationSnapshots 3 zeroSubjectProgram zeroSubjectWakeState
    zeroSubjectWakeStimulus

def zeroSubjectTriggerRecord : InternalTransitionRecord :=
  { operationId := triggerOperation.id
    operationKind := .triggerCompensation
    origin := triggerOperation.origin
    owner := rootOwner }

def zeroSubjectEndRecord : InternalTransitionRecord :=
  { operationId := ⟨"op:End"⟩
    operationKind := .reachNoneEnd
    origin := ⟨⟨"End"⟩⟩
    owner := rootOwner }

def zeroSubjectRootCompletionRecord : InternalTransitionRecord :=
  { operationId := ⟨"op:complete-root"⟩
    operationKind := .completeScope
    origin := ⟨⟨"process"⟩⟩
    owner := rootOwner }

def zeroSubjectExternalLifecycle : UnnumberedFlowNodeOccurrenceDelta :=
  { started := []
    ended :=
      [{ anchor := .wait (occurrence "C"), terminal := .completed }] }

def zeroSubjectTriggerLifecycle : UnnumberedFlowNodeOccurrenceDelta :=
  { started :=
      [{ anchor := .transition ⟨"complete-before-zero-subject-trigger"⟩ 1 0
         processId := zeroSubjectProgram.processId
         elementId := ⟨"throw"⟩
         owner := rootOwner }]
    ended :=
      [{ anchor := .transition ⟨"complete-before-zero-subject-trigger"⟩ 1 0
         terminal := .completed }] }

def zeroSubjectEndLifecycle : UnnumberedFlowNodeOccurrenceDelta :=
  { started :=
      [{ anchor := .transition ⟨"complete-before-zero-subject-trigger"⟩ 2 0
         processId := zeroSubjectProgram.processId
         elementId := ⟨"End"⟩
         owner := rootOwner }]
    ended :=
      [{ anchor := .transition ⟨"complete-before-zero-subject-trigger"⟩ 2 0
         terminal := .completed }] }

def zeroSubjectRootCompletionLifecycle : UnnumberedFlowNodeOccurrenceDelta :=
  { started := [], ended := [] }

theorem compensation_execution_only_whole_stimulus_trace_records_the_trigger_once :
    zeroSubjectWakeTrace.result.state = zeroSubjectWakeSuccessor ∧
      zeroSubjectWakeTrace.committedTransitions =
        [.externalStimulus zeroSubjectWakeStimulus,
         .internalOperation zeroSubjectTriggerRecord,
         .internalOperation zeroSubjectEndRecord,
         .internalOperation zeroSubjectRootCompletionRecord] ∧
      zeroSubjectWakeTrace.flowNodeOccurrenceLifecycles =
        [zeroSubjectExternalLifecycle, zeroSubjectTriggerLifecycle,
         zeroSubjectEndLifecycle, zeroSubjectRootCompletionLifecycle] := by
  decide +kernel

theorem compensation_execution_only_trace_replays_to_the_committed_successor :
    replayCommittedTransitionsWithCompensationSnapshots zeroSubjectProgram zeroSubjectWakeState
        zeroSubjectWakeTrace.committedTransitions = some zeroSubjectWakeSuccessor := by
  decide +kernel

end BpmnSemantics.CompensationTriggerHandlerTransitionConformance
