import {
  BpmnExecutableIrKind,
  CanonicalObservationKind,
  CommandOutcome,
  ScenarioOutcomeKind,
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  deployScenario,
  initialState,
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
  SequentialUserTaskExecutableIr,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  allHandlersFinished,
  condition,
  defineQuery,
  defineSignal,
  defineUpdate,
  patched,
  setHandler,
} from "@temporalio/workflow";

import {
  bpmnCompleteUserTaskUpdateName,
  bpmnOpenUserTasksQueryName,
  bpmnStimulusSignalName,
  bpmnTraceQueryName,
} from "./contracts.js";
import type {
  BpmnCompleteUserTaskUpdateArguments,
  BpmnStimulusSignalArguments,
} from "./contracts.js";

export const bpmnStimulusSignal =
  defineSignal<BpmnStimulusSignalArguments>(bpmnStimulusSignalName);
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
  executableIrInput?: SequentialUserTaskExecutableIr,
): Promise<ScenarioResult> {
  const executableIr = resolveExecutableIr(scenario, executableIrInput);
  const deployment = deployScenario(scenario, executableIr);
  const trace: CanonicalObservation[] = [deployment.observation];
  const pendingStimuli: Stimulus[] = [];
  const acceptedStimuli: Stimulus[] = [];
  const commandResults: CommandResultLedgerEntry[] = [];
  let semanticLoopFinished = false;

  setHandler(bpmnStimulusSignal, (stimulus) => {
    enqueueStimulus(acceptedStimuli, pendingStimuli, stimulus);
  });
  setHandler(bpmnTraceQuery, () => [...trace]);
  setHandler(
    bpmnOpenUserTasksQuery,
    () => currentOpenUserTasks(trace),
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
    { validator: validateCompleteUserTaskUpdate },
  );

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

  const startStimulus = scenario.stimuli[0];
  if (startStimulus !== undefined) {
    enqueueStimulus(acceptedStimuli, pendingStimuli, startStimulus);
  }

  let state: RuntimeState = initialState;
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
      executableIr,
      state,
      stimulus,
      scenario.stimuli.slice(stimulusIndex + 1),
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

function currentOpenUserTasks(
  trace: ReadonlyArray<CanonicalObservation>,
): ReadonlyArray<OpenUserTask> {
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const observation = trace[index];
    if (
      observation?.kind === CanonicalObservationKind.State &&
      "openUserTasks" in observation
    ) {
      return [...observation.openUserTasks];
    }
  }
  return [];
}

function enqueueStimulus(
  acceptedStimuli: Stimulus[],
  pendingStimuli: Stimulus[],
  stimulus: Stimulus,
): void {
  const commandId = stimulusCommandId(stimulus);
  const accepted = acceptedStimuli.find(
    (candidate) => stimulusCommandId(candidate) === commandId,
  );
  if (accepted === undefined) {
    acceptedStimuli.push(stimulus);
    pendingStimuli.push(stimulus);
    return;
  }
  if (!sameStimulus(accepted, stimulus)) {
    throw new TypeError(
      `Command ID ${commandId} was reused with a different stimulus`,
    );
  }
}

function sameStimulus(left: Stimulus, right: Stimulus): boolean {
  switch (left.kind) {
    case StimulusKind.StartProcess:
      return (
        right.kind === StimulusKind.StartProcess &&
        left.commandId === right.commandId &&
        left.processId === right.processId &&
        left.instanceId === right.instanceId
      );
    case StimulusKind.CompleteUserTask:
      return (
        right.kind === StimulusKind.CompleteUserTask &&
        left.commandId === right.commandId &&
        left.elementId === right.elementId
      );
    case StimulusKind.CompleteUserTaskInstance:
      return (
        right.kind === StimulusKind.CompleteUserTaskInstance &&
        left.commandId === right.commandId &&
        left.taskId.processInstanceId === right.taskId.processInstanceId &&
        left.taskId.elementId === right.taskId.elementId &&
        left.taskId.activation === right.taskId.activation
      );
    default:
      return assertNever(left);
  }
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
  stimulus: CompleteUserTaskInstanceStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["kind", "commandId", "taskId"]) ||
    value.kind !== StimulusKind.CompleteUserTaskInstance ||
    !isNonEmptyString(value.commandId) ||
    !isRecord(value.taskId) ||
    !hasOnlyKeys(value.taskId, [
      "processInstanceId",
      "elementId",
      "activation",
    ]) ||
    !isNonEmptyString(value.taskId.processInstanceId) ||
    !isNonEmptyString(value.taskId.elementId) ||
    !Number.isSafeInteger(value.taskId.activation) ||
    Number(value.taskId.activation) < 1
  ) {
    throw new TypeError(
      "Completion Update must contain one well-formed task-instance stimulus",
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return (
    Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Temporal adapter variant: ${String(value)}`);
}

function resolveExecutableIr(
  scenario: Scenario,
  executableIr: SequentialUserTaskExecutableIr | undefined,
): SequentialUserTaskExecutableIr {
  const requiresExecutableIr = patched("bpmn-source-executable-ir-v1");
  if (executableIr !== undefined) {
    return executableIr;
  }
  if (requiresExecutableIr) {
    throw new TypeError("Executable IR is required for new Workflow histories");
  }
  return retainedM0ExecutableIr(scenario);
}

function retainedM0ExecutableIr(
  scenario: Scenario,
): SequentialUserTaskExecutableIr {
  return {
    schemaVersion: "0.1.0",
    kind: BpmnExecutableIrKind.SequentialUserTask,
    identity: {
      compiler: "bpmn-source-sequential-user-task@0.1.0",
      semanticProfile: scenario.profile,
      sourceId: scenario.bpmn.id,
      sourceSha256: scenario.bpmn.sha256,
    },
    processId: "Process_SequentialUserTask",
    startEventId: "StartEvent_1",
    userTaskId: "UserTask_Approve",
    endEventId: "EndEvent_1",
    sequenceFlows: [
      {
        id: "Flow_StartToTask",
        sourceId: "StartEvent_1",
        targetId: "UserTask_Approve",
      },
      {
        id: "Flow_TaskToEnd",
        sourceId: "UserTask_Approve",
        targetId: "EndEvent_1",
      },
    ],
  };
}
