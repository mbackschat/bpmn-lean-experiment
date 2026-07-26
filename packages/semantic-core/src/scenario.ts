import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  ScenarioOutcomeKind,
  StimulusKind,
  UserTaskLifecycleState,
  WaitKind,
} from "./contract.js";
import type {
  ActiveWait,
  CanonicalObservation,
  OpenUserTask,
  Scenario,
  ScenarioResult,
  StateObservation,
  Stimulus,
} from "./contract.js";
import {
  supportsSemanticProcessScenario,
} from "./semantic-process-admission.js";
import type {
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  ControlStateKind,
  applyStimulus,
  initialState,
  semanticProcessClosureLimit,
  validateClosureLimit,
} from "./semantic-process-runtime.js";
import type {
  RuntimeState,
} from "./semantic-process-runtime.js";
import {
  stimulusCommandId,
} from "./stimulus.js";

export enum ScenarioStepKind {
  Committed = "committed",
  Terminal = "terminal",
  HarnessFailure = "harnessFailure",
}

type CommittedScenarioStep = Readonly<{
  kind: ScenarioStepKind.Committed;
  state: RuntimeState;
  observations: ReadonlyArray<CanonicalObservation>;
}>;

type TerminalScenarioStep = Readonly<{
  kind: ScenarioStepKind.Terminal;
  state: RuntimeState;
  outcome: ScenarioResult["outcome"];
  observations: ReadonlyArray<CanonicalObservation>;
}>;

type HarnessFailureScenarioStep = Readonly<{
  kind: ScenarioStepKind.HarnessFailure;
  outcome: ScenarioResult["outcome"];
  observations: ReadonlyArray<CanonicalObservation>;
}>;

export type ScenarioStep =
  | CommittedScenarioStep
  | TerminalScenarioStep
  | HarnessFailureScenarioStep;

export type ScenarioDeployment = Readonly<{
  outcome: CommandOutcome.Committed | CommandOutcome.Unsupported;
  observation: Extract<
    CanonicalObservation,
    { kind: CanonicalObservationKind.Deployment }
  >;
}>;

export function projectOpenUserTasks(
  state: RuntimeState,
): ReadonlyArray<OpenUserTask> {
  return state.userTaskWaits.map((wait) => ({
    id: wait.id,
    name: wait.name,
    state: UserTaskLifecycleState.Active,
  }));
}

function observeStableState(state: RuntimeState): StateObservation | null {
  switch (state.control.kind) {
    case ControlStateKind.Running:
    case ControlStateKind.Completed:
      return {
        kind: CanonicalObservationKind.State,
        instanceId: state.control.instanceId,
        status:
          state.control.kind === ControlStateKind.Running
            ? ProcessStatus.Running
            : ProcessStatus.Completed,
        activeWaits: projectActiveWaits(state),
        openUserTasks: projectOpenUserTasks(state),
        enabledInteractions: state.userTaskWaits.map((wait) => ({
          kind: StimulusKind.CompleteUserTaskInstance,
          taskId: wait.id,
        })),
        logicalTimeMs: state.logicalTimeMs,
      };
    case ControlStateKind.NotStarted:
      return null;
    default:
      return assertNever(state.control);
  }
}

function projectActiveWaits(state: RuntimeState): ReadonlyArray<ActiveWait> {
  const multiplicities = new Map<string, number>();
  for (const wait of state.userTaskWaits) {
    multiplicities.set(
      wait.id.elementId,
      (multiplicities.get(wait.id.elementId) ?? 0) + 1,
    );
  }
  return [...multiplicities.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([elementId, multiplicity]) => ({
      elementId,
      kind: WaitKind.UserTask,
      multiplicity,
    }));
}

export function advanceScenario(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
  closureLimit: number = semanticProcessClosureLimit,
): ScenarioStep {
  const result = applyStimulus(program, state, stimulus, closureLimit);
  if (result.internalStepBoundExceeded) {
    return {
      kind: ScenarioStepKind.HarnessFailure,
      outcome: { kind: ScenarioOutcomeKind.HarnessFailure },
      observations: [],
    };
  }

  const snapshot = observeStableState(result.state);
  if (snapshot === null) {
    return {
      kind: ScenarioStepKind.HarnessFailure,
      outcome: { kind: ScenarioOutcomeKind.HarnessFailure },
      observations: [],
    };
  }
  const observations = [
    {
      kind: CanonicalObservationKind.Command,
      commandId: stimulusCommandId(stimulus),
      outcome: result.outcome,
    },
    snapshot,
  ] as const;

  switch (result.outcome) {
    case CommandOutcome.Committed:
      return {
        kind: ScenarioStepKind.Committed,
        state: result.state,
        observations,
      };
    case CommandOutcome.Rejected:
      return {
        kind: ScenarioStepKind.Terminal,
        state: result.state,
        outcome: {
          kind: ScenarioOutcomeKind.Semantic,
          outcome: result.outcome,
        },
        observations,
      };
    default:
      return assertNever(result.outcome);
  }
}

export function deployScenario(
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
): ScenarioDeployment {
  const outcome = supportsSemanticProcessScenario(scenario, semanticProcess)
    ? CommandOutcome.Committed
    : CommandOutcome.Unsupported;
  return {
    outcome,
    observation: {
      kind: CanonicalObservationKind.Deployment,
      outcome,
    },
  };
}

function executeStimuli(
  program: SemanticProcessProgram,
  stimuli: ReadonlyArray<Stimulus>,
  closureLimit: number,
): ScenarioResult {
  let state = initialState;
  const trace: CanonicalObservation[] = [];

  for (const stimulus of stimuli) {
    const step = advanceScenario(program, state, stimulus, closureLimit);
    switch (step.kind) {
      case ScenarioStepKind.Committed:
        trace.push(...step.observations);
        state = step.state;
        break;
      case ScenarioStepKind.Terminal:
      case ScenarioStepKind.HarnessFailure:
        return {
          outcome: step.outcome,
          trace: [...trace, ...step.observations],
        };
      default:
        return assertNever(step);
    }
  }

  return {
    outcome: {
      kind: ScenarioOutcomeKind.Semantic,
      outcome: CommandOutcome.Committed,
    },
    trace,
  };
}

export function runScenarioWithClosureLimit(
  closureLimit: number,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
): ScenarioResult {
  validateClosureLimit(closureLimit);

  const deployment = deployScenario(scenario, semanticProcess);
  switch (deployment.outcome) {
    case CommandOutcome.Unsupported:
      return {
        outcome: {
          kind: ScenarioOutcomeKind.Semantic,
          outcome: deployment.outcome,
        },
        trace: [deployment.observation],
      };
    case CommandOutcome.Committed: {
      const execution = executeStimuli(
        semanticProcess,
        scenario.stimuli,
        closureLimit,
      );
      return {
        outcome: execution.outcome,
        trace: [deployment.observation, ...execution.trace],
      };
    }
    default:
      return assertNever(deployment.outcome);
  }
}

export function runScenario(
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
): ScenarioResult {
  return runScenarioWithClosureLimit(
    semanticProcessClosureLimit,
    scenario,
    semanticProcess,
  );
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic variant: ${JSON.stringify(value)}`);
}
