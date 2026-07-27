/**
 * Pure validation and projection helpers at the Temporal runner boundary.
 *
 * These functions validate explicit harness inputs and untrusted Workflow results without owning
 * environment, Worker, or delivery lifecycle.
 */
import { isDeepStrictEqual } from "node:util";

import type {
  CanonicalObservation,
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
  FireTimerStimulus,
  OpenEffect,
  OpenTimer,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  CanonicalObservationKind,
  ProcessStatus,
  ScenarioOutcomeKind,
  ScenarioStepKind,
  SemanticProcessCompilerId,
  StimulusKind,
  advanceScenario,
  initialState,
  projectEffectTransportMaterial,
  projectOpenEffects,
} from "@bpmn-lean/semantic-core";

import {
  ProcessCommandResultKind,
  TemporalCompletionDelivery,
} from "./contracts.js";
import type {
  CompletedProcessReceipt,
  ProcessCommandResult,
  TemporalScenarioExecutionOptions,
} from "./contracts.js";
import {
  EffectExecutionSchedule,
} from "./effect-probe.js";
import type {
  EffectRequest,
} from "./effect-probe.js";
import {
  completeEffectCommandId,
  effectTransportKey,
} from "./effect-transport.js";
import {
  timerFiringCommandId,
} from "./timer-command.js";

export type PreparedEffectExecution = Readonly<{
  request: EffectRequest;
  schedule: EffectExecutionSchedule;
}>;

export function semanticCommandResult(
  commandId: string,
  outcome: CommandOutcome,
): ProcessCommandResult {
  return {
    kind: ProcessCommandResultKind.Semantic,
    commandId,
    outcome,
  };
}

export function requireSemanticOutcome(
  result: ProcessCommandResult,
): CommandOutcome {
  if (result.kind !== ProcessCommandResultKind.Semantic) {
    throw new Error(
      `Conformance command ${result.commandId} was not accepted before Process closure`,
    );
  }
  return result.outcome;
}

export function validateExecutionOptions(
  scenario: Scenario,
  options: TemporalScenarioExecutionOptions,
): void {
  const timer = requireOptionalTimerStimulus(scenario);
  if (timer !== undefined) {
    if (
      options.completionDelivery !== TemporalCompletionDelivery.Ordered ||
      options.duplicateFirstCompletion === true
    ) {
      throw new TypeError(
        "Timer scenarios use internally derived ordered firing without caller duplication",
      );
    }
  } else if (options.workerDownAtTimerDue === true) {
    throw new TypeError(
      "Worker-down-at-due scheduling requires one timer stimulus",
    );
  }
  if (
    options.workerDownAtEffectPending === true &&
    options.effectExecutionSchedule !==
      EffectExecutionSchedule.PlainSuccess
  ) {
    throw new TypeError(
      "Worker-down effect scheduling requires the plain-success effect schedule",
    );
  }
  switch (options.completionDelivery) {
    case TemporalCompletionDelivery.Ordered:
    case TemporalCompletionDelivery.AcceptedBatch:
      break;
    case TemporalCompletionDelivery.PostTerminal:
      if (requireCompletionStimuli(scenario).length < 2) {
        throw new TypeError(
          "Post-terminal delivery requires a semantic completion followed by a distinct command",
        );
      }
      break;
    case TemporalCompletionDelivery.Concurrent:
      if (options.duplicateFirstCompletion === true) {
        throw new TypeError(
          "Concurrent completion delivery cannot also duplicate one completion",
        );
      }
      break;
    default:
      throw new TypeError(
        `Unsupported completion delivery: ${String(options.completionDelivery)}`,
      );
  }
  if (options.duplicateFirstCompletion !== true) {
    return;
  }
  const firstCompletion = scenario.stimuli
    .slice(1)
    .find(
      (stimulus): stimulus is CompleteUserTaskInstanceStimulus =>
        stimulus.kind === StimulusKind.CompleteUserTaskInstance,
    );
  if (firstCompletion === undefined) {
    throw new TypeError(
      "Duplicate completion requires a task-instance completion stimulus",
    );
  }
}

export function requireCompletionStimuli(
  scenario: Scenario,
): ReadonlyArray<CompleteUserTaskInstanceStimulus> {
  return scenario.stimuli.slice(1).flatMap((stimulus) => {
    switch (stimulus.kind) {
      case StimulusKind.CompleteUserTaskInstance:
        return [stimulus];
      case StimulusKind.FireTimer:
      case StimulusKind.CompleteEffect:
        return [];
      case StimulusKind.StartProcess:
        throw new TypeError(
          "Only the first scenario stimulus may start the Process",
        );
      default:
        return assertNever(stimulus);
    }
  });
}

export function requireOptionalTimerStimulus(
  scenario: Scenario,
): FireTimerStimulus | undefined {
  let timer: FireTimerStimulus | undefined;
  for (const stimulus of scenario.stimuli.slice(1)) {
    switch (stimulus.kind) {
      case StimulusKind.CompleteUserTaskInstance:
      case StimulusKind.CompleteEffect:
        break;
      case StimulusKind.FireTimer:
        if (timer !== undefined) {
          throw new TypeError(
            "The admitted Temporal capsule supports exactly one timer firing",
          );
        }
        if (
          stimulus.commandId !==
            timerFiringCommandId(
              stimulus.timerId,
              stimulus.logicalTimeMs,
            )
        ) {
          throw new TypeError(
            "Timer command ID is not bound to its occurrence and logical deadline",
          );
        }
        timer = stimulus;
        break;
      case StimulusKind.StartProcess:
        throw new TypeError(
          "Only the first scenario stimulus may start the Process",
        );
      default:
        assertNever(stimulus);
    }
  }
  return timer;
}

export function requireOptionalEffectExecution(
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  options: TemporalScenarioExecutionOptions,
): PreparedEffectExecution | undefined {
  const effects = scenario.stimuli.slice(1).flatMap((stimulus) => {
    switch (stimulus.kind) {
      case StimulusKind.CompleteEffect:
        return [stimulus];
      case StimulusKind.CompleteUserTaskInstance:
      case StimulusKind.FireTimer:
        return [];
      case StimulusKind.StartProcess:
        throw new TypeError(
          "Only the first scenario stimulus may start the Process",
        );
      default:
        return assertNever(stimulus);
    }
  });
  if (effects.length === 0) {
    if (options.effectExecutionSchedule !== undefined) {
      throw new TypeError(
        "An effect execution schedule requires one completeEffect stimulus",
      );
    }
    return undefined;
  }
  if (effects.length !== 1) {
    throw new TypeError(
      "The admitted Temporal effect capsule requires one completeEffect stimulus",
    );
  }
  const schedule = options.effectExecutionSchedule;
  switch (schedule) {
    case EffectExecutionSchedule.PlainSuccess:
    case EffectExecutionSchedule.FailAfterMutationOnce:
      break;
    case undefined:
      throw new TypeError(
        "Effect scenarios require an explicit host execution schedule",
      );
    default:
      throw new TypeError(
        `Unsupported effect execution schedule: ${String(schedule)}`,
      );
  }
  const start = requireStartStimulus(scenario);
  const started = advanceScenario(
    semanticProcess,
    initialState,
    start,
  );
  if (started.kind !== ScenarioStepKind.Committed) {
    throw new TypeError(
      "Effect harness could not derive one committed start-prefix intent",
    );
  }
  const openEffects = projectOpenEffects(started.state);
  if (openEffects.length !== 1) {
    throw new TypeError(
      "Effect harness requires exactly one committed start-prefix intent",
    );
  }
  const openEffect = openEffects[0];
  const completion = effects[0];
  if (openEffect === undefined || completion === undefined) {
    throw new TypeError(
      "Effect harness lost its committed intent or completion input",
    );
  }
  if (
    !isDeepStrictEqual(openEffect.id, completion.effectId) ||
    completion.commandId !==
      completeEffectCommandId(openEffect.id, completion.result)
  ) {
    throw new TypeError(
      "Scenario effect completion is not content-bound to the committed intent",
    );
  }
  const material = projectEffectTransportMaterial(
    semanticProcess,
    openEffect,
  );
  return {
    request: {
      ...material.descriptor,
      idempotencyKey: effectTransportKey(material),
      arguments: material.arguments,
    },
    schedule,
  };
}

export function requireStartStimulus(
  scenario: Scenario,
): StartProcessStimulus {
  const start = scenario.stimuli[0];
  if (
    start === undefined ||
    start.kind !== StimulusKind.StartProcess
  ) {
    throw new TypeError(
      "Temporal Process execution requires one explicit start stimulus",
    );
  }
  return start;
}

export function scenarioResultFromTrace(
  trace: ReadonlyArray<CanonicalObservation>,
): ScenarioResult {
  const finalCommand = trace.findLast(
    (observation) =>
      observation.kind === CanonicalObservationKind.Command,
  );
  if (
    finalCommand === undefined ||
    finalCommand.kind !== CanonicalObservationKind.Command
  ) {
    throw new Error(
      "Workflow trace has no semantic command result",
    );
  }
  return {
    outcome: {
      kind: ScenarioOutcomeKind.Semantic,
      outcome: finalCommand.outcome,
    },
    trace,
  };
}

export function completedState(
  trace: ReadonlyArray<CanonicalObservation>,
): boolean {
  return trace.some(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
}

export function openTimersInTrace(
  trace: ReadonlyArray<CanonicalObservation>,
): ReadonlyArray<OpenTimer> {
  const waiting = trace.findLast(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Running,
  );
  return waiting?.kind === CanonicalObservationKind.State
    ? waiting.openTimers
    : [];
}

export function openEffectsInTrace(
  trace: ReadonlyArray<CanonicalObservation>,
): ReadonlyArray<OpenEffect> {
  const waiting = trace.findLast(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Running,
  );
  return waiting?.kind === CanonicalObservationKind.State
    ? waiting.openEffects
    : [];
}

export function isCompletedProcessReceipt(
  value: unknown,
): value is CompletedProcessReceipt {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "definition",
    "processId",
    "processInstanceId",
    "finalState",
  ])) {
    return false;
  }
  const definition = value.definition;
  const finalState = value.finalState;
  return (
    isRecord(definition) &&
    hasOnlyKeys(definition, [
      "compiler",
      "semanticProfile",
      "sourceId",
      "sourceSha256",
    ]) &&
    definition.compiler ===
      SemanticProcessCompilerId.BpmnSourceSemanticProcess &&
    isNonEmptyString(definition.semanticProfile) &&
    isNonEmptyString(definition.sourceId) &&
    typeof definition.sourceSha256 === "string" &&
    /^[a-f0-9]{64}$/u.test(definition.sourceSha256) &&
    isNonEmptyString(value.processId) &&
    isNonEmptyString(value.processInstanceId) &&
    isRecord(finalState) &&
    hasOnlyKeys(finalState, [
      "kind",
      "instanceId",
      "status",
      "activeWaits",
      "openUserTasks",
      "openTimers",
      "openEffects",
      "variables",
      "enabledInteractions",
      "logicalTimeMs",
    ]) &&
    finalState.kind === CanonicalObservationKind.State &&
    finalState.instanceId === value.processInstanceId &&
    finalState.status === ProcessStatus.Completed &&
    Array.isArray(finalState.activeWaits) &&
    finalState.activeWaits.length === 0 &&
    Array.isArray(finalState.openUserTasks) &&
    finalState.openUserTasks.length === 0 &&
    Array.isArray(finalState.openTimers) &&
    finalState.openTimers.length === 0 &&
    Array.isArray(finalState.openEffects) &&
    finalState.openEffects.length === 0 &&
    Array.isArray(finalState.variables) &&
    Array.isArray(finalState.enabledInteractions) &&
    finalState.enabledInteractions.length === 0 &&
    Number.isSafeInteger(finalState.logicalTimeMs) &&
    Number(finalState.logicalTimeMs) >= 0
  );
}

export function requireCompletedProcessReceipt(
  value: unknown,
): CompletedProcessReceipt {
  if (!isCompletedProcessReceipt(value)) {
    throw new TypeError(
      "Temporal Workflow returned a malformed completed Process receipt",
    );
  }
  return value;
}

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
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

export function assertNever(value: never): never {
  throw new TypeError(`Unsupported Temporal runner variant: ${String(value)}`);
}

export function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${operation} exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

export function normalizeError(
  error: unknown,
  fallbackMessage: string,
): Error {
  return error instanceof Error ? error : new Error(fallbackMessage);
}
