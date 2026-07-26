import {
  CanonicalObservationKind,
  CommandOutcome,
  ScenarioOutcomeKind,
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  deployScenario,
  initialState,
  isWellFormedStimulus,
  projectOpenUserTasks,
  sameStimulus,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  RuntimeState,
  Scenario,
  ScenarioOutcome,
  ScenarioResult,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
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
} from "./contracts.js";

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

export async function runBpmnScenario(
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
): Promise<ScenarioResult> {
  const deployment = deployScenario(scenario, semanticProcess);
  const trace: CanonicalObservation[] = [deployment.observation];
  const pendingStimuli: Stimulus[] = [];
  const acceptedStimuli: Stimulus[] = [];
  const commandResults: CommandResultLedgerEntry[] = [];
  let semanticLoopFinished = false;
  let state: RuntimeState = initialState;

  const startStimulus = scenario.stimuli[0];
  if (
    deployment.outcome === CommandOutcome.Committed &&
    startStimulus !== undefined
  ) {
    // Update handlers can run as soon as they are registered, including during replay after Worker restart. Start must already lead the semantic input queue.
    enqueueStimulus(acceptedStimuli, pendingStimuli, startStimulus);
  }

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
          commandOutcome(commandResults, stimulus.commandId) !== undefined ||
          semanticLoopFinished,
      );
      const outcome = commandOutcome(commandResults, stimulus.commandId);
      if (outcome === undefined) {
        throw new TypeError(
          `Semantic loop ended without an outcome for ${stimulus.commandId}`,
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

  switch (deployment.outcome) {
    case CommandOutcome.Unsupported:
      semanticLoopFinished = true;
      await condition(allHandlersFinished);
      return {
        outcome: {
          kind: ScenarioOutcomeKind.Semantic,
          outcome: deployment.outcome,
        },
        trace,
      };
    case CommandOutcome.Committed:
      break;
    default:
      return assertNever(deployment.outcome);
  }

  let outcome: ScenarioOutcome = {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  };
  let stimulusIndex = 0;

  stimulusLoop: while (stimulusIndex < scenario.stimuli.length) {
    await condition(() => pendingStimuli.length > 0);
    const stimulus = pendingStimuli.shift();
    if (stimulus === undefined) {
      outcome = { kind: ScenarioOutcomeKind.HarnessFailure };
      break;
    }

    const step = advanceScenario(
      semanticProcess,
      state,
      stimulus,
    );
    recordCommandOutcome(commandResults, stimulus, step.observations);
    switch (step.kind) {
      case ScenarioStepKind.Committed:
        trace.push(...step.observations);
        state = step.state;
        stimulusIndex += 1;
        break;
      case ScenarioStepKind.Terminal:
      case ScenarioStepKind.HarnessFailure:
        trace.push(...step.observations);
        outcome = step.outcome;
        break stimulusLoop;
      default:
        return assertNever(step);
    }
  }

  semanticLoopFinished = true;
  await condition(allHandlersFinished);
  return { outcome, trace };
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
  const commandId = stimulusCommandId(value);
  const accepted = acceptedStimulus(acceptedStimuli, commandId);
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

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Temporal adapter variant: ${String(value)}`);
}
