/**
 * Data: the Core JUEL evaluator, transcribed from `Kernel/Feature/Data/Juel.lean`.
 *
 * One parsed JUEL text evaluates over the portable value domain and Java's carriers for it, as the pinned
 * `cibseven-juel` does ([expression semantics](../../../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#evaluation)).
 * Integers are 64-bit `bigint`s carrying their Java class; a rule that would build a Double, or reach a Java surface the
 * kernel does not represent, ends as `unsupported`. Strings are indexed and ordered in UTF-16 code units, as Java does.
 */
import { ValueTag, assertNever, type Value } from "../../il/types.js";
import {
  JuelBinary, JuelCallTag, JuelMethod, JuelNodeTag, JuelUnary, juelMethodCounts, type JuelCallNode, type JuelNode,
} from "../../il/types/juel.js";
import { EvaluationTag, type Evaluation } from "../../hooks.js";
import type { Binding } from "../../state.js";
import {
  Carrier, JValTag, bool, dotEe, double, elError, fail, fromValue, integer, isAscii, javaTrim, long, nullValue, ok,
  portable, signedDigits, stopped, text, toBool, toDecimal, toLong, toText, unsupported, type Decimal, type Eval, type JVal,
} from "./juel/coercion.js";

/** Evaluate a JUEL node table against `variables`, innermost binding first. */
export function evaluateJuel(variables: readonly Binding[], nodes: readonly JuelNode[]): Evaluation {
  if (nodes.length === 0) return { tag: EvaluationTag.Unsupported, code: "expression.juel.malformed" };
  const result = node(variables, nodes, nodes.length - 1);
  if (!result.ok) {
    return result.stop.unsupported
      ? { tag: EvaluationTag.Unsupported, code: result.stop.code }
      : { tag: EvaluationTag.Failure, code: result.stop.code };
  }
  const value = portable(result.value);
  return value === null
    // dynamic-only: whether a result is portable depends on the run's data.
    ? { tag: EvaluationTag.Unsupported, code: "juel.resultOutsideDomain" }
    : { tag: EvaluationTag.Value, result: value };
}

function child(nodes: readonly JuelNode[], parent: number, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < parent && index < nodes.length;
}

/** Node `at`; every child is an earlier node, so the recursion ends. */
function node(variables: readonly Binding[], nodes: readonly JuelNode[], at: number): Eval<JVal> {
  const current = nodes[at];
  if (current === undefined) return unsupported("expression.juel.malformed");
  const sub = (index: number): Eval<JVal> =>
    child(nodes, at, index) ? node(variables, nodes, index) : unsupported("expression.juel.malformed");
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
      const found = variables.find(([name]) => name === current.name);
      return found === undefined ? fail("unknown-variable") : ok(fromValue(found[1]));
    }
    case JuelNodeTag.Function:
      return unsupported("expression.juel.function");
    case JuelNodeTag.Dot: {
      const base = sub(current.base);
      if (!base.ok) return base;
      return base.value.tag === JValTag.Null ? ok(nullValue) : property(base.value, text(current.property));
    }
    case JuelNodeTag.Bracket: {
      const base = sub(current.base);
      if (!base.ok) return base;
      if (base.value.tag === JValTag.Null) return ok(nullValue);
      const name = sub(current.property);
      if (!name.ok) return name;
      return name.value.tag === JValTag.Null ? ok(nullValue) : property(base.value, name.value);
    }
    case JuelNodeTag.Call:
      return call(current.payload, sub);
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

/** A digits-only lexeme within `Long.valueOf`'s range (`Parser.java:140`), else `null`. */
function integerLexeme(digits: string): bigint | null {
  if (!/^[0-9]+$/u.test(digits)) return null;
  const value = BigInt(digits);
  return value <= 9223372036854775807n ? value : null;
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

function arithmetic(op: JuelBinary.Add | JuelBinary.Sub | JuelBinary.Mul, left: JVal, right: JVal): Eval<JVal> {
  if (left.tag === JValTag.Null && right.tag === JValTag.Null) return ok(long(0n));
  if (left.tag === JValTag.Decimal || right.tag === JValTag.Decimal) {
    const a = toDecimal(left);
    if (!a.ok) return stopped(a);
    const b = toDecimal(right);
    if (!b.ok) return stopped(b);
    if (op === JuelBinary.Mul) return ok({ tag: JValTag.Decimal, coefficient: a.value[0] * b.value[0], scale: a.value[1] + b.value[1] });
    const [x, y, scale] = aligned(a.value, b.value);
    return ok({ tag: JValTag.Decimal, coefficient: op === JuelBinary.Add ? x + y : x - y, scale });
  }
  if (dotEe(left) || dotEe(right)) return double(left, right);
  const a = toLong(left);
  if (!a.ok) return stopped(a);
  const b = toLong(right);
  if (!b.ok) return stopped(b);
  return ok(long(op === JuelBinary.Add ? a.value + b.value : op === JuelBinary.Sub ? a.value - b.value : a.value * b.value));
}

function remainder(left: JVal, right: JVal): Eval<JVal> {
  if (left.tag === JValTag.Null && right.tag === JValTag.Null) return ok(long(0n));
  if (left.tag === JValTag.Decimal || right.tag === JValTag.Decimal || dotEe(left) || dotEe(right)) return double(left, right);
  const a = toLong(left);
  if (!a.ok) return stopped(a);
  const b = toLong(right);
  if (!b.ok) return stopped(b);
  // `ArithmeticException`, which no EL resolver wraps (`NumberOperations.java:141`).
  return b.value === 0n ? fail("juel.arithmetic") : ok(long(a.value % b.value));
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

const isCollection = (value: JVal): boolean => value.tag === JValTag.List || value.tag === JValTag.Map;

/** `BooleanOperations.lt0`'s order of `left` against `right` (−1, 0, 1), both non-null. */
function order(left: JVal, right: JVal): Eval<number> {
  if (left.tag === JValTag.Decimal || right.tag === JValTag.Decimal) {
    const a = toDecimal(left);
    if (!a.ok) return stopped(a);
    const b = toDecimal(right);
    return b.ok ? ok(decimalCompare(a.value, b.value)) : stopped(b);
  }
  if (left.tag === JValTag.Int || right.tag === JValTag.Int) {
    const a = toLong(left);
    if (!a.ok) return stopped(a);
    const b = toLong(right);
    return b.ok ? ok(a.value < b.value ? -1 : a.value > b.value ? 1 : 0) : stopped(b);
  }
  if (left.tag === JValTag.String || right.tag === JValTag.String) {
    const a = toText(left);
    if (!a.ok) return stopped(a);
    const b = toText(right);
    // JavaScript compares strings by UTF-16 code unit, as `String.compareTo` does.
    return b.ok ? ok(a.value < b.value ? -1 : a.value > b.value ? 1 : 0) : stopped(b);
  }
  if (left.tag === JValTag.Bool && right.tag === JValTag.Bool) return ok(Number(left.value) - Number(right.value));
  // A Boolean against a List or Map is a `ClassCastException`; two collections are no `Comparable`.
  return fail(elError);
}

/** `<`, `>`, `<=` or `>=`: `inclusive` answers two nulls, `holds` reads the order of two non-null operands. */
function relational(inclusive: boolean, holds: (sign: number) => boolean, left: JVal, right: JVal): Eval<JVal> {
  // dynamic-only: Java answers two collections by reference identity first, which values do not have.
  if (left.tag === right.tag && isCollection(left)) return unsupported("juel.identity");
  if (left.tag === JValTag.Null && right.tag === JValTag.Null) return ok(bool(inclusive));
  if (left.tag === JValTag.Null || right.tag === JValTag.Null) return ok(bool(false));
  const compared = order(left, right);
  if (!compared.ok) return stopped(compared);
  return ok(bool(holds(compared.value)));
}

/** `BooleanOperations.eq`. */
function equal(left: JVal, right: JVal): Eval<boolean> {
  if (left.tag === JValTag.Null || right.tag === JValTag.Null) return ok(left.tag === right.tag);
  if (left.tag === JValTag.Decimal || right.tag === JValTag.Decimal) {
    const a = toDecimal(left);
    if (!a.ok) return stopped(a);
    const b = toDecimal(right);
    return b.ok ? ok(a.value[0] === b.value[0] && a.value[1] === b.value[1]) : stopped(b);
  }
  if (left.tag === JValTag.Int || right.tag === JValTag.Int) {
    const a = toLong(left);
    if (!a.ok) return stopped(a);
    const b = toLong(right);
    return b.ok ? ok(a.value === b.value) : stopped(b);
  }
  if (left.tag === JValTag.Bool || right.tag === JValTag.Bool) {
    const a = toBool(left);
    if (!a.ok) return stopped(a);
    const b = toBool(right);
    return b.ok ? ok(a.value === b.value) : stopped(b);
  }
  if (left.tag === JValTag.String || right.tag === JValTag.String) {
    const a = toText(left);
    if (!a.ok) return stopped(a);
    const b = toText(right);
    return b.ok ? ok(a.value === b.value) : stopped(b);
  }
  return decided(javaEquals(left, right));
}

/** Java `equals`, three-valued: `null` when it depends on an Integer's unknown class. */
function javaEquals(left: JVal, right: JVal): boolean | null {
  if (left.tag === JValTag.Int && right.tag === JValTag.Int) {
    if (left.value !== right.value) return false;
    if (left.carrier === Carrier.Unknown || right.carrier === Carrier.Unknown) return null;
    return left.carrier === right.carrier;
  }
  if (left.tag === JValTag.Decimal && right.tag === JValTag.Decimal) {
    return left.coefficient === right.coefficient && left.scale === right.scale;
  }
  if (left.tag === JValTag.List && right.tag === JValTag.List) {
    if (left.items.length !== right.items.length) return false;
    return every(left.items.map((item, index) => javaEquals(fromValue(item), fromValue(right.items[index] as Value))));
  }
  if (left.tag === JValTag.Map && right.tag === JValTag.Map) {
    if (left.entries.length !== right.entries.length) return false;
    const pairs = left.entries.map(([name, value]) => {
      const other = right.entries.find(([key]) => key === name);
      return other === undefined ? false : javaEquals(fromValue(value), fromValue(other[1]));
    });
    return every(pairs);
  }
  if (left.tag === JValTag.Null && right.tag === JValTag.Null) return true;
  if (left.tag === JValTag.Bool && right.tag === JValTag.Bool) return left.value === right.value;
  if (left.tag === JValTag.String && right.tag === JValTag.String) return left.value === right.value;
  return false;
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

function binary(op: JuelBinary, sub: (index: number) => Eval<JVal>, leftIndex: number, rightIndex: number): Eval<JVal> {
  if (op === JuelBinary.Div) return unsupported("expression.juel.division");
  const left = sub(leftIndex);
  if (!left.ok) return left;
  if (op === JuelBinary.And || op === JuelBinary.Or) {
    const first = toBool(left.value);
    if (!first.ok) return stopped(first);
    if (first.value === (op === JuelBinary.Or)) return ok(bool(first.value));
    const right = sub(rightIndex);
    if (!right.ok) return right;
    const second = toBool(right.value);
    return second.ok ? ok(bool(second.value)) : stopped(second);
  }
  const right = sub(rightIndex);
  if (!right.ok) return right;
  return operate(op, left.value, right.value);
}

function operate(op: JuelBinary, left: JVal, right: JVal): Eval<JVal> {
  switch (op) {
    case JuelBinary.Or:
    case JuelBinary.And:
    case JuelBinary.Div:
      // `binary` answers these before both operands are evaluated.
      return unsupported("expression.juel.malformed");
    case JuelBinary.Eq:
    case JuelBinary.Ne: {
      const same = equal(left, right);
      return same.ok ? ok(bool(same.value === (op === JuelBinary.Eq))) : stopped(same);
    }
    case JuelBinary.Lt:
      return relational(false, (sign) => sign < 0, left, right);
    case JuelBinary.Gt:
      return relational(false, (sign) => sign > 0, left, right);
    case JuelBinary.Le:
      return relational(true, (sign) => sign <= 0, left, right);
    case JuelBinary.Ge:
      return relational(true, (sign) => sign >= 0, left, right);
    case JuelBinary.Add:
    case JuelBinary.Sub:
    case JuelBinary.Mul:
      return arithmetic(op, left, right);
    case JuelBinary.Mod:
      return remainder(left, right);
  }
  return assertNever(op);
}

// Property access (AstProperty.eval; EL §1.6)

const beanProperties = new Set(["empty", "blank", "bytes", "class"]);

/** `base.name` or `base[name]` over a non-null base and property. */
function property(base: JVal, name: JVal): Eval<JVal> {
  switch (base.tag) {
    case JValTag.Map: {
      // dynamic-only: a non-String key's lookup depends on the host Map class.
      if (name.tag !== JValTag.String) return unsupported("juel.indexType");
      const entry = base.entries.find(([key]) => key === name.value);
      return ok(entry === undefined ? nullValue : fromValue(entry[1]));
    }
    case JValTag.List: {
      const index = listIndex(name);
      if (!index.ok) return stopped(index);
      const item = index.value >= 0 && index.value < base.items.length ? base.items[index.value] : undefined;
      return ok(item === undefined ? nullValue : fromValue(item));
    }
    case JValTag.String:
    case JValTag.Bool:
    case JValTag.Int:
    case JValTag.Decimal:
    case JValTag.Null: {
      const rendered = toText(name);
      if (!rendered.ok) return stopped(rendered);
      const exists = rendered.value === "class" || (base.tag === JValTag.String && beanProperties.has(rendered.value));
      // dynamic-only: a Java bean property of a host class.
      return exists ? unsupported("juel.beanProperty") : fail("juel.propertyNotFound");
    }
  }
  return assertNever(base);
}

/** `ListELResolver`'s index: an Integer narrowed as `intValue`, a String through `Integer.parseInt`. */
function listIndex(name: JVal): Eval<number> {
  if (name.tag === JValTag.Int) return ok(Number(BigInt.asIntN(32, name.value)));
  if (name.tag === JValTag.String) {
    // dynamic-only: `Integer.parseInt` reads Unicode digits the kernel does not model.
    if (!isAscii(name.value)) return unsupported("juel.nonAsciiText");
    const parsed = signedDigits(name.value);
    return parsed !== null && BigInt.asIntN(32, parsed) === parsed ? ok(Number(parsed)) : fail(elError);
  }
  // dynamic-only: another index kind's coercion depends on the shaded resolver.
  return unsupported("juel.indexType");
}

// Methods (AstMethod.invoke; the closed list)

function call(payload: JuelCallNode, sub: (index: number) => Eval<JVal>): Eval<JVal> {
  const { target, receiver: receiverIndex, args: argIndexes } = payload;
  switch (target.tag) {
    case JuelCallTag.Other:
      return unsupported("expression.juel.method");
    case JuelCallTag.Listed: {
      if (!juelMethodCounts[target.method].includes(argIndexes.length)) return unsupported("expression.juel.method");
      const receiver = sub(receiverIndex);
      if (!receiver.ok) return receiver;
      if (receiver.value.tag === JValTag.Null) return fail("juel.propertyNotFound");
      const args: JVal[] = [];
      for (const index of argIndexes) {
        const arg = sub(index);
        if (!arg.ok) return arg;
        args.push(arg.value);
      }
      return invoke(target.method, receiver.value, args);
    }
  }
  return assertNever(target);
}

// dynamic-only: a receiver or argument kind outside the closed list's parameters is the run's data.
const wrongReceiver = <T>(): Eval<T> => unsupported("juel.methodReceiver");
const wrongArgument = <T>(): Eval<T> => unsupported("juel.methodArgument");

function invoke(method: JuelMethod, receiver: JVal, args: readonly JVal[]): Eval<JVal> {
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
  return value?.tag === JValTag.String ? value.value : null;
}

function intArgument(value: JVal | undefined): number | null {
  return value?.tag === JValTag.Int ? Number(BigInt.asIntN(32, value.value)) : null;
}

/** A String a cut or insertion produced, unless it split a surrogate pair. */
function whole(value: string): Eval<JVal> {
  // dynamic-only: a cut inside a surrogate pair depends on the run's data.
  return value.isWellFormed() ? ok(text(value)) : unsupported("juel.surrogateSplit");
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
      return ok(bool(first?.tag === JValTag.String && first.value === receiver));
    case JuelMethod.Contains:
    case JuelMethod.StartsWith:
    case JuelMethod.EndsWith:
    case JuelMethod.IndexOf:
    case JuelMethod.LastIndexOf:
    case JuelMethod.Concat: {
      const argument = textArgument(first);
      if (argument === null) return wrongArgument();
      return method === JuelMethod.Contains ? ok(bool(receiver.includes(argument)))
        : method === JuelMethod.StartsWith ? ok(bool(receiver.startsWith(argument)))
        : method === JuelMethod.EndsWith ? ok(bool(receiver.endsWith(argument)))
        : method === JuelMethod.IndexOf ? ok(integer(receiver.indexOf(argument)))
        : method === JuelMethod.LastIndexOf ? ok(integer(receiver.lastIndexOf(argument)))
        : ok(text(receiver + argument));
    }
    case JuelMethod.Substring: {
      const begin = intArgument(first);
      const end = args.length === 1 ? receiver.length : intArgument(second);
      if (begin === null || end === null) return wrongArgument();
      // `StringIndexOutOfBoundsException` (`String.substring`).
      if (begin < 0 || end > receiver.length || begin > end) return fail(elError);
      return whole(receiver.slice(begin, end));
    }
    case JuelMethod.ToUpperCase:
    case JuelMethod.ToLowerCase:
      // dynamic-only: Java maps a non-ASCII character by the JVM's default locale.
      if (!isAscii(receiver)) return unsupported("juel.nonAsciiText");
      return ok(text(method === JuelMethod.ToUpperCase ? receiver.toUpperCase() : receiver.toLowerCase()));
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
      return wrongReceiver();
  }
  return assertNever(method);
}

function listMethod(method: JuelMethod, receiver: JVal & { readonly tag: JValTag.List }, argument: JVal): Eval<JVal> {
  const items = receiver.items.map(fromValue);
  switch (method) {
    case JuelMethod.IsEmpty:
      return ok(bool(items.length === 0));
    case JuelMethod.Size:
      return ok(integer(items.length));
    case JuelMethod.Equals: {
      const answer = decided(javaEquals(receiver, argument));
      return answer.ok ? ok(bool(answer.value)) : stopped(answer);
    }
    case JuelMethod.Contains: {
      const answer = decided(some(items.map((item) => javaEquals(argument, item))));
      return answer.ok ? ok(bool(answer.value)) : stopped(answer);
    }
    case JuelMethod.IndexOf:
    case JuelMethod.LastIndexOf: {
      const order = method === JuelMethod.IndexOf ? items.map((_, index) => index) : items.map((_, index) => items.length - 1 - index);
      for (const index of order) {
        const answer = decided(javaEquals(argument, items[index] as JVal));
        if (!answer.ok) return stopped(answer);
        if (answer.value) return ok(integer(index));
      }
      return ok(integer(-1));
    }
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
      return wrongReceiver();
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
      const answer = decided(javaEquals(receiver, argument));
      return answer.ok ? ok(bool(answer.value)) : stopped(answer);
    }
    case JuelMethod.Get:
    case JuelMethod.ContainsKey: {
      const key = textArgument(argument);
      if (key === null) return wrongArgument();
      const entry = receiver.entries.find(([name]) => name === key);
      if (method === JuelMethod.ContainsKey) return ok(bool(entry !== undefined));
      return ok(entry === undefined ? nullValue : fromValue(entry[1]));
    }
    case JuelMethod.ContainsValue: {
      const answer = decided(some(receiver.entries.map(([, value]) => javaEquals(argument, fromValue(value)))));
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
    case JuelMethod.Replace:
      return wrongReceiver();
  }
  return assertNever(method);
}
