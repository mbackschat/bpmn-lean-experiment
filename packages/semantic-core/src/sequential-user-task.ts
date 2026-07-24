import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  ScenarioOutcomeKind,
  StimulusKind,
  WaitKind,
} from "./contract.js";
import type {
  CanonicalObservation,
  Scenario,
  ScenarioResult,
  Stimulus,
} from "./contract.js";

export type SequentialUserTaskModel = Readonly<{
  processId: string;
  userTaskId: string;
}>;

export const sequentialUserTaskModel: SequentialUserTaskModel = {
  processId: "Process_SequentialUserTask",
  userTaskId: "UserTask_Approve",
};

export enum ControlStateKind {
  NotStarted = "notStarted",
  EnteringStart = "enteringStart",
  EnteringUserTask = "enteringUserTask",
  WaitingUserTask = "waitingUserTask",
  LeavingUserTask = "leavingUserTask",
  EnteringEnd = "enteringEnd",
  Completed = "completed",
}

type NotStartedControl = Readonly<{
  kind: ControlStateKind.NotStarted;
}>;

type InstancedControl = Readonly<{
  kind:
    | ControlStateKind.EnteringStart
    | ControlStateKind.EnteringUserTask
    | ControlStateKind.WaitingUserTask
    | ControlStateKind.LeavingUserTask
    | ControlStateKind.EnteringEnd
    | ControlStateKind.Completed;
  instanceId: string;
}>;

export type ControlState = NotStartedControl | InstancedControl;

export type RuntimeState = Readonly<{
  control: ControlState;
  logicalTimeMs: number;
}>;

export const initialState: RuntimeState = {
  control: { kind: ControlStateKind.NotStarted },
  logicalTimeMs: 0,
};

type SemanticCommandOutcome =
  | CommandOutcome.Committed
  | CommandOutcome.Rejected;

export type CommandResult = Readonly<{
  outcome: SemanticCommandOutcome;
  state: RuntimeState;
  internalStepBoundExceeded: boolean;
}>;

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

type CommandAdmission = Readonly<{
  outcome: CommandOutcome.Committed | CommandOutcome.Rejected;
  state: RuntimeState;
}>;

type ClosureResult = Readonly<{
  state: RuntimeState;
  hitBound: boolean;
}>;

const internalClosureLimit = 4;

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic variant: ${JSON.stringify(value)}`);
}

function withControl(state: RuntimeState, control: ControlState): RuntimeState {
  return {
    control,
    logicalTimeMs: state.logicalTimeMs,
  };
}

function internalStep(state: RuntimeState): RuntimeState | null {
  switch (state.control.kind) {
    case ControlStateKind.EnteringStart:
      return withControl(state, {
        kind: ControlStateKind.EnteringUserTask,
        instanceId: state.control.instanceId,
      });
    case ControlStateKind.EnteringUserTask:
      return withControl(state, {
        kind: ControlStateKind.WaitingUserTask,
        instanceId: state.control.instanceId,
      });
    case ControlStateKind.LeavingUserTask:
      return withControl(state, {
        kind: ControlStateKind.EnteringEnd,
        instanceId: state.control.instanceId,
      });
    case ControlStateKind.EnteringEnd:
      return withControl(state, {
        kind: ControlStateKind.Completed,
        instanceId: state.control.instanceId,
      });
    case ControlStateKind.NotStarted:
    case ControlStateKind.WaitingUserTask:
    case ControlStateKind.Completed:
      return null;
    default:
      return assertNever(state.control);
  }
}

function closeInternal(state: RuntimeState, limit: number): ClosureResult {
  let current = state;
  for (let stepCount = 0; stepCount < limit; stepCount += 1) {
    const next = internalStep(current);
    if (next === null) {
      return { state: current, hitBound: false };
    }
    current = next;
  }
  return {
    state: current,
    hitBound: internalStep(current) !== null,
  };
}

function validateClosureLimit(closureLimit: number): void {
  if (!Number.isSafeInteger(closureLimit) || closureLimit < 0) {
    throw new RangeError("closureLimit must be a non-negative safe integer");
  }
}

function admit(
  model: SequentialUserTaskModel,
  state: RuntimeState,
  stimulus: Stimulus,
): CommandAdmission {
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
      if (
        state.control.kind === ControlStateKind.NotStarted &&
        stimulus.processId === model.processId
      ) {
        return {
          outcome: CommandOutcome.Committed,
          state: withControl(state, {
            kind: ControlStateKind.EnteringStart,
            instanceId: stimulus.instanceId,
          }),
        };
      }
      return { outcome: CommandOutcome.Rejected, state };
    case StimulusKind.CompleteUserTask:
      if (
        state.control.kind === ControlStateKind.WaitingUserTask &&
        stimulus.elementId === model.userTaskId
      ) {
        return {
          outcome: CommandOutcome.Committed,
          state: withControl(state, {
            kind: ControlStateKind.LeavingUserTask,
            instanceId: state.control.instanceId,
          }),
        };
      }
      return { outcome: CommandOutcome.Rejected, state };
    default:
      return assertNever(stimulus);
  }
}

export function applyStimulus(
  model: SequentialUserTaskModel,
  state: RuntimeState,
  stimulus: Stimulus,
  closureLimit: number = internalClosureLimit,
): CommandResult {
  validateClosureLimit(closureLimit);

  const admission = admit(model, state, stimulus);
  switch (admission.outcome) {
    case CommandOutcome.Committed: {
      const closure = closeInternal(admission.state, closureLimit);
      return {
        outcome: CommandOutcome.Committed,
        state: closure.state,
        internalStepBoundExceeded: closure.hitBound,
      };
    }
    case CommandOutcome.Rejected:
      return {
        outcome: CommandOutcome.Rejected,
        state: admission.state,
        internalStepBoundExceeded: false,
      };
    default:
      return assertNever(admission.outcome);
  }
}

function enabledCompletions(
  model: SequentialUserTaskModel,
  remainingStimuli: ReadonlyArray<Stimulus>,
): ReadonlyArray<Stimulus> {
  return remainingStimuli.filter(
    (stimulus) =>
      stimulus.kind === StimulusKind.CompleteUserTask &&
      stimulus.elementId === model.userTaskId,
  );
}

function observeStableState(
  model: SequentialUserTaskModel,
  state: RuntimeState,
  remainingStimuli: ReadonlyArray<Stimulus>,
): CanonicalObservation | null {
  switch (state.control.kind) {
    case ControlStateKind.WaitingUserTask:
      return {
        kind: CanonicalObservationKind.State,
        instanceId: state.control.instanceId,
        status: ProcessStatus.Running,
        activeWaits: [
          {
            elementId: model.userTaskId,
            kind: WaitKind.UserTask,
            multiplicity: 1,
          },
        ],
        enabledStimuli: enabledCompletions(model, remainingStimuli),
        logicalTimeMs: state.logicalTimeMs,
      };
    case ControlStateKind.Completed:
      return {
        kind: CanonicalObservationKind.State,
        instanceId: state.control.instanceId,
        status: ProcessStatus.Completed,
        activeWaits: [],
        enabledStimuli: [],
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
    case StimulusKind.CompleteUserTask:
      return stimulus.commandId;
    default:
      return assertNever(stimulus);
  }
}

export function advanceScenario(
  model: SequentialUserTaskModel,
  state: RuntimeState,
  stimulus: Stimulus,
  remainingStimuli: ReadonlyArray<Stimulus>,
  closureLimit: number = internalClosureLimit,
): ScenarioStep {
  const result = applyStimulus(model, state, stimulus, closureLimit);
  if (result.internalStepBoundExceeded) {
    return {
      kind: ScenarioStepKind.HarnessFailure,
      outcome: { kind: ScenarioOutcomeKind.HarnessFailure },
      observations: [],
    };
  }

  switch (result.outcome) {
    case CommandOutcome.Committed: {
      const snapshot = observeStableState(
        model,
        result.state,
        remainingStimuli,
      );
      if (snapshot === null) {
        return {
          kind: ScenarioStepKind.HarnessFailure,
          outcome: { kind: ScenarioOutcomeKind.HarnessFailure },
          observations: [],
        };
      }
      return {
        kind: ScenarioStepKind.Committed,
        state: result.state,
        observations: [
          {
            kind: CanonicalObservationKind.Command,
            commandId: stimulusCommandId(stimulus),
            outcome: result.outcome,
          },
          snapshot,
        ],
      };
    }
    case CommandOutcome.Rejected:
      return {
        kind: ScenarioStepKind.Terminal,
        state: result.state,
        outcome: {
          kind: ScenarioOutcomeKind.Semantic,
          outcome: result.outcome,
        },
        observations: [
          {
            kind: CanonicalObservationKind.Command,
            commandId: stimulusCommandId(stimulus),
            outcome: result.outcome,
          },
        ],
      };
    default:
      return assertNever(result.outcome);
  }
}

type Execution = Readonly<{
  outcome: ScenarioResult["outcome"];
  trace: ReadonlyArray<CanonicalObservation>;
}>;

function executeStimuli(
  model: SequentialUserTaskModel,
  stimuli: ReadonlyArray<Stimulus>,
  closureLimit: number,
): Execution {
  let state = initialState;
  const trace: CanonicalObservation[] = [];

  for (const [index, stimulus] of stimuli.entries()) {
    const step = advanceScenario(
      model,
      state,
      stimulus,
      stimuli.slice(index + 1),
      closureLimit,
    );
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

function supportsScenario(scenario: Scenario): boolean {
  return (
    scenario.schemaVersion === "0.1.0" &&
    scenario.id === "m0-sequential-user-task" &&
    scenario.profile === "cibseven-2.2.0-spike.1" &&
    scenario.bpmn.id === "m0-sequential-user-task-process" &&
    scenario.bpmn.relativePath ===
      "scenarios/m0-sequential-user-task/process.bpmn" &&
    scenario.bpmn.sha256 ===
      "537758345c021a30d3dcca2e8d18137fae151d6501b72b4b46a77e6125dee295"
  );
}

export function deployScenario(scenario: Scenario): ScenarioDeployment {
  const outcome = supportsScenario(scenario)
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

export function runScenarioWithClosureLimit(
  closureLimit: number,
  scenario: Scenario,
): ScenarioResult {
  validateClosureLimit(closureLimit);

  const deployment = deployScenario(scenario);
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
        sequentialUserTaskModel,
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

export function runScenario(scenario: Scenario): ScenarioResult {
  return runScenarioWithClosureLimit(internalClosureLimit, scenario);
}
