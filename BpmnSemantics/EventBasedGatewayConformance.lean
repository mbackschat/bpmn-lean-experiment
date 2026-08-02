import BpmnSemantics.SemanticProcess

/-! # Event-Based Gateway conformance

This module owns the exact finite Message/Timer deferred-choice fixture and its checked semantic facts. It does not generalize to other trigger sets, repeated races, or simultaneous host readiness.
-/

namespace BpmnSemantics.EventBasedGatewayConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"bpmn-2.0.2-event-based-gateway-message-timer-draft"⟩

def operationChannel : MessageChannel :=
  .operationMessage ⟨"Interface_Events"⟩ ⟨"Operation_Message"⟩ ⟨"Message_Event"⟩

def processId : ProcessId := ⟨"Process_EventRace"⟩

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := profileId
        sourceId := ⟨"event-based-gateway-message-timer"⟩
        sourceSha256 :=
          "4444444444444444444444444444444444444444444444444444444444444444" }
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [ ⟨"End_Message"⟩, ⟨"End_Timer"⟩, ⟨"EventGateway"⟩
      , ⟨"MessageCatch"⟩, ⟨"Start"⟩, ⟨"Task_Message"⟩
      , ⟨"Task_Timer"⟩, ⟨"TimerCatch"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"Flow_Gateway_Message"⟩, ⟨"Flow_Gateway_Timer"⟩
      , ⟨"Flow_Message_Task"⟩, ⟨"Flow_Start_Gateway"⟩
      , ⟨"Flow_Task_Message_End"⟩, ⟨"Flow_Task_Timer_End"⟩
      , ⟨"Flow_Timer_Task"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"End_Message"⟩
      , .noneEndEvent ⟨"End_Timer"⟩
      , .eventBasedGateway ⟨"EventGateway"⟩
      , .intermediateCatchMessageEvent ⟨"MessageCatch"⟩ operationChannel
      , .noneStartEvent ⟨"Start"⟩
      , .userTask ⟨"Task_Message"⟩ (some "Message path")
      , .userTask ⟨"Task_Timer"⟩ (some "Timer path")
      , .intermediateCatchTimerEvent ⟨"TimerCatch"⟩ "PT1S" ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Gateway_Message"⟩, sourceId := ⟨"EventGateway"⟩,
          targetId := ⟨"MessageCatch"⟩ }
      , { id := ⟨"Flow_Gateway_Timer"⟩, sourceId := ⟨"EventGateway"⟩,
          targetId := ⟨"TimerCatch"⟩ }
      , { id := ⟨"Flow_Message_Task"⟩, sourceId := ⟨"MessageCatch"⟩,
          targetId := ⟨"Task_Message"⟩ }
      , { id := ⟨"Flow_Start_Gateway"⟩, sourceId := ⟨"Start"⟩,
          targetId := ⟨"EventGateway"⟩ }
      , { id := ⟨"Flow_Task_Message_End"⟩, sourceId := ⟨"Task_Message"⟩,
          targetId := ⟨"End_Message"⟩ }
      , { id := ⟨"Flow_Task_Timer_End"⟩, sourceId := ⟨"Task_Timer"⟩,
          targetId := ⟨"End_Timer"⟩ }
      , { id := ⟨"Flow_Timer_Task"⟩, sourceId := ⟨"TimerCatch"⟩,
          targetId := ⟨"Task_Timer"⟩ } ] }

def program : Program := lowerCheckedProcess checkedProcess

def instanceId : SemanticId := ⟨"EventRaceInstance"⟩

def messageSubscriptionId : MessageSubscriptionId :=
  { processInstanceId := instanceId
    elementId := ⟨"MessageCatch"⟩
    activation := 1 }

def timerOccurrenceId : TimerOccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨"TimerCatch"⟩
    activation := 1 }

def primaryRace : EventRace :=
  { id :=
      { processInstanceId := instanceId
        elementId := ⟨"EventGateway"⟩
        activation := 1 }
    owner := rootScopeOccurrenceId instanceId processId
    messageSubscriptionId
    timerOccurrenceId }

def duplicateAssociationRace : EventRace :=
  { primaryRace with id := { primaryRace.id with activation := 2 } }

def startStimulus : Stimulus :=
  .startProcess ⟨"start-event-race"⟩ ⟨processId.value⟩ instanceId []

def messageStimulus : Stimulus :=
  .deliverMessage ⟨"deliver-race-message"⟩ messageSubscriptionId
    operationChannel

def timerStimulus : Stimulus :=
  .fireTimer ⟨"fire-race-timer"⟩ timerOccurrenceId 1000

def completeMessageTask : Stimulus :=
  .completeUserTaskInstance ⟨"complete-message-task"⟩
    { processInstanceId := instanceId
      elementId := ⟨"Task_Message"⟩
      activation := 1 } []

def completeTimerTask : Stimulus :=
  .completeUserTaskInstance ⟨"complete-timer-task"⟩
    { processInstanceId := instanceId
      elementId := ⟨"Task_Timer"⟩
      activation := 1 } []

def armed : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState startStimulus

def messageWon : StimulusResult :=
  applyStimulus scenarioClosureLimit program armed.state messageStimulus

def timerWon : StimulusResult :=
  applyStimulus scenarioClosureLimit program armed.state timerStimulus

def beforeArming : RuntimeState :=
  (applyStimulus 1 program initialState startStimulus).state

def messageCommittedBeforeClosure : RuntimeState :=
  (applyStimulus 0 program armed.state messageStimulus).state

def timerCommittedBeforeClosure : RuntimeState :=
  (applyStimulus 0 program armed.state timerStimulus).state

def messageCompleted : StimulusResult :=
  applyStimulus scenarioClosureLimit program messageWon.state completeMessageTask

def timerCompleted : StimulusResult :=
  applyStimulus scenarioClosureLimit program timerWon.state completeTimerTask

def ambiguousAssociationState : RuntimeState :=
  { armed.state with eventRaces := [primaryRace, duplicateAssociationRace] }

def armedObservation : StateObservation :=
  { instanceId
    status := .running
    activeWaits :=
      [ { elementId := ⟨"MessageCatch"⟩, kind := .message, multiplicity := 1 }
      , { elementId := ⟨"TimerCatch"⟩, kind := .timer, multiplicity := 1 } ]
    openUserTasks := []
    openMessageSubscriptions :=
      [{ id := messageSubscriptionId, channel := operationChannel }]
    openTimers := [{ id := timerOccurrenceId, deadlineMs := 1000 }]
    openEffects := []
    variables := []
    enabledInteractions :=
      [.deliverMessage messageSubscriptionId operationChannel]
    logicalTimeMs := 0 }

def messageWonObservation : StateObservation :=
  { instanceId
    status := .running
    activeWaits :=
      [{ elementId := ⟨"Task_Message"⟩, kind := .userTask,
         multiplicity := 1 }]
    openUserTasks :=
      [{ id :=
          { processInstanceId := instanceId
            elementId := ⟨"Task_Message"⟩
            activation := 1 }
         name := some "Message path"
         state := .active }]
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := []
    enabledInteractions :=
      [.completeUserTaskInstance
        { processInstanceId := instanceId
          elementId := ⟨"Task_Message"⟩
          activation := 1 }]
    logicalTimeMs := 0 }

def timerWonObservation : StateObservation :=
  { instanceId
    status := .running
    activeWaits :=
      [{ elementId := ⟨"Task_Timer"⟩, kind := .userTask,
         multiplicity := 1 }]
    openUserTasks :=
      [{ id :=
          { processInstanceId := instanceId
            elementId := ⟨"Task_Timer"⟩
            activation := 1 }
         name := some "Timer path"
         state := .active }]
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := []
    enabledInteractions :=
      [.completeUserTaskInstance
        { processInstanceId := instanceId
          elementId := ⟨"Task_Timer"⟩
          activation := 1 }]
    logicalTimeMs := 1000 }

theorem exact_definition_is_admitted :
    definitionBindingValid checkedProcess program = true := by
  native_decide

theorem lowering_arms_one_named_message_timer_race :
    program.operations.find? (fun operation =>
        decide (operation.id.value = "operation:EventGateway")) =
      some
        (.awaitEventRace ⟨"operation:EventGateway"⟩
          { elementId := ⟨"EventGateway"⟩ }
          ⟨"place:Flow_Start_Gateway"⟩
          { configurationOrigin := { elementId := ⟨"Flow_Gateway_Message"⟩ }
            elementId := ⟨"MessageCatch"⟩
            channel := operationChannel
            output := ⟨"place:Flow_Message_Task"⟩ }
          { configurationOrigin := { elementId := ⟨"Flow_Gateway_Timer"⟩ }
            elementId := ⟨"TimerCatch"⟩
            durationMs := 1000
            output := ⟨"place:Flow_Timer_Task"⟩ }) := by
  native_decide

theorem every_source_flow_is_classified_exactly_once :
    checkedProcess.sequenceFlows.all fun flow =>
      let controlCount :=
        (program.controlPlaces.map (·.origin.elementId) |>.filter fun id =>
          decide (id = flow.id)).length
      let configurationCount :=
        (programConfigurationOrigins program |>.filter fun id =>
          decide (id = flow.id)).length
      controlCount + configurationCount = 1 := by
  native_decide

private def swapConfigurationOrigins : SemanticOperation → SemanticOperation
  | .awaitEventRace id origin input message timer =>
      .awaitEventRace id origin input
        { message with configurationOrigin := timer.configurationOrigin }
        { timer with configurationOrigin := message.configurationOrigin }
  | operation => operation

def swappedConfigurationProgram : Program :=
  { program with operations := program.operations.map swapConfigurationOrigins }

theorem swapped_configuration_origins_fail_checked_binding :
    programWellFormed swappedConfigurationProgram = true ∧
      definitionBindingValid checkedProcess swappedConfigurationProgram = false := by
  native_decide

theorem start_closure_arms_atomically_in_two_steps :
    (applyStimulus 1 program initialState startStimulus).internalStepBoundExceeded =
        true ∧
      (applyStimulus 2 program initialState startStimulus).internalStepBoundExceeded =
        false ∧
      armed.internalStepBoundExceeded = false ∧
      enabledInternalOperationCount program armed.state = 0 := by
  native_decide

theorem exact_arming_is_permitted_by_the_declarative_relation :
    EventRaceArmingStep beforeArming { elementId := ⟨"EventGateway"⟩ }
      ⟨"place:Flow_Start_Gateway"⟩
      { configurationOrigin := { elementId := ⟨"Flow_Gateway_Message"⟩ }
        elementId := ⟨"MessageCatch"⟩
        channel := operationChannel
        output := ⟨"place:Flow_Message_Task"⟩ }
      { configurationOrigin := { elementId := ⟨"Flow_Gateway_Timer"⟩ }
        elementId := ⟨"TimerCatch"⟩
        durationMs := 1000
        output := ⟨"place:Flow_Timer_Task"⟩ }
      armed.state := by
  apply armEventRaceState_sound
  native_decide

theorem both_exact_winners_are_permitted_by_the_declarative_relation :
    EventRaceWinnerStep program armed.state messageStimulus
        messageCommittedBeforeClosure ∧
      EventRaceWinnerStep program armed.state timerStimulus
        timerCommittedBeforeClosure := by
  constructor
  · apply eventRaceMessageWinner_sound
    native_decide
  · apply eventRaceTimerWinner_sound
    native_decide

theorem armed_state_has_exact_members_and_monotonic_identities :
    armed.outcome = .committed ∧
      armed.state.messageWaits.length = 1 ∧
      armed.state.timerWaits.length = 1 ∧
      armed.state.eventRaces =
        [{ id :=
            { processInstanceId := instanceId
              elementId := ⟨"EventGateway"⟩
              activation := 1 }
           owner := rootScopeOccurrenceId instanceId processId
           messageSubscriptionId
           timerOccurrenceId }] ∧
      armed.state.messageActivations =
        [{ elementId := ⟨"MessageCatch"⟩, count := 1 }] ∧
      armed.state.timerActivations =
        [{ elementId := ⟨"TimerCatch"⟩, count := 1 }] ∧
      armed.state.eventRaceActivations =
        [{ elementId := ⟨"EventGateway"⟩, count := 1 }] := by
  native_decide

theorem canonical_observation_exposes_only_existing_wait_surfaces :
    observeStableState program armed.state = some armedObservation ∧
      observeStableState program messageWon.state = some messageWonObservation ∧
      observeStableState program timerWon.state = some timerWonObservation := by
  native_decide

theorem message_winner_withdraws_timer_before_task_observation :
    messageWon.outcome = .committed ∧
      messageWon.internalStepBoundExceeded = false ∧
      messageWon.state.waits.map (·.task.id.value) = ["Task_Message"] ∧
      messageWon.state.messageWaits = [] ∧
      messageWon.state.timerWaits = [] ∧
      messageWon.state.eventRaces = [] ∧
      messageWon.state.logicalTimeMs = 0 := by
  native_decide

theorem timer_winner_withdraws_message_before_task_observation :
    timerWon.outcome = .committed ∧
      timerWon.internalStepBoundExceeded = false ∧
      timerWon.state.waits.map (·.task.id.value) = ["Task_Timer"] ∧
      timerWon.state.messageWaits = [] ∧
      timerWon.state.timerWaits = [] ∧
      timerWon.state.eventRaces = [] ∧
      timerWon.state.logicalTimeMs = 1000 := by
  native_decide

theorem stale_timer_after_message_win_preserves_exact_state :
    applyStimulus scenarioClosureLimit program messageWon.state
        (.fireTimer ⟨"stale-timer"⟩ timerOccurrenceId 1000) =
      { outcome := .rejected
        state := messageWon.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  native_decide

theorem stale_message_after_timer_win_preserves_exact_state :
    applyStimulus scenarioClosureLimit program timerWon.state
        (.deliverMessage ⟨"stale-message"⟩ messageSubscriptionId
          operationChannel) =
      { outcome := .rejected
        state := timerWon.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  native_decide

def wrongRaceStimuli : List Stimulus :=
  [ .deliverMessage ⟨"wrong-message-channel"⟩ messageSubscriptionId
      (.operationMessage ⟨"WrongInterface"⟩ ⟨"Operation_Message"⟩
        ⟨"Message_Event"⟩)
  , .deliverMessage ⟨"wrong-message-occurrence"⟩
      { messageSubscriptionId with activation := 2 } operationChannel
  , .fireTimer ⟨"wrong-timer-occurrence"⟩
      { timerOccurrenceId with activation := 2 } 1000
  , .fireTimer ⟨"wrong-timer-deadline"⟩ timerOccurrenceId 999 ]

theorem every_wrong_race_stimulus_preserves_the_armed_state :
    wrongRaceStimuli.map (fun stimulus =>
        let result := applyStimulus scenarioClosureLimit program armed.state stimulus
        (result.outcome, result.state)) =
      List.replicate 4 (.rejected, armed.state) := by
  native_decide

theorem selected_task_completion_uses_two_internal_steps :
    (applyStimulus 1 program messageWon.state
        completeMessageTask).internalStepBoundExceeded = true ∧
      (applyStimulus 2 program messageWon.state
        completeMessageTask).internalStepBoundExceeded = false ∧
      (applyStimulus 1 program timerWon.state
        completeTimerTask).internalStepBoundExceeded = true ∧
      (applyStimulus 2 program timerWon.state
        completeTimerTask).internalStepBoundExceeded = false := by
  native_decide

theorem both_winner_schedules_complete_without_live_surfaces :
    messageCompleted.state.control = .completed instanceId ∧
      timerCompleted.state.control = .completed instanceId ∧
      messageCompleted.state.waits = [] ∧ timerCompleted.state.waits = [] ∧
      messageCompleted.state.messageWaits = [] ∧
      timerCompleted.state.messageWaits = [] ∧
      messageCompleted.state.timerWaits = [] ∧
      timerCompleted.state.timerWaits = [] ∧
      messageCompleted.state.eventRaces = [] ∧
      timerCompleted.state.eventRaces = [] := by
  native_decide

theorem lone_race_record_is_nonquiescent_and_nonresumable :
    let owner := rootScopeOccurrenceId instanceId processId
    let race : EventRace :=
      { id :=
          { processInstanceId := instanceId
            elementId := ⟨"EventGateway"⟩
            activation := 1 }
        owner := owner
        messageSubscriptionId := messageSubscriptionId
        timerOccurrenceId := timerOccurrenceId }
    let stranded :=
      { (runningProgramStartState? program instanceId []).getD initialState with
        initiationPending := false
        eventRaces := [race] }
    scopeQuiescent stranded owner = false ∧
      stableStateResumable stranded = false ∧
      eventRaceMembersValid stranded race = false := by
  native_decide

theorem partially_armed_race_is_not_a_resumption_surface :
    let race : EventRace :=
      { id :=
          { processInstanceId := instanceId
            elementId := ⟨"EventGateway"⟩
            activation := 1 }
        owner := rootScopeOccurrenceId instanceId processId
        messageSubscriptionId := messageSubscriptionId
        timerOccurrenceId := timerOccurrenceId }
    let incomplete := { armed.state with timerWaits := [] }
    eventRaceMembersValid incomplete race = false ∧
      stableStateResumable incomplete = false := by
  native_decide

theorem duplicate_member_association_is_not_a_resumption_surface :
    eventRaceAssociationsValid ambiguousAssociationState = false ∧
      stableStateResumable ambiguousAssociationState = false ∧
      applyStimulus scenarioClosureLimit program ambiguousAssociationState
          messageStimulus =
        { outcome := .rejected
          state := ambiguousAssociationState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  native_decide

theorem erased_race_association_cannot_fall_back_to_standalone_waits :
    let unassociated := { armed.state with eventRaces := [] }
    applyStimulus scenarioClosureLimit program unassociated messageStimulus =
        { outcome := .rejected
          state := unassociated
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      applyStimulus scenarioClosureLimit program unassociated timerStimulus =
        { outcome := .rejected
          state := unassociated
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } := by
  native_decide

end BpmnSemantics.EventBasedGatewayConformance
