import {
  StimulusKind,
} from "./contract.js";
import type {
  DeliverMessageStimulus,
  FireTimerStimulus,
  MessageSubscriptionId,
  TimerOccurrenceId,
} from "./contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
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
  nextActivation,
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
  const members = exactEventRaceBinding(program, state, race);
  if (
    members === undefined ||
    !sameMessageChannel(members.message.channel, stimulus.channel)
  ) {
    return null;
  }
  return commitWinner(
    state,
    race,
    members.definition.message.output,
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
  const members = exactEventRaceBinding(program, state, race);
  if (
    members === undefined ||
    stimulus.logicalTimeMs !== members.timer.deadlineMs
  ) {
    return null;
  }
  return commitWinner(
    state,
    race,
    members.definition.timer.output,
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

type ExactEventRaceBinding = Readonly<{
  definition: AwaitEventRaceOperation;
  message: RuntimeState["messageWaits"][number];
  timer: RuntimeState["timerWaits"][number];
}>;

/** Binds one race occurrence to one definition and both exact live wait records. */
function exactEventRaceBinding(
  program: SemanticProcessProgram,
  state: RuntimeState,
  race: EventRace,
): ExactEventRaceBinding | undefined {
  if (state.control.kind !== ControlStateKind.Running) {
    return undefined;
  }
  const definition = only(program.operations.filter(
    (candidate): candidate is AwaitEventRaceOperation =>
      candidate.kind === SemanticOperationKind.AwaitEventRace &&
      candidate.origin.elementId === race.id.elementId,
  ));
  const message = only(state.messageWaits.filter((wait) =>
    raceOwnsMessage(race, wait)
  ));
  const timer = only(state.timerWaits.filter((wait) => raceOwnsTimer(race, wait)));
  if (
    definition === undefined ||
    message === undefined ||
    timer === undefined ||
    race.id.processInstanceId !== state.control.instanceId ||
    race.owner.processInstanceId !== state.control.instanceId ||
    race.messageSubscriptionId.processInstanceId !== state.control.instanceId ||
    race.timerOccurrenceId.processInstanceId !== state.control.instanceId ||
    definition.message.elementId !== race.messageSubscriptionId.elementId ||
    definition.timer.elementId !== race.timerOccurrenceId.elementId ||
    message.output !== definition.message.output ||
    timer.output !== definition.timer.output ||
    !sameMessageChannel(definition.message.channel, message.channel)
  ) {
    return undefined;
  }
  return { definition, message, timer };
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
