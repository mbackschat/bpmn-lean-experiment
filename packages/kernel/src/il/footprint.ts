/**
 * Read and write footprints, transcribed from `Kernel/IL/Footprint.lean`: what an expression, a mapping list or an
 * element reads and writes, over-approximated where the text cannot show it: a JUEL or foreign expression reads every
 * name, and a Multi-Instance definition reads every name when its element begins. `admission/flow.ts` compares branch
 * footprints for `BranchSchedule.OrderInvariant`, and `writes` is the one account of what an element writes, which that
 * closure walk and `feature/compensation.ts`'s data dependency both read.
 */
import {
  ExpressionTag,
  SimpleBooleanTag,
  assertNever,
  elementActivity,
  elementEnvelope,
  elementEvent,
  elementOutgoing,
  elementScope,
  elementStart,
  eventPayloadCatch,
  eventPayloadThrow,
  programFlow,
  scopeKindStart,
  throwView,
  triggerView,
  workCall,
  workResults,
  type Element,
  type Expression,
  type Mapping,
  type Program,
  type Subscription,
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

/**
 * The names a catch writes when it fires: its output mappings' targets and the variables its trigger sets from what it
 * caught, an Error's code and message and an Escalation's code (CIB-EXT-0028).
 */
export function catchWrites(subscription: Subscription): readonly string[] {
  return [...subscription.outputs.map((mapping) => mapping.target), ...triggerView(subscription.trigger).variables];
}

/**
 * What `element` writes when it runs, beside its envelope's and a Call's outputs (`footprint`) and what a boundary
 * writes when it fires (`catchWrites`): its work's results, its catch's or start's writes, what its Signal throw's
 * receivers install, a Signal's `camunda:in` targets or every name (CIB-EXT-0043), and its loop's output collection. A
 * loop's counters and items stay in scope occurrences of its own.
 */
export function writes(element: Element): NameSet {
  const activity = elementActivity(element);
  const event = elementEvent(element);
  const start = elementStart(element);
  const scope = elementScope(element);
  const caught = [event === null ? null : eventPayloadCatch(event[1]), start === null ? null : start[1].subscription,
    scope === null ? null : scopeKindStart(scope[1].kind)].filter((subscription) => subscription !== null);
  const record = event === null ? null : eventPayloadThrow(event[1]);
  const thrown = record === null ? null : throwView(record);
  const collection = elementEnvelope(element)?.multiInstance?.outputCollection ?? null;
  return {
    names: [...(activity === null ? [] : workResults(activity[1].work)), ...caught.flatMap(catchWrites), ...(thrown?.installs ?? []),
      ...(collection === null ? [] : [collection])],
    all: thrown?.installsAll === true,
  };
}
