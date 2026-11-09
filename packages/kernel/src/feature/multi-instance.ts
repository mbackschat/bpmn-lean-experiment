/**
 * Multi-Instance Activities, transcribed from `Kernel/Feature/MultiInstance.lean`.
 *
 * Owns matching on `MultiInstanceMode` and the Multi-Instance body. A token reaching an Activity with Multi-Instance
 * loop characteristics begins the body's occurrence, evaluates the input collection once and, for a nonempty
 * collection, enters the body's scope occurrence, which is the host its boundaries attach to. Each instance runs in a
 * scope occurrence of its own holding its input data item, as an occurrence of the Activity that `feature/work.ts` runs
 * like any other. A parallel Activity begins every instance at once, a sequential one the next after each completion
 * (BPMN 2.0.2 §13.3.7).
 *
 * The resolutions of the parallel and sequential Multi-Instance accounts: an instance's completion submits exactly its
 * output data item, which fills the instance's slot whatever the completion order; the output collection, in item
 * order, is written only when every slot is filled (`PMI-FINISH-01`); a completion condition that holds before then
 * closes the Activity, ending the remaining instances, with no output collection (`PMI-EARLY-01`); an empty collection
 * completes at once with an empty output collection. An interrupting boundary leaves the occurrence with every instance
 * in it and writes nothing (`PMI-TIMER-01`).
 */
import {
  InstanceCountTag,
  MultiInstanceFinalBody,
  MultiInstanceMode,
  MultiInstanceOutputs,
  ValueTag,
  assertNever,
  elementEnvelope,
  programElement,
  type Envelope,
  type Header,
  type MultiInstance,
  type Value,
} from "../il/types.js";
import {
  ContinuationTag,
  FailureTag,
  IterationTag,
  SignalTag,
  WriteRule,
  beginRequest,
  committed,
  completeSignal,
  enterScope,
  failed,
  leaveOutgoing,
  leaveScope,
  root,
  signal,
  type Binding,
  type Iteration,
  type MultiInstanceRun,
  type Occurrence,
  type Outcome,
  type Result,
  type State,
} from "../state.js";
import { EvaluationTag, evalContext, hold, multiInstanceRunItems, type Ctx } from "../hooks.js";

function waitingIndex(slot: Iteration, index: number): readonly number[] {
  switch (slot.tag) {
    case IterationTag.Waiting:
      return [index];
    case IterationTag.Active:
    case IterationTag.Completed:
      return [];
  }
  return assertNever(slot);
}

function isActive(slot: Iteration): boolean {
  switch (slot.tag) {
    case IterationTag.Active:
      return true;
    case IterationTag.Waiting:
    case IterationTag.Completed:
      return false;
  }
  return assertNever(slot);
}

/** The instances to begin now: every waiting one in parallel, else the first waiting one once none runs. */
function opening(mode: MultiInstanceMode, instances: readonly Iteration[]): readonly number[] {
  const waiting = instances.flatMap(waitingIndex);
  const running = instances.some(isActive);
  switch (mode) {
    case MultiInstanceMode.Parallel:
      return waiting;
    case MultiInstanceMode.Sequential:
      return running ? [] : waiting.slice(0, 1);
  }
  return assertNever(mode);
}

function output(slot: Iteration): Value | null {
  switch (slot.tag) {
    case IterationTag.Completed:
      return slot.output;
    case IterationTag.Waiting:
    case IterationTag.Active:
      return null;
  }
  return assertNever(slot);
}

function outputs(run: MultiInstanceRun): readonly Value[] {
  return run.instances.flatMap((slot) => {
    const value = output(slot);
    return value === null ? [] : [value];
  });
}

function runOf(state: State, body: number): MultiInstanceRun | null {
  return state.slots.multiInstances.find((run) => run.occurrence === body) ?? null;
}

function setRun(state: State, run: MultiInstanceRun): State {
  const runs = state.slots.multiInstances;
  const multiInstances = runs.some((other) => other.occurrence === run.occurrence)
    ? runs.map((other) => (other.occurrence === run.occurrence ? run : other))
    : [...runs, run];
  return { ...state, slots: { ...state.slots, multiInstances } };
}

/** Begin the instances `opening` names, each in a scope occurrence holding its input data item. */
function beginInstances(loop: MultiInstance, items: readonly Value[], run: MultiInstanceRun, state: State): State {
  let current = state;
  const instances = [...run.instances];
  for (const index of opening(loop.mode, run.instances)) {
    const value = items[index];
    const locals: readonly Binding[] = loop.inputDataItem !== null && value !== undefined ? [[loop.inputDataItem, value]] : [];
    const [entered, scope] = enterScope(current, run.element, run.scope, locals, null);
    current = signal(entered, {
      tag: SignalTag.Begin,
      request: beginRequest({ element: run.element, scope, continuation: { tag: ContinuationTag.MultiInstance, body: run.occurrence } }),
    });
    if (index < instances.length) instances[index] = { tag: IterationTag.Active, scope };
  }
  return setRun(current, { ...run, instances });
}

/** The output collection of `outputs` in the form of the input collection: a String List of Strings, else a List. */
function outputCollection(collection: Value, collected: readonly Value[]): Value {
  switch (collection.tag) {
    case ValueTag.StringList:
      return { tag: ValueTag.StringList, items: collected.flatMap((value) => (value.tag === ValueTag.String ? [value.value] : [])) };
    case ValueTag.List:
    case ValueTag.Null:
    case ValueTag.Bool:
    case ValueTag.Int:
    case ValueTag.Decimal:
    case ValueTag.String:
    case ValueTag.Map:
      return { tag: ValueTag.List, items: collected };
  }
  return assertNever(collection);
}

/** The output collection a filled body writes: BPMN 2.0.2 §13.3.7 aggregates; CIB-LIM-0001 selects none. */
function written(ctx: Ctx, loop: MultiInstance, collection: Value, collected: readonly Value[]): readonly Binding[] {
  switch (ctx.program.options.multiInstanceOutputs) {
    case MultiInstanceOutputs.Aggregates:
      return loop.outputCollection === null ? [] : [[loop.outputCollection, outputCollection(collection, collected)]];
    case MultiInstanceOutputs.None:
      return [];
  }
  return assertNever(ctx.program.options.multiInstanceOutputs);
}

/**
 * `Hooks.arriveMultiInstance`. An unavailable input collection holds the occurrence, as an unavailable InputSet does
 * (BPMN 2.0.2 §10.4.2).
 */
export function arriveMultiInstance(
  ctx: Ctx,
  header: Header,
  envelope: Envelope,
  loop: MultiInstance,
  occurrence: Occurrence,
  state: State,
): Outcome {
  const count = loop.count;
  // Admission refuses it (`multiInstance.cardinality`).
  if (count.tag === InstanceCountTag.Cardinality) return failed(FailureTag.Unsupported, "multi-instance-cardinality");
  const evaluation = ctx.evaluate(evalContext(state, occurrence.scope), count.items);
  if (evaluation.tag === EvaluationTag.Failure) {
    if (occurrence.incoming === null) return failed(FailureTag.SemanticFailure, "multi-instance-without-flow");
    return committed(hold(state, { occurrence: occurrence.id, flow: occurrence.incoming, scope: occurrence.scope }));
  }
  const collection = evaluation.result;
  const run: MultiInstanceRun = { scope: root, element: header.id, occurrence: occurrence.id, collection, instances: [] };
  const items = multiInstanceRunItems(run);
  if (items === null) return failed(FailureTag.SemanticFailure, "multi-instance-collection");
  if (items.length === 0) {
    return committed(signal(state, completeSignal(occurrence.id, leaveOutgoing, written(ctx, loop, collection, []), WriteRule.Outward)));
  }
  const [entered, scope] = enterScope(state, header.id, occurrence.scope, [], occurrence.id);
  const armed = envelope.boundaries.length === 0
    ? entered
    : signal(entered, { tag: SignalTag.Arm, host: occurrence.id, element: header.id, scope: occurrence.scope });
  const waiting: Iteration = { tag: IterationTag.Waiting };
  return committed(beginInstances(loop, items, { ...run, scope, instances: items.map(() => waiting) }, armed));
}

/**
 * An instance's output, kept as a String when the input collection is a String List, whose output collection holds
 * Strings only. `feature/work.ts` has checked it is exactly the output data item.
 */
function submitted(run: MultiInstanceRun, writes: readonly Binding[]): Result<Value> {
  const [only] = writes;
  if (writes.length !== 1 || only === undefined) return failed(FailureTag.Rejected, "undeclared-output");
  const value = only[1];
  if (run.collection.tag === ValueTag.StringList && value.tag !== ValueTag.String) return failed(FailureTag.Rejected, "instance-output-kind");
  return committed(value);
}

/** The body is done: complete it, writing the output collection when every slot is filled. */
function finish(ctx: Ctx, loop: MultiInstance, run: MultiInstanceRun, state: State): State {
  const collected = outputs(run);
  const writes = collected.length === run.instances.length ? written(ctx, loop, run.collection, collected) : [];
  return signal(state, completeSignal(run.occurrence, leaveOutgoing, writes, WriteRule.Outward));
}

function loopOf(ctx: Ctx, run: MultiInstanceRun): MultiInstance | null {
  const element = programElement(ctx.program, run.element);
  return (element === null ? null : elementEnvelope(element))?.multiInstance ?? null;
}

/** `Hooks.completeBody`: an idle body has nothing more to run. */
export function completeBody(
  ctx: Ctx,
  _header: Header,
  _envelope: Envelope,
  loop: MultiInstance,
  occurrence: Occurrence,
  state: State,
): Outcome {
  const run = runOf(state, occurrence.id);
  return run === null ? failed(FailureTag.SemanticFailure, "body-without-multi-instance") : committed(finish(ctx, loop, run, state));
}

/**
 * Whether the final completion evaluates the completion condition: BPMN 2.0.2 §13.3.7 evaluates on every completion;
 * CIB tests exhaustion first in sequential mode and the condition first in parallel mode (CIB-INT-0009,
 * `SequentialMultiInstanceActivityBehavior:53`, `ParallelMultiInstanceActivityBehavior:96`).
 */
function evaluatesFinalCondition(ctx: Ctx, loop: MultiInstance): boolean {
  if (ctx.program.options.multiInstanceFinalBody === MultiInstanceFinalBody.ConditionEveryCompletion) return true;
  switch (loop.mode) {
    case MultiInstanceMode.Parallel:
      return true;
    case MultiInstanceMode.Sequential:
      return false;
  }
  return assertNever(loop.mode);
}

function activeIn(slot: Iteration, scope: number): boolean {
  switch (slot.tag) {
    case IterationTag.Active:
      return slot.scope === scope;
    case IterationTag.Waiting:
    case IterationTag.Completed:
      return false;
  }
  return assertNever(slot);
}

/** Whether the completion condition holds after an instance completed. */
function stops(ctx: Ctx, loop: MultiInstance, run: MultiInstanceRun, state: State): Result<boolean> {
  if (loop.completionCondition === null) return committed(false);
  const evaluation = ctx.evaluate(evalContext(state, run.scope), loop.completionCondition);
  switch (evaluation.tag) {
    case EvaluationTag.Value:
      return evaluation.result.tag === ValueTag.Bool
        ? committed(evaluation.result.value)
        : failed(FailureTag.SemanticFailure, "completion-condition-not-boolean");
    case EvaluationTag.Failure:
      return failed(FailureTag.SemanticFailure, evaluation.code);
  }
  return assertNever(evaluation);
}

/**
 * `Hooks.instanceCompleted`: fill the instance's slot, leave its scope occurrence, then finish, close early or
 * continue.
 */
export function instanceCompleted(ctx: Ctx, body: number, occurrence: Occurrence, writes: readonly Binding[], state: State): Outcome {
  const found = runOf(state, body);
  if (found === null) return failed(FailureTag.SemanticFailure, "instance-without-multi-instance");
  const loop = loopOf(ctx, found);
  if (loop === null) return failed(FailureTag.SemanticFailure, "instance-without-loop");
  const index = found.instances.findIndex((slot) => activeIn(slot, occurrence.scope));
  if (index < 0) return failed(FailureTag.SemanticFailure, "instance-without-slot");
  const value = submitted(found, writes);
  if (!value.ok) return value;
  const instances = [...found.instances];
  instances[index] = { tag: IterationTag.Completed, output: value.value };
  const run: MultiInstanceRun = { ...found, instances };
  const left = setRun(leaveScope(state, occurrence.scope), run);
  const exhausted = outputs(run).length === run.instances.length;
  if (exhausted && !evaluatesFinalCondition(ctx, loop)) return committed(finish(ctx, loop, run, left));
  const stop = stops(ctx, loop, run, left);
  if (!stop.ok) return stop;
  if (stop.value || exhausted) return committed(finish(ctx, loop, run, left));
  const items = multiInstanceRunItems(run);
  if (items === null) return failed(FailureTag.SemanticFailure, "multi-instance-collection");
  return committed(beginInstances(loop, items, run, left));
}
