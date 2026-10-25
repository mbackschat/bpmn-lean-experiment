module

public import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
public import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
public import BpmnSemantics.SemanticProcess.Transition
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic

/-! Fixture definitions and executable checks of [`CompensationTriggerHandlerTransitionConformance`](CompensationTriggerHandlerTransitionConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.CompensationTriggerHandlerTransitionConformance


open BpmnSemantics
open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
open BpmnSemantics.SemanticProcess

def pretrigger_sources_and_execution_state_are_independently_valid : Bool := decide <|
    compensationActivityRetentionStateValid program preTriggerState = true ∧
      compensationEventSubProcessSnapshotStateValid program preTriggerState = true ∧
      compensationExecutionStateValid program preTriggerState = true

def trigger_atomically_consumes_sources_and_starts_the_complete_maximal_frontier : Bool := decide <|
    attemptCompensationTrigger program triggerOperation preTriggerState =
      .applied triggeredState

def internal_dispatch_commits_the_same_atomic_trigger_successor : Bool := decide <|
    attemptInternalOperation program triggerOperation preTriggerState =
      .applied { operation := triggerOperation, successor := triggeredState }

def frontier_keeps_a_pending_while_b_and_c_start_from_the_frozen_snapshot : Bool := decide <|
    activeTrigger.handlers =
        [pendingHandlerA, compensatingHandlerB, compensatingHandlerC] ∧
      triggeredState.compensationHandlerEffectWaits = [waitB, waitC] ∧
      triggeredState.compensationActivityRetentions =
        [{ owner := rootOwner, nextCompletionOrdinal := 3, records := [] }] ∧
      triggeredState.compensationParentContextRetentions = [] ∧
      triggeredState.tokens = []

def programBelowFirstFrontierBytes : Program :=
  { program with
    compensationExecution := some
      { executionDeclaration with
        limits := { executionDeclaration.limits with maxCanonicalBytes := 3030 } } }

def zero_subject_throw_uses_no_retained_trigger_capacity_and_releases_one_continuation : Bool := decide <|
    compensationExecutionStateValid singleSubjectProgram singleSubjectAtRetainedLimitState = true ∧
      attemptCompensationTrigger singleSubjectProgram triggerOperation
        singleSubjectAtRetainedLimitState = .applied singleSubjectAtRetainedLimitSuccessor

def retained_trigger_requires_at_least_one_selected_subject : Bool := decide <|
    compensationExecutionStateValid zeroSubjectProgram emptySucceededTriggerState = false

def compensation_execution_without_snapshots_uses_the_attempt_aware_whole_stimulus_closure : Bool := decide <|
    applyStimulusWithCompensationSnapshots 3 zeroSubjectProgram zeroSubjectWakeState
        zeroSubjectWakeStimulus =
      { outcome := .committed
        state := zeroSubjectWakeSuccessor
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

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

def compensation_execution_only_whole_stimulus_trace_records_the_trigger_once : Bool := decide <|
    zeroSubjectWakeTrace.result.state = zeroSubjectWakeSuccessor ∧
      zeroSubjectWakeTrace.committedTransitions =
        [.externalStimulus zeroSubjectWakeStimulus,
         .internalOperation zeroSubjectTriggerRecord,
         .internalOperation zeroSubjectEndRecord,
         .internalOperation zeroSubjectRootCompletionRecord] ∧
      zeroSubjectWakeTrace.flowNodeOccurrenceLifecycles =
        [zeroSubjectExternalLifecycle, zeroSubjectTriggerLifecycle,
         zeroSubjectEndLifecycle, zeroSubjectRootCompletionLifecycle]

def compensation_execution_only_trace_replays_to_the_committed_successor : Bool := decide <|
    replayCommittedTransitionsWithCompensationSnapshots zeroSubjectProgram zeroSubjectWakeState
        zeroSubjectWakeTrace.committedTransitions = some zeroSubjectWakeSuccessor

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("pretrigger_sources_and_execution_state_are_independently_valid", pretrigger_sources_and_execution_state_are_independently_valid),
  ("trigger_atomically_consumes_sources_and_starts_the_complete_maximal_frontier", trigger_atomically_consumes_sources_and_starts_the_complete_maximal_frontier),
  ("internal_dispatch_commits_the_same_atomic_trigger_successor", internal_dispatch_commits_the_same_atomic_trigger_successor),
  ("frontier_keeps_a_pending_while_b_and_c_start_from_the_frozen_snapshot", frontier_keeps_a_pending_while_b_and_c_start_from_the_frozen_snapshot),
  ("zero_subject_throw_uses_no_retained_trigger_capacity_and_releases_one_continuation", zero_subject_throw_uses_no_retained_trigger_capacity_and_releases_one_continuation),
  ("retained_trigger_requires_at_least_one_selected_subject", retained_trigger_requires_at_least_one_selected_subject),
  ("compensation_execution_without_snapshots_uses_the_attempt_aware_whole_stimulus_closure", compensation_execution_without_snapshots_uses_the_attempt_aware_whole_stimulus_closure),
  ("compensation_execution_only_whole_stimulus_trace_records_the_trigger_once", compensation_execution_only_whole_stimulus_trace_records_the_trigger_once),
  ("compensation_execution_only_trace_replays_to_the_committed_successor", compensation_execution_only_trace_replays_to_the_committed_successor)
]

end BpmnSemantics.CompensationTriggerHandlerTransitionConformance
