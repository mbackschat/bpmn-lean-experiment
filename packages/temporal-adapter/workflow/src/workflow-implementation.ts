import {
  CommandOutcome,
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  deployProcess,
  initialState,
  projectEffectTransportMaterial,
  projectOpenEffects,
  projectOpenTimers,
  projectOpenUserTasks,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  CancelIncidentProcessStimulus,
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  DeliverMessageStimulus,
  OpenUserTask,
  RetryIncidentStimulus,
  RuntimeState,
  SemanticProcessProgram,
  ProcessStartStimulus,
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
  effectTransportKey,
  bpmnMessageDeliveryResultQueryName,
  bpmnOpenUserTasksQueryName,
  timerFiringStimulus,
  bpmnUserTaskDetailQueryName,
  bpmnTraceQueryName,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnCompleteUserTaskUpdateArguments,
  BpmnDeliverMessageSignalArguments,
  BpmnMessageDeliveryResultQueryArguments,
  BpmnUserTaskDetailQueryArguments,
  MessageDeliveryResolution,
  TerminalProcessReceipt,
  UserTaskDetail,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectActivityResult,
  EffectRequest,
} from "@bpmn-lean/temporal-protocol";
import {
  acceptMessageDelivery,
  completedMessageDeliveryRecords,
  findMessageDeliveryResolution,
  recordMessageDeliveryOutcome,
} from "./message-delivery-ledger.js";
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
  projectUserTaskDetail,
} from "@bpmn-lean/temporal-protocol";
import {
  EffectHostFailureKind,
  effectActivityResultCommand,
  failRejectedHostEffectResult,
  throwEffectHostFailure,
} from "./effect-execution-host.js";
import { effectActivityPolicyForProfile } from "./effect-activity-policy.js";
import {
  bpmnRetryEffectIncidentUpdate,
  validateRetryEffectIncidentUpdate,
} from "./incident-update-handler.js";
import {
  bpmnCancelIncidentProcessUpdate,
  validateCancelIncidentProcessUpdate,
} from "./incident-cancellation-update-handler.js";
import { registerIncidentOperationsQueryHandler } from "./incident-operations-query-handler.js";
import { registerExecutionPublicationQueryHandler } from "./execution-publication-query-handler.js";
import {
  commandOutcome,
  createCommandPublicationState,
  integrateCommandPublication,
  recordCommandPublicationOutcome,
} from "./command-publication-integration.js";
import { registerFlowNodeOccurrenceQueryHandler } from "./flow-node-occurrence-query-handler.js";
import {
  isTerminalProcessState,
  terminalProcessReceipt,
} from "./terminal-process-receipt.js";

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

export async function runBpmnProcessWithHostEffects(
  start: ProcessStartStimulus,
  semanticProcess: SemanticProcessProgram,
  waitForTimer: (durationMs: number) => Promise<void>,
  executeEffect: (
    request: EffectRequest,
  ) => Promise<EffectActivityResult>,
  eventRaceActivationDrain: ActivationDrain = ActivationDrain.Required,
): Promise<TerminalProcessReceipt> {
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
  const messageDeliveryResolutions: MessageDeliveryResolution[] = [];
  let state: RuntimeState = initialState;
  let commandPublication = createCommandPublicationState(
    semanticProcess,
    start.instanceId,
  );
  const effectActivityPolicy = effectActivityPolicyForProfile(
    semanticProcess.identity.semanticProfile,
  );
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

  registerExecutionPublicationQueryHandler(
    semanticProcess,
    () => commandPublication.execution,
  );
  registerFlowNodeOccurrenceQueryHandler(
    semanticProcess,
    () => commandPublication.execution,
    () => commandPublication.flowNodeOccurrences,
  );
  registerIncidentOperationsQueryHandler(semanticProcess, () => state);
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
          commandOutcome(commandPublication, stimulus.commandId) !== undefined,
      );
      const outcome = commandOutcome(commandPublication, stimulus.commandId);
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
  setHandler(
    bpmnRetryEffectIncidentUpdate,
    async (stimulus: RetryIncidentStimulus) => {
      enqueueStimulus(acceptedStimuli, pendingStimuli, stimulus);
      await condition(
        () => commandOutcome(commandPublication, stimulus.commandId) !== undefined,
      );
      const outcome = commandOutcome(commandPublication, stimulus.commandId);
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
        validateRetryEffectIncidentUpdate(acceptedStimuli, stimulus),
    },
  );
  setHandler(
    bpmnCancelIncidentProcessUpdate,
    async (stimulus: CancelIncidentProcessStimulus) => {
      enqueueStimulus(acceptedStimuli, pendingStimuli, stimulus);
      await condition(
        () => commandOutcome(commandPublication, stimulus.commandId) !== undefined,
      );
      const outcome = commandOutcome(commandPublication, stimulus.commandId);
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
        validateCancelIncidentProcessUpdate(
          acceptedStimuli,
          start.instanceId,
          stimulus,
        ),
    },
  );

  while (true) {
    if (
      pendingStimuli.length === 0 &&
      !isTerminalProcessState(state)
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
            isTerminalProcessState(state),
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
            );
            break;
          case "failure":
            throwEffectHostFailure(command.failure);
          default:
            assertNever(command);
        }
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
      const publicationCandidate = integrateCommandPublication(
        semanticProcess,
        commandPublication,
        stimulus,
        step,
        () => Date.now(),
      );
      if (
        step.kind === ScenarioStepKind.Terminal &&
        stimulus.kind === StimulusKind.CompleteEffect
      ) {
        failRejectedHostEffectResult(state, stimulus);
      }
      commandPublication = recordCommandPublicationOutcome(
        publicationCandidate,
        stimulus,
        step.observations,
      );
      const outcome = commandOutcome(
        commandPublication,
        stimulusCommandId(stimulus),
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

    if (!isTerminalProcessState(state)) {
      continue;
    }
    await condition(allHandlersFinished);
    if (pendingStimuli.length === 0) {
      break;
    }
  }

  return terminalProcessReceipt(
    semanticProcess,
    start.instanceId,
    state,
    trace,
    completedMessageDeliveryRecords(
      messageDeliveryResolutions,
    ),
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

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Temporal adapter variant: ${String(value)}`);
}
