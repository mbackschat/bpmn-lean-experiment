/**
 * Admission of data, transcribed from `Kernel/Admission/Data.lean`: expressions, mappings, conditions, element origins
 * and the shared envelope. A refusal carries a stable code.
 *
 * Under `Evaluator.simpleBoolean` every expression the kernel reads is Simple Boolean, a literal or a variable read;
 * under `Evaluator.juel` a condition or a CIB mapping may also be a JUEL node table at the Core level
 * ([expression semantics](../../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#admission-at-core)).
 */
import {
  Evaluator, ExpressionTag, MappingDialect, assertNever, integerLexeme, multiInstanceCounterNames, type Envelope,
  type Expression, type Flow, type Header, type Mapping,
} from "../il/types.js";
import {
  JuelBinary, JuelCallTag, JuelNodeTag, juelMethodCounts, type JuelCall, type JuelFunctionNode, type JuelNode,
} from "../il/types/juel.js";

/**
 * What an expression's site lets it read. `counters`: the Multi-Instance counter names are variables there, inside an
 * instance under `MultiInstanceCounters.cibLocals` (CIB-INT-0018); `hidden`: instance names the site may not read,
 * which `admission/multi-instance.ts` `ownInputNames` lists for a Multi-Instance Activity's own input mappings.
 */
export interface Site {
  readonly counters: boolean;
  readonly hidden: readonly string[];
}

/** A site outside every instance. */
export const outsideInstances: Site = { counters: false, hidden: [] };

/**
 * A name CIB resolves before any variable, or holds only inside a Multi-Instance instance or a decision task: the
 * engine objects of `VariableScopeElResolver.java:51-90`, the loop counters, which a site inside an instance admits,
 * and a decision task's `decisionResult`.
 */
function juelName(site: Site, name: string): string | null {
  if (site.hidden.includes(name)) return "multiInstance.ownInputReadsInstance";
  if (["execution", "task", "caseExecution", "externalTask", "authenticatedUserId"].includes(name)) {
    return "expression.juel.engineContext";
  }
  if (!site.counters && multiInstanceCounterNames.includes(name)) {
    return "expression.juel.multiInstanceCounter";
  }
  // CIB binds it only as a transient local of a decision task's execution (`DecisionEvaluationUtil.java:82`), which
  // the kernel does not carry; admission sees no expression's site owner, so the read is refused wherever it stands.
  if (name === "decisionResult") return "expression.juel.decisionResult";
  return null;
}

/** The first node a Core JUEL table refuses at `site`, in node order; a child must be an earlier node. */
export function juelNodes(nodes: readonly JuelNode[], site: Site = outsideInstances): string | null {
  if (nodes.length === 0) return "expression.juel.malformed";
  for (const [at, node] of nodes.entries()) {
    const refused = juelNode(site, at, node);
    if (refused !== null) return refused;
  }
  return null;
}

/** The language the reader gives a JUEL text outside the pinned grammar (`kernel-reader/data.ts`). */
const juelLanguage = "urn:cibseven:expression-language:juel";

/**
 * A Multi-Instance loop expression under `Evaluator.juel`: JUEL, a variable read or text. CIB reads no declared
 * language there (`BpmnParse.java:1824-1838`), so a declared one is refused; `counters` admits the counter names, which
 * only the completion condition reads.
 */
export function loopExpression(counters: boolean, expression: Expression): string | null {
  switch (expression.tag) {
    case ExpressionTag.Juel:
      return juelNodes(expression.nodes, { counters, hidden: [] });
    case ExpressionTag.Variable:
      return juelName({ counters, hidden: [] }, expression.name);
    case ExpressionTag.Literal:
      return null;
    case ExpressionTag.SimpleBoolean:
      return "expression.outsideJuel";
    case ExpressionTag.Foreign:
      return expression.language === juelLanguage ? "expression.juel.syntax" : "multiInstance.expressionLanguage";
  }
  return assertNever(expression);
}

function juelNode(site: Site, at: number, node: JuelNode): string | null {
  const earlier = (...children: readonly number[]): string | null =>
    children.every((index) => Number.isInteger(index) && index >= 0 && index < at) ? null : "expression.juel.malformed";
  switch (node.tag) {
    case JuelNodeTag.Text:
    case JuelNodeTag.Null:
    case JuelNodeTag.Bool:
    case JuelNodeTag.StringLiteral:
      return null;
    case JuelNodeTag.Identifier:
      return juelName(site, node.name);
    case JuelNodeTag.Integer:
      return integerLexeme(node.digits) === null ? "expression.juel.malformed" : null;
    case JuelNodeTag.Float:
      return "expression.juel.floatLiteral";
    case JuelNodeTag.Function:
      return juelFunction(earlier, node.payload);
    case JuelNodeTag.Composite:
      return earlier(...node.parts);
    case JuelNodeTag.Dot:
      return earlier(node.base);
    case JuelNodeTag.Bracket:
      return earlier(node.base, node.property);
    case JuelNodeTag.Call:
      return earlier(node.payload.receiver, ...node.payload.args) ?? juelCall(node.payload.target, node.payload.args.length);
    case JuelNodeTag.ComputedCall: {
      const { receiver, name, args } = node.payload;
      return earlier(receiver, name, ...args) ?? "expression.juel.computedMethod";
    }
    case JuelNodeTag.Unary:
      return earlier(node.operand);
    case JuelNodeTag.Binary: {
      const { op, left, right } = node.payload;
      return earlier(left, right) ?? juelOperator(op);
    }
    case JuelNodeTag.Choice: {
      const { condition, whenTrue, whenFalse } = node.payload;
      return earlier(condition, whenTrue, whenFalse);
    }
  }
  return assertNever(node);
}

/**
 * A function call is refused whole once its arguments are well formed; the Events level admits `now()` and
 * `dateTime()` by their qualified name.
 */
function juelFunction(earlier: (...children: readonly number[]) => string | null, call: JuelFunctionNode): string | null {
  return earlier(...call.args) ?? "expression.juel.function";
}

/** Division yields a Double over Integers (EL §1.7.2), outside the portable domain; every other operator is admitted. */
function juelOperator(op: JuelBinary): string | null {
  switch (op) {
    case JuelBinary.Div:
      return "expression.juel.division";
    case JuelBinary.Or:
    case JuelBinary.And:
    case JuelBinary.Eq:
    case JuelBinary.Ne:
    case JuelBinary.Lt:
    case JuelBinary.Gt:
    case JuelBinary.Le:
    case JuelBinary.Ge:
    case JuelBinary.Add:
    case JuelBinary.Sub:
    case JuelBinary.Mul:
    case JuelBinary.Mod:
      return null;
  }
  return assertNever(op);
}

/** A method call outside the closed list, by name or by argument count. */
function juelCall(target: JuelCall, count: number): string | null {
  switch (target.tag) {
    case JuelCallTag.Listed:
      return juelMethodCounts[target.method].includes(count) ? null : "expression.juel.method";
    case JuelCallTag.Other:
      return "expression.juel.method";
  }
  return assertNever(target);
}

/**
 * A mapping's source at `site`. Under `Evaluator.juel` a CIB mapping (`ioParameter`, `callVariable`) may be JUEL, and
 * an unreadable one is the reader's `foreign`; a Data Association never carries JUEL at Core.
 */
export function mapping(evaluator: Evaluator, site: Site, entry: Mapping): string | null {
  const source = entry.source;
  const cib = entry.dialect !== MappingDialect.DataAssociation;
  switch (source.tag) {
    case ExpressionTag.Foreign:
      return evaluator === Evaluator.Juel && cib ? "expression.juel.syntax" : "mapping.expression";
    case ExpressionTag.Juel:
      if (evaluator === Evaluator.SimpleBoolean) return "mapping.expression";
      return cib ? juelNodes(source.nodes, site) : "expression.juel.site";
    case ExpressionTag.SimpleBoolean:
      return evaluator === Evaluator.Juel ? "expression.outsideJuel" : null;
    case ExpressionTag.Literal:
      return null;
    case ExpressionTag.Variable:
      return evaluator === Evaluator.Juel ? juelName(site, source.name) : null;
  }
  return assertNever(source);
}

export function mappings(evaluator: Evaluator, site: Site, list: readonly Mapping[]): string | null {
  for (const entry of list) {
    const refused = mapping(evaluator, site, entry);
    if (refused !== null) return refused;
  }
  return null;
}

/**
 * An Activity's default flow is read by `feature/flow.ts` `ownFlows` (PC-CF-07). The asynchronous continuations are
 * admitted: `step.ts` reads them as transaction boundaries (CIB-EXT-0027). The inputs and the outputs each have their
 * site.
 */
export function envelope(evaluator: Evaluator, inputs: Site, outputs: Site, fields: Envelope): string | null {
  return mappings(evaluator, inputs, fields.inputs) ?? mappings(evaluator, outputs, fields.outputs);
}

/**
 * A Sequence Flow condition is read by the profile's evaluator: Simple Boolean, or under `Evaluator.juel` a JUEL table
 * or a plain variable read (CIB-EXT-0030). A literal or `foreign` condition is refused under both.
 */
export function flowCondition(evaluator: Evaluator, site: Site, flow: Flow): string | null {
  const condition = flow.condition;
  if (condition === null) return null;
  switch (condition.tag) {
    case ExpressionTag.SimpleBoolean:
      return evaluator === Evaluator.Juel ? "expression.outsideJuel" : null;
    case ExpressionTag.Juel:
      return evaluator === Evaluator.Juel ? juelNodes(condition.nodes, site) : "flow.condition.foreign";
    case ExpressionTag.Variable:
      return evaluator === Evaluator.Juel ? juelName(site, condition.name) : "flow.condition.foreign";
    case ExpressionTag.Literal:
    case ExpressionTag.Foreign:
      return "flow.condition.foreign";
  }
  return assertNever(condition);
}

/**
 * `origin.sourceId` is what publication shows, so a program whose `Header.id` differs would publish another name; no
 * program binds an element to a definition until PC-SCOPE-03.
 */
export function origin(header: Header): string | null {
  if (header.origin.sourceId !== header.id) return "element.origin.sourceId";
  if (header.origin.definition !== null) return "element.origin.definition";
  return null;
}
