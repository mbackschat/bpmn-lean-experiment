import { setTimeout as hostDelay } from "node:timers/promises";

import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";
import type { EngineBinding, EngineOccurrenceId, EngineOpenWait, EngineStateObservation } from "@bpmn-lean/engine-api";

import {
  completionBindingName,
  currentItemBindingName,
  escalationElementId,
  exactInputItems,
  exactNaturalResults,
  lifetimeTimerElementId,
  outputBindingName,
  reviewElementId,
} from "./alpha-contract.ts";
import {
  InteractionEventKind,
  InteractionResponseKind,
  InteractionResultKind,
  driveInteractions,
  waitsOf,
} from "./host-interactions.ts";
import type { InteractionEvent, InteractionPort, InteractionResponse } from "./host-interactions.ts";

const alphaProcessId = "Process_SequentialMultiInstanceReview";
const alphaSemanticProfile = "bpmn-2.0.2";
const alphaSourceSha256 = "982f77f7fcca2d01bd2357c11057c5fdb6aaf3b383ac351a93aa32ab1bbca3ff";
const interactionDelayMs = 1;
/** The Timer's duration in the retained source (`PT5S`); the host states deadlines in Workflow epoch time. */
const lifetimeTimerDurationMs = 5_000;

export const AlphaJourney = {
  Natural: "natural",
  Interrupted: "interrupted",
} as const;

export type AlphaJourney = typeof AlphaJourney[keyof typeof AlphaJourney];

export type AlphaInterruptionGate = Readonly<{
  onEscalationReady(): void;
  waitForEscalationRelease(): Promise<void>;
}>;

export type AlphaJourneyResult = Readonly<{
  journey: AlphaJourney;
  submitted: number;
}>;

/** One published variable scope of the canonical observation (`Kernel.Run.observationJson`). */
type ObservedScope = Readonly<{
  scope: Readonly<{ processInstanceId: string; role: string; elementId?: string; activation?: number }>;
  variables: readonly EngineBinding[];
}>;

/** `EngineStateObservation` leaves the observation's `scopes` untyped; the Alpha contract reads the iteration's. */
export type AlphaState = EngineStateObservation & Readonly<{ scopes?: readonly ObservedScope[] }>;

/**
 * Checks every committed state the journey observes against the Alpha preview contract. The host owns logical time
 * (Workflow epoch milliseconds under durable scheduling, `packages/temporal-host/src/workflow-host.ts`), so the
 * contract fixes the Timer's deadline relative to the first state the journey observes, which precedes every input
 * the actor submits, never as an absolute instant.
 */
class AlphaContract {
  readonly journey: AlphaJourney;
  readonly processInstanceId: string;
  #startMs: number | undefined;
  #deadlineMs: number | undefined;

  constructor(journey: AlphaJourney, processInstanceId: string) {
    this.journey = journey;
    this.processInstanceId = processInstanceId;
  }

  require(state: AlphaState): void {
    if (state.instanceId !== this.processInstanceId) {
      throw new Error("Alpha publication changed Process-instance identity");
    }
    switch (state.status) {
      case "running":
        this.#requireRunning(state);
        return;
      case "completed":
        requireTerminalAlphaState(this.journey, state);
        return;
      default:
        throw new Error(`Alpha ${this.journey} journey reached unexpected status ${state.status}`);
    }
  }

  #requireRunning(state: AlphaState): void {
    const iterations = (state.scopes ?? []).filter(({ scope }) => scope.role === "multiInstanceInstance");
    if (iterations.length > 0) {
      const loopCounter = this.#requireExactIteration(iterations, state);
      if (this.journey === AlphaJourney.Interrupted && loopCounter > 1) {
        throw new Error("Interrupted Alpha advanced beyond the Timer-risk checkpoint");
      }
      this.#requireLifetimeTimer(state);
      requireOutputAbsent(state);
      return;
    }
    if (this.journey === AlphaJourney.Interrupted && this.#isExactEscalationState(state)) {
      requireOutputAbsent(state);
      return;
    }
    throw new Error(`Alpha ${this.journey} published a running state outside its exact preview contract`);
  }

  /**
   * A Sequential User Task controller publishes exactly one open iteration, scoped at the review task itself. Several
   * open iterations are a Parallel controller; an iteration scoped elsewhere has another body.
   */
  #requireExactIteration(iterations: readonly ObservedScope[], state: AlphaState): number {
    const [iteration] = iterations;
    if (iterations.length !== 1 || iteration === undefined || iteration.scope.elementId !== reviewElementId) {
      throw new Error("Alpha publication requires a Sequential Multi-Instance User Task controller");
    }
    const activation = iteration.scope.activation ?? 0;
    const loopCounter = activation - 1;
    const [item] = iteration.variables;
    if (
      iteration.scope.processInstanceId !== this.processInstanceId ||
      loopCounter < 0 ||
      loopCounter >= exactInputItems.length ||
      iteration.variables.length !== 1 ||
      item === undefined ||
      item.name !== currentItemBindingName ||
      !isStringValue(item.value, exactInputItems[loopCounter]!)
    ) {
      throw new Error("Alpha publication has an invalid current Sequential Multi-Instance iteration");
    }
    requireOnePublishedTask(state, { processInstanceId: this.processInstanceId, elementId: reviewElementId, activation });
    return loopCounter;
  }

  #requireLifetimeTimer(state: AlphaState): void {
    const timers = waitsOf(state, "timer");
    const [timer] = timers;
    const deadlineMs = timer?.detail.deadlineMs;
    this.#startMs ??= state.logicalTimeMs;
    if (
      timers.length !== 1 ||
      timer === undefined ||
      !sameOccurrence(timer.id, { processInstanceId: this.processInstanceId, elementId: lifetimeTimerElementId, activation: 1 }) ||
      deadlineMs !== this.#startMs + lifetimeTimerDurationMs ||
      timer.detail.recurrence !== null ||
      state.logicalTimeMs >= deadlineMs
    ) {
      throw new Error("Alpha publication has an invalid Sequential Multi-Instance lifetime Timer");
    }
    this.#deadlineMs = deadlineMs;
  }

  /** The escalation follows only the committed Timer: its deadline was published and logical time has reached it. */
  #isExactEscalationState(state: AlphaState): boolean {
    const [task] = waitsOf(state, "userTask");
    if (
      (state.scopes ?? []).some(({ scope }) => scope.role === "multiInstanceInstance") ||
      waitsOf(state, "timer").length !== 0 ||
      this.#deadlineMs === undefined ||
      state.logicalTimeMs < this.#deadlineMs ||
      task === undefined ||
      !sameOccurrence(task.id, { processInstanceId: this.processInstanceId, elementId: escalationElementId, activation: 1 })
    ) {
      return false;
    }
    requireOnePublishedTask(state, task.id);
    return true;
  }
}

export class MuePreviewAlphaActor {
  readonly #delay: (delayMs: number) => Promise<void>;

  constructor(delay: (delayMs: number) => Promise<void> = waitForHostDelay) {
    this.#delay = delay;
  }

  async runNatural(instance: PublicProcessInstanceIdentity, port: InteractionPort): Promise<AlphaJourneyResult> {
    requireExactAlphaInstance(instance);
    return await this.#drive(AlphaJourney.Natural, naturalResponses, instance, port);
  }

  async runInterrupted(
    instance: PublicProcessInstanceIdentity,
    port: InteractionPort,
    gate: AlphaInterruptionGate,
  ): Promise<AlphaJourneyResult> {
    requireExactAlphaInstance(instance);
    return await this.#drive(AlphaJourney.Interrupted, interruptedResponses, instance, port, gate);
  }

  async #drive(
    journey: AlphaJourney,
    responses: readonly InteractionResponse[],
    instance: PublicProcessInstanceIdentity,
    port: InteractionPort,
    gate?: AlphaInterruptionGate,
  ): Promise<AlphaJourneyResult> {
    const contract = new AlphaContract(journey, instance.processInstanceId);
    let escalationReady = false;
    const result = await driveInteractions(
      responses,
      port,
      async (delayMs) => {
        if (escalationReady) {
          escalationReady = false;
          gate?.onEscalationReady();
          await gate?.waitForEscalationRelease();
        }
        await this.#delay(delayMs);
      },
      (event) => {
        if (event.kind === InteractionEventKind.StateObserved) contract.require(event.state);
        if (journey === AlphaJourney.Interrupted && isEscalationReady(event)) escalationReady = true;
      },
    );
    if (result.kind !== InteractionResultKind.Driven) {
      throw new Error(`Alpha ${journey} actor refused: ${result.code}: ${result.evidence}`);
    }
    if (result.submitted !== responses.length) {
      throw new Error(`Alpha ${journey} actor submitted ${result.submitted} of ${responses.length} responses`);
    }
    return { journey, submitted: result.submitted };
  }
}

const naturalResponses: readonly InteractionResponse[] = exactInputItems.map((_item, index) => ({
  kind: InteractionResponseKind.CompleteUserTask,
  elementId: reviewElementId,
  delayMs: interactionDelayMs,
  inputVariableNames: [],
  submittedValues: [{ name: completionBindingName, value: { kind: "string", value: exactNaturalResults[index]! } }],
}));

const interruptedResponses: readonly InteractionResponse[] = [{
  kind: InteractionResponseKind.CompleteUserTask,
  elementId: reviewElementId,
  delayMs: interactionDelayMs,
  inputVariableNames: [],
  submittedValues: [{ name: completionBindingName, value: { kind: "string", value: exactNaturalResults[0] } }],
}, {
  kind: InteractionResponseKind.CompleteUserTask,
  elementId: escalationElementId,
  delayMs: interactionDelayMs,
  inputVariableNames: [],
  submittedValues: [],
}];

function requireExactAlphaInstance(instance: PublicProcessInstanceIdentity): void {
  if (
    instance.definition.processId !== alphaProcessId ||
    instance.definition.semanticProfile !== alphaSemanticProfile ||
    instance.definition.source.sha256 !== alphaSourceSha256 ||
    instance.definition.sourceOverlay !== null
  ) {
    throw new Error("Alpha actor requires the exact registered definition and profile");
  }
}

/** The task's wait is the state's only answerable wait, so the actor cannot complete another occurrence. */
function requireOnePublishedTask(state: AlphaState, taskId: EngineOccurrenceId): void {
  const answerable = state.openWaits.filter((wait) => wait.detail.kind !== "timer" && wait.detail.kind !== "effect");
  const [task] = answerable;
  if (answerable.length !== 1 || task === undefined || task.detail.kind !== "userTask" || !sameOccurrence(task.id, taskId)) {
    throw new Error("Alpha task, iteration, and completion publication identities disagree");
  }
}

function requireTerminalAlphaState(journey: AlphaJourney, state: AlphaState): void {
  if ((state.scopes ?? []).length !== 0 || state.openWaits.length !== 0) {
    throw new Error(`Alpha ${journey} terminal state retained open work`);
  }
  if (journey === AlphaJourney.Interrupted) {
    requireOutputAbsent(state);
    return;
  }
  const output = state.variables.find(({ name }) => name === outputBindingName);
  if (!isStringListValue(output?.value, exactNaturalResults)) {
    throw new Error("Natural Alpha terminal output does not contain the exact ordered aggregation");
  }
}

function requireOutputAbsent(state: AlphaState): void {
  if (state.variables.some(({ name }) => name === outputBindingName)) {
    throw new Error("Interrupted Alpha must not publish a partial aggregate output");
  }
}

function isEscalationReady(event: InteractionEvent): boolean {
  return event.kind === InteractionEventKind.InteractionReady && isEscalationWait(event.wait);
}

function isEscalationWait(wait: EngineOpenWait): boolean {
  return wait.detail.kind === "userTask" && wait.id.elementId === escalationElementId;
}

function isStringValue(value: unknown, expected: string): boolean {
  const typed = value as { kind?: unknown; value?: unknown } | null;
  return typed?.kind === "string" && typed.value === expected;
}

function isStringListValue(value: unknown, expected: readonly string[]): boolean {
  const typed = value as { kind?: unknown; value?: unknown } | null | undefined;
  return typed?.kind === "stringList" && Array.isArray(typed.value) &&
    typed.value.length === expected.length && typed.value.every((item, index) => item === expected[index]);
}

function sameOccurrence(left: EngineOccurrenceId, right: EngineOccurrenceId): boolean {
  return left.processInstanceId === right.processInstanceId && left.elementId === right.elementId &&
    left.activation === right.activation;
}

async function waitForHostDelay(delayMs: number): Promise<void> {
  await hostDelay(delayMs, undefined, { ref: false });
}
