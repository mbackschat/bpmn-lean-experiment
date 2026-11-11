/**
 * Read and write footprints, transcribed from `Kernel/IL/Footprint.lean`: what an expression, a mapping list or an
 * element reads and writes, over-approximated where the text cannot show it: a JUEL or foreign expression reads every
 * name, and a Multi-Instance definition reads every name when its element begins. `admission/flow.ts` compares branch
 * footprints for `BranchSchedule.OrderInvariant`.
 */
import {
  ExpressionTag,
  SimpleBooleanTag,
  assertNever,
  elementActivity,
  elementEnvelope,
  elementOutgoing,
  programFlow,
  workCall,
  type Element,
  type Expression,
  type Mapping,
  type Program,
} from "./types.js";

/** A set of variable names, or every name. */
export type NameSet = Readonly<{ names: readonly string[]; all: boolean }>;

export const noNames: NameSet = { names: [], all: false };

export const union = (left: NameSet, right: NameSet): NameSet => ({ names: [...left.names, ...right.names], all: left.all || right.all });

export const meets = (left: NameSet, right: NameSet): boolean =>
  (left.all && (right.all || right.names.length > 0)) || (right.all && left.names.length > 0) ||
  left.names.some((name) => right.names.includes(name));

/** What a branch reads and writes within one closure. */
export type Footprint = Readonly<{ reads: NameSet; writes: NameSet }>;

export const joined = (left: Footprint, right: Footprint): Footprint =>
  ({ reads: union(left.reads, right.reads), writes: union(left.writes, right.writes) });

/** Whether one branch's writes meet the other's reads or writes, in either direction. */
export const races = (left: Footprint, right: Footprint): boolean =>
  meets(left.writes, union(right.reads, right.writes)) || meets(right.writes, left.reads);

/**
 * The names an expression reads. A JUEL or foreign text counts as reading every name: a JUEL method or the `execution`
 * object can read a variable no identifier names.
 */
export function expressionReads(expression: Expression): NameSet {
  switch (expression.tag) {
    case ExpressionTag.Literal:
      return noNames;
    case ExpressionTag.Variable:
      return { names: [expression.name], all: false };
    case ExpressionTag.SimpleBoolean:
      return expression.body.tag === SimpleBooleanTag.Literal ? noNames : { names: [expression.body.name], all: false };
    case ExpressionTag.Juel:
    case ExpressionTag.Foreign:
      return { names: [], all: true };
  }
  return assertNever(expression);
}

export const mappingReads = (mappings: readonly Mapping[]): NameSet =>
  mappings.reduce((found, mapping) => union(found, expressionReads(mapping.source)), noNames);

/**
 * What `element` reads when it begins: its input mappings, and every name for a Multi-Instance definition, whose count,
 * collection and condition it evaluates then or later in the closure.
 */
export function beginReads(element: Element): NameSet {
  const envelope = elementEnvelope(element);
  return envelope === null ? noNames : union(mappingReads(envelope.inputs), { names: [], all: envelope.multiInstance !== null });
}

/**
 * What `element` reads and writes when it runs through in the closure: it begins, its outputs read their sources and
 * write their targets, a Call maps its inputs and outputs, and its outgoing conditions are evaluated.
 */
export function footprint(program: Program, element: Element): Footprint {
  const outputs = elementEnvelope(element)?.outputs ?? [];
  const activity = elementActivity(element);
  const call = activity === null ? null : workCall(activity[1].work);
  const conditions = elementOutgoing(element).flatMap((id) => {
    const condition = programFlow(program, id)?.condition ?? null;
    return condition === null ? [] : [condition];
  }).reduce((found, condition) => union(found, expressionReads(condition)), noNames);
  return {
    reads: union(union(beginReads(element), mappingReads(outputs)), union(call === null ? noNames : mappingReads(call.inputs), conditions)),
    writes: {
      names: [...outputs.map((mapping) => mapping.target), ...(call?.outputs ?? []).map((mapping) => mapping.target)],
      all: call?.propagateAllOutputs === true,
    },
  };
}
