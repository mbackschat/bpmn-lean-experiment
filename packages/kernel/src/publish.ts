/**
 * Publish, transcribed from `Kernel/Publish.lean`: the one generic projection from runtime state to the public
 * state observation of the canonical result. Owns matching on `OpenKind` with `step.ts`.
 *
 * User tasks and effects are ordered by occurrence (process instance id, element id, then activation), and enabled
 * interactions by their kind's wait rank and then occurrence; every other list keeps the order in which its items
 * opened. Evaluation requests are internal and never published. Every sort is Lean's stable `List.mergeSort` with
 * Lean's `String` order.
 */
import {
  assertNever,
  compareStrings,
  mergeSort,
  type MultiInstanceMode,
  type Program,
} from "./il/types.js";
import { elementEnvelope, programElement } from "./il/query.js";
import {
  InstanceStatus,
  IterationTag,
  OpenKindTag,
  instanceOf,
  multiInstanceRunItems,
  root,
  type Binding,
  type CompensationFailure,
  type EffectDetail,
  type Iteration,
  type MessageChannel,
  type OccurrenceRef,
  type OpenItem,
  type OpenKind,
  type State,
} from "./state.js";

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

/** The published wait kind of an open item and its rank in `activeWaits`; evaluation requests are not waits. */
export function waitKind(kind: OpenKind): readonly [string, number] | null {
  switch (kind.tag) {
    case OpenKindTag.UserTask:
      return ["userTask", 0];
    case OpenKindTag.Message:
      return ["message", 1];
    case OpenKindTag.Timer:
      return ["timer", 2];
    case OpenKindTag.Effect:
      return ["effect", 3];
    case OpenKindTag.Incident:
      return ["incident", 4];
    case OpenKindTag.Evaluation:
      return null;
  }
  return assertNever(kind);
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
export function activeWaitsInOpenOrder(items: readonly OpenItem[]): readonly ActiveWait[] {
  return items.reduce<readonly ActiveWait[]>((waits, item) => {
    const published = waitKind(item.kind);
    if (published === null) {
      return waits;
    }
    const [kind, rank] = published;
    const matches = (wait: ActiveWait): boolean => wait.elementId === item.element && wait.kind === kind;
    return waits.some(matches)
      ? waits.map((wait) => (matches(wait) ? { ...wait, multiplicity: wait.multiplicity + 1 } : wait))
      : [...waits, { elementId: item.element, kind, rank, multiplicity: 1 }];
  }, []);
}

/**
 * One wait per element and kind, counting its open items, ordered by kind (user task, message, timer, effect,
 * incident) and then by element id, as every retained baseline state orders them (994 of 994, 2026-11-08).
 */
export function activeWaits(items: readonly OpenItem[]): readonly ActiveWait[] {
  return mergeSort(activeWaitsInOpenOrder(items), (left, right) =>
    left.rank < right.rank || (left.rank === right.rank && compareStrings(left.elementId, right.elementId) <= 0));
}

export function occurrenceId(state: State, item: OpenItem): OccurrenceId {
  return { processInstanceId: instanceOf(state, item.scope), elementId: item.element, activation: item.activation };
}

export function effect(id: OccurrenceId, detail: EffectDetail): OpenEffect {
  return { id, protocol: detail.protocol, operation: detail.operation, arguments: detail.arguments };
}

export function userTask(state: State, item: OpenItem): OpenUserTask | null {
  const kind = item.kind;
  switch (kind.tag) {
    case OpenKindTag.UserTask:
      return {
        id: occurrenceId(state, item),
        name: kind.detail.name,
        candidateGroups: kind.detail.candidateGroups,
        formFields: kind.detail.formFields,
        inputs: kind.detail.inputs,
      };
    case OpenKindTag.Message:
    case OpenKindTag.Timer:
    case OpenKindTag.Effect:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return null;
  }
  return assertNever(kind);
}

export function messageSubscription(state: State, item: OpenItem): OpenMessageSubscription | null {
  const kind = item.kind;
  switch (kind.tag) {
    case OpenKindTag.Message:
      return { id: occurrenceId(state, item), channel: kind.detail.channel };
    case OpenKindTag.UserTask:
    case OpenKindTag.Timer:
    case OpenKindTag.Effect:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return null;
  }
  return assertNever(kind);
}

export function timer(state: State, item: OpenItem): OpenTimer | null {
  const kind = item.kind;
  switch (kind.tag) {
    case OpenKindTag.Timer:
      return { id: occurrenceId(state, item), deadlineMs: kind.detail.deadlineMs };
    case OpenKindTag.UserTask:
    case OpenKindTag.Message:
    case OpenKindTag.Effect:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return null;
  }
  return assertNever(kind);
}

export function openEffect(state: State, item: OpenItem): OpenEffect | null {
  const kind = item.kind;
  switch (kind.tag) {
    case OpenKindTag.Effect:
      return effect(occurrenceId(state, item), kind.detail);
    case OpenKindTag.UserTask:
    case OpenKindTag.Message:
    case OpenKindTag.Timer:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return null;
  }
  return assertNever(kind);
}

export function incident(state: State, item: OpenItem): OpenIncident | null {
  const kind = item.kind;
  switch (kind.tag) {
    case OpenKindTag.Incident:
      return { effect: effect(occurrenceId(state, item), kind.detail.effect), generation: kind.detail.generation };
    case OpenKindTag.UserTask:
    case OpenKindTag.Message:
    case OpenKindTag.Timer:
    case OpenKindTag.Effect:
    case OpenKindTag.Evaluation:
      return null;
  }
  return assertNever(kind);
}

/** The sort key of an enabled interaction: its kind's wait rank, then its occurrence. */
export function enabledInteractionKey(interaction: EnabledInteraction): readonly [number, OccurrenceId] {
  switch (interaction.tag) {
    case EnabledInteractionTag.CompleteUserTask:
      return [0, interaction.task];
    case EnabledInteractionTag.DeliverMessage:
      return [1, interaction.subscription];
    case EnabledInteractionTag.DeliverPayloadMessage:
      return [1, interaction.subscription];
    case EnabledInteractionTag.PublishCorrelatedPayloadMessage:
      return [1, interaction.subscription];
    case EnabledInteractionTag.RetryIncident:
      return [4, interaction.effect];
    case EnabledInteractionTag.CancelIncidentProcess:
      return [4, interaction.effect];
  }
  return assertNever(interaction);
}

export function occurrenceIdLe(left: OccurrenceId, right: OccurrenceId): boolean {
  const instance = compareStrings(left.processInstanceId, right.processInstanceId);
  if (instance !== 0) {
    return instance < 0;
  }
  const element = compareStrings(left.elementId, right.elementId);
  return element !== 0 ? element < 0 : left.activation <= right.activation;
}

export function interactions(state: State, item: OpenItem): readonly EnabledInteraction[] {
  const id = occurrenceId(state, item);
  const kind = item.kind;
  switch (kind.tag) {
    case OpenKindTag.UserTask:
      return [{ tag: EnabledInteractionTag.CompleteUserTask, task: id }];
    case OpenKindTag.Message: {
      const { channel, correlationKey, payload } = kind.detail;
      if (correlationKey !== null) {
        return [{ tag: EnabledInteractionTag.PublishCorrelatedPayloadMessage, subscription: id, channel, correlationKey }];
      }
      return [
        payload
          ? { tag: EnabledInteractionTag.DeliverPayloadMessage, subscription: id, channel }
          : { tag: EnabledInteractionTag.DeliverMessage, subscription: id, channel },
      ];
    }
    case OpenKindTag.Incident:
      return [
        { tag: EnabledInteractionTag.RetryIncident, effect: id, generation: kind.detail.generation },
        ...(kind.detail.cancellable
          ? [{ tag: EnabledInteractionTag.CancelIncidentProcess, effect: id, generation: kind.detail.generation } as const]
          : []),
      ];
    case OpenKindTag.Timer:
    case OpenKindTag.Effect:
    case OpenKindTag.Evaluation:
      return [];
  }
  return assertNever(kind);
}

export function reference(ref: OccurrenceRef): OccurrenceId {
  return { processInstanceId: ref.processInstanceId, elementId: ref.element, activation: ref.activation };
}

/**
 * A trigger is published under an identity distinct from its throwing element's, `operation:<element>`, as the
 * compensation trigger account requires and the retained baselines publish (`compensation-failure-*`,
 * `transaction-cancellation-handler-failed`).
 */
export function failure(record: CompensationFailure): PublishedFailure {
  const trigger = reference(record.trigger);
  return {
    trigger: { ...trigger, elementId: `operation:${trigger.elementId}` },
    handler: reference(record.handler),
    effect: reference(record.effect),
    code: record.code,
    message: record.message,
  };
}

function present<T>(value: T | null): value is T {
  return value !== null;
}

export function observe(state: State): Observation {
  const items = state.openItems;
  const byOccurrence = <T extends { readonly id: OccurrenceId }>(values: readonly T[]): readonly T[] =>
    mergeSort(values, (left, right) => occurrenceIdLe(left.id, right.id));
  return {
    instanceId: state.instanceId,
    status: statusName(state.status),
    activeWaits: activeWaits(items),
    openUserTasks: byOccurrence(items.map((item) => userTask(state, item)).filter(present)),
    openMessageSubscriptions: items.map((item) => messageSubscription(state, item)).filter(present),
    openTimers: items.map((item) => timer(state, item)).filter(present),
    openEffects: byOccurrence(items.map((item) => openEffect(state, item)).filter(present)),
    openIncidents: items.map((item) => incident(state, item)).filter(present),
    variables: mergeSort(
      state.variables.find((vars) => vars.scope === root)?.entries ?? [],
      (left, right) => compareStrings(left[0], right[0]) <= 0,
    ),
    enabledInteractions: mergeSort(items.flatMap((item) => interactions(state, item)), (left, right) => {
      const [leftRank, leftId] = enabledInteractionKey(left);
      const [rightRank, rightId] = enabledInteractionKey(right);
      return leftRank < rightRank || (leftRank === rightRank && occurrenceIdLe(leftId, rightId));
    }),
    logicalTimeMs: state.logicalTimeMs,
    failure: state.failure === null ? null : failure(state.failure),
  };
}

// Multi-Instance Activities

/**
 * An open instance: its zero-based position in the input collection, its User Task, the input data item it was
 * given and the output data item its completion submits.
 */
export interface OpenIteration {
  readonly loopCounter: number;
  readonly taskId: OccurrenceId;
  readonly taskInput: Binding;
  readonly completionBindingName: string;
}

/**
 * The schema's `openSequentialMultiInstance` and `openParallelMultiInstance`: the Activity's occurrence, its mode,
 * and the instance counts of BPMN 2.0.2 Table 10.30; an instance is never terminated in a state that keeps it.
 */
export interface OpenMultiInstance {
  readonly processInstanceId: string;
  readonly activityElementId: string;
  readonly activation: number;
  readonly mode: string;
  readonly plannedInstanceCount: number;
  readonly pendingItemCount: number;
  readonly numberOfInstances: number;
  readonly numberOfActiveInstances: number;
  readonly numberOfCompletedInstances: number;
  readonly activeIterations: readonly OpenIteration[];
}

/**
 * A program publishes `openMultiInstances`, in every state, exactly when it declares a Multi-Instance Activity or
 * Scope, as the frozen evaluator does (`BpmnSemantics.SemanticProcess.hasMultiInstanceDefinitions`).
 */
export function publishesMultiInstances(program: Program): boolean {
  return program.elements.some((element) => (elementEnvelope(element)?.multiInstance ?? null) !== null);
}

export function isCompleted(iteration: Iteration): boolean {
  switch (iteration.tag) {
    case IterationTag.Completed:
      return true;
    case IterationTag.Waiting:
    case IterationTag.Active:
      return false;
  }
  return assertNever(iteration);
}

/** The open Multi-Instance Activities in the order they were entered; `modeName` is `Hooks.multiInstanceMode`. */
export function multiInstances(
  modeName: (mode: MultiInstanceMode) => string,
  program: Program,
  state: State,
): readonly OpenMultiInstance[] {
  return state.slots.multiInstances.runs.flatMap((run) => {
    const element = programElement(program, run.element);
    const loop = element === null ? null : (elementEnvelope(element)?.multiInstance ?? null);
    const input = loop?.inputDataItem ?? null;
    const output = loop?.outputDataItem ?? null;
    const items = multiInstanceRunItems(run);
    if (loop === null || input === null || output === null || items === null) {
      return [];
    }
    const iterations = run.instances.flatMap((slot, index): OpenIteration[] => {
      switch (slot.tag) {
        case IterationTag.Active: {
          const item = state.openItems.find((candidate) => candidate.id === slot.item);
          const value = items[index];
          return item === undefined || value === undefined
            ? []
            : [{ loopCounter: index, taskId: occurrenceId(state, item), taskInput: [input, value], completionBindingName: output }];
        }
        case IterationTag.Waiting:
        case IterationTag.Completed:
          return [];
      }
      return assertNever(slot);
    });
    const completed = run.instances.filter(isCompleted).length;
    const generated = iterations.length + completed;
    return [{
      processInstanceId: instanceOf(state, run.scope),
      activityElementId: run.element,
      activation: run.activation,
      mode: modeName(loop.mode),
      plannedInstanceCount: run.instances.length,
      pendingItemCount: Math.max(0, run.instances.length - generated),
      numberOfInstances: generated,
      numberOfActiveInstances: iterations.length,
      numberOfCompletedInstances: completed,
      activeIterations: iterations,
    }];
  });
}
