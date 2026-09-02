import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerCompletion
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotCommandAdmission
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace

/-! # Compensation handler completion and failure conformance -/

namespace BpmnSemantics.CompensationTriggerHandlerCompletionConformance

open BpmnSemantics
open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
open BpmnSemantics.SemanticProcess

theorem completing_b_starts_a_without_disturbing_independent_c :
    attemptCompensationHandlerEffectCompletion program triggeredState waitB.id (.success []) =
      .applied afterBState := by
  decide +kernel

theorem completing_independent_c_first_keeps_a_pending_until_b_finishes :
    attemptCompensationHandlerEffectCompletion program triggeredState waitC.id (.success []) =
      .applied afterCFirstState := by
  decide +kernel

theorem the_last_success_releases_exactly_one_continuation_and_retain_tombstones :
    attemptCompensationHandlerEffectCompletion program afterBState waitA.id (.success []) =
        .applied afterBThenAState ∧
      attemptCompensationHandlerEffectCompletion program afterBThenAState waitC.id (.success []) =
        .applied allSucceededState ∧
      allSucceededState.tokens = [{ placeId := ⟨"place:done"⟩, owner := rootOwner }] ∧
      allSucceededState.compensationHandlerEffectWaits = [] := by
  decide +kernel

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

theorem terminal_stale_result_and_nonempty_patch_are_refused_without_a_successor :
    attemptCompensationHandlerEffectCompletion program failedState waitB.id (.success []) =
        .refused .invalidState ∧
      attemptCompensationHandlerEffectCompletion program triggeredState waitB.id
          (.success [{ name := "forbidden", value := .string "mutation" }]) =
        .refused .nonemptyPatch := by
  decide +kernel

theorem delayed_event_subprocess_context_reaches_the_new_frontier_unchanged :
    attemptCompensationTrigger delayedProgram triggerOperation preTriggerState =
        .applied delayedTriggeredState ∧
      attemptCompensationHandlerEffectCompletion delayedProgram delayedTriggeredState
          delayedWaitC.id (.success []) = .applied delayedAfterCState ∧
      delayedAfterCWaitB.arguments =
        [{ name := "argument", value := .string "old" }] := by
  decide +kernel

private def delayedSuccessorBytes : Nat :=
  canonicalCompensationExecutionStateUtf8Bytes delayedAfterCState.compensationTriggers
    delayedAfterCState.compensationHandlerEffectWaits

private def delayedCurrentBytes : Nat :=
  canonicalCompensationExecutionStateUtf8Bytes delayedTriggeredState.compensationTriggers
    delayedTriggeredState.compensationHandlerEffectWaits

private def delayedProgramBelowSuccessor : Program :=
  { delayedProgram with
    compensationExecution := some
      { delayedExecutionDeclaration with
        limits :=
          { delayedExecutionDeclaration.limits with
            maxCanonicalBytes := delayedSuccessorBytes - 1 } } }

theorem prospective_frontier_capacity_refusal_precedes_wait_or_context_mutation :
    delayedCurrentBytes < delayedSuccessorBytes ∧
      compensationExecutionStateValid delayedProgramBelowSuccessor delayedTriggeredState = true ∧
      attemptCompensationHandlerEffectCompletion delayedProgramBelowSuccessor
          delayedTriggeredState delayedWaitC.id (.success []) =
        .refused (.capacity .canonicalBytes (delayedSuccessorBytes - 1)
          delayedSuccessorBytes) := by
  decide +kernel

theorem completion_evaluator_is_sound_for_the_declarative_relation :
    CompensationHandlerCompletionStep program triggeredState waitB.id (.success [])
      afterBState := by
  apply attemptCompensationHandlerEffectCompletion_sound
  decide +kernel

private def completeBStimulus : Stimulus :=
  .completeEffect ⟨"complete-b"⟩ waitB.id (.success [])

private def failCStimulus : Stimulus :=
  .completeEffect ⟨"fail-c"⟩ waitC.id failureResult

theorem command_admission_dispatches_exact_compensation_success_and_failure :
    (admitStimulusWithCompensationSnapshots program triggeredState
        completeBStimulus).outcome = .committed ∧
      (admitStimulusWithCompensationSnapshots program triggeredState
        completeBStimulus).state = afterBState ∧
      (admitStimulusWithCompensationSnapshots program triggeredState
        failCStimulus).outcome = .committed ∧
      (admitStimulusWithCompensationSnapshots program triggeredState
        failCStimulus).state = failedState := by
  decide +kernel

theorem cross_family_effect_identity_collision_rejects_the_exact_submitted_state :
    (admitStimulusWithCompensationSnapshots program effectCollisionState
        completeBStimulus).outcome = .rejected ∧
      (admitStimulusWithCompensationSnapshots program effectCollisionState
        completeBStimulus).state = effectCollisionState := by
  decide +kernel

private def occurrenceStart (anchor : SemanticFlowNodeOccurrenceAnchor)
    (elementId : String) : UnnumberedFlowNodeOccurrenceStart :=
  { anchor
    processId := program.processId
    elementId := ⟨elementId⟩
    owner := rootOwner }

private def expectedTriggerLifecycle : UnnumberedFlowNodeOccurrenceDelta :=
  { started :=
      [occurrenceStart (.wait waitB.id) "EB",
       occurrenceStart (.compensationTrigger activeTrigger.id) "throw",
       occurrenceStart (.compensationHandler compensatingHandlerB.identity.id) "HB",
       occurrenceStart (.compensationHandler compensatingHandlerC.identity.id) "HC"]
    ended := [] }

private def expectedBSuccessLifecycle : UnnumberedFlowNodeOccurrenceDelta :=
  { started :=
      [occurrenceStart (.compensationHandler compensatingHandlerA.identity.id) "HA"]
    ended :=
      [{ anchor := .wait waitB.id, terminal := .completed },
       { anchor := .compensationHandler compensatingHandlerB.identity.id,
         terminal := .completed }] }

private def expectedCFailureLifecycle : UnnumberedFlowNodeOccurrenceDelta :=
  { started := []
    ended :=
      [{ anchor := .wait waitB.id, terminal := .cancelled },
       { anchor := .compensationTrigger activeTrigger.id, terminal := .cancelled },
       { anchor := .compensationHandler compensatingHandlerB.identity.id,
         terminal := .cancelled },
       { anchor := .compensationHandler compensatingHandlerC.identity.id,
         terminal := .cancelled }] }

theorem trigger_and_completion_lifecycles_preserve_private_pairing_and_public_terminals :
    flowNodeOccurrenceDeltaForOperationWithCompensation? program preTriggerState triggeredState
        triggerOperation ⟨"trigger-command"⟩ 1 = some expectedTriggerLifecycle ∧
      flowNodeOccurrenceDeltaForStimulusWithCompensation? program triggeredState afterBState
        completeBStimulus 0 = some expectedBSuccessLifecycle ∧
      flowNodeOccurrenceDeltaForStimulusWithCompensation? program triggeredState failedState
        failCStimulus 0 = some expectedCFailureLifecycle := by
  decide +kernel

private def completeBTrace :=
  applyStimulusTracedWithCompensationSnapshots 1 program triggeredState completeBStimulus

private def failCTrace :=
  applyStimulusTracedWithCompensationSnapshots 1 program triggeredState failCStimulus

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
