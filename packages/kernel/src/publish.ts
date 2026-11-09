/**
 * Publish, transcribed from `Kernel/Publish.lean`: the one generic projection from runtime state to the public state
 * observation of the canonical result. It reads open items through `openKindView`.
 *
 * User tasks and effects are ordered by occurrence (process instance id, element id, then activation), and enabled
 * interactions by their kind's wait rank and then occurrence; every other list keeps the order in which its items
 * opened. A Signal or conditional wait, which no admitted model opens yet, is not published. Every sort is Lean's
 * stable `List.mergeSort` with Lean's `String` order.
 */
import {
  assertNever,
  compareStrings,
  elementEnvelope,
  mergeSort,
  programElement,
  programPublicId,
  type MultiInstanceMode,
  type Program,
  type Value,
} from "./il/types.js";
import {
  InstanceStatus,
  IterationTag,
  instanceOf,
  occurrenceOf,
  openKindView,
  root,
  type Binding,
  type EffectDetail,
  type InstanceFailure,
  type Iteration,
  type MessageChannel,
  type OccurrenceRef,
  type OpenItem,
  type State,
} from "./state.js";
import { multiInstanceRunItems } from "./hooks.js";

/** The schema's `occurrenceId`: an element and its activation in the process instance. */
export interface OccurrenceId {
  readonly processInstanceId: string;
  readonly elementId: string;
  readonly activation: number;
}

export interface ActiveWait {
  readonly elementId: string;
  readonly kind: string;
  readonly rank: number;
  readonly multiplicity: number;
}

export interface OpenUserTask {
  readonly id: OccurrenceId;
  readonly name: string | null;
  readonly candidateGroups: readonly string[];
  readonly formFields: readonly (readonly [string, string])[];
  readonly inputs: readonly Binding[];
}

export interface OpenMessageSubscription {
  readonly id: OccurrenceId;
  readonly channel: MessageChannel;
}

export interface OpenTimer {
  readonly id: OccurrenceId;
  readonly deadlineMs: number;
}

export interface OpenEffect {
  readonly id: OccurrenceId;
  readonly protocol: string;
  readonly operation: string;
  readonly arguments: readonly Binding[];
}

export interface OpenIncident {
  readonly effect: OpenEffect;
  readonly generation: number;
}

export enum EnabledInteractionTag {
  CompleteUserTask = "completeUserTask",
  DeliverMessage = "deliverMessage",
  DeliverPayloadMessage = "deliverPayloadMessage",
  /**
   * A correlated wait's definition-scoped publication; the subscription only orders it and is never published,
   * since a correlated publication names no target.
   */
  PublishCorrelatedPayloadMessage = "publishCorrelatedPayloadMessage",
  RetryIncident = "retryIncident",
  CancelIncidentProcess = "cancelIncidentProcess",
}

export type EnabledInteraction =
  | { readonly tag: EnabledInteractionTag.CompleteUserTask; readonly task: OccurrenceId }
  | {
      readonly tag: EnabledInteractionTag.DeliverMessage;
      readonly subscription: OccurrenceId;
      readonly channel: MessageChannel;
    }
  | {
      readonly tag: EnabledInteractionTag.DeliverPayloadMessage;
      readonly subscription: OccurrenceId;
      readonly channel: MessageChannel;
    }
  | {
      readonly tag: EnabledInteractionTag.PublishCorrelatedPayloadMessage;
      readonly subscription: OccurrenceId;
      readonly channel: MessageChannel;
      readonly correlationKey: string;
    }
  | { readonly tag: EnabledInteractionTag.RetryIncident; readonly effect: OccurrenceId; readonly generation: number }
  | {
      readonly tag: EnabledInteractionTag.CancelIncidentProcess;
      readonly effect: OccurrenceId;
      readonly generation: number;
    };

/** A compensation handler's failure as the failed state publishes it. */
export interface PublishedFailure {
  readonly trigger: OccurrenceId;
  readonly handler: OccurrenceId;
  readonly effect: OccurrenceId;
  readonly code: string;
  readonly message: string | null;
}

export interface Observation {
  readonly instanceId: string;
  readonly status: string;
  readonly activeWaits: readonly ActiveWait[];
  readonly openUserTasks: readonly OpenUserTask[];
  readonly openMessageSubscriptions: readonly OpenMessageSubscription[];
  readonly openTimers: readonly OpenTimer[];
  readonly openEffects: readonly OpenEffect[];
  readonly openIncidents: readonly OpenIncident[];
  readonly variables: readonly Binding[];
  readonly enabledInteractions: readonly EnabledInteraction[];
  readonly logicalTimeMs: number;
  readonly failure: PublishedFailure | null;
}

export function statusName(status: InstanceStatus): string {
  switch (status) {
    case InstanceStatus.Running:
      return "running";
    case InstanceStatus.Completed:
      return "completed";
    case InstanceStatus.Cancelled:
      return "cancelled";
    case InstanceStatus.Failed:
      return "failed";
  }
  return assertNever(status);
}

/** One wait per element and kind, counting its open items, in the order the first of them opened. */
function activeWaitsInOpenOrder(program: Program, items: readonly OpenItem[]): readonly ActiveWait[] {
  return items.reduce<readonly ActiveWait[]>((waits, item) => {
    const elementId = programPublicId(program, item.element);
    const published = openKindView(item.kind).published;
    if (published === null) return waits;
    const [kind, rank] = published;
    const matches = (wait: ActiveWait): boolean => wait.elementId === elementId && wait.kind === kind;
    return waits.some(matches)
      ? waits.map((wait) => (matches(wait) ? { ...wait, multiplicity: wait.multiplicity + 1 } : wait))
      : [...waits, { elementId, kind, rank, multiplicity: 1 }];
  }, []);
}

/**
 * One wait per element and kind, counting its open items, ordered by kind (user task, message, timer, effect, incident)
 * and then by element id.
 */
function activeWaits(program: Program, items: readonly OpenItem[]): readonly ActiveWait[] {
  return mergeSort(activeWaitsInOpenOrder(program, items), (left, right) =>
    left.rank < right.rank || (left.rank === right.rank && compareStrings(left.elementId, right.elementId) <= 0));
}

export function occurrenceId(program: Program, state: State, item: OpenItem): OccurrenceId {
  return {
    processInstanceId: instanceOf(state, item.scope),
    elementId: programPublicId(program, item.element),
    activation: occurrenceOf(state, item.occurrence)?.activation ?? 0,
  };
}

function effect(id: OccurrenceId, detail: EffectDetail): OpenEffect {
  return { id, protocol: detail.protocol, operation: detail.operation, arguments: detail.arguments };
}

function userTask(program: Program, state: State, item: OpenItem): OpenUserTask | null {
  const detail = openKindView(item.kind).userTask;
  return detail === null ? null : {
    id: occurrenceId(program, state, item),
    name: detail.name,
    candidateGroups: detail.candidateGroups,
    formFields: detail.formFields,
    inputs: detail.inputs,
  };
}

function messageSubscription(program: Program, state: State, item: OpenItem): OpenMessageSubscription | null {
  const channel = openKindView(item.kind).channel;
  return channel === null ? null : { id: occurrenceId(program, state, item), channel };
}

function timer(program: Program, state: State, item: OpenItem): OpenTimer | null {
  const deadlineMs = openKindView(item.kind).deadlineMs;
  return deadlineMs === null ? null : { id: occurrenceId(program, state, item), deadlineMs };
}

function openEffect(program: Program, state: State, item: OpenItem): OpenEffect | null {
  const detail = openKindView(item.kind).effect;
  return detail === null ? null : effect(occurrenceId(program, state, item), detail);
}

function incident(program: Program, state: State, item: OpenItem): OpenIncident | null {
  const detail = openKindView(item.kind).incident;
  return detail === null ? null : { effect: effect(occurrenceId(program, state, item), detail.effect), generation: detail.generation };
}

/** The sort key of an enabled interaction: its kind's wait rank, then its occurrence. */
function enabledInteractionKey(interaction: EnabledInteraction): readonly [number, OccurrenceId] {
  switch (interaction.tag) {
    case EnabledInteractionTag.CompleteUserTask:
      return [0, interaction.task];
    case EnabledInteractionTag.DeliverMessage:
    case EnabledInteractionTag.DeliverPayloadMessage:
    case EnabledInteractionTag.PublishCorrelatedPayloadMessage:
      return [1, interaction.subscription];
    case EnabledInteractionTag.RetryIncident:
    case EnabledInteractionTag.CancelIncidentProcess:
      return [4, interaction.effect];
  }
  return assertNever(interaction);
}

export function occurrenceIdLe(left: OccurrenceId, right: OccurrenceId): boolean {
  const instance = compareStrings(left.processInstanceId, right.processInstanceId);
  if (instance !== 0) return instance < 0;
  const element = compareStrings(left.elementId, right.elementId);
  return element !== 0 ? element < 0 : left.activation <= right.activation;
}

/**
 * What an open item enables: each view field contributes its own interactions, so no field's presence is read as the
 * item's kind.
 */
function interactions(program: Program, state: State, item: OpenItem): readonly EnabledInteraction[] {
  const id = occurrenceId(program, state, item);
  const view = openKindView(item.kind);
  const found: EnabledInteraction[] = [];
  if (view.userTask !== null) found.push({ tag: EnabledInteractionTag.CompleteUserTask, task: id });
  const channel = view.channel;
  if (channel !== null) {
    const key = view.criteria[0];
    if (key !== undefined) {
      found.push({ tag: EnabledInteractionTag.PublishCorrelatedPayloadMessage, subscription: id, channel, correlationKey: key });
    } else {
      found.push(view.payload
        ? { tag: EnabledInteractionTag.DeliverPayloadMessage, subscription: id, channel }
        : { tag: EnabledInteractionTag.DeliverMessage, subscription: id, channel });
    }
  }
  const detail = view.incident;
  if (detail !== null) {
    found.push({ tag: EnabledInteractionTag.RetryIncident, effect: id, generation: detail.generation });
    if (detail.cancellable) found.push({ tag: EnabledInteractionTag.CancelIncidentProcess, effect: id, generation: detail.generation });
  }
  return found;
}

export function reference(program: Program, ref: OccurrenceRef): OccurrenceId {
  return { processInstanceId: ref.processInstanceId, elementId: programPublicId(program, ref.element), activation: ref.activation };
}

/**
 * A compensation trigger is published under an identity distinct from its throwing element's, `operation:<element>`:
 * "each trigger has an identity distinct from its throw Event" in the
 * [trigger account](../../../docs/capsules/COMPENSATION-TRIGGER-HANDLER-PROPOSAL.md). A failure without a trigger and
 * handler is not published in this form.
 */
function failure(program: Program, record: InstanceFailure): PublishedFailure | null {
  const related = (name: string): OccurrenceRef | null => record.related.find(([key]) => key === name)?.[1] ?? null;
  const triggerRef = related("trigger");
  if (triggerRef === null) return null;
  const handlerRef = related("handler");
  if (handlerRef === null) return null;
  const trigger = reference(program, triggerRef);
  return {
    trigger: { ...trigger, elementId: `operation:${trigger.elementId}` },
    handler: reference(program, handlerRef),
    effect: reference(program, record.occurrence),
    code: record.code,
    message: record.message,
  };
}

function present<T>(value: T | null): value is T {
  return value !== null;
}

export function observe(program: Program, state: State): Observation {
  const items = state.openItems;
  const byOccurrence = <T extends { readonly id: OccurrenceId }>(values: readonly T[]): readonly T[] =>
    mergeSort(values, (left, right) => occurrenceIdLe(left.id, right.id));
  return {
    instanceId: state.instanceId,
    status: statusName(state.status),
    activeWaits: activeWaits(program, items),
    openUserTasks: byOccurrence(items.map((item) => userTask(program, state, item)).filter(present)),
    openMessageSubscriptions: items.map((item) => messageSubscription(program, state, item)).filter(present),
    openTimers: items.map((item) => timer(program, state, item)).filter(present),
    openEffects: byOccurrence(items.map((item) => openEffect(program, state, item)).filter(present)),
    openIncidents: items.map((item) => incident(program, state, item)).filter(present),
    variables: mergeSort(
      state.variables.find((vars) => vars.scope === root)?.entries ?? [],
      (left, right) => compareStrings(left[0], right[0]) <= 0,
    ),
    enabledInteractions: mergeSort(items.flatMap((item) => interactions(program, state, item)), (left, right) => {
      const [leftRank, leftId] = enabledInteractionKey(left);
      const [rightRank, rightId] = enabledInteractionKey(right);
      return leftRank < rightRank || (leftRank === rightRank && occurrenceIdLe(leftId, rightId));
    }),
    logicalTimeMs: state.logicalTimeMs,
    failure: state.failure === null ? null : failure(program, state.failure),
  };
}

// Multi-Instance Activities

/**
 * An open instance: its zero-based position in the input collection, its User Task, the input data item it was given
 * and the output data item its completion submits.
 */
export interface OpenIteration {
  readonly loopCounter: number;
  readonly taskId: OccurrenceId;
  readonly taskInput: Binding;
  readonly completionBindingName: string;
}

/**
 * The schema's `openSequentialMultiInstance` and `openParallelMultiInstance`: the Activity's occurrence, its mode, and
 * the instance counts of BPMN 2.0.2 Table 10.30; an instance is never terminated in a state that keeps it.
 */
export interface OpenMultiInstance {
  readonly processInstanceId: string;
  readonly activityElementId: string;
  readonly activation: number;
  readonly mode: MultiInstanceMode;
  readonly plannedInstanceCount: number;
  readonly pendingItemCount: number;
  readonly numberOfInstances: number;
  readonly numberOfActiveInstances: number;
  readonly numberOfCompletedInstances: number;
  readonly activeIterations: readonly OpenIteration[];
}

/** A program publishes `openMultiInstances`, in every state, exactly when it declares a Multi-Instance Activity or Scope. */
export function publishesMultiInstances(program: Program): boolean {
  return program.elements.some((element) => (elementEnvelope(element)?.multiInstance ?? null) !== null);
}

function isCompleted(iteration: Iteration): boolean {
  switch (iteration.tag) {
    case IterationTag.Completed:
      return true;
    case IterationTag.Waiting:
    case IterationTag.Active:
      return false;
  }
  return assertNever(iteration);
}

function activeIteration(
  program: Program,
  state: State,
  slot: Iteration,
  index: number,
  items: readonly Value[],
  input: string,
  output: string,
): OpenIteration | null {
  switch (slot.tag) {
    case IterationTag.Active: {
      const item = state.openItems.find((candidate) => candidate.scope === slot.scope);
      const value = items[index];
      return item === undefined || value === undefined
        ? null
        : { loopCounter: index, taskId: occurrenceId(program, state, item), taskInput: [input, value], completionBindingName: output };
    }
    case IterationTag.Waiting:
    case IterationTag.Completed:
      return null;
  }
  return assertNever(slot);
}

/** The open Multi-Instance Activities in the order they were entered. */
export function multiInstances(program: Program, state: State): readonly OpenMultiInstance[] {
  return state.slots.multiInstances.flatMap((run) => {
    const element = programElement(program, run.element);
    const loop = element === null ? null : (elementEnvelope(element)?.multiInstance ?? null);
    const input = loop?.inputDataItem ?? null;
    const output = loop?.outputDataItem ?? null;
    const items = multiInstanceRunItems(run);
    if (loop === null || input === null || output === null || items === null) return [];
    const iterations = run.instances
      .map((slot, index) => activeIteration(program, state, slot, index, items, input, output))
      .filter(present);
    const completed = run.instances.filter(isCompleted).length;
    const generated = iterations.length + completed;
    return [{
      processInstanceId: instanceOf(state, run.scope),
      activityElementId: programPublicId(program, run.element),
      activation: occurrenceOf(state, run.occurrence)?.activation ?? 0,
      mode: loop.mode,
      plannedInstanceCount: run.instances.length,
      pendingItemCount: Math.max(0, run.instances.length - generated),
      numberOfInstances: generated,
      numberOfActiveInstances: iterations.length,
      numberOfCompletedInstances: completed,
      activeIterations: iterations,
    }];
  });
}
