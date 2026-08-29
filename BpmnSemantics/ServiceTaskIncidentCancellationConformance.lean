import BpmnSemantics.ServiceTaskIncidentRetryConformance

/-! # Service Task incident cancellation conformance

This module owns the proved laws for incident-gated root Process cancellation. It keeps the selected
entry rule distinct from general BPMN cancellation, modeled termination, and host cancellation.
-/

namespace BpmnSemantics.ServiceTaskIncidentCancellationConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def checkedProcess : CheckedProcess :=
  { ServiceTaskIncidentRetryConformance.checkedProcess with
    identity :=
      { ServiceTaskIncidentRetryConformance.checkedProcess.identity with
        semanticProfile := serviceTaskIncidentCancellationCheckpointProfileId } }

def program : Program := lowerCheckedProcess checkedProcess

def instanceId : SemanticId :=
  ServiceTaskIncidentRetryConformance.effectId.processInstanceId

def effectId : EffectOccurrenceId :=
  ServiceTaskIncidentRetryConformance.effectId

def incidentId : EffectIncidentId :=
  ServiceTaskIncidentRetryConformance.incidentId

def rootOwner : ScopeOccurrenceId :=
  ServiceTaskIncidentRetryConformance.effectWait.owner

def preservedProcessBindings : List VariableBinding :=
  [{ name := "preserved", value := .string "before-cancel" }]

def waitingState : RuntimeState :=
  { ServiceTaskIncidentRetryConformance.waitingState with
    variables :=
      { ServiceTaskIncidentRetryConformance.waitingState.variables with
        process := { bindings := preservedProcessBindings } } }

def incidentState : RuntimeState :=
  { ServiceTaskIncidentRetryConformance.incidentState with
    variables :=
      { ServiceTaskIncidentRetryConformance.incidentState.variables with
        process := { bindings := preservedProcessBindings } } }

def firstCallElementId : NodeId := ⟨"Call_Cancellation"⟩

def calledInstanceId : SemanticId :=
  deriveCalledProcessInstanceId instanceId firstCallElementId 1

def calledRootOwner : ScopeOccurrenceId :=
  { processInstanceId := calledInstanceId
    definitionScopeId := ⟨"scope:CalledCancellationRoot"⟩
    activation := 1 }

def childOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:CancellationChild"⟩
    activation := 1 }

def calledChildOwner : ScopeOccurrenceId :=
  { processInstanceId := calledInstanceId
    definitionScopeId := ⟨"scope:CalledCancellationChild"⟩
    activation := 1 }

def nestedCallElementId : NodeId := ⟨"Call_NestedCancellation"⟩

def nestedCalledInstanceId : SemanticId :=
  deriveCalledProcessInstanceId calledInstanceId nestedCallElementId 1

def nestedCalledRootOwner : ScopeOccurrenceId :=
  { processInstanceId := nestedCalledInstanceId
    definitionScopeId := ⟨"scope:NestedCalledCancellationRoot"⟩
    activation := 1 }

def nestedCalledChildOwner : ScopeOccurrenceId :=
  { processInstanceId := nestedCalledInstanceId
    definitionScopeId := ⟨"scope:NestedCalledCancellationChild"⟩
    activation := 1 }

def extraEffectId : EffectOccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨"ExtraEffect"⟩
    activation := 1 }

def extraEffectWait : EffectWait :=
  { processInstanceId := instanceId
    owner := childOwner
    elementId := ⟨"ExtraEffect"⟩
    activation := 1
    descriptor := ServiceTaskEffectConformance.descriptor
    arguments := [{ name := "local", value := .string "open" }]
    outputMappings := []
    output := ⟨"place:ExtraEffectOutput"⟩
    bpmnErrorRoute := none }

/-- The separating state combines a valid suspended incident with every represented owner family and a two-level derived called tree. -/
def cancellationCounterexampleState : RuntimeState :=
  { incidentState with
    scopeOccurrences :=
      [ { id := nestedCalledChildOwner, parent := some nestedCalledRootOwner }
      , { id := nestedCalledRootOwner, parent := none }
      , { id := calledChildOwner, parent := some calledRootOwner }
      , { id := calledRootOwner, parent := none }
      , { id := childOwner, parent := some rootOwner }
      , { id := rootOwner, parent := none } ]
    tokens :=
      [ { placeId := ⟨"place:CalledLiveWork"⟩, owner := calledChildOwner }
      , { placeId := ⟨"place:RootLiveWork"⟩, owner := rootOwner } ]
    waits :=
      [{ processInstanceId := instanceId
         owner := childOwner
         task := { id := ⟨"CancellationTask"⟩, name := none }
         activation := 1
         output := ⟨"place:CancellationTaskOutput"⟩ }]
    messageWaits :=
      [{ processInstanceId := nestedCalledInstanceId
         owner := nestedCalledChildOwner
         elementId := ⟨"CalledMessage"⟩
         activation := 1
         channel := .directMessage ⟨"CancellationMessage"⟩
         output := ⟨"place:CalledMessageOutput"⟩ }]
    timerWaits :=
      [{ processInstanceId := instanceId
         owner := childOwner
         elementId := ⟨"CancellationTimer"⟩
         activation := 1
         deadlineMs := 100
         output := ⟨"place:CancellationTimerOutput"⟩ }]
    effectWaits := [extraEffectWait]
    selectedBranchSets :=
      [{ owner := childOwner
         selectionKey := "cancel-selection"
         expectedInputs := [⟨"place:Selected"⟩] }]
    eventRaces :=
      [{ id :=
          { processInstanceId := nestedCalledInstanceId
            elementId := ⟨"CalledRace"⟩
            activation := 1 }
         owner := nestedCalledChildOwner
         messageSubscriptionId :=
          { processInstanceId := nestedCalledInstanceId
            elementId := ⟨"CalledMessage"⟩
            activation := 1 }
         timerOccurrenceId :=
          { processInstanceId := nestedCalledInstanceId
            elementId := ⟨"CalledTimer"⟩
            activation := 1 } }]
    calledProcessOccurrences :=
      [{ id :=
          { processInstanceId := instanceId
            elementId := ⟨"Call_Cancellation"⟩
            activation := 1 }
         caller := rootOwner
         calledProcessId := ⟨"CalledCancellationProcess"⟩
         calledRoot := calledRootOwner
         returnOperationId := ⟨"operation:return:cancellation"⟩ },
       { id :=
          { processInstanceId := calledInstanceId
            elementId := ⟨"Call_NestedCancellation"⟩
            activation := 1 }
         caller := calledRootOwner
         calledProcessId := ⟨"NestedCalledCancellationProcess"⟩
         calledRoot := nestedCalledRootOwner
         returnOperationId := ⟨"operation:return:nested-cancellation"⟩ }]
    variables :=
      { process := { bindings := preservedProcessBindings }
        activities :=
          [ { owner := .effectOccurrence incidentId.effectId
              bindings := [{ name := "suspended", value := .string "gone" }] }
          , { owner := .effectOccurrence extraEffectId
              bindings := [{ name := "open", value := .string "gone" }] } ] }
    activations := [{ taskId := ⟨"HistoryTask"⟩, count := 7 }]
    messageActivations := [{ elementId := ⟨"HistoryMessage"⟩, count := 6 }]
    timerActivations := [{ elementId := ⟨"HistoryTimer"⟩, count := 5 }]
    effectActivations := [{ elementId := ⟨"HistoryEffect"⟩, count := 4 }]
    scopeActivations := [{ scopeId := ⟨"HistoryScope"⟩, count := 3 }]
    eventRaceActivations := [{ elementId := ⟨"HistoryRace"⟩, count := 2 }]
    callActivations := [{ elementId := ⟨"HistoryCall"⟩, count := 1 }]
    endOccurrences := 8
    logicalTimeMs := 42 }

def cancellationStimulus : Stimulus :=
  .cancelIncidentProcess ⟨"cancel-incident-process"⟩ instanceId incidentId

def cleanedCounterexampleState : RuntimeState :=
  cancelScopeSubtree cancellationCounterexampleState rootOwner .remove

def cancelledCounterexampleState : RuntimeState :=
  cancelledIncidentRootState cleanedCounterexampleState instanceId

def cancelledObservation : StateObservation :=
  { instanceId
    status := .cancelled
    activeWaits := []
    openUserTasks := []
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    openIncidents := []
    variables := preservedProcessBindings
    enabledInteractions := []
    logicalTimeMs := 42 }

theorem exact_successor_checked_process_and_program_are_admitted :
    checkedWellFormed checkedProcess = true ∧
      programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true ∧
      program.operations =
        ServiceTaskIncidentRetryConformance.program.operations ∧
      program.controlPlaces =
        ServiceTaskIncidentRetryConformance.program.controlPlaces ∧
      program.definitionScopes =
        ServiceTaskIncidentRetryConformance.program.definitionScopes := by
  decide +kernel

theorem successor_profile_reports_the_same_literal_generation_one_incident :
    applyStimulus 0 program waitingState
        (.reportEffectFailure ⟨"report-failure"⟩ effectId 1) =
      { outcome := .committed
        state := incidentState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

theorem valid_incident_with_distinct_parentless_called_root_derives_hosting_root :
    calledProcessAssociationsValid cancellationCounterexampleState = true ∧
      effectIncidentAssociationsValid cancellationCounterexampleState = true ∧
      incidentCancellationRoot? cancellationCounterexampleState instanceId =
        some rootOwner ∧
      incidentProcessCancellationEligibility? program cancellationCounterexampleState
        instanceId incidentId =
          some { root := rootOwner, cleaned := cleanedCounterexampleState } ∧
      incidentProcessCancellationRoot? program cancellationCounterexampleState
        instanceId incidentId = some rootOwner := by
  decide +kernel

theorem cancellation_evaluator_is_sound_for_derived_hosting_root :
    cancelIncidentProcess program cancellationCounterexampleState instanceId
        incidentId = some cancelledCounterexampleState ∧
      IncidentProcessCancellationStep program cancellationCounterexampleState
        instanceId incidentId cancelledCounterexampleState := by
  have executed := (by decide +kernel :
    cancelIncidentProcess program cancellationCounterexampleState instanceId
      incidentId = some cancelledCounterexampleState)
  exact ⟨executed, cancelIncidentProcess_sound program
    cancellationCounterexampleState cancelledCounterexampleState instanceId
    incidentId executed⟩

theorem cancellation_removes_complete_root_and_called_region_exactly :
    cancelledCounterexampleState.control = .cancelled instanceId ∧
      cancelledCounterexampleState.initiationPending = false ∧
      cancelledCounterexampleState.scopeOccurrences = [] ∧
      cancelledCounterexampleState.tokens = [] ∧
      cancelledCounterexampleState.waits = [] ∧
      cancelledCounterexampleState.messageWaits = [] ∧
      cancelledCounterexampleState.timerWaits = [] ∧
      cancelledCounterexampleState.effectWaits = [] ∧
      cancelledCounterexampleState.effectIncidents = [] ∧
      cancelledCounterexampleState.selectedBranchSets = [] ∧
      cancelledCounterexampleState.eventRaces = [] ∧
      cancelledCounterexampleState.calledProcessOccurrences = [] ∧
      cancelledCounterexampleState.variables.activities = [] := by
  decide +kernel

theorem cancellation_preserves_process_data_counters_end_history_and_time_exactly :
    cancelledCounterexampleState.variables.process =
        cancellationCounterexampleState.variables.process ∧
      cancelledCounterexampleState.activations =
        cancellationCounterexampleState.activations ∧
      cancelledCounterexampleState.messageActivations =
        cancellationCounterexampleState.messageActivations ∧
      cancelledCounterexampleState.timerActivations =
        cancellationCounterexampleState.timerActivations ∧
      cancelledCounterexampleState.effectActivations =
        cancellationCounterexampleState.effectActivations ∧
      cancelledCounterexampleState.scopeActivations =
        cancellationCounterexampleState.scopeActivations ∧
      cancelledCounterexampleState.eventRaceActivations =
        cancellationCounterexampleState.eventRaceActivations ∧
      cancelledCounterexampleState.callActivations =
        cancellationCounterexampleState.callActivations ∧
      cancelledCounterexampleState.endOccurrences =
        cancellationCounterexampleState.endOccurrences ∧
      cancelledCounterexampleState.logicalTimeMs =
        cancellationCounterexampleState.logicalTimeMs := by
  decide +kernel

theorem committed_cancellation_is_terminal_without_internal_closure_or_end_occurrence :
    applyStimulus 0 program cancellationCounterexampleState cancellationStimulus =
      { outcome := .committed
        state := cancelledCounterexampleState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } ∧
      enabledInternalOperationCount program cancelledCounterexampleState = 0 ∧
      stableStateResumable cancelledCounterexampleState = true ∧
      observeStableState program cancelledCounterexampleState =
        some cancelledObservation := by
  decide +kernel

def pendingInitiationState : RuntimeState :=
  { incidentState with initiationPending := true }

def wrongRootInstanceId : SemanticId := ⟨"WrongRootInstance"⟩

def orphanInstanceId : SemanticId := ⟨"OrphanCancellationInstance"⟩

def orphanOwner : ScopeOccurrenceId :=
  { processInstanceId := orphanInstanceId
    definitionScopeId := ⟨"scope:OrphanCancellationRoot"⟩
    activation := 1 }

/-- A valid incident-bearing hosting root does not authorize silently terminalizing unrelated live work. -/
def orphanLiveRegionState : RuntimeState :=
  { incidentState with
    scopeOccurrences :=
      { id := orphanOwner, parent := none } :: incidentState.scopeOccurrences
    waits :=
      [{ processInstanceId := orphanInstanceId
         owner := orphanOwner
         task := { id := ⟨"OrphanTask"⟩, name := none }
         activation := 1
         output := ⟨"place:OrphanTaskOutput"⟩ }] }

def residualActivityState : RuntimeState :=
  { incidentState with
    variables :=
      { incidentState.variables with
        activities := incidentState.variables.activities ++
          [{ owner := .effectOccurrence extraEffectId
             bindings := [{ name := "orphan", value := .string "live" }] }] } }

def malformedDerivedRootOwner : ScopeOccurrenceId :=
  { nestedCalledRootOwner with
    processInstanceId := ⟨"not-derived-from-the-nested-caller"⟩ }

def malformedDerivedCallState : RuntimeState :=
  { cancellationCounterexampleState with
    scopeOccurrences :=
      cancellationCounterexampleState.scopeOccurrences.map fun occurrence =>
        if occurrence.id = nestedCalledRootOwner then
          { occurrence with id := malformedDerivedRootOwner }
        else if occurrence.parent = some nestedCalledRootOwner then
          { occurrence with parent := some malformedDerivedRootOwner }
        else occurrence
    calledProcessOccurrences :=
      cancellationCounterexampleState.calledProcessOccurrences.map fun record =>
        if record.calledRoot = nestedCalledRootOwner then
          { record with calledRoot := malformedDerivedRootOwner }
        else record }

def malformedCallerState : RuntimeState :=
  { cancellationCounterexampleState with
    calledProcessOccurrences :=
      cancellationCounterexampleState.calledProcessOccurrences.map fun record =>
        if record.calledRoot = nestedCalledRootOwner then
          { record with caller := calledChildOwner }
        else record }

def duplicateHostingRootState : RuntimeState :=
  { incidentState with
    scopeOccurrences :=
      { id := { rootOwner with definitionScopeId := ⟨"scope:DuplicateRoot"⟩ }
        parent := none } :: incidentState.scopeOccurrences }

def duplicateIncidentState : RuntimeState :=
  { incidentState with
    effectIncidents := incidentState.effectIncidents ++ incidentState.effectIncidents }

theorem valid_incident_with_orphan_live_region_refuses_unchanged :
    effectIncidentAssociationsValid orphanLiveRegionState = true ∧
      incidentCancellationRoot? orphanLiveRegionState instanceId = some rootOwner ∧
      incidentProcessCancellationRoot? program orphanLiveRegionState instanceId
        incidentId = none ∧
      incidentCancellationLiveRegionEmpty
        (cancelScopeSubtree orphanLiveRegionState rootOwner .remove) = false ∧
      applyStimulus 0 program orphanLiveRegionState cancellationStimulus =
        { outcome := .rejected
          state := orphanLiveRegionState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  decide +kernel

theorem cancellation_publication_requires_exact_commit_eligibility :
    (observeStableState program orphanLiveRegionState).map
        (fun observation => observation.enabledInteractions) =
      some [.retryIncident incidentId] ∧
    (observeStableState program residualActivityState).map
        (fun observation => observation.enabledInteractions) =
      some [.retryIncident incidentId] ∧
    (observeStableState program malformedDerivedCallState).map
        (fun observation => observation.enabledInteractions) =
      some [.retryIncident incidentId] ∧
    (observeStableState program malformedCallerState).map
        (fun observation => observation.enabledInteractions) =
      some [.retryIncident incidentId] ∧
    (observeStableState program duplicateHostingRootState).map
        (fun observation => observation.enabledInteractions) =
      some [.retryIncident incidentId] ∧
    observeStableState program duplicateIncidentState = none := by
  decide +kernel

theorem malformed_called_associations_refuse_with_exact_state_identity :
    calledProcessAssociationsValid malformedDerivedCallState = false ∧
      calledProcessAssociationsValid malformedCallerState = false ∧
      applyStimulus 0 program malformedDerivedCallState cancellationStimulus =
        { outcome := .rejected
          state := malformedDerivedCallState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      applyStimulus 0 program malformedCallerState cancellationStimulus =
        { outcome := .rejected
          state := malformedCallerState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  decide +kernel

theorem non_singleton_incident_collection_refuses_before_cleanup_unchanged :
    duplicateIncidentState.effectIncidents.length = 2 ∧
      incidentProcessCancellationRoot? program duplicateIncidentState instanceId
        incidentId = none ∧
      applyStimulus 0 program duplicateIncidentState cancellationStimulus =
        { outcome := .rejected
          state := duplicateIncidentState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  decide +kernel

theorem pending_initiation_and_wrong_root_refuse_with_exact_state_identity :
    applyStimulus 0 program pendingInitiationState cancellationStimulus =
        { outcome := .rejected
          state := pendingInitiationState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      applyStimulus 0 program incidentState
          (.cancelIncidentProcess ⟨"wrong-root"⟩ wrongRootInstanceId incidentId) =
        { outcome := .rejected
          state := incidentState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  decide +kernel

theorem stale_incident_old_profile_and_terminal_cancellation_refuse_unchanged :
    applyStimulus 0 program incidentState
        (.cancelIncidentProcess ⟨"stale"⟩ instanceId
          { incidentId with effectId := { effectId with activation := 2 } }) =
      { outcome := .rejected
        state := incidentState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } ∧
    applyStimulus 0 ServiceTaskIncidentRetryConformance.program
        ServiceTaskIncidentRetryConformance.incidentState cancellationStimulus =
      { outcome := .rejected
        state := ServiceTaskIncidentRetryConformance.incidentState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } ∧
    applyStimulus 0 program cancelledCounterexampleState cancellationStimulus =
      { outcome := .rejected
        state := cancelledCounterexampleState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

def incidentObservation : StateObservation :=
  { ServiceTaskIncidentRetryConformance.incidentObservation with
    variables := preservedProcessBindings
    enabledInteractions :=
      [ .retryIncident incidentId
      , .cancelIncidentProcess instanceId incidentId ] }

theorem projection_orders_retry_before_cancel_and_preserves_stage_one_prefix :
    observeStableState program incidentState = some incidentObservation ∧
      (observeStableState ServiceTaskIncidentRetryConformance.program
        ServiceTaskIncidentRetryConformance.incidentState).map
          (fun observation => observation.enabledInteractions) =
        some [.retryIncident incidentId] := by
  decide +kernel

theorem cancellation_then_retry_commits_then_rejects_in_queue_order :
    let first := applyStimulus 0 program incidentState cancellationStimulus
    let second := applyStimulus 0 program first.state
      (.retryIncident ⟨"retry-after-cancel"⟩ incidentId)
    first.outcome = .committed ∧
      first.state.control = .cancelled instanceId ∧
      second =
        { outcome := .rejected
          state := first.state
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  decide +kernel

theorem retry_then_cancellation_commits_then_rejects_in_queue_order :
    let first := applyStimulus 0 program incidentState
      (.retryIncident ⟨"retry-first"⟩ incidentId)
    let second := applyStimulus 0 program first.state cancellationStimulus
    first.outcome = .committed ∧
      first.state.control = .running instanceId ∧
      first.state.effectIncidents = [] ∧
      first.state.effectWaits =
        [{ ServiceTaskIncidentRetryConformance.effectWait with
          incidentAlreadyRetried := true }] ∧
      second =
        { outcome := .rejected
          state := first.state
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  decide +kernel

end BpmnSemantics.ServiceTaskIncidentCancellationConformance
