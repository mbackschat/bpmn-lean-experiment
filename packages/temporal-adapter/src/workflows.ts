import {
  CommandOutcome,
  ScenarioOutcomeKind,
  ScenarioStepKind,
  advanceScenario,
  deployScenario,
  initialState,
  sequentialUserTaskModel,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  RuntimeState,
  Scenario,
  ScenarioOutcome,
  ScenarioResult,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  allHandlersFinished,
  condition,
  defineQuery,
  defineSignal,
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
): Promise<ScenarioResult> {
  const deployment = deployScenario(scenario);
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
      sequentialUserTaskModel,
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
