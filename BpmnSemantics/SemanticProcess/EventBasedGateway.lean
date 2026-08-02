import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Event-Based Gateway race semantics

This module owns atomic Message/Timer race arming, the hidden occurrence association, winner selection, and the declarative relations that constrain those executable transformations. It does not choose between jointly ready host events; callers provide one explicit semantic stimulus at a time.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def eventRaceRunningInstance? (state : RuntimeState) : Option SemanticId :=
  match state.control with
  | .running instanceId => some instanceId
  | _ => none

private def nodeActivationCount (activations : List (NodeId × Nat))
    (elementId : NodeId) : Nat :=
  (activations.find? fun activation => decide (activation.1 = elementId))
    |>.map (·.2) |>.getD 0

def eventRaceActivationCount (state : RuntimeState)
    (elementId : NodeId) : Nat :=
  nodeActivationCount (state.eventRaceActivations.map fun value =>
    (value.elementId, value.count)) elementId

def eventRaceMessageActivationCount (state : RuntimeState)
    (elementId : NodeId) : Nat :=
  nodeActivationCount (state.messageActivations.map fun value =>
    (value.elementId, value.count)) elementId

def eventRaceTimerActivationCount (state : RuntimeState)
    (elementId : NodeId) : Nat :=
  nodeActivationCount (state.timerActivations.map fun value =>
    (value.elementId, value.count)) elementId

private def eventRaceBefore (left right : EventRace) : Bool :=
  if left.id.processInstanceId.value ≠ right.id.processInstanceId.value then
    left.id.processInstanceId.value < right.id.processInstanceId.value
  else if left.id.elementId.value ≠ right.id.elementId.value then
    left.id.elementId.value < right.id.elementId.value
  else if left.id.activation ≠ right.id.activation then
    left.id.activation < right.id.activation
  else if left.owner.definitionScopeId.value ≠
      right.owner.definitionScopeId.value then
    left.owner.definitionScopeId.value < right.owner.definitionScopeId.value
  else left.owner.activation < right.owner.activation

private def insertEventRaceCanonical (race : EventRace) :
    List EventRace → List EventRace
  | [] => [race]
  | current :: rest =>
      if eventRaceBefore race current then race :: current :: rest
      else current :: insertEventRaceCanonical race rest

def eventRaceMessageDefinitionMatches (program : Program)
    (wait : MessageWait) : Bool :=
  program.operations.any fun
    | .awaitEventRace _ _ _ message _ =>
        decide (message.elementId = wait.elementId && message.channel = wait.channel)
    | _ => false

def eventRaceOccurrenceMatches (id : OccurrenceId) (race : EventRace) : Bool :=
  decide (race.id = id)

def eventRaceHasMessage (race : EventRace) (wait : MessageWait) : Bool :=
  decide (
    race.messageSubscriptionId.processInstanceId = wait.processInstanceId &&
      race.messageSubscriptionId.elementId.value = wait.elementId.value &&
      race.messageSubscriptionId.activation = wait.activation &&
      race.owner = wait.owner)

def eventRaceHasTimer (race : EventRace) (wait : TimerWait) : Bool :=
  decide (
    race.timerOccurrenceId.processInstanceId = wait.processInstanceId &&
      race.timerOccurrenceId.elementId.value = wait.elementId.value &&
      race.timerOccurrenceId.activation = wait.activation &&
      race.owner = wait.owner)

def armEventRaceState? (state : RuntimeState) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (message : EventRaceMessageArm)
    (timer : EventRaceTimerArm) : Option RuntimeState :=
  match onlyTokenOwner? state input with
  | none => none
  | some owner =>
      match eventRaceRunningInstance? state with
      | none => none
      | some instanceId =>
          let raceActivation :=
            eventRaceActivationCount state origin.elementId + 1
          let messageActivation :=
            eventRaceMessageActivationCount state message.elementId + 1
          let timerActivation :=
            eventRaceTimerActivationCount state timer.elementId + 1
          let messageId : MessageSubscriptionId :=
            { processInstanceId := instanceId
              elementId := ⟨message.elementId.value⟩
              activation := messageActivation }
          let timerId : TimerOccurrenceId :=
            { processInstanceId := instanceId
              elementId := ⟨timer.elementId.value⟩
              activation := timerActivation }
          let race : EventRace :=
            { id :=
                { processInstanceId := instanceId
                  elementId := ⟨origin.elementId.value⟩
                  activation := raceActivation }
              owner
              messageSubscriptionId := messageId
              timerOccurrenceId := timerId }
          some
            { state with
              tokens := removeToken state.tokens input owner
              messageWaits :=
                { processInstanceId := instanceId
                  owner
                  elementId := message.elementId
                  activation := messageActivation
                  channel := message.channel
                  output := message.output } :: state.messageWaits
              timerWaits :=
                { processInstanceId := instanceId
                  owner
                  elementId := timer.elementId
                  activation := timerActivation
                  deadlineMs := state.logicalTimeMs + timer.durationMs
                  output := timer.output } :: state.timerWaits
              eventRaces := insertEventRaceCanonical race state.eventRaces
              messageActivations :=
                { elementId := message.elementId, count := messageActivation } ::
                  state.messageActivations.filter fun value =>
                    decide (value.elementId ≠ message.elementId)
              timerActivations :=
                { elementId := timer.elementId, count := timerActivation } ::
                  state.timerActivations.filter fun value =>
                    decide (value.elementId ≠ timer.elementId)
              eventRaceActivations :=
                { elementId := origin.elementId, count := raceActivation } ::
                  state.eventRaceActivations.filter fun value =>
                    decide (value.elementId ≠ origin.elementId) }

/-- Atomic declarative arming relation with explicit ownership, freshness, identities, and state update. -/
inductive EventRaceArmingStep : RuntimeState → BpmnElementOrigin →
    ControlPlaceId → EventRaceMessageArm → EventRaceTimerArm →
    RuntimeState → Prop where
  | arm (before : RuntimeState) (origin : BpmnElementOrigin)
      (input : ControlPlaceId) (message : EventRaceMessageArm)
      (timer : EventRaceTimerArm) (owner : ScopeOccurrenceId)
      (instanceId : SemanticId) (raceActivation messageActivation
        timerActivation : Nat)
      (owned : onlyTokenOwner? before input = some owner)
      (running : eventRaceRunningInstance? before = some instanceId)
      (freshRace :
        raceActivation = eventRaceActivationCount before origin.elementId + 1)
      (freshMessage : messageActivation =
        eventRaceMessageActivationCount before message.elementId + 1)
      (freshTimer : timerActivation =
        eventRaceTimerActivationCount before timer.elementId + 1) :
      EventRaceArmingStep before origin input message timer
        { before with
          tokens := removeToken before.tokens input owner
          messageWaits :=
            { processInstanceId := instanceId
              owner
              elementId := message.elementId
              activation := messageActivation
              channel := message.channel
              output := message.output } :: before.messageWaits
          timerWaits :=
            { processInstanceId := instanceId
              owner
              elementId := timer.elementId
              activation := timerActivation
              deadlineMs := before.logicalTimeMs + timer.durationMs
              output := timer.output } :: before.timerWaits
          eventRaces := insertEventRaceCanonical
            { id :=
                { processInstanceId := instanceId
                  elementId := ⟨origin.elementId.value⟩
                  activation := raceActivation }
              owner
              messageSubscriptionId :=
                { processInstanceId := instanceId
                  elementId := ⟨message.elementId.value⟩
                  activation := messageActivation }
              timerOccurrenceId :=
                { processInstanceId := instanceId
                  elementId := ⟨timer.elementId.value⟩
                  activation := timerActivation } }
            before.eventRaces
          messageActivations :=
            { elementId := message.elementId, count := messageActivation } ::
              before.messageActivations.filter fun value =>
                decide (value.elementId ≠ message.elementId)
          timerActivations :=
            { elementId := timer.elementId, count := timerActivation } ::
              before.timerActivations.filter fun value =>
                decide (value.elementId ≠ timer.elementId)
          eventRaceActivations :=
            { elementId := origin.elementId, count := raceActivation } ::
              before.eventRaceActivations.filter fun value =>
                decide (value.elementId ≠ origin.elementId) }

theorem armEventRaceState_sound (before after : RuntimeState)
    (origin : BpmnElementOrigin) (input : ControlPlaceId)
    (message : EventRaceMessageArm) (timer : EventRaceTimerArm)
    (success : armEventRaceState? before origin input message timer = some after) :
    EventRaceArmingStep before origin input message timer after := by
  unfold armEventRaceState? at success
  split at success
  · contradiction
  · rename_i owner ownedEq
    split at success
    · contradiction
    · rename_i instanceId runningEq
      cases success
      exact .arm before origin input message timer owner instanceId
        (eventRaceActivationCount before origin.elementId + 1)
        (eventRaceMessageActivationCount before message.elementId + 1)
        (eventRaceTimerActivationCount before timer.elementId + 1)
        ownedEq runningEq rfl rfl rfl

def eventRaceMessageOccurrenceMatches (subscriptionId : MessageSubscriptionId)
    (wait : MessageWait) : Bool :=
  decide (
    wait.processInstanceId = subscriptionId.processInstanceId &&
      wait.elementId.value = subscriptionId.elementId.value &&
      wait.activation = subscriptionId.activation)

def eventRaceTimerOccurrenceMatches (timerId : TimerOccurrenceId)
    (wait : TimerWait) : Bool :=
  decide (
    wait.processInstanceId = timerId.processInstanceId &&
      wait.elementId.value = timerId.elementId.value &&
      wait.activation = timerId.activation)

def eventRaceForMessage? (state : RuntimeState) (wait : MessageWait) :
    Option EventRace :=
  match state.eventRaces.filter (eventRaceHasMessage · wait) with
  | [race] => some race
  | _ => none

def eventRaceForTimer? (state : RuntimeState) (wait : TimerWait) :
    Option EventRace :=
  match state.eventRaces.filter (eventRaceHasTimer · wait) with
  | [race] => some race
  | _ => none

def commitEventRaceMessageWinner (state : RuntimeState) (race : EventRace)
    (messageWait : MessageWait) (timerWait : TimerWait) : RuntimeState :=
  { state with
    messageWaits := state.messageWaits.erase messageWait
    timerWaits := state.timerWaits.erase timerWait
    eventRaces := state.eventRaces.erase race
    tokens := addToken state.tokens messageWait.output messageWait.owner }

def commitEventRaceTimerWinner (state : RuntimeState) (race : EventRace)
    (messageWait : MessageWait) (timerWait : TimerWait) : RuntimeState :=
  { state with
    messageWaits := state.messageWaits.erase messageWait
    timerWaits := state.timerWaits.erase timerWait
    eventRaces := state.eventRaces.erase race
    tokens := addToken state.tokens timerWait.output timerWait.owner
    logicalTimeMs := timerWait.deadlineMs }

/-- Every hidden race owns one unique Message wait, Timer wait, race identity, and member association. -/
def eventRaceAssociationsValid (state : RuntimeState) : Bool :=
  state.eventRaces.all fun race =>
    decide ((state.messageWaits.filter (eventRaceHasMessage race)).length = 1) &&
      decide ((state.timerWaits.filter (eventRaceHasTimer race)).length = 1) &&
      decide ((state.eventRaces.filter fun candidate =>
        candidate.id = race.id).length = 1) &&
      decide ((state.eventRaces.filter fun candidate =>
        candidate.messageSubscriptionId = race.messageSubscriptionId).length = 1) &&
      decide ((state.eventRaces.filter fun candidate =>
        candidate.timerOccurrenceId = race.timerOccurrenceId).length = 1)

def eventRaceMessageWinner? (program : Program) (state : RuntimeState)
    (subscriptionId : MessageSubscriptionId) (channel : MessageChannel) :
    Option RuntimeState :=
  if eventRaceAssociationsValid state then
    match state.messageWaits.find?
        (eventRaceMessageOccurrenceMatches subscriptionId) with
      | none => none
      | some messageWait =>
          match eventRaceForMessage? state messageWait with
          | none => none
          | some race =>
              match state.timerWaits.find? (eventRaceHasTimer race) with
              | none => none
              | some timerWait =>
                  if messageWait.channel = channel &&
                      eventRaceMessageDefinitionMatches program messageWait then
                    some (commitEventRaceMessageWinner state race messageWait
                      timerWait)
                  else none
  else none

def eventRaceTimerWinner? (state : RuntimeState) (timerId : TimerOccurrenceId)
    (logicalTimeMs : Nat) : Option RuntimeState :=
  if eventRaceAssociationsValid state then
    match state.timerWaits.find? (eventRaceTimerOccurrenceMatches timerId) with
      | none => none
      | some timerWait =>
          match eventRaceForTimer? state timerWait with
          | none => none
          | some race =>
              match state.messageWaits.find? (eventRaceHasMessage race) with
              | none => none
              | some messageWait =>
                  if logicalTimeMs = timerWait.deadlineMs then
                    some (commitEventRaceTimerWinner state race messageWait
                      timerWait)
                  else none
  else none

/-- Declarative Message-winner relation with exact occurrence, unique race, sibling, channel, definition, and state-update premises. -/
inductive EventRaceMessageWinnerStep : Program → RuntimeState →
    MessageSubscriptionId → MessageChannel → RuntimeState → Prop where
  | commit (program : Program) (before : RuntimeState)
      (subscriptionId : MessageSubscriptionId) (channel : MessageChannel)
      (messageWait : MessageWait) (race : EventRace) (timerWait : TimerWait)
      (occurrence : before.messageWaits.find?
        (eventRaceMessageOccurrenceMatches subscriptionId) = some messageWait)
      (association : eventRaceForMessage? before messageWait = some race)
      (sibling : before.timerWaits.find? (eventRaceHasTimer race) =
        some timerWait)
      (callerChannel : messageWait.channel = channel)
      (definition : eventRaceMessageDefinitionMatches program messageWait = true) :
      EventRaceMessageWinnerStep program before subscriptionId channel
        { before with
          messageWaits := before.messageWaits.erase messageWait
          timerWaits := before.timerWaits.erase timerWait
          eventRaces := before.eventRaces.erase race
          tokens := addToken before.tokens messageWait.output messageWait.owner }

/-- Declarative Timer-winner relation with exact occurrence, unique race, sibling, deadline, and state-update premises. -/
inductive EventRaceTimerWinnerStep : RuntimeState → TimerOccurrenceId → Nat →
    RuntimeState → Prop where
  | commit (before : RuntimeState) (timerId : TimerOccurrenceId)
      (logicalTimeMs : Nat) (timerWait : TimerWait) (race : EventRace)
      (messageWait : MessageWait)
      (occurrence : before.timerWaits.find?
        (eventRaceTimerOccurrenceMatches timerId) = some timerWait)
      (association : eventRaceForTimer? before timerWait = some race)
      (sibling : before.messageWaits.find? (eventRaceHasMessage race) =
        some messageWait)
      (deadline : logicalTimeMs = timerWait.deadlineMs) :
      EventRaceTimerWinnerStep before timerId logicalTimeMs
        { before with
          messageWaits := before.messageWaits.erase messageWait
          timerWaits := before.timerWaits.erase timerWait
          eventRaces := before.eventRaces.erase race
          tokens := addToken before.tokens timerWait.output timerWait.owner
          logicalTimeMs := timerWait.deadlineMs }

/-- Declarative winner relation. Its constructors preserve which explicit stimulus selected the continuation. -/
inductive EventRaceWinnerStep : Program → RuntimeState → Stimulus →
    RuntimeState → Prop where
  | message (program : Program) (before after : RuntimeState)
      (commandId : SemanticId) (subscriptionId : MessageSubscriptionId)
      (channel : MessageChannel)
      (transition : EventRaceMessageWinnerStep program before subscriptionId
        channel after) :
      EventRaceWinnerStep program before
        (.deliverMessage commandId subscriptionId channel) after
  | timer (program : Program) (before after : RuntimeState)
      (commandId : SemanticId) (timerId : TimerOccurrenceId)
      (logicalTimeMs : Nat)
      (transition : EventRaceTimerWinnerStep before timerId logicalTimeMs after) :
      EventRaceWinnerStep program before
        (.fireTimer commandId timerId logicalTimeMs) after

theorem eventRaceMessageWinnerState_sound (program : Program)
    (before after : RuntimeState) (subscriptionId : MessageSubscriptionId)
    (channel : MessageChannel)
    (success : eventRaceMessageWinner? program before subscriptionId channel =
      some after) :
    EventRaceMessageWinnerStep program before subscriptionId channel after := by
  unfold eventRaceMessageWinner? at success
  split at success
  · rename_i associationsValid
    split at success
    · contradiction
    · rename_i messageWait occurrenceEq
      split at success
      · contradiction
      · rename_i race associationEq
        split at success
        · contradiction
        · rename_i timerWait siblingEq
          split at success
          · rename_i accepted
            cases success
            have callerChannel : messageWait.channel = channel := by
              exact of_decide_eq_true (Bool.and_eq_true_iff.mp accepted).1
            exact .commit program before subscriptionId channel messageWait race
              timerWait occurrenceEq associationEq siblingEq callerChannel
              (Bool.and_eq_true_iff.mp accepted).2
          · contradiction
  · contradiction

theorem eventRaceTimerWinnerState_sound (before after : RuntimeState)
    (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (success : eventRaceTimerWinner? before timerId logicalTimeMs = some after) :
    EventRaceTimerWinnerStep before timerId logicalTimeMs after := by
  unfold eventRaceTimerWinner? at success
  split at success
  · rename_i associationsValid
    split at success
    · contradiction
    · rename_i timerWait occurrenceEq
      split at success
      · contradiction
      · rename_i race associationEq
        split at success
        · contradiction
        · rename_i messageWait siblingEq
          split at success
          · rename_i deadline
            cases success
            exact .commit before timerId logicalTimeMs timerWait race messageWait
              occurrenceEq associationEq siblingEq deadline
          · contradiction
  · contradiction

theorem eventRaceMessageWinner_sound (program : Program)
    (before after : RuntimeState) (commandId : SemanticId)
    (subscriptionId : MessageSubscriptionId) (channel : MessageChannel)
    (success :
      eventRaceMessageWinner? program before subscriptionId channel =
        some after) :
    EventRaceWinnerStep program before
      (.deliverMessage commandId subscriptionId channel) after :=
  .message program before after commandId subscriptionId channel
    (eventRaceMessageWinnerState_sound program before after subscriptionId
      channel success)

theorem eventRaceTimerWinner_sound (program : Program)
    (before after : RuntimeState) (commandId : SemanticId)
    (timerId : TimerOccurrenceId) (logicalTimeMs : Nat)
    (success : eventRaceTimerWinner? before timerId logicalTimeMs = some after) :
    EventRaceWinnerStep program before
      (.fireTimer commandId timerId logicalTimeMs) after :=
  .timer program before after commandId timerId logicalTimeMs
    (eventRaceTimerWinnerState_sound before after timerId logicalTimeMs success)

/-- A record is resumable only when both complete member identities still name owner-matching waits. -/
def eventRaceMembersValid (state : RuntimeState) (race : EventRace) : Bool :=
  state.messageWaits.any (eventRaceHasMessage race) &&
    state.timerWaits.any (eventRaceHasTimer race)

theorem eventRace_exact_membership_and_ownership
    (state : RuntimeState) (race : EventRace)
    (present : race ∈ state.eventRaces)
    (valid : eventRaceMembersValid state race = true) :
    race ∈ state.eventRaces ∧
      (∃ messageWait ∈ state.messageWaits,
        eventRaceHasMessage race messageWait) ∧
      ∃ timerWait ∈ state.timerWaits,
        eventRaceHasTimer race timerWait := by
  have members := Bool.and_eq_true_iff.mp valid
  exact ⟨present, List.any_eq_true.mp members.1,
    List.any_eq_true.mp members.2⟩

/-- On the exact admitted member inventory, Message commitment removes both waits and makes Timer selection ineligible. -/
theorem committed_message_winner_is_exclusive
    (state : RuntimeState) (race : EventRace)
    (messageWait : MessageWait) (timerWait : TimerWait)
    (messages : state.messageWaits = [messageWait])
    (timers : state.timerWaits = [timerWait])
    (races : state.eventRaces = [race]) :
    let after := commitEventRaceMessageWinner state race messageWait timerWait
    after.messageWaits = [] ∧ after.timerWaits = [] ∧
      after.eventRaces = [] ∧
      eventRaceTimerWinner? after race.timerOccurrenceId timerWait.deadlineMs =
        none := by
  simp [commitEventRaceMessageWinner, messages, timers, races,
    eventRaceTimerWinner?]

/-- On the exact admitted member inventory, Timer commitment removes both waits and makes Message selection ineligible. -/
theorem committed_timer_winner_is_exclusive
    (program : Program) (state : RuntimeState) (race : EventRace)
    (messageWait : MessageWait) (timerWait : TimerWait)
    (messages : state.messageWaits = [messageWait])
    (timers : state.timerWaits = [timerWait])
    (races : state.eventRaces = [race]) :
    let after := commitEventRaceTimerWinner state race messageWait timerWait
    after.messageWaits = [] ∧ after.timerWaits = [] ∧
      after.eventRaces = [] ∧
      eventRaceMessageWinner? program after race.messageSubscriptionId
        messageWait.channel = none := by
  simp [commitEventRaceTimerWinner, messages, timers, races,
    eventRaceMessageWinner?]

/-- Interruption removes every race owned by the interrupted occurrence subtree. -/
theorem interruptScope_removes_interrupted_event_race
    (state : RuntimeState) (root parent : ScopeOccurrenceId)
    (output : ControlPlaceId) (race : EventRace)
    (interrupted : occurrenceInSubtree state.scopeOccurrences root race.owner = true) :
    race ∉ (interruptScope state root parent output).eventRaces := by
  simp [interruptScope, interrupted]

/-- Interruption never reuses a race activation identity. -/
theorem interruptScope_preserves_event_race_activations
    (state : RuntimeState) (root parent : ScopeOccurrenceId)
    (output : ControlPlaceId) :
    (interruptScope state root parent output).eventRaceActivations =
      state.eventRaceActivations := by
  simp [interruptScope]

end BpmnSemantics.SemanticProcess
