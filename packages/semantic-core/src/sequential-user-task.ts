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
  CanonicalObservation,
  Scenario,
  ScenarioResult,
  StateObservation,
  Stimulus,
} from "./contract.js";
import type {
  SequentialUserTaskExecutableIr,
} from "./executable-ir.js";
import {
  supportsSequentialUserTaskScenario,
} from "./sequential-user-task-admission.js";
import {
  ControlStateKind,
  applyStimulus,
  initialState,
  sequentialUserTaskClosureLimit,
  validateClosureLimit,
} from "./sequential-user-task-runtime.js";
import type {
  RuntimeState,
} from "./sequential-user-task-runtime.js";

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

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic variant: ${JSON.stringify(value)}`);
}

function taskInstanceId(
  model: SequentialUserTaskExecutableIr,
  instanceId: string,
  activation: number,
) {
  return {
    processInstanceId: instanceId,
    elementId: model.userTask.id,
    activation,
  };
}

function observeStableState(
  model: SequentialUserTaskExecutableIr,
  state: RuntimeState,
): StateObservation | null {
  switch (state.control.kind) {
    case ControlStateKind.WaitingUserTask: {
      const id = taskInstanceId(
        model,
        state.control.instanceId,
        state.control.activation,
      );
      return {
        kind: CanonicalObservationKind.State,
        instanceId: state.control.instanceId,
        status: ProcessStatus.Running,
        activeWaits: [
          {
            elementId: model.userTask.id,
            kind: WaitKind.UserTask,
            multiplicity: 1,
          },
        ],
        openUserTasks: [
          {
            id,
            name: model.userTask.name,
            state: UserTaskLifecycleState.Active,
          },
        ],
        enabledInteractions: [
          {
            kind: StimulusKind.CompleteUserTaskInstance,
            taskId: id,
          },
        ],
        logicalTimeMs: state.logicalTimeMs,
      };
    }
    case ControlStateKind.Completed:
      return {
        kind: CanonicalObservationKind.State,
        instanceId: state.control.instanceId,
        status: ProcessStatus.Completed,
        activeWaits: [],
        openUserTasks: [],
        enabledInteractions: [],
        logicalTimeMs: state.logicalTimeMs,
      };
    case ControlStateKind.NotStarted:
    case ControlStateKind.EnteringStart:
    case ControlStateKind.EnteringUserTask:
    case ControlStateKind.LeavingUserTask:
    case ControlStateKind.EnteringEnd:
      return null;
    default:
      return assertNever(state.control);
  }
}

export function stimulusCommandId(stimulus: Stimulus): string {
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
    case StimulusKind.CompleteUserTaskInstance:
      return stimulus.commandId;
    default:
      return assertNever(stimulus);
  }
}

export function advanceScenario(
  model: SequentialUserTaskExecutableIr,
  state: RuntimeState,
  stimulus: Stimulus,
  closureLimit: number = sequentialUserTaskClosureLimit,
): ScenarioStep {
  const result = applyStimulus(model, state, stimulus, closureLimit);
  if (result.internalStepBoundExceeded) {
    return {
      kind: ScenarioStepKind.HarnessFailure,
      outcome: { kind: ScenarioOutcomeKind.HarnessFailure },
      observations: [],
    };
  }

  const snapshot = observeStableState(model, result.state);
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
  executableIr: SequentialUserTaskExecutableIr,
): ScenarioDeployment {
  const outcome = supportsSequentialUserTaskScenario(scenario, executableIr)
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
  model: SequentialUserTaskExecutableIr,
  stimuli: ReadonlyArray<Stimulus>,
  closureLimit: number,
): ScenarioResult {
  let state = initialState;
  const trace: CanonicalObservation[] = [];

  for (const stimulus of stimuli) {
    const step = advanceScenario(model, state, stimulus, closureLimit);
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
  executableIr: SequentialUserTaskExecutableIr,
): ScenarioResult {
  validateClosureLimit(closureLimit);

  const deployment = deployScenario(scenario, executableIr);
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
        executableIr,
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
  executableIr: SequentialUserTaskExecutableIr,
): ScenarioResult {
  return runScenarioWithClosureLimit(
    sequentialUserTaskClosureLimit,
    scenario,
    executableIr,
  );
}
