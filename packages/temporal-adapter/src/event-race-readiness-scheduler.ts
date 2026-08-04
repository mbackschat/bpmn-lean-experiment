/**
 * Durable readiness scheduling for the bounded one-Message/one-Timer Event-Based Gateway profile.
 *
 * This module owns what is specific to the race: which committed state counts as one managed pair,
 * that a Message and its Timer sharing one activation has no portable BPMN winner, and that a message
 * already accepted by its Signal handler is not resubmitted. The activation-tagged batching and the
 * durable Timer ownership are shared host mechanisms and live with their own owners.
 */
import {
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  DeliverMessageStimulus,
  FireTimerStimulus,
  RuntimeState,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
} from "@temporalio/workflow";

import {
  ActivationDrain,
  createActivationTaggedReadiness,
} from "./activation-tagged-readiness.js";
import {
  bpmnEventRaceOrderingUnavailableFailureType,
} from "./contracts.js";
import {
  createDurableTimerOwner,
} from "./durable-timer-owner.js";
import type {
  DurableTimer,
} from "./durable-timer-owner.js";
import {
  hostInvariantFailure,
} from "./host-invariant.js";

type MessageReadiness = Readonly<{
  kind: typeof StimulusKind.DeliverMessage;
  stimulus: DeliverMessageStimulus;
  submitToCore: boolean;
}>;

type TimerReadiness = Readonly<{
  kind: typeof StimulusKind.FireTimer;
  stimulus: FireTimerStimulus;
}>;

type EventRaceReadiness = MessageReadiness | TimerReadiness;

export type EventRaceReadinessScheduler = Readonly<{
  recordMessageCallback: (
    state: RuntimeState,
    stimulus: DeliverMessageStimulus,
    submitToCore: boolean,
  ) => boolean;
  waitForReadiness: (state: RuntimeState) => Promise<ReadonlyArray<Stimulus>>;
  reconcileCommittedState: (state: RuntimeState) => void;
}>;

export function createEventRaceReadinessScheduler(
  waitForTimer: (durationMs: number) => Promise<void>,
  activationDrain: ActivationDrain,
): EventRaceReadinessScheduler {
  const readiness = createActivationTaggedReadiness<EventRaceReadiness>(
    activationDrain,
    "Event race scheduler woke without one classified callback",
  );
  const timer = createDurableTimerOwner({
    waitForTimer,
    refusals: {
      replaced: "Event race attempted to replace its live durable Timer",
      identityChanged: "Committed event race changed its durable Timer identity",
    },
    onFiring: (stimulus) =>
      readiness.record({ kind: StimulusKind.FireTimer, stimulus }),
    onFailure: readiness.recordFailure,
  });

  return {
    recordMessageCallback(state, stimulus, submitToCore) {
      if (state.eventRaces.length === 0) {
        return false;
      }
      requireManagedRaceTimer(state);
      readiness.record({
        kind: StimulusKind.DeliverMessage,
        stimulus,
        submitToCore,
      });
      return true;
    },

    async waitForReadiness(state) {
      timer.ensureArmed(requireManagedRaceTimer(state));
      const batch = await readiness.takeBatch();
      if (
        batch.some(({ kind }) => kind === StimulusKind.DeliverMessage) &&
        batch.some(({ kind }) => kind === StimulusKind.FireTimer)
      ) {
        throw ApplicationFailure.nonRetryable(
          "Message and Timer readiness shared one Workflow activation with no portable winner order",
          bpmnEventRaceOrderingUnavailableFailureType,
        );
      }
      return submittedStimuli(batch);
    },

    reconcileCommittedState(state) {
      timer.reconcile(
        state.eventRaces.length > 0
          ? requireManagedRaceTimer(state)
          : undefined,
      );
    },
  };
}

/** A Signal-delivered message its handler already accepted is not offered to the core a second time. */
function submittedStimuli(
  batch: ReadonlyArray<EventRaceReadiness>,
): ReadonlyArray<Stimulus> {
  const stimuli: Stimulus[] = [];
  for (const callback of batch) {
    switch (callback.kind) {
      case StimulusKind.DeliverMessage:
        if (callback.submitToCore) {
          stimuli.push(callback.stimulus);
        }
        break;
      case StimulusKind.FireTimer:
        stimuli.push(callback.stimulus);
        break;
      default:
        assertNever(callback);
    }
  }
  return stimuli;
}

function requireManagedRaceTimer(state: RuntimeState): DurableTimer {
  const [race] = state.eventRaces;
  const [message] = state.messageWaits;
  const [timer] = state.timerWaits;
  if (
    state.eventRaces.length !== 1 ||
    state.messageWaits.length !== 1 ||
    state.timerWaits.length !== 1 ||
    race === undefined ||
    message === undefined ||
    timer === undefined ||
    !sameOccurrence(race.messageSubscriptionId, message.id) ||
    !sameOccurrence(race.timerOccurrenceId, timer.id) ||
    !sameOwner(race.owner, message.owner) ||
    !sameOwner(race.owner, timer.owner) ||
    timer.deadlineMs - state.logicalTimeMs !== 1_000
  ) {
    throw hostInvariantFailure(
      "Managed event race is not one exact occurrence-owned Message/PT1S Timer pair",
    );
  }
  return {
    id: timer.id,
    deadlineMs: timer.deadlineMs,
    remainingMs: 1_000,
  };
}

function sameOccurrence(
  left: RuntimeState["eventRaces"][number]["messageSubscriptionId"],
  right: RuntimeState["messageWaits"][number]["id"],
): boolean;
function sameOccurrence(
  left: RuntimeState["eventRaces"][number]["timerOccurrenceId"],
  right: RuntimeState["timerWaits"][number]["id"],
): boolean;
function sameOccurrence(
  left: Readonly<{
    processInstanceId: string;
    elementId: string;
    activation: number;
  }>,
  right: Readonly<{
    processInstanceId: string;
    elementId: string;
    activation: number;
  }>,
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation;
}

function sameOwner(
  left: RuntimeState["eventRaces"][number]["owner"],
  right: RuntimeState["messageWaits"][number]["owner"],
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.definitionScopeId === right.definitionScopeId &&
    left.activation === right.activation;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported event race callback: ${String(value)}`);
}
