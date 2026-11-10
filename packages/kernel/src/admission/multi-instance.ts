/**
 * Admission of Multi-Instance loop characteristics, transcribed from `Kernel/Admission/MultiInstance.lean`. A refusal
 * carries a stable code.
 *
 * `feature/multi-instance.ts` runs one instance per item of an input collection the Activity reads from a variable
 * once, on entry, gives each instance its item as the input data item and takes the output data item, if any, from each
 * completion; it applies no other data mapping to an instance and evaluates a completion condition only in the kernel.
 * Which work an instance may do is admitted by `admission/work.ts`.
 */
import {
  CollectionRead,
  ExpressionTag,
  InstanceCountTag,
  assertNever,
  type Envelope,
  type Expression,
  type InstanceCount,
  type MultiInstance,
} from "../il/types.js";

function collectionItems(items: Expression): string | null {
  switch (items.tag) {
    case ExpressionTag.Variable:
      return null;
    case ExpressionTag.Literal:
    case ExpressionTag.SimpleBoolean:
      return "multiInstance.collectionExpression";
    case ExpressionTag.Juel:
      return "expression.juel.site";
    case ExpressionTag.Foreign:
      return "expression.outsideSimpleBoolean";
  }
  return assertNever(items);
}

function collection(count: InstanceCount): string | null {
  switch (count.tag) {
    case InstanceCountTag.Collection:
      return collectionItems(count.items);
    case InstanceCountTag.Cardinality:
      return "multiInstance.cardinality";
  }
  return assertNever(count);
}

function condition(expression: Expression | null): string | null {
  if (expression === null) return null;
  switch (expression.tag) {
    case ExpressionTag.SimpleBoolean:
      return null;
    case ExpressionTag.Literal:
    case ExpressionTag.Variable:
      return "multiInstance.completionConditionExpression";
    case ExpressionTag.Juel:
      return "expression.juel.site";
    case ExpressionTag.Foreign:
      return "expression.outsideSimpleBoolean";
  }
  return assertNever(expression);
}

/**
 * An instance's result, given whether its work submits the output data item (`admission/work.ts` `instanceBody`): a
 * User Task's submission fills it; a Service Task's empty OutputSet fills neither an output data item nor an output
 * collection, which body result effects (PC-MI-10) would.
 */
function result(submits: boolean, loop: MultiInstance): string | null {
  if (submits) return loop.outputDataItem === null ? "multiInstance.outputDataItem" : null;
  return loop.outputDataItem !== null || loop.outputCollection !== null ? "multiInstance.instanceResult" : null;
}

/** `submits` is `null` for work no instance may do, which `admission/work.ts` refuses. */
export function activity(submits: boolean | null, envelope: Envelope, loop: MultiInstance): string | null {
  const refused = collection(loop.count) ?? condition(loop.completionCondition);
  if (refused !== null) return refused;
  if (loop.elementVariable !== null) return "multiInstance.elementVariable";
  if (loop.mutableCollection === CollectionRead.SequentialReread) return "multiInstance.mutableCollection";
  if (loop.inputDataItem === null) return "multiInstance.inputDataItem";
  const unfilled = submits === null ? null : result(submits, loop);
  if (unfilled !== null) return unfilled;
  if (envelope.inputs.length > 0 || envelope.outputs.length > 0) return "multiInstance.mappings";
  return null;
}
