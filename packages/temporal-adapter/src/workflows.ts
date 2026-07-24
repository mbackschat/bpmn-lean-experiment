import {
  BpmnExecutableIrKind,
  CommandOutcome,
  ScenarioOutcomeKind,
  ScenarioStepKind,
  advanceScenario,
  deployScenario,
  initialState,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
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
  patched,
  setHandler,
} from "@temporalio/workflow";

import {
  bpmnStimulusSignalName,
  bpmnTraceQueryName,
} from "./contracts.js";
import type { BpmnStimulusSignalArguments } from "./contracts.js";

export const bpmnStimulusSignal =
  defineSignal<BpmnStimulusSignalArguments>(bpmnStimulusSignalName);
export const bpmnTraceQuery =
  defineQuery<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName);

export async function runBpmnScenario(
  scenario: Scenario,
  executableIrInput?: SequentialUserTaskExecutableIr,
): Promise<ScenarioResult> {
  const executableIr = resolveExecutableIr(scenario, executableIrInput);
  const deployment = deployScenario(scenario, executableIr);
  const trace: CanonicalObservation[] = [deployment.observation];
  const pendingStimuli: Stimulus[] = [];
  const acceptedCommandIds: string[] = [];

  setHandler(bpmnStimulusSignal, (stimulus) => {
    const commandId = stimulusCommandId(stimulus);
    if (!acceptedCommandIds.includes(commandId)) {
      acceptedCommandIds.push(commandId);
      pendingStimuli.push(stimulus);
    }
  });
  setHandler(bpmnTraceQuery, () => [...trace]);

  switch (deployment.outcome) {
    case CommandOutcome.Unsupported:
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
    acceptedCommandIds.push(stimulusCommandId(startStimulus));
    pendingStimuli.push(startStimulus);
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

  await condition(allHandlersFinished);
  return { outcome, trace };
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
