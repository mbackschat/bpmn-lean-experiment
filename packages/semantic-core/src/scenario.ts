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
  OpenTimer,
  Scenario,
  ScenarioResult,
  StartProcessStimulus,
  StateObservation,
  Stimulus,
} from "./contract.js";
import {
  supportsSemanticProcessExecution,
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
import {
  compareCanonicalStrings,
} from "./wire.js";

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
  return state.userTaskWaits
    .map((wait) => ({
      id: wait.id,
      name: wait.name,
      state: UserTaskLifecycleState.Active,
    }))
    .sort(compareOpenUserTasks);
}

export function projectOpenTimers(
  state: RuntimeState,
): ReadonlyArray<OpenTimer> {
  return state.timerWaits
    .map(({ id, deadlineMs }) => ({ id, deadlineMs }))
    .sort(compareOpenTimers);
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
        openTimers: projectOpenTimers(state),
        enabledInteractions: projectOpenUserTasks(state).map((task) => ({
          kind: StimulusKind.CompleteUserTaskInstance,
          taskId: task.id,
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
  const userTaskMultiplicities = new Map<string, number>();
  for (const wait of state.userTaskWaits) {
    userTaskMultiplicities.set(
      wait.id.elementId,
      (userTaskMultiplicities.get(wait.id.elementId) ?? 0) + 1,
    );
  }
  const timerMultiplicities = new Map<string, number>();
  for (const wait of state.timerWaits) {
    timerMultiplicities.set(
      wait.id.elementId,
      (timerMultiplicities.get(wait.id.elementId) ?? 0) + 1,
    );
  }
  return [
    ...[...userTaskMultiplicities.entries()].map(
      ([elementId, multiplicity]) => ({
        elementId,
        kind: WaitKind.UserTask,
        multiplicity,
      }),
    ),
    ...[...timerMultiplicities.entries()].map(
      ([elementId, multiplicity]) => ({
        elementId,
        kind: WaitKind.Timer,
        multiplicity,
      }),
    ),
  ]
    .sort((left, right) =>
      left.elementId === right.elementId
        ? compareStrings(left.kind, right.kind)
        : compareStrings(left.elementId, right.elementId)
    );
}

function compareOpenUserTasks(
  left: OpenUserTask,
  right: OpenUserTask,
): number {
  if (left.id.processInstanceId !== right.id.processInstanceId) {
    return compareStrings(
      left.id.processInstanceId,
      right.id.processInstanceId,
    );
  }
  if (left.id.elementId !== right.id.elementId) {
    return compareStrings(left.id.elementId, right.id.elementId);
  }
  return left.id.activation - right.id.activation;
}

function compareOpenTimers(left: OpenTimer, right: OpenTimer): number {
  if (left.id.processInstanceId !== right.id.processInstanceId) {
    return compareStrings(
      left.id.processInstanceId,
      right.id.processInstanceId,
    );
  }
  if (left.id.elementId !== right.id.elementId) {
    return compareStrings(left.id.elementId, right.id.elementId);
  }
  return left.id.activation - right.id.activation;
}

function compareStrings(left: string, right: string): number {
  return compareCanonicalStrings(left, right);
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

export function deployProcess(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): ScenarioDeployment {
  const outcome = supportsSemanticProcessExecution(start, semanticProcess)
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
