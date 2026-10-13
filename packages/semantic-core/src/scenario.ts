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
  EnabledInteraction,
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
  projectSelectedTaskInputs,
} from "./activity-data-input-observation.js";
import { projectOpenMultiInstances } from "./multi-instance-observation.js";
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
  incidentCancellationEligibility,
} from "./semantic-process-incident-cancellation.js";
import {
  MessageWaitDeliveryKind,
  messageWaitDeliveryKind,
} from "./semantic-process-message.js";
import {
  CorrelatedMessageInteractionKind,
  projectCorrelatedMessageCandidate,
} from "./message-key-correlation.js";
import {
  ControlStateKind,
  initialState,
  semanticProcessClosureLimit,
  validateClosureLimit,
} from "./semantic-process-runtime.js";
import type {
  CommandResult,
  RuntimeState,
} from "./semantic-process-runtime.js";
import {
  applyStimulusWithTrace,
} from "./semantic-transition-trace.js";
import { isWellFormedRuntimeState } from "./runtime-state-well-formedness.js";
import { interruptingMessageEventSubProcessStateIsValid } from "./interrupting-message-event-subprocess-state-validation.js";
import type {
  TracedCommandResult,
  UnnumberedCommittedExecutionPublication,
} from "./semantic-transition-trace.js";
import type {
  UnnumberedFlowNodeOccurrenceDelta,
} from "./flow-node-occurrence-lifecycle.js";
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
  publication: UnnumberedCommittedExecutionPublication | null;
  flowNodeOccurrenceLifecycles: [
    UnnumberedFlowNodeOccurrenceDelta,
    ...UnnumberedFlowNodeOccurrenceDelta[],
  ] | null;
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
  diagnostic: {
    stage: "commandClosure" | "observationProjection";
    outcome: CommandResult["outcome"];
    internalStepBoundExceeded: boolean;
    ambiguousInternalChoice: boolean;
  };
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
    .map((wait) => {
      const inputs = projectSelectedTaskInputs(
        state.activityOccurrences,
        state.variables,
        wait.id,
      );
      return {
        id: wait.id,
        name: wait.name,
        state: UserTaskLifecycleState.Active,
        ...(wait.metadata === undefined ? {} : { metadata: wait.metadata }),
        // Spread rather than assigned, so a task whose Activity owns no local data omits the key
        // entirely and its canonical observation bytes are unchanged.
        ...(inputs === undefined ? {} : { inputs }),
      };
    })
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
  return [...state.messageWaits, ...(state.eventSubProcessMessageSubscriptions ?? [])]
    .map(({ id, channel }) => ({ id, channel }))
    .sort(compareOpenOccurrences);
}

export function projectOpenEffects(
  state: RuntimeState,
): ReadonlyArray<OpenEffect> {
  return [
    ...state.effectWaits,
    ...(state.compensationHandlerEffectWaits ?? []),
  ]
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

/** Projects the canonical public observation for one committed stable runtime state. */
export function observeStableState(
  program: SemanticProcessProgram,
  state: RuntimeState,
): StateObservation | null {
  if (!incidentStateAllowsDispatch(program, state) ||
      !interruptingMessageEventSubProcessStateIsValid(program, state)) {
    return null;
  }
  switch (state.control.kind) {
    case ControlStateKind.Running:
    case ControlStateKind.Completed:
    case ControlStateKind.Cancelled: {
      const cancellation = incidentCancellationEligibility(program, state, null);
      const multiInstances = projectOpenMultiInstances(program, state);
      const messageInteractions = projectEnabledMessageInteractions(program, state);
      if (multiInstances === null || messageInteractions === null) {
        return null;
      }
      return {
        kind: CanonicalObservationKind.State,
        instanceId: state.control.instanceId,
        status: processStatus(state.control.kind),
        activeWaits: projectActiveWaits(state),
        openUserTasks: projectOpenUserTasks(state),
        openMessageSubscriptions: projectOpenMessageSubscriptions(state),
        openTimers: projectOpenTimers(state),
        openEffects: projectOpenEffects(state),
        openIncidents: projectOpenIncidents(state),
        // Spread rather than assigned, so a program with no Multi-Instance Activity omits the key
        // entirely and its canonical observation bytes are unchanged.
        ...(multiInstances === undefined
          ? {}
          : { openMultiInstances: multiInstances }),
        variables: state.variables.process.bindings,
        enabledInteractions: [
          ...projectOpenUserTasks(state).map((task) => ({
            kind: StimulusKind.CompleteUserTaskInstance,
            taskId: task.id,
          } as const)),
          ...messageInteractions,
          ...projectOpenIncidents(state).map((incident) => ({
            kind: StimulusKind.RetryIncident,
            incidentId: incident.id,
          } as const)),
          ...(cancellation === null
            ? []
            : [{
                kind: StimulusKind.CancelIncidentProcess,
                processInstanceId: state.control.instanceId,
                incidentId: cancellation.incident.id,
              } as const]),
        ],
        logicalTimeMs: state.logicalTimeMs,
      };
    }
    case ControlStateKind.Failed: {
      if (!isWellFormedRuntimeState(program, state.control.instanceId, state)) {
        return null;
      }
      const multiInstances = projectOpenMultiInstances(program, state);
      if (multiInstances === null || (multiInstances?.length ?? 0) !== 0) {
        return null;
      }
      return {
        kind: CanonicalObservationKind.State,
        instanceId: state.control.instanceId,
        status: ProcessStatus.Failed,
        failure: state.control.failure,
        activeWaits: [],
        openUserTasks: [],
        openMessageSubscriptions: [],
        openTimers: [],
        openEffects: [],
        openIncidents: [],
        ...(multiInstances === undefined ? {} : { openMultiInstances: [] }),
        variables: state.variables.process.bindings,
        enabledInteractions: [],
        logicalTimeMs: state.logicalTimeMs,
      };
    }
    case ControlStateKind.NotStarted:
      return null;
    default:
      return assertNever(state.control);
  }
}

function projectEnabledMessageInteractions(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<EnabledInteraction> | null {
  const interactions: EnabledInteraction[] = [];
  for (const wait of state.messageWaits) {
    const deliveryKind = messageWaitDeliveryKind(program, state, wait);
    switch (deliveryKind) {
      case MessageWaitDeliveryKind.Direct:
        interactions.push({
          kind: StimulusKind.DeliverMessage,
          subscriptionId: wait.id,
          channel: wait.channel,
        });
        break;
      case MessageWaitDeliveryKind.DirectPayload:
        interactions.push({
          kind: StimulusKind.DeliverPayloadMessage,
          subscriptionId: wait.id,
          channel: wait.channel,
        });
        break;
      case MessageWaitDeliveryKind.CorrelatedPayload: {
        const candidate = projectCorrelatedMessageCandidate(program, state);
        if (
          candidate === null ||
          candidate.subscriptionId.processInstanceId !==
            wait.id.processInstanceId ||
          candidate.subscriptionId.elementId !== wait.id.elementId ||
          candidate.subscriptionId.activation !== wait.id.activation
        ) {
          return null;
        }
        interactions.push({
          kind: CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage,
          address: candidate.address,
        });
        break;
      }
      case null:
        return null;
      default:
        return assertNever(deliveryKind);
    }
  }
  for (const subscription of state.eventSubProcessMessageSubscriptions ?? []) {
    interactions.push({
      kind: StimulusKind.DeliverMessage,
      subscriptionId: subscription.id,
      channel: subscription.channel,
    });
  }
  return interactions;
}

function processStatus(
  kind:
    | ControlStateKind.Running
    | ControlStateKind.Completed
    | ControlStateKind.Cancelled,
): ProcessStatus.Running | ProcessStatus.Completed | ProcessStatus.Cancelled {
  switch (kind) {
    case ControlStateKind.Running:
      return ProcessStatus.Running;
    case ControlStateKind.Completed:
      return ProcessStatus.Completed;
    case ControlStateKind.Cancelled:
      return ProcessStatus.Cancelled;
    default:
      return assertNever(kind);
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
  for (const wait of [
    ...state.effectWaits,
    ...(state.compensationHandlerEffectWaits ?? []),
  ]) {
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
  closureLimit?: number,
): ScenarioStep {
  const traced = applyStimulusWithTrace(
    program,
    state,
    stimulus,
    closureLimit,
  );
  const result = traced.result;
  // Each arm transcribes Lean's `executeStimuli`: closure flags are harness failures before the
  // outcome is read, and every other outcome is classified by its own arm rather than grouped.
  if (result.internalStepBoundExceeded || result.ambiguousInternalChoice) {
    return closureHarnessFailure("commandClosure", result);
  }
  const snapshot = observeStableState(program, result.state);
  const command = {
    kind: CanonicalObservationKind.Command,
    commandId: stimulusCommandId(stimulus),
    outcome: result.outcome,
  } as const;
  switch (result.outcome) {
    case CommandOutcome.Committed:
      return snapshot === null ? closureHarnessFailure("observationProjection", result) : {
        kind: ScenarioStepKind.Committed,
        state: result.state,
        observations: [command, snapshot],
        publication: committedPublication(traced, snapshot),
        flowNodeOccurrenceLifecycles: committedFlowNodeOccurrenceLifecycles(traced),
      };
    // Lean's `terminalExecution`: a refusal or a flag-free atomic rollback (a capacity refusal, or a schedule
    // failure under a required choice schedule) is semantic and carries the stable state when one exists,
    // such as for a refused first Start, which has none.
    case CommandOutcome.Rejected:
    case CommandOutcome.RolledBack:
      return {
        kind: ScenarioStepKind.Terminal,
        state: result.state,
        outcome: { kind: ScenarioOutcomeKind.Semantic, outcome: result.outcome },
        observations: snapshot === null ? [command] : [command, snapshot],
      };
    default:
      return assertNever(result.outcome);
  }
}

function closureHarnessFailure(
  stage: HarnessFailureScenarioStep["diagnostic"]["stage"],
  result: CommandResult,
): HarnessFailureScenarioStep {
  return {
    kind: ScenarioStepKind.HarnessFailure,
    outcome: { kind: ScenarioOutcomeKind.HarnessFailure },
    observations: [],
    diagnostic: {
      stage,
      outcome: result.outcome,
      internalStepBoundExceeded: result.internalStepBoundExceeded,
      ambiguousInternalChoice: result.ambiguousInternalChoice,
    },
  };
}

/**
 * The closure diagnostic a host raises for a semantic flag-free rollback.
 *
 * The scenario reports the rollback semantically, as Lean does, but a host cannot continue from it:
 * the rolled-back command leaves the state unchanged, so reissuing it repeats the same refusal; a
 * refused recurring Timer firing, for instance, stays armed and due. The
 * Repeatable Event Subscriptions specification keeps `BpmnSemanticClosureFailure` for core rollback,
 * so this returns the diagnostic that failure carries, or null for every other step.
 */
export function rolledBackClosureDiagnostic(
  step: ScenarioStep,
): HarnessFailureScenarioStep["diagnostic"] | null {
  return step.kind === ScenarioStepKind.Terminal && step.outcome.kind === ScenarioOutcomeKind.Semantic &&
      step.outcome.outcome === CommandOutcome.RolledBack
    ? { stage: "commandClosure", outcome: CommandOutcome.RolledBack, internalStepBoundExceeded: false, ambiguousInternalChoice: false }
    : null;
}

function committedFlowNodeOccurrenceLifecycles(
  traced: TracedCommandResult,
): [UnnumberedFlowNodeOccurrenceDelta, ...UnnumberedFlowNodeOccurrenceDelta[]] | null {
  const first = traced.flowNodeOccurrenceLifecycles[0];
  return first === undefined ||
      traced.flowNodeOccurrenceLifecycles.length !== traced.committedTransitions.length
    ? null
    : [first, ...traced.flowNodeOccurrenceLifecycles.slice(1)];
}

function committedPublication(
  traced: TracedCommandResult,
  state: StateObservation,
): UnnumberedCommittedExecutionPublication | null {
  const first = traced.committedTransitions[0];
  if (first === undefined || traced.currentPositions === null) {
    return null;
  }
  return {
    transitions: [first, ...traced.committedTransitions.slice(1)],
    current: {
      state,
      controlTokens: traced.currentPositions.controlTokens,
      scopes: traced.currentPositions.scopes,
    },
  };
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

/**
 * Whether a host may create an execution for this Start: the execution is supported and command
 * admission commits the Start itself. A scenario may still carry a supported Start that is then
 * refused, as Lean's `runScenario` does; a host has no instance to keep for one, so it refuses
 * before creating anything rather than consulting a parallel list of Start checks that can drift.
 */
export function admitsHostedProcessStart(
  start: ProcessStartStimulus,
  semanticProcess: SemanticProcessProgram,
): boolean {
  return supportsSemanticProcessExecution(start, semanticProcess) &&
    applyStimulusWithTrace(semanticProcess, initialState, start).result.outcome === CommandOutcome.Committed;
}

export function deployProcess(
  start: ProcessStartStimulus,
  semanticProcess: SemanticProcessProgram,
): ScenarioDeployment {
  const outcome = admitsHostedProcessStart(start, semanticProcess)
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

  for (const [index, stimulus] of stimuli.entries()) {
    const step = advanceScenario(program, state, stimulus, closureLimit);
    switch (step.kind) {
      case ScenarioStepKind.Committed:
        trace.push(...step.observations);
        state = step.state;
        break;
      case ScenarioStepKind.Terminal:
        // ABMSG-REFUSE-01 requires a stale loser to prove state preservation before the still-live
        // follow-on is completed; an intermediate rejection is therefore an observation, not the
        // end of the answer-free schedule. As in Lean's `executeStimuli`, continuing needs an observed
        // state; a rejection that left no instance cannot ground the remaining stimuli.
        if (
          step.outcome.kind === ScenarioOutcomeKind.Semantic &&
          step.outcome.outcome === CommandOutcome.Rejected &&
          index + 1 < stimuli.length
        ) {
          if (!step.observations.some(({ kind }) => kind === CanonicalObservationKind.State)) {
            return { outcome: { kind: ScenarioOutcomeKind.HarnessFailure }, trace };
          }
          trace.push(...step.observations);
          state = step.state;
          break;
        }
        return {
          outcome: step.outcome,
          trace: [...trace, ...step.observations],
        };
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
