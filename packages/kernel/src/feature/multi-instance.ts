/**
 * Multi-Instance Activities, transcribed from `Kernel/Feature/MultiInstance.lean`.
 *
 * Owns matching on `MultiInstanceMode` and the Multi-Instance body. A token reaching an Activity with Multi-Instance
 * loop characteristics begins the body's occurrence, evaluates the input collection once and, for a nonempty
 * collection, enters the body's scope occurrence, which is the host its boundaries attach to. Each instance runs in a
 * scope occurrence of its own holding its input data item, as an occurrence of the Activity that `feature/work.ts` runs
 * like any other. A parallel Activity enters every instance at once and begins them in item order, under
 * `declarationDepthFirst` each once the one before has reached its next wait, join or end (CIB-OP-0016); a sequential
 * one begins the next after each completion (BPMN 2.0.2 §13.3.7).
 *
 * The resolutions of the parallel and sequential Multi-Instance accounts: an instance's completion submits exactly its
 * output data item, which fills the instance's slot whatever the completion order; the output collection, in item
 * order, is written only when every slot is filled (`PMI-FINISH-01`); a completion condition that holds before then
 * closes the Activity, ending the remaining instances, with no output collection (`PMI-EARLY-01`); an empty collection
 * completes at once with an empty output collection. An interrupting boundary leaves the occurrence with every instance
 * in it and writes nothing (`PMI-TIMER-01`).
 */
import {
  BranchSchedule,
  ExpressionTag,
  InstanceCountTag,
  MultiInstanceBinding,
  MultiInstanceCount,
  MultiInstanceCounters,
  MultiInstanceFinalBody,
  MultiInstanceInputFailure,
  MultiInstanceMode,
  MultiInstanceOutputs,
  ValueTag,
  assertNever,
  elementEnvelope,
  isAscii,
  multiInstanceCounterNames,
  parseJavaInt,
  programElement,
  withinJavaInt,
  type Envelope,
  type Expression,
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
  deferBegins,
  enterScope,
  failed,
  leaveOutgoing,
  signal,
  type BeginRequest,
  type Binding,
  type EvalContext,
  type Iteration,
  type MultiInstanceRun,
  type Occurrence,
  type Outcome,
  type Result,
  type State,
} from "../state.js";
import {
  EvaluationTag, collectionItems, evalContext, hold, leaveScope, multiInstanceRunItems, ownVariables, type Ctx,
} from "../hooks.js";

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

/** The feature's one match on the mode; every mode-specific rule below reads it. */
function sequential(mode: MultiInstanceMode): boolean {
  switch (mode) {
    case MultiInstanceMode.Parallel:
      return false;
    case MultiInstanceMode.Sequential:
      return true;
  }
  return assertNever(mode);
}

/** The instances to begin now: every waiting one in parallel, else the first waiting one once none runs. */
function opening(mode: MultiInstanceMode, instances: readonly Iteration[]): readonly number[] {
  const waiting = instances.flatMap(waitingIndex);
  if (!sequential(mode)) return waiting;
  return instances.some(isActive) ? [] : waiting.slice(0, 1);
}

function slotFilled(slot: Iteration): boolean {
  switch (slot.tag) {
    case IterationTag.Completed:
      return true;
    case IterationTag.Waiting:
    case IterationTag.Active:
      return false;
  }
  return assertNever(slot);
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

function completedOutputs(run: MultiInstanceRun): readonly Value[] {
  return run.instances.flatMap((slot) => {
    const value = output(slot);
    return value === null ? [] : [value];
  });
}

/**
 * The collection a loop reads under the profile's binding: the Data Association reading the reader folds into `count`,
 * or the variable `loopDataInputRef` names (CIB-INT-0014, `BpmnParse#parseMultiInstanceLoopCharacteristics`), which a
 * loop without that element, given by `camunda:collection`, does not have.
 */
function collectionOf(ctx: Ctx, loop: MultiInstance, items: Expression): Expression {
  switch (ctx.program.options.multiInstanceBinding) {
    case MultiInstanceBinding.LoopReferences:
      return loop.loopDataInputRef === null ? items : { tag: ExpressionTag.Variable, name: loop.loopDataInputRef };
    case MultiInstanceBinding.DataAssociations:
      return items;
  }
  return assertNever(ctx.program.options.multiInstanceBinding);
}

/**
 * The local each instance holds its item in under the profile's binding: the Data Input the item's association feeds,
 * or the `inputDataItem`'s `name`, none when it has no name, else `camunda:elementVariable`, which admission admits only
 * without an `inputDataItem` (CIB-INT-0014, `BpmnParse.java:1863-1873`).
 */
function itemName(ctx: Ctx, loop: MultiInstance): string | null {
  switch (ctx.program.options.multiInstanceBinding) {
    case MultiInstanceBinding.DataAssociations:
      return loop.inputDataItem;
    case MultiInstanceBinding.LoopReferences:
      return loop.inputDataItemName ?? loop.elementVariable;
  }
  return assertNever(ctx.program.options.multiInstanceBinding);
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

type Counts = ReadonlyArray<readonly [string, number]>;

/**
 * CIB's counts on the body (CIB-INT-0018): the count, from entry in sequential mode (CIB-INT-0002); the active
 * instances, which CIB never lowers below 1 in sequential mode (`SequentialMultiInstanceActivityBehavior:38-45`,
 * `:47-61`); the completed ones (`ParallelMultiInstanceActivityBehavior:64-68`, `:84-87`).
 */
function bodyCounts(loop: MultiInstance, instances: readonly Iteration[]): Counts {
  const total = instances.length;
  const completed = instances.filter(slotFilled).length;
  const active = sequential(loop.mode) ? 1 : total - completed;
  const [, instancesName, activeName, completedName] = multiInstanceCounterNames;
  return [[instancesName!, total], [activeName!, active], [completedName!, completed]];
}

/** An instance's zero-based `loopCounter` (`MultiInstanceActivityBehavior:76-78`). */
function instanceCounts(index: number): Counts {
  return [[multiInstanceCounterNames[0]!, index]];
}

/**
 * `counts` as the execution locals CIB holds them in (`MultiInstanceActivityBehavior:196-198`) under
 * `MultiInstanceCounters.cibLocals`; the standards reading holds none, Table 10.30's counts being instance attributes no
 * expression names.
 */
function counterLocals(ctx: Ctx, counts: Counts): readonly Binding[] {
  switch (ctx.program.options.multiInstanceCounters) {
    case MultiInstanceCounters.None:
      return [];
    case MultiInstanceCounters.CibLocals:
      return counts.map(([name, count]): Binding => [name, { tag: ValueTag.Int, value: count }]);
  }
  return assertNever(ctx.program.options.multiInstanceCounters);
}

/** Whether `variables` hold exactly the counter locals of `counts`. */
function holdsCounts(ctx: Ctx, variables: readonly Binding[], counts: Counts): boolean {
  return counterLocals(ctx, counts).every(([name, expected]) => {
    const actual = variables.find(([held]) => held === name)?.[1];
    return actual !== undefined && actual.tag === ValueTag.Int && expected.tag === ValueTag.Int && actual.value === expected.value;
  });
}

/**
 * Queue the begins of instances already entered, in item order. Under `declarationDepthFirst` a parallel body defers
 * them onto the closure's work stack, instance 0 on top: CIB creates every instance's execution, then starts them from the
 * last index down onto its LIFO operation queue, so each runs to its next wait, join or end before the next begins, and
 * all of them before the work queued beneath the body (CIB-OP-0016, `ParallelMultiInstanceActivityBehavior:50-61`).
 * Otherwise each begins as a `begin` signal, before any token moves: under `orderInvariant` the order among parallel
 * instances is no BPMN meaning (§13.3.7), and a sequential body's next instance begins from the completion of the one
 * before, where CIB's `createNextInstance` starts it (`SequentialMultiInstanceActivityBehavior:59`).
 */
function queueInstances(ctx: Ctx, mode: MultiInstanceMode, requests: readonly BeginRequest[], state: State): State {
  const signalled = requests.reduce((current, request) => signal(current, { tag: SignalTag.Begin, request }), state);
  switch (ctx.program.options.branchSchedule) {
    case BranchSchedule.OrderInvariant:
      return signalled;
    case BranchSchedule.DeclarationDepthFirst:
      return sequential(mode) ? signalled : deferBegins(state, requests);
  }
  return assertNever(ctx.program.options.branchSchedule);
}

/**
 * Begin the instances `opening` names, each in a scope occurrence holding its input data item and, under `cibLocals`,
 * its `loopCounter`.
 */
function beginInstances(ctx: Ctx, loop: MultiInstance, items: readonly Value[], run: MultiInstanceRun, state: State): State {
  let current = state;
  const instances = [...run.instances];
  const name = itemName(ctx, loop);
  const requests: BeginRequest[] = [];
  for (const index of opening(loop.mode, run.instances)) {
    const value = items[index];
    const locals: readonly Binding[] = [...counterLocals(ctx, instanceCounts(index)), ...(name !== null && value !== undefined ? [[name, value] as Binding] : [])];
    const [entered, scope] = enterScope(current, run.element, run.scope, locals, null);
    current = entered;
    requests.push(beginRequest({ element: run.element, scope, continuation: { tag: ContinuationTag.MultiInstance, body: run.occurrence } }));
    if (index < instances.length) instances[index] = { tag: IterationTag.Active, scope };
  }
  return setRun(queueInstances(ctx, loop.mode, requests, current), { ...run, instances });
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

const notANumber: Result<number> = failed(FailureTag.SemanticFailure, "multiInstance.notANumber");

/** A count, given the rule's width; a refused value is a `semanticFailure` with the rule's code. */
function counted(rule: MultiInstanceCount, count: bigint): Result<number> {
  // Dynamic-only: CIB's `intValue` would keep the low 32 bits.
  if (rule === MultiInstanceCount.JavaInt && !withinJavaInt(count)) return failed(FailureTag.Unsupported, "multiInstance.countRange");
  return count < 0n ? failed(FailureTag.SemanticFailure, "multiInstance.negativeCount") : committed(Number(count));
}

/** `Integer.parseInt` over ASCII text: an optional sign and at least one digit, within `int`. */
function parsedCount(rule: MultiInstanceCount, text: string): Result<number> {
  // Dynamic-only: `Integer.parseInt` reads Unicode digits the kernel does not model.
  if (!isAscii(text)) return failed(FailureTag.Unsupported, "juel.nonAsciiText");
  const parsed = parseJavaInt(text);
  return parsed === null ? notANumber : counted(rule, parsed);
}

/**
 * The instances a cardinality value counts (EXPRESSION-SEMANTICS-SPEC "Multi-Instance level", Results); a value the
 * rule refuses is a `semanticFailure` with the rule's code, which `entryInput` places. Under `integer` only an Integer
 * counts (BPMN 2.0.2 Table 10.29); under `javaInt` CIB's `resolveLoopCardinality` also parses text and takes an
 * integral Decimal, at Java's `int` width (CIB-EXT-0033, `MultiInstanceActivityBehavior:145-155`).
 */
function countOf(rule: MultiInstanceCount, value: Value): Result<number> {
  if (value.tag === ValueTag.Int) return counted(rule, BigInt(value.value));
  if (rule === MultiInstanceCount.Integer) return notANumber;
  switch (value.tag) {
    case ValueTag.Decimal: {
      const unit = 10n ** BigInt(value.scale);
      // Dynamic-only: CIB's `BigDecimal.intValue` truncates a fraction.
      if (value.coefficient % unit !== 0n) return failed(FailureTag.Unsupported, "multiInstance.fractionalCount");
      return counted(rule, value.coefficient / unit);
    }
    case ValueTag.String:
      return parsedCount(rule, value.value);
    case ValueTag.Null:
    case ValueTag.Bool:
    case ValueTag.StringList:
    case ValueTag.List:
    case ValueTag.Map:
      return notANumber;
  }
  return assertNever(value);
}

/**
 * One entry input, read before the domain predicate, under the profile's `MultiInstanceInputFailure` (CIB-INT-0019):
 * `null` when an unavailable input holds the occurrence, as an unavailable InputSet does (BPMN 2.0.2 §10.4.2), and a
 * value `rule` refuses a semantic failure; under `rollback` both fail the operation.
 */
function entryInput<T>(ctx: Ctx, state: State, scope: number, expression: Expression, rule: (value: Value) => Result<T>): Result<T | null> {
  const rollback = ctx.program.options.multiInstanceInputFailure === MultiInstanceInputFailure.Rollback;
  const evaluation = ctx.evaluate({ ...evalContext(state, scope), domainChecked: false }, expression);
  switch (evaluation.tag) {
    case EvaluationTag.Unsupported:
      return failed(FailureTag.Unsupported, evaluation.code);
    case EvaluationTag.Failure:
      return rollback ? failed(FailureTag.RolledBack, evaluation.code) : committed(null);
    case EvaluationTag.Value: {
      const read = rule(evaluation.result);
      if (read.ok || read.failure.tag !== FailureTag.SemanticFailure) return read;
      return failed(rollback ? FailureTag.RolledBack : FailureTag.SemanticFailure, read.failure.code);
    }
  }
  return assertNever(evaluation);
}

type EntryRead = readonly [collection: Value, items: readonly Value[], count: number];

/**
 * What an entry reads: the collection, its items and the number of instances; a cardinality loop's collection is
 * `null` and its instances get no item (`MultiInstanceActivityBehavior:85`).
 */
function entryRead(ctx: Ctx, loop: MultiInstance, state: State, scope: number): Result<EntryRead | null> {
  const count = loop.count;
  switch (count.tag) {
    case InstanceCountTag.Collection: {
      const code = ctx.program.options.multiInstanceInputFailure === MultiInstanceInputFailure.Rollback
        ? "multiInstance.notACollection" : "multi-instance-collection";
      return entryInput(ctx, state, scope, collectionOf(ctx, loop, count.items), (collection): Result<EntryRead> => {
        const members = collectionItems(collection);
        return members === null ? failed(FailureTag.SemanticFailure, code) : committed([collection, members, members.length]);
      });
    }
    case InstanceCountTag.Cardinality:
      return entryInput(ctx, state, scope, count.count, (value): Result<EntryRead> => {
        const instances = countOf(ctx.program.options.multiInstanceCount, value);
        return instances.ok ? committed([{ tag: ValueTag.Null }, [], instances.value]) : instances;
      });
    case InstanceCountTag.CountAndCollection:
      // Admission refuses it (`multiInstance.countAndCollection`).
      return failed(FailureTag.Unsupported, "multiInstance.countAndCollection");
  }
  return assertNever(count);
}

/** `Hooks.arriveMultiInstance`: read the count or collection on entry, then begin the instances. */
export function arriveMultiInstance(
  ctx: Ctx,
  header: Header,
  envelope: Envelope,
  loop: MultiInstance,
  occurrence: Occurrence,
  state: State,
): Outcome {
  const read = entryRead(ctx, loop, state, occurrence.scope);
  if (!read.ok) return read;
  if (read.value === null) {
    if (occurrence.incoming === null) return failed(FailureTag.SemanticFailure, "multi-instance-without-flow");
    return committed(hold(state, { occurrence: occurrence.id, flow: occurrence.incoming, scope: occurrence.scope }));
  }
  const [collection, items, count] = read.value;
  if (count === 0) {
    return committed(signal(state, completeSignal(occurrence.id, leaveOutgoing, written(ctx, loop, collection, []), WriteRule.Outward)));
  }
  const waiting: Iteration = { tag: IterationTag.Waiting };
  const instances = Array.from({ length: count }, () => waiting);
  const [entered, scope] = enterScope(state, header.id, occurrence.scope, counterLocals(ctx, bodyCounts(loop, instances)), occurrence.id);
  const armed = envelope.boundaries.length === 0
    ? entered
    : signal(entered, { tag: SignalTag.Arm, host: occurrence.id, element: header.id, scope: occurrence.scope });
  const run: MultiInstanceRun = { scope, element: header.id, occurrence: occurrence.id, collection, instances };
  return committed(beginInstances(ctx, loop, items, run, armed));
}

/**
 * An instance's output, kept as a String when the input collection is a String List, whose output collection holds
 * Strings only. A loop without an output data item takes the empty OutputSet; what its completion writes are the
 * instance's result locals (`feature/work.ts` `effectCompletion`). `feature/work.ts` has checked a User Task's
 * submission is exactly the output data item.
 */
function submitted(loop: MultiInstance, run: MultiInstanceRun, writes: readonly Binding[]): Result<Value | null> {
  if (loop.outputDataItem === null) return committed(null);
  const [only] = writes;
  if (writes.length !== 1 || only === undefined) return failed(FailureTag.Rejected, "undeclared-output");
  const value = only[1];
  if (run.collection.tag === ValueTag.StringList && value.tag !== ValueTag.String) return failed(FailureTag.Rejected, "instance-output-kind");
  return committed(value);
}

/** The body is done: complete it, writing the output collection when every slot is filled. */
function finish(ctx: Ctx, loop: MultiInstance, run: MultiInstanceRun, state: State): State {
  const writes = run.instances.every(slotFilled) ? written(ctx, loop, run.collection, completedOutputs(run)) : [];
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
  return !sequential(loop.mode);
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

/**
 * What a completion condition reads: the completing instance's scope occurrence, before it is left, so the item and the
 * instance's result locals are visible (BPMN 2.0.2 §13.3.7), and under `cibLocals` CIB's counters (CIB-INT-0018): the
 * instance's zero-based index; the count; the active instances, which CIB never lowers
 * below 1 in sequential mode (`SequentialMultiInstanceActivityBehavior:41`); the completed ones, this one included.
 */
function conditionContext(ctx: Ctx, loop: MultiInstance, run: MultiInstanceRun, index: number, scope: number, state: State): EvalContext {
  const context = evalContext(state, scope);
  const counters = counterLocals(ctx, [...instanceCounts(index), ...bodyCounts(loop, run.instances)]);
  return { ...context, variables: [...counters, ...context.variables] };
}

/**
 * Whether the completion condition holds, read in the instance's scope occurrence before it is left. In sequential
 * mode an earlier instance's result this one did not overwrite, which CIB keeps on the body, has no kernel reading. A
 * failure fails the operation that reached it, so it follows the stimulus table (`MultiInstanceActivityBehavior:157-162`).
 */
function stops(ctx: Ctx, loop: MultiInstance, run: MultiInstanceRun, index: number, scope: number, results: readonly string[],
  state: State): Result<boolean> {
  if (loop.completionCondition === null) return committed(false);
  // Dynamic-only: which names an earlier instance's result left depends on the run's effect results.
  if ((run.results ?? []).some((name) => !results.includes(name))) return failed(FailureTag.Unsupported, "multiInstance.sequentialResultLeftover");
  const evaluation = ctx.evaluate(conditionContext(ctx, loop, run, index, scope, state), loop.completionCondition);
  switch (evaluation.tag) {
    case EvaluationTag.Value:
      return evaluation.result.tag === ValueTag.Bool
        ? committed(evaluation.result.value)
        : failed(FailureTag.RolledBack, "multiInstance.completionNotBoolean");
    case EvaluationTag.Failure:
      return failed(FailureTag.RolledBack, evaluation.code);
    case EvaluationTag.Unsupported:
      return failed(FailureTag.Unsupported, evaluation.code);
  }
  return assertNever(evaluation);
}

/**
 * `Hooks.instanceCompleted`: fill the instance's slot, evaluate the completion condition in the instance's scope
 * occurrence, leave it, then finish, close early or continue.
 */
export function instanceCompleted(ctx: Ctx, body: number, occurrence: Occurrence, writes: readonly Binding[], state: State): Outcome {
  const found = runOf(state, body);
  if (found === null) return failed(FailureTag.SemanticFailure, "instance-without-multi-instance");
  const loop = loopOf(ctx, found);
  if (loop === null) return failed(FailureTag.SemanticFailure, "instance-without-loop");
  const index = found.instances.findIndex((slot) => activeIn(slot, occurrence.scope));
  if (index < 0) return failed(FailureTag.SemanticFailure, "instance-without-slot");
  const value = submitted(loop, found, writes);
  if (!value.ok) return value;
  const results = loop.outputDataItem === null ? writes.map(([name]) => name) : [];
  const item = itemName(ctx, loop);
  const shadows = results.some((name) => multiInstanceCounterNames.includes(name) || name === item);
  const intact = holdsCounts(ctx, ownVariables(state, found.scope), bodyCounts(loop, found.instances)) &&
    holdsCounts(ctx, ownVariables(state, occurrence.scope), instanceCounts(index));
  // Dynamic-only: an effect result's names, and a write that reached a counter local, are the run's data. CIB's next
  // read of a counter is typed (`MultiInstanceActivityBehavior:200-204`); the kernel decides no other value there.
  if (shadows || !intact) return failed(FailureTag.Unsupported, "multiInstance.resultShadowsInstance");
  const instances = [...found.instances];
  instances[index] = { tag: IterationTag.Completed, output: value.value };
  const completed: MultiInstanceRun = { ...found, instances };
  const exhausted = completed.instances.every(slotFilled);
  const stop = exhausted && !evaluatesFinalCondition(ctx, loop) ? committed(false) : stops(ctx, loop, completed, index, occurrence.scope, results, state);
  if (!stop.ok) return stop;
  const kept = sequential(loop.mode) ? [...new Set([...(found.results ?? []), ...results])] : [];
  const run: MultiInstanceRun = { ...completed, results: kept };
  const left = setRun(leaveScope(state, occurrence.scope), run);
  if (stop.value || exhausted) return committed(finish(ctx, loop, run, left));
  const counted = signal(left, { tag: SignalTag.Write, scope: run.scope, writes: counterLocals(ctx, bodyCounts(loop, run.instances)), rule: WriteRule.Own });
  return committed(beginInstances(ctx, loop, multiInstanceRunItems(run) ?? [], run, counted));
}
