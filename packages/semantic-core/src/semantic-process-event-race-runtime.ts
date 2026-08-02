import {
  StimulusKind,
} from "./contract.js";
import type {
  DeliverMessageStimulus,
  FireTimerStimulus,
  MessageSubscriptionId,
  TimerOccurrenceId,
} from "./contract.js";
import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  AwaitEventRaceOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  sameMessageChannel,
} from "./message-channel.js";
import {
  addToken,
  compareEventRaces,
  compareMessageWaits,
  compareTimerWaits,
  ControlStateKind,
  removeToken,
  sameOccurrence,
  sameScopeOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  EventRace,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

/** Atomically replaces one Gateway token with both waits and their ownership record. */
export function armEventRace(
  operation: AwaitEventRaceOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const raceActivation = nextActivation(
    state.eventRaceActivations,
    operation.origin.elementId,
  );
  const messageActivation = nextActivation(
    state.messageActivations,
    operation.message.elementId,
  );
  const timerActivation = nextActivation(
    state.timerActivations,
    operation.timer.elementId,
  );
  const deadlineMs = state.logicalTimeMs + operation.timer.durationMs;
  if (!Number.isSafeInteger(deadlineMs)) {
    throw new RangeError("Timer deadline exceeds the safe integer boundary");
  }
  const messageSubscriptionId = {
    processInstanceId: state.control.instanceId,
    elementId: operation.message.elementId,
    activation: messageActivation,
  };
  const timerOccurrenceId = {
    processInstanceId: state.control.instanceId,
    elementId: operation.timer.elementId,
    activation: timerActivation,
  };
  const race: EventRace = {
    id: {
      processInstanceId: state.control.instanceId,
      elementId: operation.origin.elementId,
      activation: raceActivation,
    },
    owner,
    messageSubscriptionId,
    timerOccurrenceId,
  };
  return {
    ...state,
    controlTokens: removeToken(state.controlTokens, operation.input, owner),
    messageWaits: [
      ...state.messageWaits,
      {
        id: messageSubscriptionId,
        owner,
        channel: operation.message.channel,
        output: operation.message.output,
      },
    ].sort(compareMessageWaits),
    timerWaits: [
      ...state.timerWaits,
      {
        id: timerOccurrenceId,
        owner,
        deadlineMs,
        output: operation.timer.output,
      },
    ].sort(compareTimerWaits),
    eventRaces: [...state.eventRaces, race].sort(compareEventRaces),
    messageActivations: setActivationCount(
      state.messageActivations,
      operation.message.elementId,
      messageActivation,
    ),
    timerActivations: setActivationCount(
      state.timerActivations,
      operation.timer.elementId,
      timerActivation,
    ),
    eventRaceActivations: setActivationCount(
      state.eventRaceActivations,
      operation.origin.elementId,
      raceActivation,
    ),
  };
}

/** Commits the Message arm only when both race members still exist, withdrawing both waits. */
export function winEventRaceWithMessage(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: DeliverMessageStimulus,
): RuntimeState | null {
  if (
    stimulus.kind !== StimulusKind.DeliverMessage ||
    state.control.kind !== ControlStateKind.Running ||
    !eventRaceAssociationsAreValid(state)
  ) {
    return null;
  }
  const race = raceForMessage(state.eventRaces, stimulus.subscriptionId);
  if (race === undefined) {
    return null;
  }
  const members = completeMembers(program, state, race);
  if (
    members === undefined ||
    !sameMessageChannel(members.message.channel, stimulus.channel)
  ) {
    return null;
  }
  return commitWinner(
    state,
    race,
    members.message.output,
    members.message.owner,
    state.logicalTimeMs,
  );
}

/** Commits the Timer arm only at its exact deadline, withdrawing both waits. */
export function winEventRaceWithTimer(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: FireTimerStimulus,
): RuntimeState | null {
  if (
    stimulus.kind !== StimulusKind.FireTimer ||
    state.control.kind !== ControlStateKind.Running ||
    !eventRaceAssociationsAreValid(state)
  ) {
    return null;
  }
  const race = raceForTimer(state.eventRaces, stimulus.timerId);
  if (race === undefined) {
    return null;
  }
  const members = completeMembers(program, state, race);
  if (
    members === undefined ||
    stimulus.logicalTimeMs !== members.timer.deadlineMs
  ) {
    return null;
  }
  return commitWinner(
    state,
    race,
    members.timer.output,
    members.timer.owner,
    members.timer.deadlineMs,
  );
}

export function isEventRaceMessageDefinition(
  program: SemanticProcessProgram,
  id: MessageSubscriptionId,
): boolean {
  return program.operations.some(
    (operation) =>
      operation.kind === SemanticOperationKind.AwaitEventRace &&
      operation.message.elementId === id.elementId,
  );
}

export function isEventRaceTimerDefinition(
  program: SemanticProcessProgram,
  id: TimerOccurrenceId,
): boolean {
  return program.operations.some(
    (operation) =>
      operation.kind === SemanticOperationKind.AwaitEventRace &&
      operation.timer.elementId === id.elementId,
  );
}

/** Requires each hidden race and each of its two member waits to form one unique ownership association. */
export function eventRaceAssociationsAreValid(state: RuntimeState): boolean {
  return state.eventRaces.every((race, index) =>
    state.eventRaces.findIndex((candidate) => sameOccurrence(candidate.id, race.id)) === index &&
    state.messageWaits.filter((wait) => raceOwnsMessage(race, wait)).length === 1 &&
    state.timerWaits.filter((wait) => raceOwnsTimer(race, wait)).length === 1 &&
    state.eventRaces.filter((candidate) =>
      sameOccurrence(candidate.messageSubscriptionId, race.messageSubscriptionId)
    ).length === 1 &&
    state.eventRaces.filter((candidate) =>
      sameOccurrence(candidate.timerOccurrenceId, race.timerOccurrenceId)
    ).length === 1
  );
}

function completeMembers(
  program: SemanticProcessProgram,
  state: RuntimeState,
  race: EventRace,
) {
  const operation = program.operations.find(
    (candidate): candidate is AwaitEventRaceOperation =>
      candidate.kind === SemanticOperationKind.AwaitEventRace &&
      candidate.origin.elementId === race.id.elementId,
  );
  const message = state.messageWaits.find((wait) => raceOwnsMessage(race, wait));
  const timer = state.timerWaits.find((wait) => raceOwnsTimer(race, wait));
  return operation !== undefined &&
      message !== undefined &&
      timer !== undefined &&
      operation.message.elementId === message.id.elementId &&
      operation.timer.elementId === timer.id.elementId &&
      sameMessageChannel(operation.message.channel, message.channel) &&
      sameScopeOccurrence(message.owner, race.owner) &&
      sameScopeOccurrence(timer.owner, race.owner)
    ? { message, timer }
    : undefined;
}

function commitWinner(
  state: RuntimeState,
  race: EventRace,
  output: string,
  owner: ScopeOccurrenceId,
  logicalTimeMs: number,
): RuntimeState {
  return {
    ...state,
    controlTokens: addToken(state.controlTokens, output, owner),
    messageWaits: state.messageWaits.filter(
      ({ id }) => !sameOccurrence(id, race.messageSubscriptionId),
    ),
    timerWaits: state.timerWaits.filter(
      ({ id }) => !sameOccurrence(id, race.timerOccurrenceId),
    ),
    eventRaces: state.eventRaces.filter(
      (candidate) => !sameOccurrence(candidate.id, race.id),
    ),
    logicalTimeMs,
  };
}

function raceForMessage(
  races: ReadonlyArray<EventRace>,
  id: MessageSubscriptionId,
): EventRace | undefined {
  return only(races.filter((race) => sameOccurrence(race.messageSubscriptionId, id)));
}

function raceForTimer(
  races: ReadonlyArray<EventRace>,
  id: TimerOccurrenceId,
): EventRace | undefined {
  return only(races.filter((race) => sameOccurrence(race.timerOccurrenceId, id)));
}

function raceOwnsMessage(
  race: EventRace,
  wait: RuntimeState["messageWaits"][number],
): boolean {
  return sameOccurrence(wait.id, race.messageSubscriptionId) &&
    sameScopeOccurrence(wait.owner, race.owner);
}

function raceOwnsTimer(
  race: EventRace,
  wait: RuntimeState["timerWaits"][number],
): boolean {
  return sameOccurrence(wait.id, race.timerOccurrenceId) &&
    sameScopeOccurrence(wait.owner, race.owner);
}

function only<T>(values: ReadonlyArray<T>): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function nextActivation(
  counters: ReadonlyArray<Readonly<{ elementId: string; count: number }>>,
  elementId: string,
): number {
  return (counters.find((counter) => counter.elementId === elementId)?.count ?? 0) + 1;
}
