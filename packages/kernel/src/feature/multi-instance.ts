/**
 * Multi-Instance Activities, transcribed from `Kernel/Feature/MultiInstance.lean`.
 *
 * Owns matching on `MultiInstanceMode`. A token reaching an Activity with Multi-Instance loop characteristics
 * evaluates the input collection once and, for a nonempty collection, enters a scope occurrence of the Activity that
 * holds its instances and is the host its boundaries attach to; each instance is the item `Ctx.bodyWait` names,
 * opened in that occurrence. A parallel Activity opens every instance at once, a sequential one the next after each
 * completion (BPMN 2.0.2 §13.3.7). Instances are numbered by the Activity's element like any occurrence of it; the
 * Activity's own activations are counted apart (`MultiInstances.entered`), as the retained baselines publish them
 * (`parallel-multi-instance-all`).
 *
 * An instance's completion submits exactly its output data item, which fills the instance's slot whatever the
 * completion order; the output collection, in item order, is written only when every slot is filled
 * (`PMI-FINISH-01`); a completion condition that holds before then closes the Activity, ending the remaining
 * instances, with no output collection (`PMI-EARLY-01`); an empty collection completes at once with an empty output
 * collection. An interrupting boundary leaves the occurrence with every instance in it and writes nothing
 * (`PMI-TIMER-01`).
 */
import { EvaluationTag, type Arrival, type Ctx } from "../hooks.js";
import {
  InstanceCountTag,
  MultiInstanceMode,
  ValueTag,
  assertNever,
  type ActivityPayload,
  type ElementId,
  type Expression,
  type Header,
  type InstanceCount,
  type MultiInstance,
  type Value,
} from "../il/types.js";
import {
  FailureTag,
  IterationTag,
  SignalTag,
  closeItem,
  committed,
  disarm,
  emit,
  failed,
  hold,
  issue,
  multiInstanceRunItems,
  leaveScope,
  openAttached,
  root,
  signal,
  visible,
  writeOutward,
  type Binding,
  type Iteration,
  type MultiInstanceRun,
  type OpenItem,
  type Outcome,
  type Result,
  type ScopeOccurrenceId,
  type State,
} from "../state.js";

/** `Hooks.multiInstanceMode`. */
export function modeName(mode: MultiInstanceMode): string {
  switch (mode) {
    case MultiInstanceMode.Sequential:
      return "sequential";
    case MultiInstanceMode.Parallel:
      return "parallel";
  }
  return assertNever(mode);
}

function isWaiting(slot: Iteration): boolean {
  switch (slot.tag) {
    case IterationTag.Waiting:
      return true;
    case IterationTag.Active:
      return false;
    case IterationTag.Completed:
      return false;
  }
  return assertNever(slot);
}

function isActive(slot: Iteration): boolean {
  switch (slot.tag) {
    case IterationTag.Active:
      return true;
    case IterationTag.Waiting:
      return false;
    case IterationTag.Completed:
      return false;
  }
  return assertNever(slot);
}

/** The instances to open now: every waiting one in parallel, else the first waiting one once none runs. */
export function opening(mode: MultiInstanceMode, instances: readonly Iteration[]): readonly number[] {
  const waiting = instances.flatMap((slot, index) => (isWaiting(slot) ? [index] : []));
  const running = instances.some(isActive);
  switch (mode) {
    case MultiInstanceMode.Parallel:
      return waiting;
    case MultiInstanceMode.Sequential:
      return running ? [] : waiting.slice(0, 1);
  }
  return assertNever(mode);
}

export function output(slot: Iteration): Value | null {
  switch (slot.tag) {
    case IterationTag.Completed:
      return slot.output;
    case IterationTag.Waiting:
      return null;
    case IterationTag.Active:
      return null;
  }
  return assertNever(slot);
}

export function runOf(state: State, scope: ScopeOccurrenceId): MultiInstanceRun | null {
  return state.slots.multiInstances.runs.find((run) => run.scope === scope) ?? null;
}

export function setRun(state: State, run: MultiInstanceRun): State {
  const existing = state.slots.multiInstances.runs;
  const runs = existing.some((other) => other.scope === run.scope)
    ? existing.map((other) => (other.scope === run.scope ? run : other))
    : [...existing, run];
  return {
    ...state,
    slots: { ...state.slots, multiInstances: { ...state.slots.multiInstances, runs } },
  };
}

/** The next activation of the Multi-Instance Activity `element`, recorded. */
export function enter(state: State, element: ElementId): readonly [State, number] {
  const entered = state.slots.multiInstances.entered;
  const count = (entered.find((entry) => entry[0] === element)?.[1] ?? 0) + 1;
  return [
    {
      ...state,
      slots: {
        ...state.slots,
        multiInstances: {
          ...state.slots.multiInstances,
          entered: [[element, count] as const, ...entered.filter((entry) => entry[0] !== element)],
        },
      },
    },
    count,
  ];
}

function replaceAt<T>(list: readonly T[], index: number, value: T): readonly T[] {
  return list.map((item, position) => (position === index ? value : item));
}

/** Open the instances `opening` names. */
export function openInstances(
  ctx: Ctx,
  payload: ActivityPayload,
  loop: MultiInstance,
  run: MultiInstanceRun,
  state: State,
): Outcome {
  const kind = ctx.bodyWait(payload);
  if (kind === null) {
    return failed(FailureTag.Unsupported, "multi-instance-body");
  }
  let current = state;
  let instances = run.instances;
  for (const index of opening(loop.mode, run.instances)) {
    const [opened, item] = openAttached(current, kind, run.element, run.scope, null);
    current = opened;
    instances = replaceAt(instances, index, { tag: IterationTag.Active, item });
  }
  return committed(setRun(current, { ...run, instances }));
}

/**
 * Leave the Activity's occurrence, ending every instance left in it and its boundaries, write `outputs` outward from
 * the enclosing occurrence and take the Activity's outgoing flows there.
 */
export function leave(
  payload: ActivityPayload,
  run: MultiInstanceRun,
  outputs: readonly Binding[],
  state: State,
): State {
  const parent = state.scopes.find((occurrence) => occurrence.id === run.scope)?.parent ?? root;
  const left = disarm(leaveScope(state, run.scope), run.scope);
  const wrote = outputs.reduce((current, binding) => writeOutward(current, parent, binding), left);
  return emit(wrote, payload.envelope.outgoing, parent);
}

/** The output collection of `outputs` in the form of the input collection: a String List of Strings, else a List. */
export function outputCollection(collection: Value, outputs: readonly Value[]): Value {
  switch (collection.tag) {
    case ValueTag.StringList:
      return {
        tag: ValueTag.StringList,
        items: outputs.flatMap((value): string[] => {
          switch (value.tag) {
            case ValueTag.String:
              return [value.value];
            case ValueTag.Null:
              return [];
            case ValueTag.Bool:
              return [];
            case ValueTag.Int:
              return [];
            case ValueTag.Decimal:
              return [];
            case ValueTag.StringList:
              return [];
            case ValueTag.List:
              return [];
            case ValueTag.Map:
              return [];
          }
          return assertNever(value);
        }),
      };
    case ValueTag.List:
      return { tag: ValueTag.List, items: outputs };
    case ValueTag.Null:
      return { tag: ValueTag.List, items: outputs };
    case ValueTag.Bool:
      return { tag: ValueTag.List, items: outputs };
    case ValueTag.Int:
      return { tag: ValueTag.List, items: outputs };
    case ValueTag.Decimal:
      return { tag: ValueTag.List, items: outputs };
    case ValueTag.String:
      return { tag: ValueTag.List, items: outputs };
    case ValueTag.Map:
      return { tag: ValueTag.List, items: outputs };
  }
  return assertNever(collection);
}

export function written(loop: MultiInstance, collection: Value, outputs: readonly Value[]): readonly Binding[] {
  return loop.outputCollection === null ? [] : [[loop.outputCollection, outputCollection(collection, outputs)]];
}

function collectionSource(count: InstanceCount): Result<Expression> {
  switch (count.tag) {
    case InstanceCountTag.Collection:
      return committed(count.items);
    case InstanceCountTag.Cardinality:
      return failed(FailureTag.Unsupported, "multi-instance-cardinality");
  }
  return assertNever(count);
}

/**
 * `Hooks.arriveMultiInstance`. An unavailable input collection holds the token, as an unavailable InputSet does
 * (BPMN 2.0.2 §10.4.2).
 */
export function arriveMultiInstance(
  ctx: Ctx,
  header: Header,
  payload: ActivityPayload,
  loop: MultiInstance,
  arrival: Arrival,
  state: State,
): Outcome {
  const source = collectionSource(loop.count);
  if (!source.ok) {
    return source;
  }
  const evaluation = ctx.evaluate(visible(state, arrival.scope), source.value);
  switch (evaluation.tag) {
    case EvaluationTag.NeedsHost:
      return failed(FailureTag.Unsupported, "host-evaluation");
    case EvaluationTag.Failure:
      return committed(hold(state, { flow: arrival.flow, scope: arrival.scope }));
    case EvaluationTag.Value:
      return arriveWith(ctx, header, payload, loop, arrival, evaluation.result, state);
  }
  return assertNever(evaluation);
}

function arriveWith(
  ctx: Ctx,
  header: Header,
  payload: ActivityPayload,
  loop: MultiInstance,
  arrival: Arrival,
  collection: Value,
  state: State,
): Outcome {
  const [entered, activation] = enter(state, header.id);
  const [issued, scope] = issue(entered);
  const run: MultiInstanceRun = { scope, element: header.id, activation, collection, instances: [] };
  const members = multiInstanceRunItems(run);
  if (members === null) {
    return failed(FailureTag.SemanticFailure, "multi-instance-collection");
  }
  if (members.length === 0) {
    const wrote = written(loop, collection, []).reduce(
      (current, binding) => writeOutward(current, arrival.scope, binding),
      issued,
    );
    return committed(emit(wrote, payload.envelope.outgoing, arrival.scope));
  }
  const withScope: State = {
    ...issued,
    scopes: [
      ...issued.scopes,
      {
        id: scope,
        element: header.id,
        parent: arrival.scope,
        activation,
        calledInstance: null,
        compensating: false,
      },
    ],
  };
  const armed =
    payload.envelope.boundaries.length === 0
      ? withScope
      : signal(withScope, { tag: SignalTag.Arm, host: scope, element: header.id, scope: arrival.scope });
  return openInstances(ctx, payload, loop, { ...run, instances: members.map(() => ({ tag: IterationTag.Waiting })) }, armed);
}

/**
 * The value an instance's completion submits for its output data item: exactly that one name, and a String when the
 * input collection is a String List, whose output collection holds Strings only.
 */
export function submitted(loop: MultiInstance, run: MultiInstanceRun, values: readonly Binding[]): Result<Value> {
  const name = loop.outputDataItem;
  if (name === null) {
    return failed(FailureTag.Rejected, "undeclared-output");
  }
  if (values.length === 0) {
    return failed(FailureTag.Rejected, "output-unavailable");
  }
  const [only, ...rest] = values;
  if (only === undefined || rest.length !== 0) {
    return failed(FailureTag.Rejected, "undeclared-output");
  }
  const [submittedName, value] = only;
  if (submittedName !== name) {
    return failed(FailureTag.Rejected, "undeclared-output");
  }
  switch (run.collection.tag) {
    case ValueTag.StringList:
      switch (value.tag) {
        case ValueTag.String:
          return committed(value);
        case ValueTag.Null:
        case ValueTag.Bool:
        case ValueTag.Int:
        case ValueTag.Decimal:
        case ValueTag.StringList:
        case ValueTag.List:
        case ValueTag.Map:
          return failed(FailureTag.Rejected, "instance-output-kind");
      }
      return assertNever(value);
    case ValueTag.Null:
    case ValueTag.Bool:
    case ValueTag.Int:
    case ValueTag.Decimal:
    case ValueTag.String:
    case ValueTag.List:
    case ValueTag.Map:
      return committed(value);
  }
  return assertNever(run.collection);
}

/** Whether the completion condition holds over `variables`; an Activity without one never closes early. */
function stops(ctx: Ctx, condition: Expression | null, variables: readonly Binding[]): Result<boolean> {
  if (condition === null) {
    return committed(false);
  }
  const evaluation = ctx.evaluate(variables, condition);
  switch (evaluation.tag) {
    case EvaluationTag.Value:
      return booleanResult(evaluation.result);
    case EvaluationTag.NeedsHost:
      return failed(FailureTag.Unsupported, "host-evaluation");
    case EvaluationTag.Failure:
      return failed(FailureTag.SemanticFailure, evaluation.code);
  }
  return assertNever(evaluation);
}

function booleanResult(value: Value): Result<boolean> {
  switch (value.tag) {
    case ValueTag.Bool:
      return committed(value.value);
    case ValueTag.Null:
    case ValueTag.Int:
    case ValueTag.Decimal:
    case ValueTag.String:
    case ValueTag.StringList:
    case ValueTag.List:
    case ValueTag.Map:
      return failed(FailureTag.SemanticFailure, "completion-condition-not-boolean");
  }
  return assertNever(value);
}

/** `Hooks.completeInstance`: fill the instance's slot, then finish, close early or continue. */
export function completeInstance(
  ctx: Ctx,
  _header: Header,
  payload: ActivityPayload,
  loop: MultiInstance,
  item: OpenItem,
  values: readonly Binding[],
  state: State,
): Outcome {
  const found = runOf(state, item.scope);
  if (found === null) {
    return failed(FailureTag.SemanticFailure, "instance-without-multi-instance");
  }
  const index = found.instances.findIndex((slot) => {
    switch (slot.tag) {
      case IterationTag.Active:
        return slot.item === item.id;
      case IterationTag.Waiting:
        return false;
      case IterationTag.Completed:
        return false;
    }
    return assertNever(slot);
  });
  if (index < 0) {
    return failed(FailureTag.SemanticFailure, "instance-without-slot");
  }
  const value = submitted(loop, found, values);
  if (!value.ok) {
    return value;
  }
  const run: MultiInstanceRun = {
    ...found,
    instances: replaceAt(found.instances, index, { tag: IterationTag.Completed, output: value.value }),
  };
  const closed = setRun(disarm(closeItem(state, item.id), item.id), run);
  const outputs = run.instances.flatMap((slot) => {
    const filled = output(slot);
    return filled === null ? [] : [filled];
  });
  if (outputs.length === run.instances.length) {
    return committed(leave(payload, run, written(loop, run.collection, outputs), closed));
  }
  const stop = stops(ctx, loop.completionCondition, visible(closed, run.scope));
  if (!stop.ok) {
    return stop;
  }
  return stop.value ? committed(leave(payload, run, [], closed)) : openInstances(ctx, payload, loop, run, closed);
}
