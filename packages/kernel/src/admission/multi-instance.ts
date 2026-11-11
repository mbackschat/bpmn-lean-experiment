/**
 * Admission of Multi-Instance loop characteristics, transcribed from `Kernel/Admission/MultiInstance.lean`. A refusal
 * carries a stable code.
 *
 * `feature/multi-instance.ts` runs one instance per item of an input collection, or per count of a cardinality, read
 * once on entry; it gives each instance its item as the input data item and takes the output data item, if any, from
 * each completion; it applies no other data mapping to an instance. Under the standards profile the collection is a
 * variable read and the completion condition Simple Boolean; under `Evaluator.juel` the Multi-Instance level
 * ([expression semantics](../../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#multi-instance-level)) admits
 * JUEL, a variable read and text at all three sites, which `admission/data.ts` `loopExpression` checks. Which work an
 * instance may do is admitted by `admission/work.ts`.
 */
import {
  BranchSchedule,
  CollectionRead,
  Evaluator,
  ExpressionTag,
  InstanceCountTag,
  MultiInstanceBinding,
  MultiInstanceCounters,
  MultiInstanceMode,
  SubmissionRule,
  assertNever,
  multiInstanceCounterNames,
  elementEnvelope,
  programElement,
  type ElementId,
  type Envelope,
  type Expression,
  type InstanceCount,
  type MultiInstance,
  type ProfileOptions,
  type Program,
} from "../il/types.js";

/** A collection under the standards profile: a variable read. */
function standardItems(items: Expression): string | null {
  switch (items.tag) {
    case ExpressionTag.Variable:
      return null;
    case ExpressionTag.Literal:
    case ExpressionTag.SimpleBoolean:
      return "multiInstance.collectionExpression";
    case ExpressionTag.Juel:
    case ExpressionTag.Foreign:
      return "expression.outsideSimpleBoolean";
  }
  return assertNever(items);
}

/** A count under the standards profile; Simple Boolean expresses no Integer, so a cardinality is refused. */
function standardCount(count: InstanceCount): string | null {
  switch (count.tag) {
    case InstanceCountTag.Collection:
      return standardItems(count.items);
    case InstanceCountTag.Cardinality:
      return "multiInstance.cardinality";
    case InstanceCountTag.CountAndCollection:
      return "multiInstance.countAndCollection";
  }
  return assertNever(count);
}

function standardCondition(expression: Expression): string | null {
  switch (expression.tag) {
    case ExpressionTag.SimpleBoolean:
      return null;
    case ExpressionTag.Literal:
    case ExpressionTag.Variable:
      return "multiInstance.completionConditionExpression";
    case ExpressionTag.Juel:
    case ExpressionTag.Foreign:
      return "expression.outsideSimpleBoolean";
  }
  return assertNever(expression);
}

type LoopExpression = (counters: boolean, expression: Expression) => string | null;

/** A count under `Evaluator.juel`, each expression checked by `juel`. */
function juelCount(juel: LoopExpression, count: InstanceCount): string | null {
  switch (count.tag) {
    case InstanceCountTag.Collection:
      return juel(false, count.items);
    case InstanceCountTag.Cardinality:
      return juel(false, count.count);
    case InstanceCountTag.CountAndCollection:
      return "multiInstance.countAndCollection";
  }
  return assertNever(count);
}

/** Whether the loop runs its instances at once, not one after another (BPMN 2.0.2 §13.3.7). */
function runsAtOnce(loop: MultiInstance): boolean {
  switch (loop.mode) {
    case MultiInstanceMode.Parallel:
      return true;
    case MultiInstanceMode.Sequential:
      return false;
  }
  return assertNever(loop.mode);
}

/** A sequential loop whose collection is `.juel`, which CIB re-evaluates before every later instance (PC-MI-08). */
function rereads(loop: MultiInstance): boolean {
  return !runsAtOnce(loop) && loop.count.tag === InstanceCountTag.Collection && loop.count.items.tag === ExpressionTag.Juel;
}

/**
 * An instance's result, given whether its work submits the output data item (`admission/work.ts` `instanceBody`): a
 * User Task's submission fills it, except that a submission installing variables (CIB-EXT-0005) needs none, since CIB's
 * `TaskService.complete` sets each value through the instance's task execution; a Service Task's empty OutputSet fills
 * neither an output data item nor an output collection, which body result effects (PC-MI-10) would.
 */
function instanceResult(submission: SubmissionRule, submits: boolean, loop: MultiInstance): string | null {
  if (submits) {
    return loop.outputDataItem === null && submission === SubmissionRule.OutputSet ? "multiInstance.outputDataItem" : null;
  }
  return loop.outputDataItem !== null || loop.outputCollection !== null ? "multiInstance.instanceResult" : null;
}

/**
 * Whether `camunda:elementVariable` is refused: under the standards binding it is a foreign extension; under
 * `loopReferences` it names the item local (CIB-INT-0014, `BpmnParse.java:1863-1866`) unless the loop also has an
 * `inputDataItem`, whose `name` CIB sets over it (`:1868-1873`) even when absent, which the IL cannot tell from no item.
 */
function elementVariableRefused(options: ProfileOptions, loop: MultiInstance): boolean {
  if (loop.elementVariable === null) return false;
  switch (options.multiInstanceBinding) {
    case MultiInstanceBinding.DataAssociations:
      return true;
    case MultiInstanceBinding.LoopReferences:
      return loop.inputDataItem !== null || loop.inputDataItemName !== null;
  }
  return assertNever(options.multiInstanceBinding);
}

/**
 * Whether `id` or an element enclosing it has Multi-Instance loop characteristics, so a site there runs inside an
 * instance. A called process's elements stop at its level: the called instance holds no caller's counter.
 */
function inInstance(program: Program, fuel: number, id: ElementId | null): boolean {
  if (fuel === 0 || id === null) return false;
  const element = programElement(program, id);
  if (element === null) return false;
  return (elementEnvelope(element)?.multiInstance ?? null) !== null || inInstance(program, fuel - 1, element.header.parent);
}

/**
 * Whether the counter names are variables at a site in `id`'s scope: inside an instance under
 * `MultiInstanceCounters.cibLocals`, where CIB holds them as the instance's and the body's locals
 * (`MultiInstanceActivityBehavior:196-198`). The innermost loop's counters hide an enclosing loop's.
 */
export function countersAt(program: Program, id: ElementId | null): boolean {
  return program.options.multiInstanceCounters === MultiInstanceCounters.CibLocals &&
    inInstance(program, program.elements.length, id);
}

/**
 * The instance names a looping Activity's own input mappings may not read under `loopReferences`: the counters and the
 * item. CIB evaluates them in the parent of the execution entering the Activity (`IoParameter.java:50-51`, run by
 * `PvmExecutionImpl.java:1309-1314`), a choice that depends on whether the inner Activity is a scope and that its
 * source marks legacy; such a read rolls the start back where BPMN 2.0.2 gives each instance its item (CIB-LIM-0019).
 * The standards binding keeps every own input mapping refused (`multiInstance.mappings`).
 */
export function ownInputNames(options: ProfileOptions, loop: MultiInstance): readonly string[] {
  switch (options.multiInstanceBinding) {
    case MultiInstanceBinding.DataAssociations:
      return [];
    case MultiInstanceBinding.LoopReferences: {
      const item = loop.inputDataItemName ?? loop.elementVariable;
      return [...multiInstanceCounterNames, ...(item === null ? [] : [item])];
    }
  }
  return assertNever(options.multiInstanceBinding);
}

/**
 * A mapping, output or result target named like a counter inside an instance, which would overwrite CIB's counter
 * local (`MultiInstanceActivityBehavior:196-198`) before its next typed read (`:200-204`); `counters` is `countersAt`
 * of the scope the targets are written in (CIB-LIM-0020). A write no admission sees stays dynamic
 * (`multiInstance.resultShadowsInstance`).
 */
export function counterTarget(counters: boolean, targets: readonly string[]): string | null {
  return counters && targets.some((target) => multiInstanceCounterNames.includes(target)) ? "multiInstance.counterTarget" : null;
}

/** Whether the loop runs its instances at once, in no order the schedule fixes. */
function unordered(options: ProfileOptions, loop: MultiInstance): boolean {
  switch (options.branchSchedule) {
    case BranchSchedule.DeclarationDepthFirst:
      return false;
    case BranchSchedule.OrderInvariant:
      return runsAtOnce(loop);
  }
  return assertNever(options.branchSchedule);
}

/**
 * Under `BranchSchedule.orderInvariant`, the instances of a parallel loop may not race one another in the closure that
 * begins them (`admission/flow.ts` `instanceClosure`): BPMN 2.0.2 §13.3.7 fixes no order among them, which
 * `feature/multi-instance.ts` leaves to the closure's first-in, first-out queue, so a name an instance writes there, or
 * which instance's completion first satisfies the completion condition and cancels the rest, would depend on an order no
 * input states. `races` and `completes` count conservatively, as `flow.concurrentWrite` does: an instance's write to its
 * own item counts, and so does any completion path. A forward-compatible restriction; CIB's `declarationDepthFirst` runs
 * instance 0 first (CIB-OP-0016). A User, Service or Receive Task instance waits, so its loop is admitted.
 */
export function concurrentInstances(options: ProfileOptions, loop: MultiInstance, races: boolean, completes: boolean): string | null {
  return unordered(options, loop) && (races || (loop.completionCondition !== null && completes))
    ? "multiInstance.concurrentInstances"
    : null;
}

/**
 * `submits` is `null` for work no instance may do, which `admission/work.ts` refuses. Under the CIB counters an item
 * named like a counter is refused: CIB sets both on one execution, so one overwrites the other. A collection loop needs
 * its input data item, or an admitted element variable; a cardinality loop sets none
 * (`MultiInstanceActivityBehavior:85`). Own input mappings are admitted under `loopReferences`, whose reads
 * `ownInputNames` restricts and whose targets `counterTarget` does; own output mappings are a CIB deployment error
 * (`BpmnParse.java:4855-4857`).
 */
export function activityLoop(options: ProfileOptions, juel: LoopExpression, submits: boolean | null, envelope: Envelope,
  loop: MultiInstance): string | null {
  const underJuel = options.evaluator === Evaluator.Juel;
  const counters = options.multiInstanceCounters === MultiInstanceCounters.CibLocals;
  const condition = loop.completionCondition;
  const refused = (underJuel ? juelCount(juel, loop.count) : standardCount(loop.count)) ??
    (condition === null ? null : underJuel ? juel(counters, condition) : standardCondition(condition));
  if (refused !== null) return refused;
  if (elementVariableRefused(options, loop)) return "multiInstance.elementVariable";
  if (loop.mutableCollection === CollectionRead.SequentialReread || (underJuel && rereads(loop))) return "multiInstance.mutableCollection";
  if (loop.count.tag !== InstanceCountTag.Cardinality && loop.inputDataItem === null && loop.elementVariable === null) {
    return "multiInstance.inputDataItem";
  }
  if (counters && [loop.inputDataItem, loop.inputDataItemName, loop.elementVariable]
    .some((name) => name !== null && multiInstanceCounterNames.includes(name))) {
    return "multiInstance.itemNamedLikeCounter";
  }
  const unfilled = submits === null ? null : instanceResult(options.submission, submits, loop);
  if (unfilled !== null) return unfilled;
  if (envelope.outputs.length > 0 || (envelope.inputs.length > 0 && ownInputNames(options, loop).length === 0)) {
    return "multiInstance.mappings";
  }
  return counterTarget(counters, envelope.inputs.map((entry) => entry.target));
}
