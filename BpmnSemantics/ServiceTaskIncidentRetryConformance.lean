import BpmnSemantics.SemanticProcess.Scenario
import BpmnSemantics.ServiceTaskEffectConformance

/-! # Service Task incident and retry conformance

This module owns the proved laws for one literal-generation Service Task effect incident and its one exact retry. It does not define CIB, Temporal, cancellation, or general BPMN fault meaning.
-/

namespace BpmnSemantics.ServiceTaskIncidentRetryConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def checkedProcess : CheckedProcess :=
  { ServiceTaskEffectConformance.checkedProcess with
    identity :=
      { ServiceTaskEffectConformance.checkedProcess.identity with
        semanticProfile := serviceTaskIncidentCheckpointProfileId } }

def program : Program :=
  lowerCheckedProcess checkedProcess

def effectId : EffectOccurrenceId :=
  ServiceTaskEffectConformance.effectId

def incidentId : EffectIncidentId :=
  { effectId, generation := 1 }

def effectWait : EffectWait :=
  { ServiceTaskEffectConformance.effectWait with
    incidentAlreadyRetried := false }

def waitingState : RuntimeState :=
  singletonEffectWaitingState effectWait

def incident : SemanticEffectIncident :=
  { id := incidentId, wait := effectWait }

def incidentState : RuntimeState :=
  { waitingState with
    effectWaits := []
    effectIncidents := [incident] }

def retriedWait : EffectWait :=
  { effectWait with incidentAlreadyRetried := true }

def retriedState : RuntimeState :=
  { incidentState with
    effectIncidents := []
    effectWaits := [retriedWait] }

def incidentObservation : StateObservation :=
  { instanceId := effectId.processInstanceId
    status := .running
    activeWaits :=
      [{ elementId := effectId.elementId, kind := .incident, multiplicity := 1 }]
    openUserTasks := []
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    openIncidents :=
      [{ kind := .effectExecutionFailed
         id := incidentId
         effect :=
           { id := effectId
             descriptor := effectWait.descriptor
             arguments := effectWait.arguments } }]
    variables := []
    enabledInteractions := [.retryIncident incidentId]
    logicalTimeMs := 0 }

def retriedObservation : StateObservation :=
  { instanceId := effectId.processInstanceId
    status := .running
    activeWaits :=
      [{ elementId := effectId.elementId, kind := .effect, multiplicity := 1 }]
    openUserTasks := []
    openMessageSubscriptions := []
    openTimers := []
    openEffects :=
      [{ id := effectId
         descriptor := effectWait.descriptor
         arguments := effectWait.arguments }]
    openIncidents := []
    variables := []
    enabledInteractions := []
    logicalTimeMs := 0 }

theorem exact_successor_checked_process_is_admitted :
    checkedWellFormed checkedProcess = true := by
  decide +kernel

theorem exact_successor_program_is_admitted :
    programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true := by
  decide +kernel

theorem report_relation_exists_for_literal_generation_one :
    EffectIncidentReportStep waitingState effectId 1 incidentState := by
  apply EffectIncidentReportStep.commit waitingState effectId effectWait
  · decide +kernel
  · decide +kernel

theorem report_evaluator_is_sound_for_literal_generation_one :
    reportEffectFailure waitingState effectId 1 = some incidentState ∧
      EffectIncidentReportStep waitingState effectId 1 incidentState := by
  have executed : reportEffectFailure waitingState effectId 1 =
      some incidentState := by decide +kernel
  exact ⟨executed,
    reportEffectFailure_sound waitingState incidentState effectId 1 executed⟩

theorem retry_relation_exists_for_exact_incident :
    EffectIncidentRetryStep incidentState incidentId retriedState := by
  apply EffectIncidentRetryStep.commit incidentState incidentId incident
  · decide +kernel
  · decide +kernel

theorem retry_evaluator_is_sound_for_exact_incident :
    retryEffectIncident incidentState incidentId = some retriedState ∧
      EffectIncidentRetryStep incidentState incidentId retriedState := by
  have executed : retryEffectIncident incidentState incidentId =
      some retriedState := by decide +kernel
  exact ⟨executed,
    retryEffectIncident_sound incidentState retriedState incidentId executed⟩

theorem report_projects_exact_incident_and_retry_interaction :
    observeStableState program incidentState = some incidentObservation := by
  decide +kernel

theorem retry_restores_exact_effect_projection :
    observeStableState program retriedState = some retriedObservation := by
  decide +kernel

theorem incident_blocks_scope_quiescence_and_is_resumable :
    scopeQuiescent incidentState effectWait.owner = false ∧
      stableStateResumable incidentState = true := by
  decide +kernel

theorem retry_preserves_complete_suspended_effect_and_runtime_context :
    retriedWait.processInstanceId = effectWait.processInstanceId ∧
      retriedWait.owner = effectWait.owner ∧
      retriedWait.elementId = effectWait.elementId ∧
      retriedWait.activation = effectWait.activation ∧
      retriedWait.descriptor = effectWait.descriptor ∧
      retriedWait.arguments = effectWait.arguments ∧
      retriedWait.outputMappings = effectWait.outputMappings ∧
      retriedWait.bpmnErrorRoute = effectWait.bpmnErrorRoute ∧
      retriedWait.output = effectWait.output ∧
      retriedState.variables = incidentState.variables ∧
      retriedState.logicalTimeMs = incidentState.logicalTimeMs ∧
      retriedState.activations = incidentState.activations ∧
      retriedState.messageActivations = incidentState.messageActivations ∧
      retriedState.timerActivations = incidentState.timerActivations ∧
      retriedState.effectActivations = incidentState.effectActivations ∧
      retriedState.scopeActivations = incidentState.scopeActivations ∧
      retriedState.eventRaceActivations = incidentState.eventRaceActivations ∧
      retriedState.callActivations = incidentState.callActivations ∧
      retriedState.tokens = incidentState.tokens ∧
      retriedWait.incidentAlreadyRetried = true := by
  decide +kernel

theorem wrong_occurrence_report_is_rejected_with_exact_state :
    applyStimulus scenarioClosureLimit program waitingState
        (.reportEffectFailure ⟨"wrong-occurrence"⟩
          { effectId with activation := 2 } 1) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem stale_incident_retry_is_rejected_with_exact_state :
    applyStimulus scenarioClosureLimit program incidentState
        (.retryIncident ⟨"stale-incident"⟩
          { incidentId with effectId := { effectId with activation := 2 } }) =
      { outcome := .rejected
        state := incidentState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

def mismatchedIncidentState : RuntimeState :=
  { incidentState with
    effectIncidents :=
      [{ incident with
         id := { incidentId with effectId := { effectId with activation := 2 } } }] }

def duplicateOwnerScopeIncidentState : RuntimeState :=
  { incidentState with
    scopeOccurrences := incidentState.scopeOccurrences ++
      incidentState.scopeOccurrences }

def processIdentityDriftIncidentState : RuntimeState :=
  { incidentState with control := .running ⟨"OtherInstance"⟩ }

def missingActivityScopeIncidentState : RuntimeState :=
  { incidentState with
    variables := { incidentState.variables with activities := [] } }

def duplicateActivityScopeIncidentState : RuntimeState :=
  { incidentState with
    variables :=
      { incidentState.variables with
        activities := incidentState.variables.activities ++
          incidentState.variables.activities } }

def openMatchingEffectIncidentState : RuntimeState :=
  { incidentState with effectWaits := [effectWait] }

def retriedSuspendedWaitIncidentState : RuntimeState :=
  { incidentState with
    effectIncidents := [{ incident with wait := retriedWait }] }

def secondIncident : SemanticEffectIncident :=
  let secondEffectId := { effectId with activation := 2 }
  { id := { effectId := secondEffectId, generation := 1 }
    wait := { effectWait with activation := 2 } }

def secondEffectWait : EffectWait :=
  { effectWait with activation := 2 }

def twoDistinctIncidentsState : RuntimeState :=
  { incidentState with effectIncidents := [incident, secondIncident] }

def malformedIncidentStates : List RuntimeState :=
  [ duplicateOwnerScopeIncidentState
  , processIdentityDriftIncidentState
  , missingActivityScopeIncidentState
  , duplicateActivityScopeIncidentState
  , openMatchingEffectIncidentState
  , retriedSuspendedWaitIncidentState
  , twoDistinctIncidentsState ]

theorem malformed_incident_association_table_is_closed :
    malformedIncidentStates.map effectIncidentAssociationsValid =
      [false, false, false, false, false, false, false] := by
  decide +kernel

theorem malformed_report_readiness_table_is_closed :
    effectWaitReadyForIncident
        { waitingState with
          scopeOccurrences := waitingState.scopeOccurrences ++
            waitingState.scopeOccurrences }
        effectId effectWait = false ∧
      effectWaitReadyForIncident
        { waitingState with control := .running ⟨"OtherInstance"⟩ }
        effectId effectWait = false ∧
      effectWaitReadyForIncident
        { waitingState with
          variables := { waitingState.variables with activities := [] } }
        effectId effectWait = false ∧
      effectWaitReadyForIncident
        { waitingState with
          variables :=
            { waitingState.variables with
              activities := waitingState.variables.activities ++
                waitingState.variables.activities } }
        effectId effectWait = false ∧
      effectWaitReadyForIncident
        { waitingState with effectWaits := [retriedWait] }
        effectId retriedWait = false ∧
      effectWaitReadyForIncident
        { waitingState with effectWaits := [effectWait, secondEffectWait] }
        effectId effectWait = false := by
  decide +kernel

theorem two_distinct_incidents_are_rejected_before_dispatch :
    applyStimulus scenarioClosureLimit program twoDistinctIncidentsState
        (.retryIncident ⟨"two-incidents"⟩ incidentId) =
      { outcome := .rejected
        state := twoDistinctIncidentsState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem two_distinct_incidents_are_rejected_by_retry_evaluator :
    retryEffectIncident twoDistinctIncidentsState incidentId = none := by
  decide +kernel

theorem mismatched_incident_wait_identity_is_rejected_before_dispatch :
    applyStimulus scenarioClosureLimit program mismatchedIncidentState
        (.retryIncident ⟨"mismatched"⟩
          { incidentId with effectId := { effectId with activation := 2 } }) =
      { outcome := .rejected
        state := mismatchedIncidentState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem duplicate_report_is_rejected_with_exact_state :
    applyStimulus scenarioClosureLimit program incidentState
        (.reportEffectFailure ⟨"duplicate-report"⟩ effectId 1) =
      { outcome := .rejected
        state := incidentState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem retry_while_effect_is_open_is_rejected_with_exact_state :
    applyStimulus scenarioClosureLimit program waitingState
        (.retryIncident ⟨"retry-open-effect"⟩ incidentId) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem two_distinct_retry_commands_commit_then_reject_in_queue_order :
    let first := applyStimulus scenarioClosureLimit program incidentState
      (.retryIncident ⟨"retry-first"⟩ incidentId)
    let second := applyStimulus scenarioClosureLimit program first.state
      (.retryIncident ⟨"retry-second"⟩ incidentId)
    first =
        { outcome := .committed
          state := retriedState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      second =
        { outcome := .rejected
          state := retriedState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  decide +kernel

theorem post_retry_report_is_rejected_with_exact_state :
    applyStimulus scenarioClosureLimit program retriedState
        (.reportEffectFailure ⟨"post-retry-report"⟩ effectId 1) =
      { outcome := .rejected
        state := retriedState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem incident_bearing_non_successor_program_rejects_before_closure
    (candidate : Program) (closureLimit : Nat) (commandId : SemanticId)
    (profileMismatch :
      candidate.identity.semanticProfile ≠ serviceTaskIncidentCheckpointProfileId)
    (cancellationProfileMismatch :
      candidate.identity.semanticProfile ≠
        serviceTaskIncidentCancellationCheckpointProfileId) :
    applyStimulus closureLimit candidate incidentState
        (.retryIncident commandId incidentId) =
      { outcome := .rejected
        state := incidentState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  cases declared : candidate.compensationEventSubProcessSnapshots with
  | none =>
      simp [applyStimulus, admitStimulus, declared, incidentStateAdmitted,
        serviceTaskIncidentProfileAdmitted, incidentState, incident,
        profileMismatch, cancellationProfileMismatch]
  | some declaration =>
      exact applyStimulus_withSnapshotDeclaration_rejects closureLimit candidate incidentState
        (.retryIncident commandId incidentId) declaration declared

theorem predecessor_profile_rejects_injected_incident_unchanged :
    applyStimulus 0 ServiceTaskEffectConformance.program incidentState
        (.retryIncident ⟨"old-profile"⟩ incidentId) =
      { outcome := .rejected
        state := incidentState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  apply incident_bearing_non_successor_program_rejects_before_closure
  decide +kernel
  decide +kernel

theorem success_and_bpmn_error_never_create_incidents :
    (applyStimulus scenarioClosureLimit program waitingState
      (.completeEffect ⟨"success"⟩ effectId (.success []))).state.effectIncidents = [] ∧
    (applyStimulus scenarioClosureLimit program waitingState
      (.completeEffect ⟨"business-error"⟩ effectId
        (.bpmnError "ERR" none []))).state.effectIncidents = [] := by
  decide +kernel

end BpmnSemantics.ServiceTaskIncidentRetryConformance
