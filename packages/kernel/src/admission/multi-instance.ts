/**
 * Admission of Multi-Instance loop characteristics, transcribed from `Kernel/Admission/MultiInstance.lean`. A
 * refusal carries a stable code.
 *
 * `feature/multi-instance.ts` runs one instance per item of an input collection the Activity reads from a variable
 * once, on entry, gives each instance its item as the input data item and takes the output data item from each
 * completion; it applies no other data mapping to an instance and evaluates a completion condition only in the
 * kernel. Which work an instance may do is admitted by `admission/work.ts`.
 */
import {
  ExpressionTag,
  InstanceCountTag,
  assertNever,
  type Envelope,
  type Expression,
  type InstanceCount,
  type MultiInstance,
} from "../il/types.js";

export function collection(count: InstanceCount): string | null {
  switch (count.tag) {
    case InstanceCountTag.Collection:
      switch (count.items.tag) {
        case ExpressionTag.Variable:
          return null;
        case ExpressionTag.Literal:
          return "multiInstance.collectionExpression";
        case ExpressionTag.SimpleBoolean:
          return "multiInstance.collectionExpression";
        case ExpressionTag.Foreign:
          return "multiInstance.collectionExpression";
      }
      return assertNever(count.items);
    case InstanceCountTag.Cardinality:
      return "multiInstance.cardinality";
  }
  return assertNever(count);
}

export function condition(condition: Expression | null): string | null {
  if (condition === null) {
    return null;
  }
  switch (condition.tag) {
    case ExpressionTag.SimpleBoolean:
      return null;
    case ExpressionTag.Literal:
      return "multiInstance.completionConditionExpression";
    case ExpressionTag.Variable:
      return "multiInstance.completionConditionExpression";
    case ExpressionTag.Foreign:
      return "multiInstance.completionConditionExpression";
  }
  return assertNever(condition);
}

export function activity(envelope: Envelope, loop: MultiInstance): string | null {
  return (
    collection(loop.count) ??
    condition(loop.completionCondition) ??
    (loop.elementVariable !== null
      ? "multiInstance.elementVariable"
      : loop.mutableCollection
        ? "multiInstance.mutableCollection"
        : loop.inputDataItem === null
          ? "multiInstance.inputDataItem"
          : loop.outputDataItem === null
            ? "multiInstance.outputDataItem"
            : envelope.inputs.length !== 0 || envelope.outputs.length !== 0
              ? "multiInstance.mappings"
              : null)
  );
}
