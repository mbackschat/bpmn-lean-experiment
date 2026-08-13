import BpmnSemantics.MessageStartConformance
import BpmnSemantics.SemanticProcess

/-! # Timer Start Event conformance

This module owns the exact standards-only Timer Start fixture and its proved admission, lowering, transition, identity-refusal, closure, observation, and scenario-ordering laws. It covers one top-level `PT1S` Timer Start Event followed by one User Task and one None End Event. Schedule lifecycle, recurring timers, time-date and time-cycle forms, payload, Event Sub-Process starts, and host identity remain outside this account.
-/

namespace BpmnSemantics.TimerStartConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  timerStartProfileId

def sourceIdentity : SourceIdentity :=
  { semanticProfile := profileId
    sourceId := ⟨"timer-start-event"⟩
    sourceSha256 :=
      "16ede7a6d5090be3a481ce7a4af97745bba96375272a59da66384091dd2c02b0" }

def processId : ProcessId :=
  ⟨"Process_TimerStart"⟩

def startEventId : NodeId :=
  ⟨"TimerStart_PT1S"⟩

def taskNodeId : NodeId :=
  ⟨"UserTask_AfterTimer"⟩

def endEventId : NodeId :=
  ⟨"EndEvent_AfterTimer"⟩

def startOutput : ControlPlaceId :=
  ⟨"place:Flow_TimerStartToTask"⟩

def taskOutput : ControlPlaceId :=
  ⟨"place:Flow_TaskToEnd"⟩

def checkedProcess : CheckedProcess :=
  { identity := sourceIdentity
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [endEventId, startEventId, taskNodeId]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [⟨"Flow_TaskToEnd"⟩, ⟨"Flow_TimerStartToTask"⟩]
    nodes :=
      [ .noneEndEvent endEventId
      , .timerStartEvent startEventId "PT1S"
      , .userTask taskNodeId (some "Review") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_TaskToEnd"⟩
          sourceId := taskNodeId
          targetId := endEventId }
      , { id := ⟨"Flow_TimerStartToTask"⟩
          sourceId := startEventId
          targetId := taskNodeId } ] }

def expectedProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := profileId
        sourceId := sourceIdentity.sourceId
        sourceSha256 := sourceIdentity.sourceSha256 }
    processId
    definitionScopes := checkedProcess.definitionScopes
    operationScopes :=
      [ { operationId := ⟨"operation:EndEvent_AfterTimer"⟩
          scopeId := rootDefinitionScopeId processId }
      , { operationId := ⟨"operation:TimerStart_PT1S"⟩
          scopeId := rootDefinitionScopeId processId }
      , { operationId := ⟨"operation:UserTask_AfterTimer"⟩
          scopeId := rootDefinitionScopeId processId }
      , { operationId :=
            ⟨"operation:complete-scope:scope:Process_TimerStart"⟩
          scopeId := rootDefinitionScopeId processId } ]
    controlPlaceScopes := rootSequenceFlowScopes processId
      [⟨"Flow_TaskToEnd"⟩, ⟨"Flow_TimerStartToTask"⟩] |>.map
        fun ownership =>
          { controlPlaceId := flowControlPlaceId ownership.sequenceFlowId
            scopeId := ownership.scopeId }
    controlPlaces := checkedProcess.sequenceFlows.map
      CheckedSequenceFlow.toControlPlace
    operations :=
      [ .reachNoneEnd
          ⟨"operation:EndEvent_AfterTimer"⟩
          { elementId := endEventId }
          taskOutput
      , .initiateTimer
          ⟨"operation:TimerStart_PT1S"⟩
          { elementId := startEventId }
          1000
          [startOutput]
      , .awaitUserTask
          ⟨"operation:UserTask_AfterTimer"⟩
          { elementId := taskNodeId }
          startOutput
          taskOutput
          { id := ⟨taskNodeId.value⟩, name := some "Review" }
      , .completeScope
          ⟨"operation:complete-scope:scope:Process_TimerStart"⟩
          { elementId := ⟨processId.value⟩ }
          (rootDefinitionScopeId processId)
          none ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def startOperationId : OperationId :=
  ⟨"operation:TimerStart_PT1S"⟩

def taskOperationId : OperationId :=
  ⟨"operation:UserTask_AfterTimer"⟩

def instanceId : SemanticId :=
  ⟨"TimerStartInstance_1"⟩

def trigger : Stimulus :=
  .triggerTimerStart
    ⟨"trigger-timer-start"⟩
    ⟨processId.value⟩
    instanceId
    ⟨startEventId.value⟩

private def requiredObservations : List ObservationKind :=
  [ .deployment
  , .commandResults
  , .processStatus
  , .activeWaits
  , .openUserTasks
  , .openTimers
  , .openEffects
  , .variables
  , .enabledInteractions
  , .logicalTime ]

private def scenarioForProgram (candidate : Program) (stimuli : List Stimulus) :
    Scenario :=
  { kind := .scenario
    id := ⟨"timer-start-pairing"⟩
    profile := candidate.identity.semanticProfile
    bpmn :=
      { id := candidate.identity.sourceId
        relativePath := "timer-start-pairing.bpmn"
        sha256 := candidate.identity.sourceSha256
        sourceOverlay := candidate.identity.sourceOverlay }
    stimuli
    observations := requiredObservations
    provenance :=
      { normativeRefs := []
        cibRevision := "not-applicable"
        cibRefs := [] } }

def rootOwner (id : SemanticId) : ScopeOccurrenceId :=
  rootScopeOccurrenceId id processId

def admittedState : RuntimeState :=
  (admitTimerStart? program initialState ⟨processId.value⟩ instanceId
    ⟨startEventId.value⟩).getD initialState

def initiatedState : RuntimeState :=
  (step program admittedState startOperationId).getD initialState

def exactWait : UserTaskWait :=
  { processInstanceId := instanceId
    owner := rootOwner instanceId
    task := { id := ⟨taskNodeId.value⟩, name := some "Review" }
    activation := 1
    output := taskOutput }

def waitingState : RuntimeState :=
  { admittedState with
    initiationPending := false
    waits := [exactWait]
    activations := [{ taskId := exactWait.task.id, count := 1 }] }

private def comparisonProgramIdentity (profile sourceId digest : String) :
    ProgramIdentity :=
  { expectedProgram.identity with
    semanticProfile := ⟨profile⟩
    sourceId := ⟨sourceId⟩
    sourceSha256 := digest }

def noneComparisonProgram : Program :=
  { expectedProgram with
    identity := comparisonProgramIdentity
      "cibseven-2.2.0-user-task-process-data-draft"
      "timer-start-none-comparison"
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    operations := expectedProgram.operations.map fun operation =>
      match operation with
      | .initiateTimer id origin _ [output] => .initiate id origin output
      | other => other }

def messageComparisonProgram : Program :=
  { expectedProgram with
    identity := comparisonProgramIdentity
      messageStartProfileId.value
      "timer-start-message-comparison"
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    operations := expectedProgram.operations.map fun operation =>
      match operation with
      | .initiateTimer id origin _ outputs =>
          .initiateMessage id origin MessageStartConformance.channel outputs
      | other => other }

def noneInstanceId : SemanticId :=
  ⟨"NoneStartInstance_1"⟩

def messageInstanceId : SemanticId :=
  ⟨"MessageStartInstance_1"⟩

def noneTrigger : Stimulus :=
  .startProcess ⟨"start-none"⟩ ⟨processId.value⟩ noneInstanceId []

def messageTrigger : Stimulus :=
  .triggerMessageStart ⟨"start-message"⟩ ⟨processId.value⟩
    messageInstanceId ⟨startEventId.value⟩ MessageStartConformance.channel

def noneWaitingState : RuntimeState :=
  (applyStimulus 2 noneComparisonProgram initialState noneTrigger).state

def messageWaitingState : RuntimeState :=
  (applyStimulus 2 messageComparisonProgram initialState messageTrigger).state

private def normalizeOccurrenceId (id : OccurrenceId) : OccurrenceId :=
  { id with processInstanceId := ⟨"NormalizedInstance"⟩ }

private def normalizeEnabledInteraction : EnabledInteraction → EnabledInteraction
  | .completeUserTaskInstance id =>
      .completeUserTaskInstance (normalizeOccurrenceId id)
  | .deliverMessage id channel =>
      .deliverMessage (normalizeOccurrenceId id) channel
  | .retryIncident incidentId =>
      .retryIncident
        { incidentId with effectId := normalizeOccurrenceId incidentId.effectId }
  | .cancelIncidentProcess _ incidentId =>
      .cancelIncidentProcess ⟨"NormalizedInstance"⟩
        { incidentId with effectId := normalizeOccurrenceId incidentId.effectId }

private def normalizeObservation (observation : StateObservation) :
    StateObservation :=
  { observation with
    instanceId := ⟨"NormalizedInstance"⟩
    openUserTasks := observation.openUserTasks.map fun task =>
      { task with id := normalizeOccurrenceId task.id }
    openMessageSubscriptions := observation.openMessageSubscriptions.map
      fun subscription =>
        { subscription with id := normalizeOccurrenceId subscription.id }
    openTimers := observation.openTimers.map fun timer =>
      { timer with id := normalizeOccurrenceId timer.id }
    openEffects := observation.openEffects.map fun effect =>
      { effect with id := normalizeOccurrenceId effect.id }
    openIncidents := observation.openIncidents.map fun incident =>
      { incident with
        id := { incident.id with effectId := normalizeOccurrenceId incident.id.effectId }
        effect := { incident.effect with id := normalizeOccurrenceId incident.effect.id } }
    enabledInteractions := observation.enabledInteractions.map
      normalizeEnabledInteraction }

/-- The exact checked graph is independently admitted. -/
theorem exact_checked_process_is_admitted :
    checkedWellFormed checkedProcess = true := by
  decide +kernel

/-- The exact lowered IL is structurally and profile-admitted. -/
theorem exact_program_is_admitted :
    programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true := by
  decide +kernel

/-- Checked source and IL are bound by exact lowering equality. -/
theorem exact_definition_binding_is_admitted :
    definitionBindingValid checkedProcess program = true := by
  decide +kernel

/-- Lowering preserves the exact Start Event origin, normalized duration, and endpoint-derived output. -/
theorem exact_lowering_preserves_timer_start :
    lowerCheckedProcess checkedProcess = expectedProgram ∧
      lowerTimerStartOutputs checkedProcess startEventId = [startOutput] := by
  decide +kernel

/-- Generic IL validation admits canonical nonempty Timer-initiation fan-out. -/
theorem generic_timer_initiation_accepts_multiple_distinct_outputs :
    timerInitiationOperationWellFormed
      [ { id := ⟨"place:A"⟩, origin := { elementId := ⟨"Flow_A"⟩ } }
      , { id := ⟨"place:B"⟩, origin := { elementId := ⟨"Flow_B"⟩ } } ]
      ⟨"operation:timer-start"⟩
      { elementId := startEventId }
      1000
      [⟨"place:A"⟩, ⟨"place:B"⟩] = true := by
  decide +kernel

/-- Generic IL validation rejects empty, repeated, noncanonical, and wrong-duration Timer initiations. -/
theorem generic_timer_initiation_rejects_malformed_outputs_or_duration :
    let places :=
      [ { id := ⟨"place:A"⟩, origin := { elementId := ⟨"Flow_A"⟩ } }
      , { id := ⟨"place:B"⟩, origin := { elementId := ⟨"Flow_B"⟩ } } ]
    timerInitiationOperationWellFormed places ⟨"operation:timer-start"⟩
        { elementId := startEventId } 1000 [] = false ∧
      timerInitiationOperationWellFormed places ⟨"operation:timer-start"⟩
        { elementId := startEventId } 1000
        [⟨"place:A"⟩, ⟨"place:A"⟩] = false ∧
      timerInitiationOperationWellFormed places ⟨"operation:timer-start"⟩
        { elementId := startEventId } 1000
        [⟨"place:B"⟩, ⟨"place:A"⟩] = false ∧
      timerInitiationOperationWellFormed places ⟨"operation:timer-start"⟩
        { elementId := startEventId } 999
        [⟨"place:A"⟩, ⟨"place:B"⟩] = false := by
  decide +kernel

/-- The selected profile narrows the reusable fan-out to exactly one output. -/
theorem selected_profile_requires_exactly_one_output :
    programProfileCapabilitiesValid
      { expectedProgram with
        operations := expectedProgram.operations.map fun operation =>
          match operation with
          | .initiateTimer id origin durationMs _ =>
              .initiateTimer id origin durationMs
                [⟨"place:A"⟩, ⟨"place:B"⟩]
          | other => other } = false := by
  decide +kernel

/-- Exact trigger admission creates one fresh root occurrence and no payload, Timer, or schedule state. -/
theorem exact_trigger_admission_state :
    admittedState =
      { runningStartState instanceId [] with
        scopeOccurrences := [{ id := rootOwner instanceId, parent := none }]
        scopeActivations :=
          [{ scopeId := rootDefinitionScopeId processId, count := 1 }] } := by
  decide +kernel

/-- Internal Timer initiation creates the sole root-owned output token without opening a runtime Timer. -/
theorem exact_timer_initiation_state :
    initiatedState =
      { admittedState with
        initiationPending := false
        tokens := [rootToken instanceId processId startOutput] } := by
  decide +kernel

/-- The executable Timer initiation evaluator is sound for its declarative relation. -/
theorem timer_initiation_evaluator_is_sound
    (before after : RuntimeState) (outputs : List ControlPlaceId)
    (result : initiateTimerState? before outputs = some after) :
    TimerInitiationStep before outputs after :=
  initiateTimerState_sound before after outputs result

/-- The two unstable prefixes each enable exactly one internal operation. -/
theorem closure_prefixes_have_unique_enabledness :
    enabledInternalOperationCount program admittedState = 1 ∧
      enabledInternalOperationCount program initiatedState = 1 := by
  decide +kernel

/-- The exact internal trace is Timer initiation followed by User Task activation. -/
theorem exact_two_step_internal_trace :
    runChoices program admittedState [startOperationId, taskOperationId] =
      some waitingState := by
  decide +kernel

/-- Limit two reaches the stable resumable User Task wait, while limit one reports exact overflow. -/
theorem exact_closure_and_overflow_boundary :
    applyStimulus 2 program initialState trigger =
        { outcome := .committed
          state := waitingState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      enabledInternalOperationCount program waitingState = 0 ∧
      stableStateResumable waitingState = true ∧
      applyStimulus 1 program initialState trigger =
        { outcome := .committed
          state := initiatedState
          internalStepBoundExceeded := true
          ambiguousInternalChoice := false } := by
  decide +kernel

/-- The production closure limit is exactly eight and exceeds the representative two-step closure. -/
theorem production_closure_limit_is_exact_and_sufficient :
    scenarioClosureLimit = 8 ∧ 2 ≤ scenarioClosureLimit := by
  decide +kernel

private def rejectedExactly (candidateProgram : Program)
    (state : RuntimeState) (stimulus : Stimulus) : Bool :=
  decide (applyStimulus scenarioClosureLimit candidateProgram state stimulus =
    { outcome := .rejected
      state
      internalStepBoundExceeded := false
      ambiguousInternalChoice := false })

/-- None, Message, and Timer start families reject every cross-kind start with exact state preservation. -/
theorem start_families_are_pairwise_closed :
    rejectedExactly program initialState noneTrigger = true ∧
      rejectedExactly program initialState messageTrigger = true ∧
      rejectedExactly noneComparisonProgram initialState trigger = true ∧
      rejectedExactly messageComparisonProgram initialState trigger = true := by
  decide +kernel

/-- Process, Start Event, profile, duration, root, and runtime-state mismatches reject exactly. -/
theorem every_timer_start_binding_mismatch_is_rejected_exactly :
    let wrongProfileProgram :=
      { program with identity :=
          { program.identity with
            semanticProfile :=
              ⟨"cibseven-2.2.0-user-task-process-data-draft"⟩ } }
    let wrongDurationProgram :=
      { program with operations := program.operations.map fun operation =>
          match operation with
          | .initiateTimer id origin _ outputs =>
              .initiateTimer id origin 999 outputs
          | other => other }
    let brokenRootProgram := { program with definitionScopes := [] }
    rejectedExactly program initialState
        (.triggerTimerStart ⟨"wrong-process"⟩ ⟨"Other_Process"⟩
          instanceId ⟨startEventId.value⟩) = true ∧
      rejectedExactly program initialState
        (.triggerTimerStart ⟨"wrong-start"⟩ ⟨processId.value⟩
          instanceId ⟨"Other_Start"⟩) = true ∧
      rejectedExactly wrongProfileProgram initialState trigger = true ∧
      rejectedExactly wrongDurationProgram initialState trigger = true ∧
      rejectedExactly brokenRootProgram initialState trigger = true ∧
      rejectedExactly program waitingState trigger = true := by
  decide +kernel

/-- Distinct semantic instance identities create distinct root occurrences and controls. -/
theorem distinct_fresh_instances_do_not_alias :
    let first := (admitTimerStart? program initialState
      ⟨processId.value⟩ ⟨"Instance_A"⟩ ⟨startEventId.value⟩).getD
        initialState
    let second := (admitTimerStart? program initialState
      ⟨processId.value⟩ ⟨"Instance_B"⟩ ⟨startEventId.value⟩).getD
        initialState
    first.control ≠ second.control ∧
      first.scopeOccurrences ≠ second.scopeOccurrences := by
  decide +kernel

/-- Complete stable observations agree across corresponding None, Message, and Timer starts after semantic instance identity normalization. -/
theorem normalized_downstream_observations_agree :
    (observeStableState program waitingState).map normalizeObservation =
        (observeStableState noneComparisonProgram noneWaitingState).map
          normalizeObservation ∧
      (observeStableState program waitingState).map normalizeObservation =
        (observeStableState messageComparisonProgram messageWaitingState).map
          normalizeObservation := by
  decide +kernel

/-- Timer Start is first-only and scenario support pairs the first stimulus with the exact program family. -/
theorem scenario_start_is_first_only_and_program_paired :
    stimulusSequenceSupported [trigger] = true ∧
      stimulusSequenceSupported [trigger, trigger] = false ∧
      supportsScenario program (scenarioForProgram program [trigger]) = true ∧
      supportsScenario program (scenarioForProgram program [noneTrigger]) = false ∧
      supportsScenario noneComparisonProgram
        (scenarioForProgram noneComparisonProgram [trigger]) = false ∧
      supportsScenario messageComparisonProgram
        (scenarioForProgram messageComparisonProgram [trigger]) = false := by
  decide +kernel

/-- Cross-kind scenarios fail deployment admission and execute no stimulus. -/
theorem cross_kind_scenarios_execute_no_stimulus :
    runScenario program (scenarioForProgram program [noneTrigger]) =
      { outcome := .semantic .unsupported
        trace := [.deployment .unsupported] } ∧
      runScenario noneComparisonProgram
        (scenarioForProgram noneComparisonProgram [trigger]) =
        { outcome := .semantic .unsupported
          trace := [.deployment .unsupported] } := by
  decide +kernel

end BpmnSemantics.TimerStartConformance
