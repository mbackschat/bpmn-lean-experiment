/**
 * Durable readiness scheduling for the bounded one-Message/one-Timer Event-Based Gateway profile.
 *
 * Callback order is not semantic order. Every callback is tagged with the current Workflow activation,
 * and the required microtask drain closes that activation before a batch is classified.
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
  CancellationScope,
  condition,
  isCancellation,
  workflowInfo,
} from "@temporalio/workflow";

import {
  bpmnEventRaceOrderingUnavailableFailureType,
} from "./contracts.js";
import {
  timerFiringStimulus,
} from "./timer-command.js";

export const EventRaceActivationDrain = {
  Required: "required",
  RemovedMutation: "removedMutation",
} as const;

export type EventRaceActivationDrain =
  typeof EventRaceActivationDrain[keyof typeof EventRaceActivationDrain];

type MessageReadiness = Readonly<{
  kind: typeof StimulusKind.DeliverMessage;
  activation: number;
  stimulus: DeliverMessageStimulus;
  submitToCore: boolean;
}>;

type TimerReadiness = Readonly<{
  kind: typeof StimulusKind.FireTimer;
  activation: number;
  stimulus: FireTimerStimulus;
}>;

type EventRaceReadiness = MessageReadiness | TimerReadiness;

type ActiveTimer = {
  key: string;
  scope: CancellationScope;
  fired: boolean;
};

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
  activationDrain: EventRaceActivationDrain,
): EventRaceReadinessScheduler {
  let readiness: EventRaceReadiness[] = [];
  let activeTimer: ActiveTimer | undefined;
  let timerFailure: unknown;

  return {
    recordMessageCallback(state, stimulus, submitToCore) {
      if (state.eventRaces.length === 0) {
        return false;
      }
      requireManagedRaceTimer(state);
      readiness.push({
        kind: StimulusKind.DeliverMessage,
        activation: workflowInfo().historyLength,
        stimulus,
        submitToCore,
      });
      return true;
    },

    async waitForReadiness(state) {
      const timer = requireManagedRaceTimer(state);
      ensureDurableTimer(timer);
      await condition(() => readiness.length > 0 || timerFailure !== undefined);
      if (timerFailure !== undefined) {
        throw timerFailure;
      }
      if (activationDrain === EventRaceActivationDrain.Required) {
        await Promise.resolve();
      }
      const first = readiness[0];
      if (first === undefined) {
        throw hostInvariantFailure(
          "Event race scheduler woke without one classified callback",
        );
      }
      const batch = readiness.filter(
        ({ activation }) => activation === first.activation,
      );
      readiness = readiness.filter(
        ({ activation }) => activation !== first.activation,
      );
      if (
        batch.some(({ kind }) => kind === StimulusKind.DeliverMessage) &&
        batch.some(({ kind }) => kind === StimulusKind.FireTimer)
      ) {
        throw ApplicationFailure.nonRetryable(
          "Message and Timer readiness shared one Workflow activation with no portable winner order",
          bpmnEventRaceOrderingUnavailableFailureType,
        );
      }
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
    },

    reconcileCommittedState(state) {
      const timer = activeTimer;
      if (state.eventRaces.length > 0) {
        const required = requireManagedRaceTimer(state);
        if (timer !== undefined && timer.key !== timerKey(required)) {
          throw hostInvariantFailure(
            "Committed event race changed its durable Timer identity",
          );
        }
        return;
      }
      if (timer !== undefined) {
        if (!timer.fired) {
          timer.scope.cancel();
        }
        activeTimer = undefined;
      }
    },
  };

  function ensureDurableTimer(timer: ManagedRaceTimer): void {
    const key = timerKey(timer);
    if (activeTimer !== undefined) {
      if (activeTimer.key !== key) {
        throw hostInvariantFailure(
          "Event race attempted to replace its live durable Timer",
        );
      }
      return;
    }
    const scope = new CancellationScope({ cancellable: true });
    const ownedTimer: ActiveTimer = { key, scope, fired: false };
    activeTimer = ownedTimer;
    void scope.run(() => waitForTimer(timer.remainingMs)).then(
      () => {
        if (activeTimer !== ownedTimer) {
          return;
        }
        ownedTimer.fired = true;
        readiness.push({
          kind: StimulusKind.FireTimer,
          activation: workflowInfo().historyLength,
          stimulus: timerFiringStimulus(timer),
        });
      },
      (error: unknown) => {
        if (!isCancellation(error)) {
          timerFailure = error;
        }
      },
    );
  }
}

type ManagedRaceTimer = Readonly<{
  id: RuntimeState["timerWaits"][number]["id"];
  deadlineMs: number;
  remainingMs: number;
}>;

function requireManagedRaceTimer(state: RuntimeState): ManagedRaceTimer {
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

function timerKey(timer: ManagedRaceTimer): string {
  return [
    timer.id.processInstanceId,
    timer.id.elementId,
    timer.id.activation,
    timer.deadlineMs,
  ].join("\u0000");
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

function hostInvariantFailure(message: string): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    message,
    "BpmnHostCapabilityInvariantViolation",
  );
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported event race callback: ${String(value)}`);
}
