/**
 * Read and write footprints, transcribed from `Kernel/IL/Footprint.lean`: what an expression, a mapping list or an
 * element reads and writes, over-approximated where the text cannot show it: a JUEL or foreign expression reads every
 * name, a Multi-Instance definition reads every name when its element begins, and so does a Script Task, whose effect
 * opens with every visible variable. `admission/flow.ts` compares branch
 * footprints for `BranchSchedule.OrderInvariant`, and `writes` is the one account of what an element writes, which that
 * closure walk and `feature/compensation.ts`'s data dependency both read. The mechanisms whose units those comparisons
 * pair (`QueuingMechanism`) are listed here once.
 */
import {
  ConditionalRetrigger,
  DeliveryVariables,
  ExpressionTag,
  SignalPayload,
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
  programDecision,
  programFlow,
  scopeKindStart,
  throwView,
  triggerView,
  workCall,
  workResults,
  valueSourceLiteral,
  type ConditionTrigger,
  type Element,
  type Expression,
  type Mapping,
  type Program,
  type RuleWork,
  type Subscription,
} from "./types.js";
import { DecisionLogicTag, InputExpressionTag, type InputExpression } from "./types/decision.js";
import { workReader } from "./types/work.js";

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

/**
 * The names through which a write may turn a condition from true to false: none for `isPresent`, since no write of a
 * closure removes a name (only a variable command does, `step/inputs.ts`) and an explicit null counts as present.
 */
export const falsifiable = (expression: Expression): NameSet =>
  expression.tag === ExpressionTag.SimpleBoolean && expression.body.tag === SimpleBooleanTag.IsPresent ? noNames : expressionReads(expression);

/**
 * The names through which a write ordered against the opening (`opening`) or the end of a Conditional subscription with
 * `trigger` may change what it fires, value-blind. Against the opening, under `edge` those that may turn the condition
 * false (`falsifiable`), since a write that can only turn it true fires it after the opening as it would on arrival;
 * that holds only without a filter, since arming ignores filters while a filter blocks a later write, so a filtered
 * condition reads every name it reads (`edge` admits none, `event.condition.filter`). Under `eachWrite`, which fires
 * again on every write its filter passes while the condition holds, every name the condition reads or the filter
 * passes. Against the end, those through which the write may make it true (`mayMakeTrue`'s bound): under `edge` the
 * names the condition reads, under `eachWrite` those the filter passes.
 */
export function conditionNames(retrigger: ConditionalRetrigger, opening: boolean, trigger: ConditionTrigger): NameSet {
  const filtered: NameSet = trigger.variableName !== null ? { names: [trigger.variableName], all: false } : { names: [], all: true };
  const unfiltered = trigger.variableName === null && trigger.variableEvents.length === 0;
  switch (retrigger) {
    case ConditionalRetrigger.EachWrite:
      return opening ? union(expressionReads(trigger.condition), filtered) : filtered;
    case ConditionalRetrigger.Edge:
      return !opening || !unfiltered ? expressionReads(trigger.condition) : falsifiable(trigger.condition);
  }
  return assertNever(retrigger);
}

export const mappingReads = (mappings: readonly Mapping[]): NameSet =>
  mappings.reduce((found, mapping) => union(found, expressionReads(mapping.source)), noNames);

/**
 * What `element` reads when it begins: its input mappings, and every name for a Multi-Instance definition, whose count,
 * collection and condition it evaluates then or later in the closure.
 */
/**
 * The variable inputs of the decision table a Business Rule Task's work names, or `null` where a name cannot be told: a
 * decision key that is an expression or names no decision, a decision without a table, an input that is no variable.
 * Admission refuses each (`work.rule.decisionExpression`, `work.rule.decisionMissing`, `decision.logic`,
 * `decision.inputExpression`), so `workReads` counts every name for them only to stay an over-approximation.
 */
export function decisionInputs(program: Program, work: RuleWork): readonly string[] | null {
  const key = valueSourceLiteral(work.decision);
  const decision = key === null ? null : programDecision(program, key);
  if (decision === null) return null;
  switch (decision.logic.tag) {
    case DecisionLogicTag.Table: {
      const names = decision.logic.value.inputs.map((input) => inputVariable(input.expression));
      return names.every((name) => name !== null) ? names : null;
    }
    case DecisionLogicTag.Foreign: return null;
  }
  return assertNever(decision.logic);
}

/** The variable a decision input reads, `null` for an expression. */
function inputVariable(expression: InputExpression): string | null {
  switch (expression.tag) {
    case InputExpressionTag.Variable: return expression.name;
    case InputExpressionTag.Foreign: return null;
  }
  return assertNever(expression);
}

/**
 * What `element`'s work reads beside its mappings (`workReader`): every name for a Script Task, whose effect opens with
 * every visible variable (`feature/work.ts#scriptSnapshot`), and a Business Rule Task's decision table's variable inputs
 * (`decisionInputs`, `feature/decision.ts#readInput`).
 */
export function workReads(program: Program, element: Element): NameSet {
  const activity = elementActivity(element);
  const reader = activity === null ? null : workReader(activity[1].work);
  if (reader === null) return noNames;
  if (reader.rule === null) return { names: [], all: true };
  const names = decisionInputs(program, reader.rule);
  return names === null ? { names: [], all: true } : { names, all: false };
}

/**
 * What `element` reads when it begins: its input mappings, every name for a Multi-Instance definition, whose count,
 * collection and condition it evaluates then or later in the closure, and what its work reads (`workReads`), which a
 * Script Task's effect and a Business Rule Task's decision read as it begins.
 */
export function beginReads(program: Program, element: Element): NameSet {
  const envelope = elementEnvelope(element);
  const own = envelope === null ? noNames : union(mappingReads(envelope.inputs), { names: [], all: envelope.multiInstance !== null });
  return union(own, workReads(program, element));
}

/**
 * Whether an Event Sub-Process writes every name when its start begins it: a delivery's own variables are input data,
 * unknown at admission, which the begin writes outward from the new occurrence (`step.ts#writeStart`) under
 * `DeliveryVariables.Installs` for a Message start (CIB-EXT-0025) and `SignalPayload.Variables` for a Signal start
 * (CIB-EXT-0043).
 */
export function deliveredWrites(program: Program, element: Element): boolean {
  const scope = elementScope(element);
  const start = scope === null ? null : scopeKindStart(scope[1].kind);
  if (start === null) return false;
  const view = triggerView(start.trigger);
  return (view.message !== null && program.options.deliveryVariables === DeliveryVariables.Installs) ||
    (view.signal !== null && program.options.signalPayload === SignalPayload.Variables);
}

/**
 * What `element` reads and writes when it runs through in the closure: it begins, its outputs read their sources and
 * write their targets, a Call maps its inputs and outputs, its outgoing conditions are evaluated, and an Event
 * Sub-Process whose start carries a delivery's variables writes every name (`deliveredWrites`).
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
    reads: union(union(beginReads(program, element), mappingReads(outputs)), union(call === null ? noNames : mappingReads(call.inputs), conditions)),
    writes: {
      names: [...outputs.map((mapping) => mapping.target), ...(call?.outputs ?? []).map((mapping) => mapping.target)],
      all: call?.propagateAllOutputs === true || deliveredWrites(program, element),
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
 * What `element` writes when it runs, beside its envelope's and a Call's outputs and an Event Sub-Process start's
 * delivered variables, which need the program's options (`footprint`), and what a boundary writes when it fires
 * (`catchWrites`): its work's results, its catch's or start's writes, what its Signal throw's receivers install, a
 * Signal's `camunda:in` targets or every name (CIB-EXT-0043), and its loop's output collection. A loop's counters and
 * items stay in scope occurrences of its own.
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

/**
 * A mechanism of the kernel that queues more than one unit of work in one closure, in an order no input states (P1's
 * census of the queuing sites). Admission's order checks under `BranchSchedule.OrderInvariant` range over
 * `queuingMechanisms`, as `Kernel.Laws.Flow.Concurrent` does in Lean, so a new mechanism takes a case in each.
 */
export enum QueuingMechanism {
  /** A split's branches (BPMN 2.0.2 §13.3.1, Table 13.1). */
  Split = "split",
  /** The children a Scope's entry begins without a start Event (§13.3.4). */
  Entered = "entered",
  /** A parallel Multi-Instance body's instances (§13.3.7). */
  Instances = "instances",
  /** A Signal throw's firings beside its continuation (§10.5.1). */
  Signalled = "signalled",
  /** An Escalation throw's continuation beside its non-interrupting catchers (§10.5.1). */
  Escalated = "escalated",
  /** The Conditional firings one write offers (Tables 10.89, 10.90). */
  Writes = "writes",
  /** The handler runs one Compensation throw or Cancel End begins (§13.5.5). */
  Compensating = "compensating",
  /** The Conditional items one arming finds true, beside the entry's begun work (§13.4.4). */
  Armed = "armed",
  /** The continuations of the Inclusive joins one quiescent closure offers again (Table 13.3). */
  Rejoined = "rejoined",
}

/**
 * Where a mechanism queues its units, and so where admission checks it: at a Sequence Flow's source, at a looping
 * element, or at an element whose run or entry fans out.
 */
export enum QueuingSite {
  Flow = "flow",
  Loop = "loop",
  Element = "element",
}

export function queuedAt(mechanism: QueuingMechanism): QueuingSite {
  switch (mechanism) {
    case QueuingMechanism.Split:
      return QueuingSite.Flow;
    case QueuingMechanism.Instances:
      return QueuingSite.Loop;
    case QueuingMechanism.Entered:
    case QueuingMechanism.Signalled:
    case QueuingMechanism.Escalated:
    case QueuingMechanism.Writes:
    case QueuingMechanism.Compensating:
    case QueuingMechanism.Armed:
    case QueuingMechanism.Rejoined:
      return QueuingSite.Element;
  }
  return assertNever(mechanism);
}

/**
 * Every mechanism, in the order `admission-registry.ts` `admitLocated` reaches its check: flows, then loops, then each
 * element's fan-outs.
 */
export const queuingMechanisms: readonly QueuingMechanism[] = [
  QueuingMechanism.Split, QueuingMechanism.Instances, QueuingMechanism.Signalled, QueuingMechanism.Escalated,
  QueuingMechanism.Writes, QueuingMechanism.Compensating, QueuingMechanism.Entered, QueuingMechanism.Armed,
  QueuingMechanism.Rejoined,
];
