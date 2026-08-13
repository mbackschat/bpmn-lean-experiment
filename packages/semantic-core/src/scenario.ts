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
  OpenMessageSubscription,
  OpenTimer,
  OpenEffect,
  OpenEffectIncident,
  OccurrenceId,
  ProcessStartStimulus,
  Scenario,
  ScenarioResult,
  StateObservation,
  Stimulus,
} from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import {
  supportsSemanticProcessExecution,
  supportsSemanticProcessScenario,
} from "./semantic-process-admission.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  incidentStateAllowsDispatch,
  openEffectIncidentAssociationIsValid,
} from "./semantic-process-incident-validation.js";
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

type CommittedScenarioStep = DeepReadonly<{
  kind: ScenarioStepKind.Committed;
  state: RuntimeState;
  observations: CanonicalObservation[];
}>;

type TerminalScenarioStep = DeepReadonly<{
  kind: ScenarioStepKind.Terminal;
  state: RuntimeState;
  outcome: ScenarioResult["outcome"];
  observations: CanonicalObservation[];
}>;

type HarnessFailureScenarioStep = DeepReadonly<{
  kind: ScenarioStepKind.HarnessFailure;
  outcome: ScenarioResult["outcome"];
  observations: CanonicalObservation[];
}>;

export type ScenarioStep =
  | CommittedScenarioStep
  | TerminalScenarioStep
  | HarnessFailureScenarioStep;

const waitKindOrder = {
  [WaitKind.UserTask]: 0,
  [WaitKind.Message]: 1,
  [WaitKind.Timer]: 2,
  [WaitKind.Effect]: 3,
  [WaitKind.Incident]: 4,
} as const satisfies Record<WaitKind, number>;

export type ScenarioDeployment = DeepReadonly<{
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
      ...(wait.metadata === undefined ? {} : { metadata: wait.metadata }),
    }))
    .sort(compareOpenOccurrences);
}

export function projectOpenTimers(
  state: RuntimeState,
): ReadonlyArray<OpenTimer> {
  return state.timerWaits
    .map(({ id, deadlineMs }) => ({ id, deadlineMs }))
    .sort(compareOpenOccurrences);
}

export function projectOpenMessageSubscriptions(
  state: RuntimeState,
): ReadonlyArray<OpenMessageSubscription> {
  return state.messageWaits
    .map(({ id, channel }) => ({ id, channel }))
    .sort(compareOpenOccurrences);
}

export function projectOpenEffects(
  state: RuntimeState,
): ReadonlyArray<OpenEffect> {
  return state.effectWaits
    .map(({ id, descriptor, arguments: arguments_ }) => ({
      id,
      descriptor,
      arguments: arguments_,
    }))
    .sort(compareOpenOccurrences);
}

export function projectOpenIncidents(
  state: RuntimeState,
): ReadonlyArray<OpenEffectIncident> {
  const projected = state.effectIncidents
    .map(({ id, wait }) => ({
      kind: "effectExecutionFailed",
      id,
      effect: {
        id: wait.id,
        descriptor: wait.descriptor,
        arguments: wait.arguments,
      },
    } as const))
    .sort((left, right) => compareOpenOccurrences(left.effect, right.effect));
  if (!projected.every(openEffectIncidentAssociationIsValid)) {
    throw new TypeError("Cannot publish a malformed effect incident association");
  }
  return projected;
}

function observeStableState(
  program: SemanticProcessProgram,
  state: RuntimeState,
): StateObservation | null {
  if (!incidentStateAllowsDispatch(program, state)) {
    return null;
  }
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
        openMessageSubscriptions: projectOpenMessageSubscriptions(state),
        openTimers: projectOpenTimers(state),
        openEffects: projectOpenEffects(state),
        openIncidents: projectOpenIncidents(state),
        variables: state.variables.process.bindings,
        enabledInteractions: [
          ...projectOpenUserTasks(state).map((task) => ({
            kind: StimulusKind.CompleteUserTaskInstance,
            taskId: task.id,
          } as const)),
          ...projectOpenMessageSubscriptions(state).map(
            (subscription) => ({
              kind: StimulusKind.DeliverMessage,
              subscriptionId: subscription.id,
              channel: subscription.channel,
            } as const),
          ),
          ...projectOpenIncidents(state).map((incident) => ({
            kind: StimulusKind.RetryIncident,
            incidentId: incident.id,
          } as const)),
        ],
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
  const messageMultiplicities = new Map<string, number>();
  for (const wait of state.messageWaits) {
    messageMultiplicities.set(
      wait.id.elementId,
      (messageMultiplicities.get(wait.id.elementId) ?? 0) + 1,
    );
  }
  const effectMultiplicities = new Map<string, number>();
  for (const wait of state.effectWaits) {
    effectMultiplicities.set(
      wait.id.elementId,
      (effectMultiplicities.get(wait.id.elementId) ?? 0) + 1,
    );
  }
  const incidentMultiplicities = new Map<string, number>();
  for (const incident of state.effectIncidents) {
    const elementId = incident.id.effectId.elementId;
    incidentMultiplicities.set(
      elementId,
      (incidentMultiplicities.get(elementId) ?? 0) + 1,
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
    ...[...messageMultiplicities.entries()].map(
      ([elementId, multiplicity]) => ({
        elementId,
        kind: WaitKind.Message,
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
    ...[...effectMultiplicities.entries()].map(
      ([elementId, multiplicity]) => ({
        elementId,
        kind: WaitKind.Effect,
        multiplicity,
      }),
    ),
    ...[...incidentMultiplicities.entries()].map(
      ([elementId, multiplicity]) => ({
        elementId,
        kind: WaitKind.Incident,
        multiplicity,
      }),
    ),
  ].sort((left, right) => {
    const kindOrder = waitKindOrder[left.kind] - waitKindOrder[right.kind];
    return kindOrder === 0
      ? compareStrings(left.elementId, right.elementId)
      : kindOrder;
  });
}

function compareOpenOccurrences(
  left: Readonly<{ id: OccurrenceId }>,
  right: Readonly<{ id: OccurrenceId }>,
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

  const snapshot = observeStableState(program, result.state);
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
  start: ProcessStartStimulus,
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
