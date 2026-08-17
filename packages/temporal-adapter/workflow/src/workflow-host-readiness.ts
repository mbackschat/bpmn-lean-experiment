import {
  StimulusKind,
  projectEffectTransportMaterial,
  projectOpenEffects,
  projectOpenTimers,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  effectTransportKey,
  timerFiringStimulus,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectActivityResult,
  EffectRequest,
} from "@bpmn-lean/temporal-protocol";
import {
  ActivityFailure,
  ApplicationFailure,
  CancelledFailure,
  condition,
} from "@temporalio/workflow";

import type { BoundedDeadlineScheduler } from "./bounded-deadline-scheduler.js";
import type { EffectActivityPolicy } from "./effect-activity-policy.js";
import {
  effectActivityResultCommand,
  throwEffectHostFailure,
} from "./effect-execution-host.js";
import type { EventRaceReadinessScheduler } from "./event-race-readiness-scheduler.js";
import { hostInvariantFailure } from "./host-invariant.js";
import { isTerminalProcessState } from "./terminal-process-receipt.js";
import {
  acceptedStimulus,
  requireSameCommandStimulus,
} from "./workflow-wire-validation.js";

export enum HostReadinessAction {
  DrainSemanticQueue = "drainSemanticQueue",
  RecheckMainLoop = "recheckMainLoop",
}

export async function waitForHostReadiness(
  state: RuntimeState,
  semanticProcess: SemanticProcessProgram,
  pendingStimuli: Stimulus[],
  acceptedStimuli: Stimulus[],
  eventRaceScheduler: EventRaceReadinessScheduler,
  boundedDeadlineSchedulers: ReadonlyArray<BoundedDeadlineScheduler>,
  waitForTimer: (durationMs: number) => Promise<void>,
  executeEffect: (request: EffectRequest) => Promise<EffectActivityResult>,
  effectActivityPolicy: EffectActivityPolicy,
  reserveStimulus: (stimulus: Stimulus) => boolean,
  hostRecheckRequested: () => boolean,
): Promise<HostReadinessAction> {
  const timers = projectOpenTimers(state);
  const effects = projectOpenEffects(state);
  if (state.eventRaces.length > 0) {
    if (effects.length > 0) {
      throw hostInvariantFailure(
        "Pre-start host admission allowed an effect beside a managed event race",
      );
    }
    const readyStimuli = await eventRaceScheduler.waitForReadiness(state);
    for (const stimulus of readyStimuli) {
      if (stimulus.kind === StimulusKind.DeliverMessage) {
        pendingStimuli.push(stimulus);
      } else {
        enqueueStimulus(
          acceptedStimuli,
          pendingStimuli,
          stimulus,
          reserveStimulus,
        );
      }
    }
    return HostReadinessAction.RecheckMainLoop;
  }
  if (timers.length > 0 && effects.length > 0) {
    throw hostInvariantFailure(
      "Pre-start host admission failed to exclude concurrent timer and effect waits",
    );
  }
  if (timers.length === 0 && effects.length === 0) {
    await condition(
      () =>
        pendingStimuli.length > 0 ||
        isTerminalProcessState(state) ||
        hostRecheckRequested(),
    );
    return HostReadinessAction.DrainSemanticQueue;
  }
  if (timers.length > 0) {
    // A boundary deadline races the completion Update, so the generic path below is unsound for
    // it: that path arms a bare durable timer and, on an activation carrying both callbacks,
    // would let raw job order pick the winner. Its own barrier-backed scheduler owns the
    // deadline instead, and refuses only the shared-activation case this capsule leaves undefined.
    const boundedDeadlineScheduler = boundedDeadlineSchedulers.find(
      (scheduler) => scheduler.ownsCommittedDeadline(state),
    );
    if (boundedDeadlineScheduler !== undefined) {
      for (
        const stimulus of await boundedDeadlineScheduler.waitForReadiness(state)
      ) {
        if (stimulus.kind === StimulusKind.CompleteUserTaskInstance) {
          // Its Update handler already accepted it; re-accepting would drop it from the queue.
          pendingStimuli.push(stimulus);
        } else {
          enqueueStimulus(
            acceptedStimuli,
            pendingStimuli,
            stimulus,
            reserveStimulus,
          );
        }
      }
      return HostReadinessAction.RecheckMainLoop;
    }
    if (timers.length !== 1) {
      throw hostInvariantFailure(
        "Pre-start host admission failed to exclude multiple committed timer waits",
      );
    }
    const timer = timers[0];
    if (timer === undefined) {
      throw ApplicationFailure.nonRetryable(
        "Committed timer projection lost its only occurrence",
        "BpmnTimerProjectionFailure",
      );
    }
    const remainingMs = timer.deadlineMs - state.logicalTimeMs;
    if (!Number.isSafeInteger(remainingMs) || remainingMs < 0) {
      throw ApplicationFailure.nonRetryable(
        "Committed timer deadline precedes semantic logical time",
        "BpmnTimerDeadlineFailure",
      );
    }
    // The durable timer is derived only from committed core state. Physical lateness is
    // refinement stutter in this race-free capsule; semantic input carries the exact deadline.
    await waitForTimer(remainingMs);
    enqueueStimulus(
      acceptedStimuli,
      pendingStimuli,
      timerFiringStimulus(timer),
      reserveStimulus,
    );
    return HostReadinessAction.DrainSemanticQueue;
  }
  if (effects.length !== 1) {
    throw hostInvariantFailure(
      "Pre-start host admission failed to exclude multiple committed effect intents",
    );
  }
  const effect = effects[0];
  if (effect === undefined) {
    throw ApplicationFailure.nonRetryable(
      "Committed effect projection lost its only occurrence",
      "BpmnEffectProjectionFailure",
    );
  }
  const material = projectEffectTransportMaterial(semanticProcess, effect);
  const request: EffectRequest = {
    ...material.descriptor,
    idempotencyKey: effectTransportKey(material),
    arguments: material.arguments,
  };
  let result: EffectActivityResult;
  try {
    result = await executeEffect(request);
  } catch (error: unknown) {
    // Cancellation recovery is unmodeled and must retain its host classification. Only an
    // exhausted non-cancelled Activity execution becomes this capsule's typed adapter failure.
    if (
      !(error instanceof ActivityFailure) ||
      error.cause instanceof CancelledFailure
    ) {
      throw error;
    }
    throw ApplicationFailure.nonRetryable(
      "Effect Activity exhausted its bounded execution policy",
      "BPMN_EFFECT_EXECUTION_EXHAUSTED",
      undefined,
      error,
    );
  }
  const command = effectActivityResultCommand(
    effectActivityPolicy,
    state,
    effect,
    result,
  );
  switch (command.kind) {
    case "command":
      enqueueStimulus(
        acceptedStimuli,
        pendingStimuli,
        command.stimulus,
        reserveStimulus,
      );
      return HostReadinessAction.DrainSemanticQueue;
    case "failure":
      throwEffectHostFailure(command.failure);
    default:
      return assertNever(command);
  }
}

export function enqueueStimulus(
  acceptedStimuli: Stimulus[],
  pendingStimuli: Stimulus[],
  stimulus: Stimulus,
  reserveStimulus: (stimulus: Stimulus) => boolean = () => true,
): void {
  const commandId = stimulusCommandId(stimulus);
  const accepted = acceptedStimulus(acceptedStimuli, commandId);
  if (accepted === undefined) {
    if (!reserveStimulus(stimulus)) {
      return;
    }
    acceptedStimuli.push(stimulus);
    pendingStimuli.push(stimulus);
    return;
  }
  requireSameCommandStimulus(accepted, stimulus);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Temporal adapter variant: ${String(value)}`);
}
