import {
  CanonicalObservationKind,
  CommandOutcome,
  ControlStateKind,
  EffectExecutionResultKind,
  ProcessStatus,
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  deployProcess,
  initialState,
  isWellFormedStimulus,
  isWellFormedEffectExecutionResult,
  projectEffectTransportMaterial,
  projectOpenEffects,
  projectOpenTimers,
  projectOpenUserTasks,
  sameStimulus,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteEffectStimulus,
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  OpenUserTask,
  RuntimeState,
  SemanticProcessProgram,
  ProcessStartStimulus,
  StateObservation,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  ActivityFailure,
  ApplicationFailure,
  CancelledFailure,
  allHandlersFinished,
  condition,
  defineQuery,
  defineSignal,
  defineUpdate,
  setHandler,
} from "@temporalio/workflow";

import {
  bpmnBoundedActivitySchedulerUnavailableFailureType,
  bpmnCompleteUserTaskUpdateName,
  bpmnDeliverMessageSignalName,
  bpmnMessageDeliveryResultQueryName,
  bpmnOpenUserTasksQueryName,
  bpmnUserTaskDetailQueryName,
  bpmnTraceQueryName,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnCompleteUserTaskUpdateArguments,
  BpmnDeliverMessageSignalArguments,
  BpmnMessageDeliveryResultQueryArguments,
  BpmnUserTaskDetailQueryArguments,
  CompletedProcessReceipt,
  MessageDeliveryResolution,
  UserTaskDetail,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectExecutionResult,
  EffectRequest,
} from "@bpmn-lean/temporal-protocol";
import {
  acceptMessageDelivery,
  completedMessageDeliveryRecords,
  findMessageDeliveryResolution,
  recordMessageDeliveryOutcome,
} from "./message-delivery-ledger.js";
import {
  completeEffectStimulus,
  effectTransportKey,
} from "@bpmn-lean/temporal-protocol";
import {
  acceptedStimulus,
  requireSameCommandStimulus,
  validateCompleteUserTaskUpdate,
  validateDeliverMessageSignal,
} from "./workflow-wire-validation.js";
import {
  ActivationDrain,
} from "./activation-tagged-readiness.js";
import {
  boundedActivityDeadlineFamily,
  boundedScopeDeadlineFamily,
  createBoundedDeadlineScheduler,
  monitoredActivityDeadlineFamily,
} from "./bounded-deadline-scheduler.js";
import {
  createEventRaceReadinessScheduler,
} from "./event-race-readiness-scheduler.js";
import {
  hostInvariantFailure,
} from "./host-invariant.js";
import {
  timerFiringStimulus,
} from "@bpmn-lean/temporal-protocol";
import {
  projectUserTaskDetail,
} from "@bpmn-lean/temporal-protocol";

export const bpmnTraceQuery =
  defineQuery<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName);
export const bpmnOpenUserTasksQuery =
  defineQuery<ReadonlyArray<OpenUserTask>>(bpmnOpenUserTasksQueryName);
export const bpmnUserTaskDetailQuery = defineQuery<
  UserTaskDetail | null,
  BpmnUserTaskDetailQueryArguments
>(bpmnUserTaskDetailQueryName);
export const bpmnCompleteUserTaskUpdate: ReturnType<
  typeof defineUpdate<CommandOutcome, BpmnCompleteUserTaskUpdateArguments>
> = defineUpdate<
  CommandOutcome,
  BpmnCompleteUserTaskUpdateArguments
>(bpmnCompleteUserTaskUpdateName);
export const bpmnDeliverMessageSignal = defineSignal<
  BpmnDeliverMessageSignalArguments
>(bpmnDeliverMessageSignalName);
export const bpmnMessageDeliveryResultQuery = defineQuery<
  MessageDeliveryResolution | null,
  BpmnMessageDeliveryResultQueryArguments
>(bpmnMessageDeliveryResultQueryName);

type CommandResultLedgerEntry = Readonly<{
  commandId: string;
  outcome: CommandOutcome;
}>;

export async function runBpmnProcessWithHostEffects(
  start: ProcessStartStimulus,
  semanticProcess: SemanticProcessProgram,
  waitForTimer: (durationMs: number) => Promise<void>,
  executeEffect: (
    request: EffectRequest,
  ) => Promise<EffectExecutionResult>,
  eventRaceActivationDrain: ActivationDrain = ActivationDrain.Required,
): Promise<CompletedProcessReceipt> {
  const deployment = deployProcess(start, semanticProcess);
  if (deployment.outcome !== CommandOutcome.Committed) {
    throw ApplicationFailure.nonRetryable(
      "Workflow input is not one admitted Semantic Process execution",
      "BpmnProcessAdmissionFailure",
    );
  }

  const trace: CanonicalObservation[] = [deployment.observation];
  const pendingStimuli: Stimulus[] = [];
  const acceptedStimuli: Stimulus[] = [];
  const commandResults: CommandResultLedgerEntry[] = [];
  const messageDeliveryResolutions: MessageDeliveryResolution[] = [];
  let state: RuntimeState = initialState;
  const eventRaceScheduler = createEventRaceReadinessScheduler(
    waitForTimer,
    eventRaceActivationDrain,
  );
  // One scheduler per boundary-deadline host kind. Each owns only the deadlines its own family
  // defines, so at most one ever claims a given committed state and none can schedule another
  // family's pair under the wrong refusal identity.
  const boundedDeadlineSchedulers = [
    createBoundedDeadlineScheduler(
      semanticProcess,
      waitForTimer,
      boundedActivityDeadlineFamily,
    ),
    createBoundedDeadlineScheduler(
      semanticProcess,
      waitForTimer,
      boundedScopeDeadlineFamily,
    ),
    createBoundedDeadlineScheduler(
      semanticProcess,
      waitForTimer,
      monitoredActivityDeadlineFamily,
    ),
  ] as const;
  const boundedDeadlineSchedulerFor = (candidate: RuntimeState) =>
    boundedDeadlineSchedulers.find((scheduler) =>
      scheduler.ownsCommittedDeadline(candidate)
    );

  // Update handlers can run as soon as they are registered, including during replay after Worker restart. Start must already lead the semantic input queue.
  enqueueStimulus(acceptedStimuli, pendingStimuli, start);

  setHandler(bpmnTraceQuery, () => [...trace]);
  setHandler(
    bpmnOpenUserTasksQuery,
    () => projectOpenUserTasks(state),
  );
  setHandler(
    bpmnUserTaskDetailQuery,
    (request) => projectUserTaskDetail(state, request),
  );
  setHandler(
    bpmnMessageDeliveryResultQuery,
    (stimulus) =>
      findMessageDeliveryResolution(
        messageDeliveryResolutions,
        stimulus,
      ) ?? null,
  );
  setHandler(bpmnDeliverMessageSignal, (stimulus) => {
    validateDeliverMessageSignal(stimulus);
    const accepted = acceptedStimulus(
      acceptedStimuli,
      stimulus.commandId,
    );
    const acceptance = acceptMessageDelivery(
      messageDeliveryResolutions,
      stimulus,
      accepted,
    );
    const scheduledByEventRace = eventRaceScheduler.recordMessageCallback(
      state,
      stimulus,
      acceptance.enqueue,
    );
    if (acceptance.enqueue) {
      acceptedStimuli.push(stimulus);
      if (!scheduledByEventRace) {
        pendingStimuli.push(stimulus);
      }
    }
  });
  setHandler(
    bpmnCompleteUserTaskUpdate,
    async (stimulus) => {
      // A bounded completion races its deadline, so the scheduler classifies it by activation
      // instead of the loop draining it in arrival order.
      if (
        boundedDeadlineSchedulerFor(state)?.recordCompletionCallback(
          state,
          stimulus,
        ) === true
      ) {
        acceptedStimuli.push(stimulus);
      } else {
        enqueueStimulus(acceptedStimuli, pendingStimuli, stimulus);
      }
      await condition(
        () =>
          commandOutcome(commandResults, stimulus.commandId) !== undefined,
      );
      const outcome = commandOutcome(commandResults, stimulus.commandId);
      if (outcome === undefined) {
        throw ApplicationFailure.nonRetryable(
          `Semantic loop ended without an outcome for ${stimulus.commandId}`,
          "BpmnCommandOutcomeMissing",
        );
      }
      return outcome;
    },
    {
      validator: (stimulus) =>
        validateCompleteUserTaskUpdate(acceptedStimuli, stimulus),
    },
  );

  while (true) {
    if (
      pendingStimuli.length === 0 &&
      state.control.kind !== ControlStateKind.Completed
    ) {
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
            enqueueStimulus(acceptedStimuli, pendingStimuli, stimulus);
          }
        }
        continue;
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
            state.control.kind === ControlStateKind.Completed,
        );
      } else if (timers.length > 0) {
        // A boundary deadline races the completion Update, so the generic path below is unsound for
        // it: that path arms a bare durable timer and, on an activation carrying both callbacks,
        // would let raw job order pick the winner. Its own barrier-backed scheduler owns the
        // deadline instead, and refuses only the shared-activation case this capsule leaves undefined.
        const boundedDeadlineScheduler = boundedDeadlineSchedulerFor(state);
        if (boundedDeadlineScheduler !== undefined) {
          for (const stimulus of await boundedDeadlineScheduler.waitForReadiness(state)) {
            if (stimulus.kind === StimulusKind.CompleteUserTaskInstance) {
              // Its Update handler already accepted it; re-accepting would drop it from the queue.
              pendingStimuli.push(stimulus);
            } else {
              enqueueStimulus(acceptedStimuli, pendingStimuli, stimulus);
            }
          }
          continue;
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
        );
      } else {
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
        const material = projectEffectTransportMaterial(
          semanticProcess,
          effect,
        );
        const request: EffectRequest = {
          ...material.descriptor,
          idempotencyKey: effectTransportKey(material),
          arguments: material.arguments,
        };
        let result: EffectExecutionResult;
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
        if (!isWellFormedEffectExecutionResult(result)) {
          throw ApplicationFailure.nonRetryable(
            "Effect Activity returned an invalid result",
            "BpmnEffectExecutionResultInvalid",
          );
        }
        enqueueStimulus(
          acceptedStimuli,
          pendingStimuli,
          completeEffectStimulus(effect.id, result),
        );
      }
    }
    while (pendingStimuli.length > 0) {
      const stimulus = pendingStimuli.shift();
      if (stimulus === undefined) {
        throw ApplicationFailure.nonRetryable(
          "Semantic input queue lost an accepted stimulus",
          "BpmnSemanticQueueFailure",
        );
      }
      const step = advanceScenario(semanticProcess, state, stimulus);
      if (
        step.kind === ScenarioStepKind.Terminal &&
        stimulus.kind === StimulusKind.CompleteEffect
      ) {
        failRejectedHostEffectResult(state, stimulus);
      }
      const outcome = recordCommandOutcome(
        commandResults,
        stimulus,
        step.observations,
      );
      if (
        stimulus.kind === StimulusKind.DeliverMessage &&
        outcome !== undefined
      ) {
        recordMessageDeliveryOutcome(
          messageDeliveryResolutions,
          stimulus,
          outcome,
        );
      }
      trace.push(...step.observations);
      switch (step.kind) {
        case ScenarioStepKind.Committed:
        case ScenarioStepKind.Terminal:
          state = step.state;
          eventRaceScheduler.reconcileCommittedState(state);
          for (const scheduler of boundedDeadlineSchedulers) {
            scheduler.reconcileCommittedState(state);
          }
          break;
        case ScenarioStepKind.HarnessFailure:
          throw ApplicationFailure.nonRetryable(
            "Semantic core exceeded its checked closure boundary",
            "BpmnSemanticClosureFailure",
          );
        default:
          return assertNever(step);
      }
    }

    if (state.control.kind !== ControlStateKind.Completed) {
      continue;
    }
    await condition(allHandlersFinished);
    if (pendingStimuli.length === 0) {
      break;
    }
  }

  return {
    definition: semanticProcess.identity,
    processId: semanticProcess.processId,
    processInstanceId: start.instanceId,
    finalState: requireCompletedState(trace, start.instanceId),
    messageDeliveryRecords: completedMessageDeliveryRecords(
      messageDeliveryResolutions,
    ),
  };
}

function failRejectedHostEffectResult(
  state: RuntimeState,
  stimulus: CompleteEffectStimulus,
): never {
  const wait = state.effectWaits.find(
    ({ id }) =>
      id.processInstanceId === stimulus.effectId.processInstanceId &&
      id.elementId === stimulus.effectId.elementId &&
      id.activation === stimulus.effectId.activation,
  );
  if (
    stimulus.result.kind === EffectExecutionResultKind.BpmnError &&
    wait !== undefined &&
    (
      wait.bpmnErrorRoute === null ||
      wait.bpmnErrorRoute.code !== stimulus.result.code
    )
  ) {
    throw ApplicationFailure.nonRetryable(
      "Effect Activity returned a BPMN Error with no admitted matching route",
      "BPMN_UNHANDLED_BPMN_ERROR",
    );
  }
  throw ApplicationFailure.nonRetryable(
    "Effect Activity returned a result refused by the committed semantic intent",
    "BpmnEffectExecutionResultRejected",
  );
}

function enqueueStimulus(
  acceptedStimuli: Stimulus[],
  pendingStimuli: Stimulus[],
  stimulus: Stimulus,
): void {
  const commandId = stimulusCommandId(stimulus);
  const accepted = acceptedStimulus(acceptedStimuli, commandId);
  if (accepted === undefined) {
    acceptedStimuli.push(stimulus);
    pendingStimuli.push(stimulus);
    return;
  }
  requireSameCommandStimulus(accepted, stimulus);
}

function recordCommandOutcome(
  results: CommandResultLedgerEntry[],
  stimulus: Stimulus,
  observations: ReadonlyArray<CanonicalObservation>,
): CommandOutcome | undefined {
  const commandId = stimulusCommandId(stimulus);
  const observation = observations.find(
    (candidate) =>
      candidate.kind === CanonicalObservationKind.Command &&
      candidate.commandId === commandId,
  );
  if (
    observation === undefined ||
    observation.kind !== CanonicalObservationKind.Command
  ) {
    return undefined;
  }
  const existing = commandOutcome(results, commandId);
  if (existing !== undefined && existing !== observation.outcome) {
    throw new TypeError(`Command ${commandId} produced conflicting outcomes`);
  }
  if (existing === undefined) {
    results.push({ commandId, outcome: observation.outcome });
  }
  return observation.outcome;
}

function commandOutcome(
  results: ReadonlyArray<CommandResultLedgerEntry>,
  commandId: string,
): CommandOutcome | undefined {
  return results.find((entry) => entry.commandId === commandId)?.outcome;
}





function requireCompletedState(
  trace: ReadonlyArray<CanonicalObservation>,
  processInstanceId: string,
): StateObservation & { status: ProcessStatus.Completed } {
  const finalState = trace.findLast(
    (
      observation,
    ): observation is StateObservation & {
      status: ProcessStatus.Completed;
    } =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  if (
    finalState === undefined ||
    finalState.instanceId !== processInstanceId
  ) {
    throw ApplicationFailure.nonRetryable(
      "Completed semantic Process has no valid final observation",
      "BpmnCompletedReceiptFailure",
    );
  }
  return finalState;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Temporal adapter variant: ${String(value)}`);
}
