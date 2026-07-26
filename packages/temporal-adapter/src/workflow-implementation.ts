import {
  CanonicalObservationKind,
  CommandOutcome,
  ControlStateKind,
  ProcessStatus,
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  deployProcess,
  initialState,
  isWellFormedStimulus,
  projectEffectTransportMaterial,
  projectOpenEffects,
  projectOpenTimers,
  projectOpenUserTasks,
  sameStimulus,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  RuntimeState,
  SemanticProcessProgram,
  StartProcessStimulus,
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
  defineUpdate,
  setHandler,
} from "@temporalio/workflow";

import {
  bpmnCompleteUserTaskUpdateName,
  bpmnOpenUserTasksQueryName,
  bpmnTraceQueryName,
} from "./contracts.js";
import type {
  BpmnCompleteUserTaskUpdateArguments,
  CompletedProcessReceipt,
} from "./contracts.js";
import type {
  EffectExecutionResult,
  EffectRequest,
} from "./effect-probe.js";
import {
  EffectExecutionResultKind,
} from "./effect-probe.js";
import {
  completeEffectStimulus,
  effectTransportKey,
} from "./effect-transport.js";
import {
  timerFiringStimulus,
} from "./timer-command.js";

export const bpmnTraceQuery =
  defineQuery<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName);
export const bpmnOpenUserTasksQuery =
  defineQuery<ReadonlyArray<OpenUserTask>>(bpmnOpenUserTasksQueryName);
export const bpmnCompleteUserTaskUpdate = defineUpdate<
  CommandOutcome,
  BpmnCompleteUserTaskUpdateArguments
>(bpmnCompleteUserTaskUpdateName);

type CommandResultLedgerEntry = Readonly<{
  commandId: string;
  outcome: CommandOutcome;
}>;

export async function runBpmnProcessWithHostEffects(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
  waitForTimer: (durationMs: number) => Promise<void>,
  executeEffect: (
    request: EffectRequest,
  ) => Promise<EffectExecutionResult>,
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
  let state: RuntimeState = initialState;

  // Update handlers can run as soon as they are registered, including during replay after Worker restart. Start must already lead the semantic input queue.
  enqueueStimulus(acceptedStimuli, pendingStimuli, start);

  // tag::temporal-semantic-boundary[]
  setHandler(bpmnTraceQuery, () => [...trace]);
  setHandler(
    bpmnOpenUserTasksQuery,
    () => projectOpenUserTasks(state),
  );
  setHandler(
    bpmnCompleteUserTaskUpdate,
    async (stimulus) => {
      enqueueStimulus(acceptedStimuli, pendingStimuli, stimulus);
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
  // end::temporal-semantic-boundary[]

  while (true) {
    if (
      pendingStimuli.length === 0 &&
      state.control.kind !== ControlStateKind.Completed
    ) {
      const timers = projectOpenTimers(state);
      const effects = projectOpenEffects(state);
      if (timers.length > 0 && effects.length > 0) {
        throw ApplicationFailure.nonRetryable(
          "The admitted Temporal capsules do not compose timer and effect waits",
          "BpmnHostWaitAmbiguity",
        );
      }
      if (timers.length === 0 && effects.length === 0) {
        await condition(
          () =>
            pendingStimuli.length > 0 ||
            state.control.kind === ControlStateKind.Completed,
        );
      } else if (timers.length > 0) {
        if (timers.length !== 1) {
          throw ApplicationFailure.nonRetryable(
            "The admitted Temporal timer capsule requires exactly one committed timer wait",
            "BpmnTimerCardinalityFailure",
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
          throw ApplicationFailure.nonRetryable(
            "The admitted Temporal effect capsule requires exactly one committed effect intent",
            "BpmnEffectCardinalityFailure",
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
        if (!isEffectExecutionSuccess(result)) {
          throw ApplicationFailure.nonRetryable(
            "Effect Activity returned an invalid result",
            "BpmnEffectExecutionResultInvalid",
          );
        }
        enqueueStimulus(
          acceptedStimuli,
          pendingStimuli,
          completeEffectStimulus(effect.id),
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
      recordCommandOutcome(commandResults, stimulus, step.observations);
      trace.push(...step.observations);
      switch (step.kind) {
        case ScenarioStepKind.Committed:
        case ScenarioStepKind.Terminal:
          state = step.state;
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
  };
}

function isEffectExecutionSuccess(
  value: unknown,
): value is EffectExecutionResult {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    "kind" in value &&
    value.kind === EffectExecutionResultKind.Success
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
): void {
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
    return;
  }
  const existing = commandOutcome(results, commandId);
  if (existing !== undefined && existing !== observation.outcome) {
    throw new TypeError(`Command ${commandId} produced conflicting outcomes`);
  }
  if (existing === undefined) {
    results.push({ commandId, outcome: observation.outcome });
  }
}

function commandOutcome(
  results: ReadonlyArray<CommandResultLedgerEntry>,
  commandId: string,
): CommandOutcome | undefined {
  return results.find((entry) => entry.commandId === commandId)?.outcome;
}

function validateCompleteUserTaskUpdate(
  acceptedStimuli: ReadonlyArray<Stimulus>,
  stimulus: CompleteUserTaskInstanceStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isWellFormedStimulus(value) ||
    value.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError(
      "Completion Update must contain one well-formed task-instance stimulus",
    );
  }
  const accepted = acceptedStimulus(
    acceptedStimuli,
    stimulusCommandId(value),
  );
  if (accepted !== undefined) {
    requireSameCommandStimulus(accepted, value);
  }
}

function acceptedStimulus(
  acceptedStimuli: ReadonlyArray<Stimulus>,
  commandId: string,
): Stimulus | undefined {
  return acceptedStimuli.find(
    (candidate) => stimulusCommandId(candidate) === commandId,
  );
}

function requireSameCommandStimulus(
  accepted: Stimulus,
  stimulus: Stimulus,
): void {
  if (!sameStimulus(accepted, stimulus)) {
    throw ApplicationFailure.nonRetryable(
      `Command ID ${stimulusCommandId(stimulus)} was reused with a different stimulus`,
      "BpmnCommandIdentityConflict",
    );
  }
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
