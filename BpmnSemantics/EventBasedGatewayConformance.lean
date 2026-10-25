module

public import BpmnSemantics.SemanticProcess.ExecutionRuntime
public import BpmnSemantics.EventBasedGatewayFixtures
public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity

/-! # Event-Based Gateway conformance

This module owns the exact finite Message/Timer deferred-choice fixture and its checked semantic facts. It does not generalize to other trigger sets, repeated races, or simultaneous host readiness.
-/

@[expose] public section

namespace BpmnSemantics.EventBasedGatewayConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def messageWon : StimulusResult :=
  applyStimulus scenarioClosureLimit program armed.state messageStimulus

def timerWon : StimulusResult :=
  applyStimulus scenarioClosureLimit program armed.state timerStimulus

def beforeArming : RuntimeState :=
  (runChoices program (admitStimulus program initialState startStimulus).state
    [⟨"operation:Start"⟩]).getD initialState

def messageCommittedBeforeClosure : RuntimeState :=
  (admitStimulus program armed.state messageStimulus).state

def timerCommittedBeforeClosure : RuntimeState :=
  (admitStimulus program armed.state timerStimulus).state

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
  decide +kernel

def lowering_arms_one_named_message_timer_race : Bool := decide <|
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
            output := ⟨"place:Flow_Timer_Task"⟩ })

def every_source_flow_is_classified_exactly_once : Bool := decide <|
    checkedProcess.sequenceFlows.all fun flow =>
      let controlCount :=
        (program.controlPlaces.map (·.origin.elementId) |>.filter fun id =>
          decide (id = flow.id)).length
      let configurationCount :=
        (programConfigurationOrigins program |>.filter fun id =>
          decide (id = flow.id)).length
      controlCount + configurationCount = 1

def swapConfigurationOrigins : SemanticOperation → SemanticOperation
  | .awaitEventRace id origin input message timer =>
      .awaitEventRace id origin input
        { message with configurationOrigin := timer.configurationOrigin }
        { timer with configurationOrigin := message.configurationOrigin }
  | operation => operation

def swappedConfigurationProgram : Program :=
  { program with operations := program.operations.map swapConfigurationOrigins }

def swapEventRaceOutputs : SemanticOperation → SemanticOperation
  | .awaitEventRace id origin input message timer =>
      .awaitEventRace id origin input
        { message with output := timer.output }
        { timer with output := message.output }
  | operation => operation

def swappedOutputProgram : Program :=
  { program with operations := program.operations.map swapEventRaceOutputs }

def replaceEventRaceOrigin : SemanticOperation → SemanticOperation
  | .awaitEventRace id _ input message timer =>
      .awaitEventRace id { elementId := ⟨"WrongEventGateway"⟩ } input message timer
  | operation => operation

def wrongRaceDefinitionProgram : Program :=
  { program with operations := program.operations.map replaceEventRaceOrigin }

def duplicateRaceDefinitionProgram : Program :=
  match program.operations.find? fun
      | .awaitEventRace .. => true
      | _ => false with
  | some (.awaitEventRace _ origin input message timer) =>
      { program with
        operations := .awaitEventRace ⟨"operation:DuplicateEventGateway"⟩
          origin input message timer :: program.operations }
  | _ => program

def mixedDuplicateOriginProgram : Program :=
  match program.operations.find? fun
      | .awaitEventRace .. => true
      | _ => false with
  | some (.awaitEventRace _ origin input message timer) =>
      { program with
        operations := .awaitEventRace ⟨"operation:MalformedEventGateway"⟩
          origin input { message with output := timer.output } timer ::
            program.operations }
  | _ => program

def swapped_configuration_origins_fail_checked_binding : Bool := decide <|
    programWellFormed swappedConfigurationProgram = true ∧
      definitionBindingValid checkedProcess swappedConfigurationProgram = false

def both_winner_directions_reject_swapped_outputs : Bool := decide <|
    (applyStimulus scenarioClosureLimit swappedOutputProgram armed.state
        messageStimulus).outcome = .rejected ∧
      (applyStimulus scenarioClosureLimit swappedOutputProgram armed.state
        timerStimulus).outcome = .rejected

def both_winner_directions_reject_the_wrong_race_definition : Bool := decide <|
    (applyStimulus scenarioClosureLimit wrongRaceDefinitionProgram armed.state
        messageStimulus).outcome = .rejected ∧
      (applyStimulus scenarioClosureLimit wrongRaceDefinitionProgram armed.state
        timerStimulus).outcome = .rejected

def both_winner_directions_require_one_unique_race_definition : Bool := decide <|
    (applyStimulus scenarioClosureLimit duplicateRaceDefinitionProgram
        armed.state messageStimulus).outcome = .rejected ∧
      (applyStimulus scenarioClosureLimit duplicateRaceDefinitionProgram
        armed.state timerStimulus).outcome = .rejected

def both_winner_directions_reject_a_malformed_same_origin_definition : Bool := decide <|
    (applyStimulus scenarioClosureLimit mixedDuplicateOriginProgram armed.state
        messageStimulus).outcome = .rejected ∧
      (applyStimulus scenarioClosureLimit mixedDuplicateOriginProgram armed.state
        timerStimulus).outcome = .rejected

def start_closure_arms_atomically_in_two_steps : Bool := decide <|
    (applyStimulus 1 program initialState startStimulus).internalStepBoundExceeded =
        true ∧
      (applyStimulus 2 program initialState startStimulus).internalStepBoundExceeded =
        false ∧
      armed.internalStepBoundExceeded = false ∧
      enabledInternalOperationCount program armed.state = 0

def intermediate_prefixes_have_successful_admission_and_internal_steps : Bool := decide <|
    (admitStimulus program initialState startStimulus).outcome = .committed ∧
      runChoices program (admitStimulus program initialState startStimulus).state
        [⟨"operation:Start"⟩] = some beforeArming ∧
      (admitStimulus program armed.state messageStimulus).outcome = .committed ∧
      (admitStimulus program armed.state timerStimulus).outcome = .committed

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
  decide +kernel

theorem both_exact_winners_are_permitted_by_the_declarative_relation :
    EventRaceWinnerStep program armed.state messageStimulus
        messageCommittedBeforeClosure ∧
      EventRaceWinnerStep program armed.state timerStimulus
        timerCommittedBeforeClosure := by
  constructor
  · apply eventRaceMessageWinner_sound
    decide +kernel
  · apply eventRaceTimerWinner_sound
    decide +kernel

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
  decide +kernel

def canonical_observation_exposes_only_existing_wait_surfaces : Bool := decide <|
    observeStableState program armed.state = some armedObservation ∧
      observeStableState program messageWon.state = some messageWonObservation ∧
      observeStableState program timerWon.state = some timerWonObservation

theorem message_winner_withdraws_timer_before_task_observation :
    messageWon.outcome = .committed ∧
      messageWon.internalStepBoundExceeded = false ∧
      messageWon.state.waits.map (·.task.id.value) = ["Task_Message"] ∧
      messageWon.state.messageWaits = [] ∧
      messageWon.state.timerWaits = [] ∧
      messageWon.state.eventRaces = [] ∧
      messageWon.state.logicalTimeMs = 0 := by
  decide +kernel

def timer_winner_withdraws_message_before_task_observation : Bool := decide <|
    timerWon.outcome = .committed ∧
      timerWon.internalStepBoundExceeded = false ∧
      timerWon.state.waits.map (·.task.id.value) = ["Task_Timer"] ∧
      timerWon.state.messageWaits = [] ∧
      timerWon.state.timerWaits = [] ∧
      timerWon.state.eventRaces = [] ∧
      timerWon.state.logicalTimeMs = 1000

def stale_timer_after_message_win_preserves_exact_state : Bool := decide <|
    applyStimulus scenarioClosureLimit program messageWon.state
        (.fireTimer ⟨"stale-timer"⟩ timerOccurrenceId 1000) =
      { outcome := .rejected
        state := messageWon.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def stale_message_after_timer_win_preserves_exact_state : Bool := decide <|
    applyStimulus scenarioClosureLimit program timerWon.state
        (.deliverMessage ⟨"stale-message"⟩ messageSubscriptionId
          operationChannel) =
      { outcome := .rejected
        state := timerWon.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

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
  decide +kernel

def selected_task_completion_uses_two_internal_steps : Bool := decide <|
    (applyStimulus 1 program messageWon.state
        completeMessageTask).internalStepBoundExceeded = true ∧
      (applyStimulus 2 program messageWon.state
        completeMessageTask).internalStepBoundExceeded = false ∧
      (applyStimulus 1 program timerWon.state
        completeTimerTask).internalStepBoundExceeded = true ∧
      (applyStimulus 2 program timerWon.state
        completeTimerTask).internalStepBoundExceeded = false

def both_winner_schedules_complete_without_live_surfaces : Bool := decide <|
    messageCompleted.state.control = .completed instanceId ∧
      timerCompleted.state.control = .completed instanceId ∧
      messageCompleted.state.waits = [] ∧ timerCompleted.state.waits = [] ∧
      messageCompleted.state.messageWaits = [] ∧
      timerCompleted.state.messageWaits = [] ∧
      messageCompleted.state.timerWaits = [] ∧
      timerCompleted.state.timerWaits = [] ∧
      messageCompleted.state.eventRaces = [] ∧
      timerCompleted.state.eventRaces = []

def lone_race_record_is_nonquiescent_and_nonresumable : Bool := decide <|
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
      eventRaceMembersValid stranded race = false

def partially_armed_race_is_not_a_resumption_surface : Bool := decide <|
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
      stableStateResumable incomplete = false

def duplicate_member_association_is_not_a_resumption_surface : Bool := decide <|
    eventRaceAssociationsValid ambiguousAssociationState = false ∧
      stableStateResumable ambiguousAssociationState = false ∧
      applyStimulus scenarioClosureLimit program ambiguousAssociationState
          messageStimulus =
        { outcome := .rejected
          state := ambiguousAssociationState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false }

def erased_race_association_cannot_fall_back_to_standalone_waits : Bool := decide <|
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
          ambiguousInternalChoice := false }

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("lowering_arms_one_named_message_timer_race", lowering_arms_one_named_message_timer_race),
  ("every_source_flow_is_classified_exactly_once", every_source_flow_is_classified_exactly_once),
  ("swapped_configuration_origins_fail_checked_binding", swapped_configuration_origins_fail_checked_binding),
  ("both_winner_directions_reject_swapped_outputs", both_winner_directions_reject_swapped_outputs),
  ("both_winner_directions_reject_the_wrong_race_definition", both_winner_directions_reject_the_wrong_race_definition),
  ("both_winner_directions_require_one_unique_race_definition", both_winner_directions_require_one_unique_race_definition),
  ("both_winner_directions_reject_a_malformed_same_origin_definition", both_winner_directions_reject_a_malformed_same_origin_definition),
  ("start_closure_arms_atomically_in_two_steps", start_closure_arms_atomically_in_two_steps),
  ("intermediate_prefixes_have_successful_admission_and_internal_steps", intermediate_prefixes_have_successful_admission_and_internal_steps),
  ("canonical_observation_exposes_only_existing_wait_surfaces", canonical_observation_exposes_only_existing_wait_surfaces),
  ("timer_winner_withdraws_message_before_task_observation", timer_winner_withdraws_message_before_task_observation),
  ("stale_timer_after_message_win_preserves_exact_state", stale_timer_after_message_win_preserves_exact_state),
  ("stale_message_after_timer_win_preserves_exact_state", stale_message_after_timer_win_preserves_exact_state),
  ("selected_task_completion_uses_two_internal_steps", selected_task_completion_uses_two_internal_steps),
  ("both_winner_schedules_complete_without_live_surfaces", both_winner_schedules_complete_without_live_surfaces),
  ("lone_race_record_is_nonquiescent_and_nonresumable", lone_race_record_is_nonquiescent_and_nonresumable),
  ("partially_armed_race_is_not_a_resumption_surface", partially_armed_race_is_not_a_resumption_surface),
  ("duplicate_member_association_is_not_a_resumption_surface", duplicate_member_association_is_not_a_resumption_surface),
  ("erased_race_association_cannot_fall_back_to_standalone_waits", erased_race_association_cannot_fall_back_to_standalone_waits)
]

end BpmnSemantics.EventBasedGatewayConformance
