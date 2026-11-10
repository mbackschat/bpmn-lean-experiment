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
  CollectionRead,
  Evaluator,
  ExpressionTag,
  InstanceCountTag,
  MultiInstanceCounters,
  MultiInstanceMode,
  SubmissionRule,
  assertNever,
  type Envelope,
  type Expression,
  type InstanceCount,
  type MultiInstance,
  type ProfileOptions,
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

/** A sequential loop whose collection is `.juel`, which CIB re-evaluates before every later instance (PC-MI-08). */
function rereads(loop: MultiInstance): boolean {
  return loop.mode === MultiInstanceMode.Sequential && loop.count.tag === InstanceCountTag.Collection &&
    loop.count.items.tag === ExpressionTag.Juel;
}

/**
 * An instance's result, given whether its work submits the output data item (`admission/work.ts` `instanceBody`): a
 * User Task's submission fills it, except that a submission installing variables (CIB-EXT-0005) needs none, since CIB's
 * `TaskService.complete` sets each value through the instance's task execution; a Service Task's empty OutputSet fills
 * neither an output data item nor an output collection, which body result effects (PC-MI-10) would.
 */
function result(submission: SubmissionRule, submits: boolean, loop: MultiInstance): string | null {
  if (submits) {
    return loop.outputDataItem === null && submission === SubmissionRule.OutputSet ? "multiInstance.outputDataItem" : null;
  }
  return loop.outputDataItem !== null || loop.outputCollection !== null ? "multiInstance.instanceResult" : null;
}

const counterNames: readonly string[] = ["loopCounter", "nrOfInstances", "nrOfActiveInstances", "nrOfCompletedInstances"];

/**
 * `submits` is `null` for work no instance may do, which `admission/work.ts` refuses. Under the CIB counters an item
 * named like a counter is refused: CIB sets both on one execution, so one overwrites the other. A collection loop needs
 * its input data item; a cardinality loop sets none (`MultiInstanceActivityBehavior:85`).
 */
export function activity(options: ProfileOptions, juel: LoopExpression, submits: boolean | null, envelope: Envelope,
  loop: MultiInstance): string | null {
  const underJuel = options.evaluator === Evaluator.Juel;
  const counters = options.multiInstanceCounters === MultiInstanceCounters.CibLocals;
  const condition = loop.completionCondition;
  const refused = (underJuel ? juelCount(juel, loop.count) : standardCount(loop.count)) ??
    (condition === null ? null : underJuel ? juel(counters, condition) : standardCondition(condition));
  if (refused !== null) return refused;
  if (loop.elementVariable !== null) return "multiInstance.elementVariable";
  if (loop.mutableCollection === CollectionRead.SequentialReread || (underJuel && rereads(loop))) return "multiInstance.mutableCollection";
  if (loop.count.tag !== InstanceCountTag.Cardinality && loop.inputDataItem === null) return "multiInstance.inputDataItem";
  if (counters && [loop.inputDataItem, loop.inputDataItemName].some((name) => name !== null && counterNames.includes(name))) {
    return "multiInstance.itemNamedLikeCounter";
  }
  const unfilled = submits === null ? null : result(options.submission, submits, loop);
  if (unfilled !== null) return unfilled;
  if (envelope.inputs.length > 0 || envelope.outputs.length > 0) return "multiInstance.mappings";
  return null;
}
