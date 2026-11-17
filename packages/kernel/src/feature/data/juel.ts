/**
 * Data: the Core JUEL evaluator, transcribed from `Kernel/Feature/Data/Juel.lean`.
 *
 * One parsed JUEL text evaluates over the portable value domain and Java's carriers for it, as the pinned
 * `cibseven-juel` does ([expression semantics](../../../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#evaluation)).
 * Integers are 64-bit `bigint`s carrying their Java class; a rule that would build a Double, or reach a Java surface the
 * kernel does not represent, ends as `unsupported`. Strings are indexed and ordered in UTF-16 code units, as Java does.
 */
import { assertNever, integerLexeme, isAscii, parseJavaInt, ValueTag, type Value } from "../../il/types.js";
import {
  JuelBinary, JuelCallTag, JuelMethod, JuelNodeTag, JuelUnary, juelMethodCounts, type JuelCallNode, type JuelNode,
} from "../../il/types/juel.js";
import { EvaluationTag, type Evaluation } from "../../hooks.js";
import type { EvalContext } from "../../state.js";
import {
  Carrier, EqualClassTag, JValTag, NumberClass, OrderClassTag, bool, deciding, dotEe, double, elError, equalClass,
  equalRank, fail, fromValue, integer, isList, isMap, isNull, javaTrim, long, nullValue, numberClass, numberRank, ok,
  orderClass, orderRank, portable, siteValue, stopped, text, toBool, toDecimal, toLong, toText, unsupported,
  type Decimal, type Eval, type JVal,
} from "./juel/coercion.js";

/** Evaluate a JUEL node table against the context's variables, innermost binding first. */
export function evaluateJuel(context: EvalContext, nodes: readonly JuelNode[]): Evaluation {
  if (nodes.length === 0) return { tag: EvaluationTag.Unsupported, code: "expression.juel.malformed" };
  const result = node(context, nodes, nodes.length - 1);
  if (!result.ok) {
    return result.stop.unsupported
      ? { tag: EvaluationTag.Unsupported, code: result.stop.code }
      : { tag: EvaluationTag.Failure, code: result.stop.code };
  }
  const value = context.domainChecked === false ? siteValue(result.value) : portable(result.value);
  return value === null
    // dynamic-only: whether a result is portable depends on the run's data.
    ? { tag: EvaluationTag.Unsupported, code: "juel.resultOutsideDomain" }
    : { tag: EvaluationTag.Value, result: value };
}

function child(nodes: readonly JuelNode[], parent: number, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < parent && index < nodes.length;
}

/** Node `at`; every child is an earlier node, so the recursion ends. */
function node(context: EvalContext, nodes: readonly JuelNode[], at: number): Eval<JVal> {
  const current = nodes[at];
  if (current === undefined) return unsupported("expression.juel.malformed");
  const sub = (index: number): Eval<JVal> =>
    child(nodes, at, index) ? node(context, nodes, index) : unsupported("expression.juel.malformed");
  switch (current.tag) {
    case JuelNodeTag.Text:
      return ok(text(current.value));
    case JuelNodeTag.Composite: {
      let out = "";
      for (const part of current.parts) {
        const value = sub(part);
        if (!value.ok) return stopped(value);
        const rendered = toText(value.value);
        if (!rendered.ok) return stopped(rendered);
        out += rendered.value;
      }
      return ok(text(out));
    }
    case JuelNodeTag.Null:
      return ok(nullValue);
    case JuelNodeTag.Bool:
      return ok(bool(current.value));
    case JuelNodeTag.Integer: {
      const value = integerLexeme(current.digits);
      return value === null ? unsupported("expression.juel.malformed") : ok(long(value));
    }
    case JuelNodeTag.Float:
      return unsupported("expression.juel.floatLiteral");
    case JuelNodeTag.StringLiteral:
      return ok(text(current.value));
    case JuelNodeTag.Identifier: {
      const found = context.variables.find(([name]) => name === current.name);
      return found === undefined ? fail("unknown-variable") : ok(fromValue(found[1]));
    }
    case JuelNodeTag.Function:
      return unsupported("expression.juel.function");
    case JuelNodeTag.Dot: {
      const base = sub(current.base);
      if (!base.ok) return base;
      return isNull(base.value) ? ok(nullValue) : property(base.value, text(current.property));
    }
    case JuelNodeTag.Bracket: {
      const base = sub(current.base);
      if (!base.ok) return base;
      if (isNull(base.value)) return ok(nullValue);
      const name = sub(current.property);
      if (!name.ok) return name;
      return isNull(name.value) ? ok(nullValue) : property(base.value, name.value);
    }
    case JuelNodeTag.Call:
      return methodCall(current.payload, sub);
    case JuelNodeTag.ComputedCall:
      return unsupported("expression.juel.computedMethod");
    case JuelNodeTag.Unary: {
      const operand = sub(current.operand);
      if (!operand.ok) return operand;
      return unary(current.op, operand.value);
    }
    case JuelNodeTag.Binary:
      return binary(current.payload.op, sub, current.payload.left, current.payload.right);
    case JuelNodeTag.Choice: {
      const { condition: conditionIndex, whenTrue, whenFalse } = current.payload;
      const condition = sub(conditionIndex);
      if (!condition.ok) return condition;
      const holds = toBool(condition.value);
      if (!holds.ok) return stopped(holds);
      return sub(holds.value ? whenTrue : whenFalse);
    }
  }
  return assertNever(current);
}

// Operators (NumberOperations, BooleanOperations; EL §1.7 to §1.11)

function aligned(left: Decimal, right: Decimal): readonly [bigint, bigint, bigint] {
  const scale = left[1] > right[1] ? left[1] : right[1];
  return [left[0] * 10n ** (scale - left[1]), right[0] * 10n ** (scale - right[1]), scale];
}

function decimalCompare(left: Decimal, right: Decimal): number {
  const [a, b] = aligned(left, right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function addDecimal(left: Decimal, right: Decimal): Decimal {
  const [x, y, scale] = aligned(left, right);
  return [x + y, scale];
}

function subtractDecimal(left: Decimal, right: Decimal): Decimal {
  const [x, y, scale] = aligned(left, right);
  return [x - y, scale];
}

const multiplyDecimal = (left: Decimal, right: Decimal): Decimal => [left[0] * right[0], left[1] + right[1]];

/** `NumberOperations.add`, `sub` or `mul`, given its rule over BigDecimals and over longs. */
function arithmetic(
  onDecimal: (left: Decimal, right: Decimal) => Decimal, onLong: (left: bigint, right: bigint) => bigint, left: JVal, right: JVal,
): Eval<JVal> {
  const decider = deciding(numberRank, numberClass(left), numberClass(right));
  switch (decider) {
    case NumberClass.Absent:
      return ok(long(0n));
    case NumberClass.BigDecimal: {
      const a = toDecimal(left);
      if (!a.ok) return stopped(a);
      const b = toDecimal(right);
      if (!b.ok) return stopped(b);
      const [coefficient, scale] = onDecimal(a.value, b.value);
      return ok({ tag: JValTag.Decimal, coefficient, scale });
    }
    case NumberClass.Double:
      return double(left, right);
    case NumberClass.Long: {
      const a = toLong(left);
      if (!a.ok) return stopped(a);
      const b = toLong(right);
      if (!b.ok) return stopped(b);
      return ok(long(onLong(a.value, b.value)));
    }
  }
  return assertNever(decider);
}

function remainder(left: JVal, right: JVal): Eval<JVal> {
  const decider = deciding(numberRank, numberClass(left), numberClass(right));
  switch (decider) {
    case NumberClass.Absent:
      return ok(long(0n));
    case NumberClass.BigDecimal:
    case NumberClass.Double:
      return double(left, right);
    case NumberClass.Long: {
      const a = toLong(left);
      if (!a.ok) return stopped(a);
      const b = toLong(right);
      if (!b.ok) return stopped(b);
      // `ArithmeticException`, which no EL resolver wraps (`NumberOperations.java:141`).
      return b.value === 0n ? fail("juel.arithmetic") : ok(long(a.value % b.value));
    }
  }
  return assertNever(decider);
}

function negate(value: JVal): Eval<JVal> {
  switch (value.tag) {
    case JValTag.Null:
      return ok(long(0n));
    case JValTag.Decimal:
      return ok({ tag: JValTag.Decimal, coefficient: -value.coefficient, scale: value.scale });
    case JValTag.String: {
      if (dotEe(value)) return double(value, value);
      const parsed = toLong(value);
      return parsed.ok ? ok(long(-parsed.value)) : stopped(parsed);
    }
    case JValTag.Int:
      return ok(value.carrier === Carrier.Integer
        ? { tag: JValTag.Int, value: BigInt.asIntN(32, -value.value), carrier: Carrier.Integer }
        : value.carrier === Carrier.Long ? long(-value.value)
        : { tag: JValTag.Int, value: BigInt.asIntN(64, -value.value), carrier: Carrier.Unknown });
    case JValTag.Bool:
    case JValTag.List:
    case JValTag.Map:
      return fail(elError);
  }
  return assertNever(value);
}

function isEmpty(value: JVal): boolean {
  switch (value.tag) {
    case JValTag.Null:
      return true;
    case JValTag.String:
      return value.value === "";
    case JValTag.List:
      return value.items.length === 0;
    case JValTag.Map:
      return value.entries.length === 0;
    case JValTag.Bool:
    case JValTag.Int:
    case JValTag.Decimal:
      return false;
  }
  return assertNever(value);
}

function unary(op: JuelUnary, value: JVal): Eval<JVal> {
  switch (op) {
    case JuelUnary.Not: {
      const holds = toBool(value);
      return holds.ok ? ok(bool(!holds.value)) : stopped(holds);
    }
    case JuelUnary.Neg:
      return negate(value);
    case JuelUnary.Empty:
      return ok(bool(isEmpty(value)));
  }
  return assertNever(op);
}

/** `BooleanOperations.lt0`'s order of `left` against `right` (−1, 0, 1), both non-null. */
function order(left: JVal, right: JVal): Eval<number> {
  const [leftClass, rightClass] = [orderClass(left), orderClass(right)];
  const decider = deciding(orderRank, leftClass, rightClass);
  switch (decider.tag) {
    case OrderClassTag.BigDecimal: {
      const a = toDecimal(left);
      if (!a.ok) return stopped(a);
      const b = toDecimal(right);
      return b.ok ? ok(decimalCompare(a.value, b.value)) : stopped(b);
    }
    case OrderClassTag.Long: {
      const a = toLong(left);
      if (!a.ok) return stopped(a);
      const b = toLong(right);
      return b.ok ? ok(a.value < b.value ? -1 : a.value > b.value ? 1 : 0) : stopped(b);
    }
    case OrderClassTag.Text: {
      const a = toText(left);
      if (!a.ok) return stopped(a);
      const b = toText(right);
      // JavaScript compares strings by UTF-16 code unit, as `String.compareTo` does.
      return b.ok ? ok(a.value < b.value ? -1 : a.value > b.value ? 1 : 0) : stopped(b);
    }
    case OrderClassTag.Boolean:
    case OrderClassTag.Incomparable:
      if (leftClass.tag === OrderClassTag.Boolean && rightClass.tag === OrderClassTag.Boolean) {
        return ok(Number(leftClass.value) - Number(rightClass.value));
      }
      // A Boolean against a List or Map is a `ClassCastException`; two collections are no `Comparable`.
      return fail(elError);
  }
  return assertNever(decider);
}

/** `<`, `>`, `<=` or `>=`: `inclusive` answers two nulls, `holds` reads the order of two non-null operands. */
function relational(inclusive: boolean, holds: (sign: number) => boolean, left: JVal, right: JVal): Eval<JVal> {
  // dynamic-only: Java answers two collections by reference identity first, which values do not have.
  if ((isList(left) && isList(right)) || (isMap(left) && isMap(right))) return unsupported("juel.identity");
  if (isNull(left) && isNull(right)) return ok(bool(inclusive));
  if (isNull(left) || isNull(right)) return ok(bool(false));
  const compared = order(left, right);
  if (!compared.ok) return stopped(compared);
  return ok(bool(holds(compared.value)));
}

/** `BooleanOperations.eq`. */
function equal(left: JVal, right: JVal): Eval<boolean> {
  const decider = deciding(equalRank, equalClass(left), equalClass(right));
  switch (decider.tag) {
    case EqualClassTag.Absent:
      return ok(isNull(left) && isNull(right));
    case EqualClassTag.BigDecimal: {
      const a = toDecimal(left);
      if (!a.ok) return stopped(a);
      const b = toDecimal(right);
      return b.ok ? ok(a.value[0] === b.value[0] && a.value[1] === b.value[1]) : stopped(b);
    }
    case EqualClassTag.Long: {
      const a = toLong(left);
      if (!a.ok) return stopped(a);
      const b = toLong(right);
      return b.ok ? ok(a.value === b.value) : stopped(b);
    }
    case EqualClassTag.Boolean: {
      const a = toBool(left);
      if (!a.ok) return stopped(a);
      const b = toBool(right);
      return b.ok ? ok(a.value === b.value) : stopped(b);
    }
    case EqualClassTag.Text: {
      const a = toText(left);
      if (!a.ok) return stopped(a);
      const b = toText(right);
      return b.ok ? ok(a.value === b.value) : stopped(b);
    }
    case EqualClassTag.Collection:
      return decided(javaEquals(left, decider.value));
  }
  return assertNever(decider);
}

/**
 * Java `equals` of an evaluated value against a context value, three-valued: `null` when it depends on an Integer's
 * class, which a context value does not record. Every comparison the evaluator makes has a context value on one side, an
 * item or entry of a collection or the collection itself, whose `equals` Java keeps symmetric; so two equal Integers
 * always leave the answer to their classes.
 */
function javaEquals(left: JVal, value: Value): boolean | null {
  const right = fromValue(value);
  switch (left.tag) {
    case JValTag.Int:
      return !sameKind(left, right) ? false : left.value !== right.value ? false : null;
    case JValTag.Decimal:
      return sameKind(left, right) && left.coefficient === right.coefficient && left.scale === right.scale;
    case JValTag.List: {
      if (!sameKind(left, right) || left.items.length !== right.items.length) return false;
      return every(left.items.map((item, index) => javaEquals(fromValue(item), right.items[index] as Value)));
    }
    case JValTag.Map: {
      if (!sameKind(left, right) || left.entries.length !== right.entries.length) return false;
      const pairs = left.entries.map(([name, item]) => {
        const other = right.entries.find(([key]) => key === name);
        return other === undefined ? false : javaEquals(fromValue(item), other[1]);
      });
      return every(pairs);
    }
    case JValTag.Null:
      return sameKind(left, right);
    case JValTag.Bool:
    case JValTag.String:
      return sameKind(left, right) && left.value === right.value;
  }
  return assertNever(left);
}

/** Whether `right` is of `left`'s kind, the one kind `equals` of two carriers compares within. */
function sameKind<T extends JVal>(left: T, right: JVal): right is Extract<JVal, { readonly tag: T["tag"] }> {
  return right.tag === left.tag;
}

/** Three-valued conjunction: false wins, then unknown. */
function every(answers: readonly (boolean | null)[]): boolean | null {
  if (answers.includes(false)) return false;
  return answers.includes(null) ? null : true;
}

/** Three-valued disjunction: true wins, then unknown. */
function some(answers: readonly (boolean | null)[]): boolean | null {
  if (answers.includes(true)) return true;
  return answers.includes(null) ? null : false;
}

function decided(answer: boolean | null): Eval<boolean> {
  // dynamic-only: an Integer's Java class is not recorded in a value.
  return answer === null ? unsupported("juel.integerCarrier") : ok(answer);
}

/**
 * `left op right`, the one dispatch over `JuelBinary`: `and` and `or` skip their right operand once the left one
 * decides (EL §1.9); every other operator evaluates both, left first.
 */
function binary(op: JuelBinary, sub: (index: number) => Eval<JVal>, leftIndex: number, rightIndex: number): Eval<JVal> {
  const both = (rule: (left: JVal, right: JVal) => Eval<JVal>): Eval<JVal> => {
    const left = sub(leftIndex);
    if (!left.ok) return left;
    const right = sub(rightIndex);
    return right.ok ? rule(left.value, right.value) : right;
  };
  const logical = (decisive: boolean): Eval<JVal> => {
    const left = sub(leftIndex);
    if (!left.ok) return left;
    const first = toBool(left.value);
    if (!first.ok) return stopped(first);
    if (first.value === decisive) return ok(bool(first.value));
    const right = sub(rightIndex);
    if (!right.ok) return right;
    const second = toBool(right.value);
    return second.ok ? ok(bool(second.value)) : stopped(second);
  };
  switch (op) {
    case JuelBinary.Div:
      return unsupported("expression.juel.division");
    case JuelBinary.And:
      return logical(false);
    case JuelBinary.Or:
      return logical(true);
    case JuelBinary.Eq:
      return both((left, right) => {
        const same = equal(left, right);
        return same.ok ? ok(bool(same.value)) : stopped(same);
      });
    case JuelBinary.Ne:
      return both((left, right) => {
        const same = equal(left, right);
        return same.ok ? ok(bool(!same.value)) : stopped(same);
      });
    case JuelBinary.Lt:
      return both((left, right) => relational(false, (sign) => sign < 0, left, right));
    case JuelBinary.Gt:
      return both((left, right) => relational(false, (sign) => sign > 0, left, right));
    case JuelBinary.Le:
      return both((left, right) => relational(true, (sign) => sign <= 0, left, right));
    case JuelBinary.Ge:
      return both((left, right) => relational(true, (sign) => sign >= 0, left, right));
    case JuelBinary.Add:
      return both((left, right) => arithmetic(addDecimal, (a, b) => a + b, left, right));
    case JuelBinary.Sub:
      return both((left, right) => arithmetic(subtractDecimal, (a, b) => a - b, left, right));
    case JuelBinary.Mul:
      return both((left, right) => arithmetic(multiplyDecimal, (a, b) => a * b, left, right));
    case JuelBinary.Mod:
      return both(remainder);
  }
  return assertNever(op);
}

// Property access (AstProperty.eval; EL §1.6)

/** A property of a scalar base: one of the bean properties its class has is a host property, anything else is not found. */
function scalarProperty(beanProperties: readonly string[], name: JVal): Eval<JVal> {
  const rendered = toText(name);
  if (!rendered.ok) return stopped(rendered);
  // dynamic-only: a Java bean property of a host class.
  return beanProperties.includes(rendered.value) ? unsupported("juel.beanProperty") : fail("juel.propertyNotFound");
}

/** `base.name` or `base[name]` over a non-null base and property. */
function property(base: JVal, name: JVal): Eval<JVal> {
  switch (base.tag) {
    case JValTag.Map: {
      const key = textArgument(name);
      // dynamic-only: a non-String key's lookup depends on the host Map class.
      if (key === null) return unsupported("juel.indexType");
      const entry = base.entries.find(([candidate]) => candidate === key);
      return ok(entry === undefined ? nullValue : fromValue(entry[1]));
    }
    case JValTag.List: {
      const index = listIndex(name);
      if (!index.ok) return stopped(index);
      const item = index.value >= 0 && index.value < base.items.length ? base.items[index.value] : undefined;
      return ok(item === undefined ? nullValue : fromValue(item));
    }
    case JValTag.String:
      return scalarProperty(["class", "empty", "blank", "bytes"], name);
    case JValTag.Bool:
    case JValTag.Int:
    case JValTag.Decimal:
    case JValTag.Null:
      return scalarProperty(["class"], name);
  }
  return assertNever(base);
}

/** `ListELResolver`'s index: an Integer narrowed as `intValue`, a String through `Integer.parseInt`. */
function listIndex(name: JVal): Eval<number> {
  switch (name.tag) {
    case JValTag.Int:
      return ok(Number(BigInt.asIntN(32, name.value)));
    case JValTag.String: {
      // dynamic-only: `Integer.parseInt` reads Unicode digits the kernel does not model.
      if (!isAscii(name.value)) return unsupported("juel.nonAsciiText");
      const parsed = parseJavaInt(name.value);
      return parsed === null ? fail(elError) : ok(Number(parsed));
    }
    case JValTag.Null:
    case JValTag.Bool:
    case JValTag.Decimal:
    case JValTag.List:
    case JValTag.Map:
      // dynamic-only: another index kind's coercion depends on the shaded resolver.
      return unsupported("juel.indexType");
  }
  return assertNever(name);
}

// Methods (AstMethod.invoke; the closed list)

function methodCall(payload: JuelCallNode, sub: (index: number) => Eval<JVal>): Eval<JVal> {
  const { target, receiver: receiverIndex, args: argIndexes } = payload;
  switch (target.tag) {
    case JuelCallTag.Other:
      return unsupported("expression.juel.method");
    case JuelCallTag.Listed: {
      if (!juelMethodCounts[target.method].includes(argIndexes.length)) return unsupported("expression.juel.method");
      const receiver = sub(receiverIndex);
      if (!receiver.ok) return receiver;
      if (isNull(receiver.value)) return fail("juel.propertyNotFound");
      const args: JVal[] = [];
      for (const index of argIndexes) {
        const arg = sub(index);
        if (!arg.ok) return arg;
        args.push(arg.value);
      }
      return applyMethod(target.method, receiver.value, args);
    }
  }
  return assertNever(target);
}

// dynamic-only: the receiver's class has a method of that name the kernel does not model (a scalar carrier's `equals`,
// the writing `Map.replace`), or an argument kind is outside the listed parameter's; either is the run's data.
const wrongReceiver = <T>(): Eval<T> => unsupported("juel.methodReceiver");
const wrongArgument = <T>(): Eval<T> => unsupported("juel.methodArgument");

/**
 * A listed method the receiver's class lacks: no String, List or Map carrier CIB hands JUEL (CIB-CFG-0009) declares it,
 * so the call throws `MethodNotFoundException` (`AstMethod.java:91-93`), an `ELException`.
 */
const missingMethod = <T>(): Eval<T> => fail(elError);

function applyMethod(method: JuelMethod, receiver: JVal, args: readonly JVal[]): Eval<JVal> {
  const first = args[0] ?? nullValue;
  switch (receiver.tag) {
    case JValTag.String:
      return stringMethod(method, receiver.value, args);
    case JValTag.List:
      return listMethod(method, receiver, first);
    case JValTag.Map:
      return mapMethod(method, receiver, first);
    case JValTag.Null:
    case JValTag.Bool:
    case JValTag.Int:
    case JValTag.Decimal:
      return wrongReceiver();
  }
  return assertNever(receiver);
}

function textArgument(value: JVal | undefined): string | null {
  if (value === undefined) return null;
  switch (value.tag) {
    case JValTag.String:
      return value.value;
    case JValTag.Null:
    case JValTag.Bool:
    case JValTag.Int:
    case JValTag.Decimal:
    case JValTag.List:
    case JValTag.Map:
      return null;
  }
  return assertNever(value);
}

function intArgument(value: JVal | undefined): number | null {
  if (value === undefined) return null;
  switch (value.tag) {
    case JValTag.Int:
      return Number(BigInt.asIntN(32, value.value));
    case JValTag.Null:
    case JValTag.Bool:
    case JValTag.Decimal:
    case JValTag.String:
    case JValTag.List:
    case JValTag.Map:
      return null;
  }
  return assertNever(value);
}

/** A String a cut or insertion produced, unless it split a surrogate pair. */
function whole(value: string): Eval<JVal> {
  // dynamic-only: a cut inside a surrogate pair depends on the run's data.
  return value.isWellFormed() ? ok(text(value)) : unsupported("juel.surrogateSplit");
}

/** A method whose one argument must be a String. */
function withText(argument: JVal | undefined, rule: (argument: string) => JVal): Eval<JVal> {
  const value = textArgument(argument);
  return value === null ? wrongArgument() : ok(rule(value));
}

/** `toUpperCase` or `toLowerCase`, whose `mapped` result holds only for ASCII text. */
function asciiCase(receiver: string, mapped: string): Eval<JVal> {
  // dynamic-only: Java maps a non-ASCII character by the JVM's default locale.
  return isAscii(receiver) ? ok(text(mapped)) : unsupported("juel.nonAsciiText");
}

function stringMethod(method: JuelMethod, receiver: string, args: readonly JVal[]): Eval<JVal> {
  const first = args[0];
  const second = args[1];
  switch (method) {
    case JuelMethod.Length:
      return ok(integer(receiver.length));
    case JuelMethod.IsEmpty:
      return ok(bool(receiver.length === 0));
    case JuelMethod.Equals:
      return ok(bool(textArgument(first) === receiver));
    case JuelMethod.Contains:
      return withText(first, (argument) => bool(receiver.includes(argument)));
    case JuelMethod.StartsWith:
      return withText(first, (argument) => bool(receiver.startsWith(argument)));
    case JuelMethod.EndsWith:
      return withText(first, (argument) => bool(receiver.endsWith(argument)));
    case JuelMethod.IndexOf:
      return withText(first, (argument) => integer(receiver.indexOf(argument)));
    case JuelMethod.LastIndexOf:
      return withText(first, (argument) => integer(receiver.lastIndexOf(argument)));
    case JuelMethod.Concat:
      return withText(first, (argument) => text(receiver + argument));
    case JuelMethod.Substring: {
      const begin = intArgument(first);
      const end = args.length === 1 ? receiver.length : intArgument(second);
      if (begin === null || end === null) return wrongArgument();
      // `StringIndexOutOfBoundsException` (`String.substring`).
      if (begin < 0 || end > receiver.length || begin > end) return fail(elError);
      return whole(receiver.slice(begin, end));
    }
    case JuelMethod.ToUpperCase:
      return asciiCase(receiver, receiver.toUpperCase());
    case JuelMethod.ToLowerCase:
      return asciiCase(receiver, receiver.toLowerCase());
    case JuelMethod.Trim:
      return ok(text(javaTrim(receiver)));
    case JuelMethod.Replace: {
      const target = textArgument(first);
      const replacement = textArgument(second);
      if (target === null || replacement === null) return wrongArgument();
      // A function replacer, so that `$` in the replacement is literal as in Java's `CharSequence` overload; an empty
      // target matches at every UTF-16 position, as Java's does.
      return whole(receiver.replaceAll(target, () => replacement));
    }
    case JuelMethod.Size:
    case JuelMethod.Get:
    case JuelMethod.ContainsKey:
    case JuelMethod.ContainsValue:
      return missingMethod();
  }
  return assertNever(method);
}

function listMethod(method: JuelMethod, receiver: JVal & { readonly tag: JValTag.List }, argument: JVal): Eval<JVal> {
  const items = receiver.items.map(fromValue);
  const found = (order: readonly number[]): Eval<JVal> => {
    for (const index of order) {
      const answer = decided(javaEquals(argument, receiver.items[index] as Value));
      if (!answer.ok) return stopped(answer);
      if (answer.value) return ok(integer(index));
    }
    return ok(integer(-1));
  };
  switch (method) {
    case JuelMethod.IsEmpty:
      return ok(bool(items.length === 0));
    case JuelMethod.Size:
      return ok(integer(items.length));
    case JuelMethod.Equals: {
      const answer = decided(javaEquals(argument, { tag: ValueTag.List, items: receiver.items }));
      return answer.ok ? ok(bool(answer.value)) : stopped(answer);
    }
    case JuelMethod.Contains: {
      const answer = decided(some(receiver.items.map((item) => javaEquals(argument, item))));
      return answer.ok ? ok(bool(answer.value)) : stopped(answer);
    }
    case JuelMethod.IndexOf:
      return found(items.map((_, index) => index));
    case JuelMethod.LastIndexOf:
      return found(items.map((_, index) => items.length - 1 - index));
    case JuelMethod.Get: {
      const index = intArgument(argument);
      if (index === null) return wrongArgument();
      const item = items[index];
      // `IndexOutOfBoundsException` (`List.get`).
      return index < 0 || item === undefined ? fail(elError) : ok(item);
    }
    case JuelMethod.Length:
    case JuelMethod.StartsWith:
    case JuelMethod.EndsWith:
    case JuelMethod.Substring:
    case JuelMethod.ToUpperCase:
    case JuelMethod.ToLowerCase:
    case JuelMethod.Trim:
    case JuelMethod.Concat:
    case JuelMethod.Replace:
    case JuelMethod.ContainsKey:
    case JuelMethod.ContainsValue:
      return missingMethod();
  }
  return assertNever(method);
}

function mapMethod(method: JuelMethod, receiver: JVal & { readonly tag: JValTag.Map }, argument: JVal): Eval<JVal> {
  switch (method) {
    case JuelMethod.IsEmpty:
      return ok(bool(receiver.entries.length === 0));
    case JuelMethod.Size:
      return ok(integer(receiver.entries.length));
    case JuelMethod.Equals: {
      const answer = decided(javaEquals(argument, { tag: ValueTag.Map, entries: receiver.entries }));
      return answer.ok ? ok(bool(answer.value)) : stopped(answer);
    }
    case JuelMethod.Get:
      return withText(argument, (key) => {
        const entry = receiver.entries.find(([name]) => name === key);
        return entry === undefined ? nullValue : fromValue(entry[1]);
      });
    case JuelMethod.ContainsKey:
      return withText(argument, (key) => bool(receiver.entries.some(([name]) => name === key)));
    case JuelMethod.ContainsValue: {
      const answer = decided(some(receiver.entries.map(([, value]) => javaEquals(argument, value))));
      return answer.ok ? ok(bool(answer.value)) : stopped(answer);
    }
    case JuelMethod.Length:
    case JuelMethod.Contains:
    case JuelMethod.StartsWith:
    case JuelMethod.EndsWith:
    case JuelMethod.IndexOf:
    case JuelMethod.LastIndexOf:
    case JuelMethod.Substring:
    case JuelMethod.ToUpperCase:
    case JuelMethod.ToLowerCase:
    case JuelMethod.Trim:
    case JuelMethod.Concat:
      return missingMethod();
    case JuelMethod.Replace:
      return wrongReceiver();
  }
  return assertNever(method);
}
