import BpmnSemantics.CompensationEventSubProcessSnapshotLifecycleIntegrationConformance

/-! # Compensation Event Sub-Process snapshot atomic refusal

Kernel-decided witnesses for root and child reservation refusal, promotion refusal after earlier work,
empty publication on rollback, and canonical simultaneous-refusal selection.
-/

namespace BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def reservationOverflowProgram : Program :=
  CompensationEventSubProcessSnapshotConformance.programWithLimits 1
    (CompensationEventSubProcessSnapshotConformance.reservedCanonicalBytes - 1)

def reservationOverflowResult : TracedStimulusResult :=
  applyStimulusTracedWithCompensationSnapshots scenarioClosureLimit reservationOverflowProgram
    initialState
    (.startProcess ⟨"reject-child-reservation"⟩
      ⟨SubProcessBoundaryTimerConformance.processId.value⟩
      CompensationEventSubProcessSnapshotConformance.instanceId [])

/-- Child-entry overflow rejects the complete start and publishes none of its earlier work. -/
theorem child_entry_overflow_rolls_back_the_complete_stimulus :
    reservationOverflowResult.result =
        { outcome := .rejected
          state := initialState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      reservationOverflowResult.committedTransitions = [] ∧
      reservationOverflowResult.flowNodeOccurrenceLifecycles = [] := by
  decide +kernel

def promotionOverflowProgram : Program :=
  CompensationEventSubProcessSnapshotConformance.programWithLimits 1
    CompensationEventSubProcessSnapshotConformance.reservedCanonicalBytes

def promotionOverflowStarted : StimulusResult :=
  applyStimulusWithCompensationSnapshots scenarioClosureLimit promotionOverflowProgram initialState
    (.startProcess ⟨"start-before-promotion-overflow"⟩
      ⟨SubProcessBoundaryTimerConformance.processId.value⟩
      CompensationEventSubProcessSnapshotConformance.instanceId [])

def promotionOverflowResult : TracedStimulusResult :=
  applyStimulusTracedWithCompensationSnapshots scenarioClosureLimit promotionOverflowProgram
    promotionOverflowStarted.state
    (.completeUserTaskInstance ⟨"reject-child-promotion"⟩ childTaskId [])

/-- Promotion overflow after prior external and internal work restores the exact pre-command state. -/
theorem completion_overflow_discards_admission_and_internal_work :
    promotionOverflowStarted.outcome = .committed ∧
      promotionOverflowResult.result =
        { outcome := .rejected
          state := promotionOverflowStarted.state
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      promotionOverflowResult.committedTransitions = [] ∧
      promotionOverflowResult.flowNodeOccurrenceLifecycles = [] := by
  decide +kernel

def rootStartOverflowProgram : Program :=
  { CompensationEventSubProcessSnapshotConformance.rootProgram with
    compensationEventSubProcessSnapshots := some
      { targets :=
          [{ parentScopeId := SubProcessBoundaryTimerConformance.rootScopeId
             handlerScopeId :=
               CompensationEventSubProcessSnapshotConformance.rootHandlerScopeId }]
        maxRecords := 2
        maxCanonicalBytes := 2 } }

def rootStartOverflowResult : TracedStimulusResult :=
  applyStimulusTracedWithCompensationSnapshots scenarioClosureLimit rootStartOverflowProgram
    initialState
    (.startProcess ⟨"reject-root-reservation"⟩
      ⟨SubProcessBoundaryTimerConformance.processId.value⟩
      CompensationEventSubProcessSnapshotConformance.instanceId [])

/-- Root reservation refusal happens before the independently built running state becomes visible. -/
theorem root_start_overflow_preserves_not_started_state :
    rootStartOverflowResult.result =
        { outcome := .rejected
          state := initialState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      rootStartOverflowResult.committedTransitions = [] ∧
      rootStartOverflowResult.flowNodeOccurrenceLifecycles = [] := by
  decide +kernel

def lowerRefusalOperation : SemanticOperation :=
  .initiate ⟨"operation:A-refusal"⟩ { elementId := ⟨"A-refusal"⟩ }
    ⟨"place:A-refusal"⟩

def legacyBypassStimulus : Stimulus :=
  .startProcess ⟨"legacy-bypass"⟩
    ⟨SubProcessBoundaryTimerConformance.processId.value⟩
    CompensationEventSubProcessSnapshotConformance.instanceId []

/-- A declaring Program cannot reach the declaration-free admission, operation, evaluation, or replay paths. -/
theorem declaring_program_cannot_use_legacy_entry_points :
    (dispatchStimulus CompensationEventSubProcessSnapshotAdmissionConformance.program
        initialState legacyBypassStimulus).outcome = .rejected ∧
    (dispatchStimulus CompensationEventSubProcessSnapshotAdmissionConformance.program
        initialState legacyBypassStimulus).state = initialState ∧
    (admitStimulus CompensationEventSubProcessSnapshotAdmissionConformance.program
        initialState legacyBypassStimulus).outcome = .rejected ∧
    (admitStimulus CompensationEventSubProcessSnapshotAdmissionConformance.program
        initialState legacyBypassStimulus).state = initialState ∧
    fire? CompensationEventSubProcessSnapshotAdmissionConformance.program
        lowerRefusalOperation initialState = none ∧
    applyStimulus scenarioClosureLimit
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        initialState legacyBypassStimulus =
      { outcome := .rejected
        state := initialState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } ∧
    (applyStimulusTraced scenarioClosureLimit
        CompensationEventSubProcessSnapshotAdmissionConformance.program
        initialState legacyBypassStimulus).committedTransitions = [] ∧
    replayCommittedTransitions
        CompensationEventSubProcessSnapshotAdmissionConformance.program initialState
        [.externalStimulus legacyBypassStimulus] = none := by
  decide +kernel

def higherRefusalOperation : SemanticOperation :=
  .initiate ⟨"operation:Z-refusal"⟩ { elementId := ⟨"Z-refusal"⟩ }
    ⟨"place:Z-refusal"⟩

/-- Simultaneous refusals select the detail attached to the lowest canonical operation ID. -/
theorem refusal_detail_selection_is_canonical_not_list_ordered :
    canonicalInternalOperationRefusal?
      [ .refused higherRefusalOperation .invalidProgram
      , .refused lowerRefusalOperation .invalidState ] = some .invalidState := by
  decide +kernel

end BpmnSemantics.CompensationEventSubProcessSnapshotIntegrationConformance
