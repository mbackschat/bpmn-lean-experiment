import {
  ScenarioStepKind,
  REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  StimulusKind,
  compareCanonicalStrings,
  sameOccurrenceId,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  ScenarioStep,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  bpmnSubscriptionTimerV1,
  requireSubscriptionTimerBindingForState,
} from "@bpmn-lean/temporal-protocol";
import type { BpmnSubscriptionTimerBindingV1 } from "@bpmn-lean/temporal-protocol";
import { hostInvariantFailure } from "./host-invariant.js";
import { ActivationDrain, createActivationTaggedReadiness } from "./activation-tagged-readiness.js";
import { createDurableTimerOwner } from "./durable-timer-owner.js";

export type SubscriptionReadinessScheduler = NonNullable<ReturnType<typeof createSubscriptionReadinessScheduler>>;

export function createSubscriptionReadinessScheduler(
  program: SemanticProcessProgram,
  initial: RuntimeState,
  restored: BpmnSubscriptionTimerBindingV1 | undefined,
  waitForTimer: (durationMs: number) => Promise<void>,
  acceptTimer: (stimulus: Stimulus) => boolean,
) {
  if (program.identity.semanticProfile !== REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID) {
    return undefined;
  }
  let binding = restored ?? { protocol: bpmnSubscriptionTimerV1, timer: null };
  requireSubscriptionTimerBindingForState(program, initial, binding);
  let fenced = false;
  let pending = 0;
  const readiness = createActivationTaggedReadiness<Stimulus>(
    ActivationDrain.Required, "Subscription readiness woke without an accepted callback",
  );
  const recordCommand = (stimulus: Stimulus) => {
    readiness.record(stimulus);
    pending += 1;
  };
  const timer = createDurableTimerOwner({
    waitForTimer,
    refusals: {
      replaced: "Subscription Timer was replaced before its committed handoff",
      identityChanged: "Subscription Timer identity differs from committed state",
    },
    onFiring: (stimulus) => { if (acceptTimer(stimulus)) recordCommand(stimulus); },
    onFailure: readiness.recordFailure,
  });
  const takeBatch = async (hostWakeRequested: () => boolean) => {
    const batch = await readiness.takeBatch(hostWakeRequested);
    pending -= batch.length;
    return selectSubscriptionStimuli(batch);
  };
  return {
    recordCommand,
    hasPendingCallbacks: () => pending > 0,
    currentBinding: () => binding,
    prepareCommit: (before: RuntimeState,
      step: Exclude<ScenarioStep, { kind: ScenarioStepKind.HarnessFailure }>,
      stimulus: Stimulus, nowMs: number, publicationRevision: number) =>
      prepareSubscriptionTimerBinding(program, before, step, stimulus, binding, nowMs, publicationRevision),
    commit(candidate: BpmnSubscriptionTimerBindingV1) {
      if (candidate.timer === null || binding.timer === null ||
        !sameOccurrenceId(candidate.timer.id, binding.timer.id) ||
        candidate.timer.logicalDeadlineMs !== binding.timer.logicalDeadlineMs) {
        timer.reconcile(undefined);
      }
      binding = candidate;
    },
    takePendingBatch: () => takeBatch(() => true),
    async fenceAndDrain() {
      fenced = true;
      const batch = await takeBatch(() => true);
      timer.reconcile(undefined);
      return batch;
    },
    async waitForReadiness(nowMs: number, hostWakeRequested: () => boolean) {
      if (!fenced && binding.timer !== null) {
        timer.ensureArmed({
          id: binding.timer.id, deadlineMs: binding.timer.logicalDeadlineMs,
          remainingMs: subscriptionTimerRemainingMs(binding, nowMs),
        });
      }
      return await takeBatch(hostWakeRequested);
    },
  };
}

enum SubscriptionCommandClass {
  Completion,
  Message,
  Timer,
  Incident,
}

/** ESL-ORDER-01 fixes the complete activation batch before any command executes. */
export function selectSubscriptionStimuli(batch: ReadonlyArray<Stimulus>): Stimulus[] {
  return [...batch].sort((left, right) =>
    subscriptionCommandClass(left) - subscriptionCommandClass(right) ||
    compareCanonicalStrings(stimulusCommandId(left), stimulusCommandId(right)));
}

function subscriptionCommandClass(stimulus: Stimulus): SubscriptionCommandClass {
  switch (stimulus.kind) {
    case StimulusKind.CompleteUserTaskInstance:
      return SubscriptionCommandClass.Completion;
    case StimulusKind.DeliverMessage:
    case StimulusKind.DeliverPayloadMessage:
    case StimulusKind.DeliverCorrelatedPayloadMessage:
      return SubscriptionCommandClass.Message;
    case StimulusKind.FireTimer:
      return SubscriptionCommandClass.Timer;
    case StimulusKind.RetryIncident:
    case StimulusKind.CancelIncidentProcess:
      return SubscriptionCommandClass.Incident;
    case StimulusKind.StartProcess:
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
    case StimulusKind.CompleteEffect:
    case StimulusKind.ReportEffectFailure:
      throw hostInvariantFailure("Subscription readiness received an unavailable command class");
    default:
      return assertNever(stimulus);
  }
}

/** ESL-HANDOFF-01 preflights the successor binding without changing committed host state. */
export function prepareSubscriptionTimerBinding(
  program: SemanticProcessProgram,
  before: RuntimeState,
  step: Exclude<ScenarioStep, { kind: ScenarioStepKind.HarnessFailure }>,
  stimulus: Stimulus,
  binding: BpmnSubscriptionTimerBindingV1,
  nowMs: number,
  publicationRevision: number,
): BpmnSubscriptionTimerBindingV1 {
  requireSubscriptionTimerBindingForState(program, before, binding);
  if (step.kind === ScenarioStepKind.Terminal) {
    if (stimulus.kind === StimulusKind.FireTimer &&
      before.timerWaits.some(({ id }) => sameOccurrenceId(id, stimulus.timerId))) {
      throw hostInvariantFailure("Subscription firing left its exact Timer live", {
        outcome: step.outcome.kind === "semantic" ? step.outcome.outcome : step.outcome.kind,
        commandId: stimulus.commandId,
        timerId: stimulus.timerId,
        logicalDeadlineMs: stimulus.logicalTimeMs,
        publicationRevision,
      });
    }
    return binding;
  }
  const timers = step.state.timerWaits;
  if (timers.length === 0) return { protocol: bpmnSubscriptionTimerV1, timer: null };
  if (timers.length !== 1) {
    throw hostInvariantFailure("Subscription state contains more than one Timer");
  }
  const timer = timers[0]!;
  if (binding.timer !== null && sameOccurrenceId(binding.timer.id, timer.id)) {
    requireSubscriptionTimerBindingForState(program, step.state, binding);
    return binding;
  }
  let dueTimeMs: number;
  if (binding.timer === null) {
    const remainingMs = timer.deadlineMs - step.state.logicalTimeMs;
    if (!Number.isSafeInteger(remainingMs) || remainingMs < 0) {
      throw hostInvariantFailure("Subscription Timer has an invalid initial logical delay");
    }
    dueTimeMs = addTime(nowMs, remainingMs);
  } else {
    if (stimulus.kind !== StimulusKind.FireTimer ||
      !sameOccurrenceId(stimulus.timerId, binding.timer.id)) {
      throw hostInvariantFailure("Subscription Timer changed without consuming its bound firing");
    }
    const periodMs = timer.deadlineMs - binding.timer.logicalDeadlineMs;
    if (!Number.isSafeInteger(periodMs) || periodMs <= 0) {
      throw hostInvariantFailure("Subscription Timer replacement did not advance its logical deadline");
    }
    dueTimeMs = addTime(binding.timer.dueTimeMs, periodMs);
  }
  return {
    protocol: bpmnSubscriptionTimerV1,
    timer: { id: timer.id, logicalDeadlineMs: timer.deadlineMs, dueTimeMs },
  };
}

export function subscriptionTimerRemainingMs(
  binding: BpmnSubscriptionTimerBindingV1,
  nowMs: number,
): number {
  if (binding.timer === null || !Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw hostInvariantFailure("Subscription Timer delay requires a bound Timer and valid Workflow time");
  }
  return Math.max(1, binding.timer.dueTimeMs - nowMs);
}

function addTime(base: number, delta: number): number {
  const sum = base + delta;
  if (!Number.isSafeInteger(base) || base < 0 || !Number.isSafeInteger(sum) || sum < 0) {
    throw hostInvariantFailure("Subscription Timer due time exceeds the safe integer domain");
  }
  return sum;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported subscription command: ${JSON.stringify(value)}`);
}
