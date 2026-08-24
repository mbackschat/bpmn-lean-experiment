import { setTimeout as hostDelay } from "node:timers/promises";

import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";
import {
  ProcessStatus,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  OpenSequentialMultiInstance,
  OccurrenceId,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  HostInteractionEventKind,
  HostInteractionResultKind,
  driveHostInteractions,
} from "@bpmn-lean/temporal-testkit";
import type {
  HostInteractionEvent,
  HostInteractionPort,
  HostInteractionResponse,
} from "@bpmn-lean/temporal-testkit";

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

const alphaProcessId = "Process_SequentialMultiInstanceReview";
const alphaSemanticProfile = "bpmn-2.0.2-sequential-multi-instance-user-task-draft";
const alphaSourceSha256 = "9161c134984d42a04cd57d5ea161938a774705be2e955ade5302d5dde2afa6f4";
const interactionDelayMs = 1;

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

export class MuePreviewAlphaActor {
  readonly #delay: (delayMs: number) => Promise<void>;

  constructor(delay: (delayMs: number) => Promise<void> = waitForHostDelay) {
    this.#delay = delay;
  }

  async runNatural(
    instance: PublicProcessInstanceIdentity,
    port: HostInteractionPort,
  ): Promise<AlphaJourneyResult> {
    requireExactAlphaInstance(instance);
    return await this.#drive(
      AlphaJourney.Natural,
      naturalResponses,
      instance,
      port,
    );
  }

  async runInterrupted(
    instance: PublicProcessInstanceIdentity,
    port: HostInteractionPort,
    gate: AlphaInterruptionGate,
  ): Promise<AlphaJourneyResult> {
    requireExactAlphaInstance(instance);
    return await this.#drive(
      AlphaJourney.Interrupted,
      interruptedResponses,
      instance,
      port,
      gate,
    );
  }

  async #drive(
    journey: AlphaJourney,
    responses: ReadonlyArray<HostInteractionResponse>,
    instance: PublicProcessInstanceIdentity,
    port: HostInteractionPort,
    gate?: AlphaInterruptionGate,
  ): Promise<AlphaJourneyResult> {
    let escalationReady = false;
    const result = await driveHostInteractions(
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
        if (event.kind === HostInteractionEventKind.StateObserved) {
          requireExactAlphaState(journey, instance.processInstanceId, event.state);
        }
        if (journey === AlphaJourney.Interrupted && isEscalationReady(event)) {
          escalationReady = true;
        }
      },
    );
    if (result.kind !== HostInteractionResultKind.Driven) {
      throw new Error(`Alpha ${journey} actor refused: ${result.code}: ${result.evidence}`);
    }
    if (result.submitted !== responses.length) {
      throw new Error(`Alpha ${journey} actor submitted ${result.submitted} of ${responses.length} responses`);
    }
    return { journey, submitted: result.submitted };
  }
}

const naturalResponses = exactInputItems.map((_item, index) => ({
  kind: StimulusKind.CompleteUserTaskInstance,
  elementId: reviewElementId,
  delayMs: interactionDelayMs,
  inputVariableNames: [],
  submittedValues: [{
    name: completionBindingName,
    value: { kind: VariableValueKind.String, value: exactNaturalResults[index]! },
  }],
})) satisfies ReadonlyArray<HostInteractionResponse>;

const interruptedResponses = [{
  kind: StimulusKind.CompleteUserTaskInstance,
  elementId: reviewElementId,
  delayMs: interactionDelayMs,
  inputVariableNames: [],
  submittedValues: [{
    name: completionBindingName,
    value: { kind: VariableValueKind.String, value: exactNaturalResults[0] },
  }],
}, {
  kind: StimulusKind.CompleteUserTaskInstance,
  elementId: escalationElementId,
  delayMs: interactionDelayMs,
  inputVariableNames: [],
  submittedValues: [],
}] satisfies ReadonlyArray<HostInteractionResponse>;

function requireExactAlphaInstance(instance: PublicProcessInstanceIdentity): void {
  if (
    instance.definition.processId !== alphaProcessId ||
    instance.definition.semanticProfile !== alphaSemanticProfile ||
    instance.definition.source.sha256 !== alphaSourceSha256
  ) {
    throw new Error("Alpha actor requires the exact registered definition and profile");
  }
}

function requireExactAlphaState(
  journey: AlphaJourney,
  processInstanceId: string,
  state: StateObservation,
): void {
  if (state.instanceId !== processInstanceId) {
    throw new Error("Alpha publication changed Process-instance identity");
  }
  switch (state.status) {
    case ProcessStatus.Running:
      requireRunningAlphaState(journey, processInstanceId, state);
      return;
    case ProcessStatus.Completed:
      requireTerminalAlphaState(journey, state);
      return;
    case ProcessStatus.NotStarted:
    case ProcessStatus.Cancelled:
      throw new Error(`Alpha ${journey} journey reached unexpected status ${state.status}`);
  }
}

function requireRunningAlphaState(
  journey: AlphaJourney,
  processInstanceId: string,
  state: StateObservation,
): void {
  const controllers = state.openMultiInstances ?? [];
  if (controllers.length === 1) {
    const loopCounter = requireExactController(processInstanceId, controllers[0]!, state);
    if (journey === AlphaJourney.Interrupted && loopCounter > 1) {
      throw new Error("Interrupted Alpha advanced beyond the Timer-risk checkpoint");
    }
    requireLifetimeTimer(processInstanceId, state);
    requireOutputAbsent(state);
    return;
  }
  if (journey === AlphaJourney.Interrupted && isExactEscalationState(processInstanceId, state)) {
    requireOutputAbsent(state);
    return;
  }
  throw new Error(`Alpha ${journey} published a running state outside its exact preview contract`);
}

function requireExactController(
  processInstanceId: string,
  controller: OpenSequentialMultiInstance,
  state: StateObservation,
): number {
  const [iteration] = controller.activeIterations;
  if (iteration === undefined) {
    throw new Error("Alpha publication has no active Sequential Multi-Instance iteration");
  }
  const loopCounter = iteration.loopCounter;
  if (
    controller.id.processInstanceId !== processInstanceId ||
    controller.id.activityElementId !== reviewElementId ||
    controller.id.activation !== 1 ||
    controller.mode !== "sequential" ||
    controller.plannedInstanceCount !== exactInputItems.length ||
    controller.numberOfInstances !== loopCounter + 1 ||
    controller.numberOfActiveInstances !== 1 ||
    controller.numberOfCompletedInstances !== loopCounter ||
    controller.numberOfTerminatedInstances !== 0 ||
    controller.numberOfInstances !==
      controller.numberOfActiveInstances +
        controller.numberOfCompletedInstances +
        controller.numberOfTerminatedInstances ||
    controller.pendingItemCount !==
      controller.plannedInstanceCount - controller.numberOfInstances ||
    controller.activeIterations.length !== 1 ||
    loopCounter < 0 ||
    loopCounter >= exactInputItems.length ||
    iteration.taskInput.name !== currentItemBindingName ||
    iteration.taskInput.value.kind !== VariableValueKind.String ||
    iteration.taskInput.value.value !== exactInputItems[loopCounter] ||
    iteration.completionBindingName !== completionBindingName ||
    iteration.taskId.processInstanceId !== processInstanceId ||
    iteration.taskId.elementId !== reviewElementId ||
    iteration.taskId.activation !== loopCounter + 1
  ) {
    throw new Error("Alpha publication has an invalid current Sequential Multi-Instance iteration");
  }
  requireOnePublishedTask(state, iteration.taskId);
  return loopCounter;
}

function requireLifetimeTimer(
  processInstanceId: string,
  state: StateObservation,
): void {
  const [timer] = state.openTimers;
  if (
    state.openTimers.length !== 1 ||
    timer === undefined ||
    timer.id.processInstanceId !== processInstanceId ||
    timer.id.elementId !== lifetimeTimerElementId ||
    timer.id.activation !== 1 ||
    timer.deadlineMs !== 1_000 ||
    state.logicalTimeMs !== 0
  ) {
    throw new Error("Alpha publication has an invalid Sequential Multi-Instance lifetime Timer");
  }
}

function isExactEscalationState(
  processInstanceId: string,
  state: StateObservation,
): boolean {
  const [task] = state.openUserTasks;
  if (
    (state.openMultiInstances ?? []).length !== 0 ||
    state.openTimers.length !== 0 ||
    state.logicalTimeMs !== 1_000 ||
    state.openUserTasks.length !== 1 ||
    task === undefined ||
    task.id.processInstanceId !== processInstanceId ||
    task.id.elementId !== escalationElementId ||
    task.id.activation !== 1
  ) {
    return false;
  }
  requireOnePublishedTask(state, task.id);
  return true;
}

function requireOnePublishedTask(state: StateObservation, taskId: OccurrenceId): void {
  const [task] = state.openUserTasks;
  const completions = state.enabledInteractions.filter(
    (interaction) => interaction.kind === StimulusKind.CompleteUserTaskInstance,
  );
  if (
    state.openUserTasks.length !== 1 ||
    task === undefined ||
    !sameOccurrence(task.id, taskId) ||
    state.enabledInteractions.length !== 1 ||
    completions.length !== 1 ||
    !sameOccurrence(completions[0]!.taskId, taskId)
  ) {
    throw new Error("Alpha task, iteration, and completion publication identities disagree");
  }
}

function requireTerminalAlphaState(journey: AlphaJourney, state: StateObservation): void {
  if (
    (state.openMultiInstances ?? []).length !== 0 ||
    state.openUserTasks.length !== 0 ||
    state.openTimers.length !== 0 ||
    state.enabledInteractions.length !== 0
  ) {
    throw new Error(`Alpha ${journey} terminal state retained open work`);
  }
  if (journey === AlphaJourney.Interrupted) {
    requireOutputAbsent(state);
    return;
  }
  const output = state.variables.find(({ name }) => name === outputBindingName);
  if (
    output?.value.kind !== VariableValueKind.StringList ||
    !sameStrings(output.value.value, exactNaturalResults)
  ) {
    throw new Error("Natural Alpha terminal output does not contain the exact ordered aggregation");
  }
}

function requireOutputAbsent(state: StateObservation): void {
  if (state.variables.some(({ name }) => name === outputBindingName)) {
    throw new Error("Interrupted Alpha must not publish a partial aggregate output");
  }
}

function isEscalationReady(event: HostInteractionEvent): boolean {
  return event.kind === HostInteractionEventKind.InteractionReady &&
    event.interaction.kind === StimulusKind.CompleteUserTaskInstance &&
    event.interaction.taskId.elementId === escalationElementId;
}

function sameOccurrence(left: OccurrenceId, right: OccurrenceId): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation;
}

function sameStrings(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function waitForHostDelay(delayMs: number): Promise<void> {
  await hostDelay(delayMs, undefined, { ref: false });
}
