/**
 * The Core JUEL evaluator (`feature/data/juel.ts`) against the rules of the expression semantics
 * (docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#evaluation): each row builds one node table, evaluates it through
 * the registry's `evaluate` against named bindings, and expects a value, a failure code or an `unsupported` code. The
 * oracle is the pinned `cibseven-juel` source cited per rule in the semantics; the retained CIB evidence checks the
 * same rules end to end.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { hooks } from "@bpmn-lean/kernel";
import type { Value } from "@bpmn-lean/kernel";

type Node = Record<string, unknown>;

/** A post-order node table: each builder appends one node and returns its index. */
class Table {
  readonly nodes: Node[] = [];
  private add(node: Node): number {
    this.nodes.push(node);
    return this.nodes.length - 1;
  }
  text = (value: string): number => this.add({ tag: "text", value });
  composite = (...parts: number[]): number => this.add({ tag: "composite", parts });
  nil = (): number => this.add({ tag: "null" });
  bool = (value: boolean): number => this.add({ tag: "bool", value });
  int = (digits: string): number => this.add({ tag: "integer", digits });
  float = (lexeme: string): number => this.add({ tag: "float", lexeme });
  str = (value: string): number => this.add({ tag: "stringLiteral", value });
  id = (name: string): number => this.add({ tag: "identifier", name });
  fn = (name: string, ...args: number[]): number => this.add({ tag: "function", payload: { qualifier: null, name, args } });
  dot = (base: number, property: string): number => this.add({ tag: "dot", base, property });
  at = (base: number, property: number): number => this.add({ tag: "bracket", base, property });
  call = (receiver: number, method: string, ...args: number[]): number =>
    this.add({ tag: "call", payload: { receiver, target: { tag: "listed", method }, args } });
  other = (receiver: number, name: string, ...args: number[]): number =>
    this.add({ tag: "call", payload: { receiver, target: { tag: "other", name }, args } });
  computed = (receiver: number, name: number): number => this.add({ tag: "computedCall", payload: { receiver, name, args: [] } });
  un = (op: string, operand: number): number => this.add({ tag: "unary", op, operand });
  bin = (op: string, left: number, right: number): number => this.add({ tag: "binary", payload: { op, left, right } });
  choice = (condition: number, whenTrue: number, whenFalse: number): number =>
    this.add({ tag: "choice", payload: { condition, whenTrue, whenFalse } });
}

const int = (value: number): Value => ({ tag: "int", value } as unknown as Value);
const str = (value: string): Value => ({ tag: "string", value } as unknown as Value);
const bool = (value: boolean): Value => ({ tag: "bool", value } as unknown as Value);
const nil: Value = { tag: "null" } as unknown as Value;
const decimal = (coefficient: bigint, scale: number): Value => ({ tag: "decimal", coefficient, scale } as unknown as Value);
const list = (...items: Value[]): Value => ({ tag: "list", items } as unknown as Value);
const map = (...entries: [string, Value][]): Value => ({ tag: "map", entries } as unknown as Value);

type Expected = Readonly<{ value: Value }> | Readonly<{ failure: string }> | Readonly<{ unsupported: string }>;
type Row = Readonly<{ name: string; build: (t: Table) => unknown; variables?: [string, Value][]; expect: Expected }>;

const context: [string, Value][] = [
  ["a", int(7)], ["b", int(3)], ["s", str("7")], ["t", str("true")], ["word", str("abc")], ["blank", str("")],
  ["nothing", nil], ["flag", bool(true)], ["price", decimal(15n, 1)], ["numbers", list(int(3), int(5))],
  ["texts", list(str("x"), str("y"))], ["order", map(["id", str("A-1")], ["lines", list(map(["sku", str("S")]))])],
  ["emoji", str("a\u{1F600}b")], ["big", int(9007199254740991)],
];

const rows: readonly Row[] = [
  // Literals, text and composites (Scanner, AstComposite; EL §1.2.3)
  { name: "text alone", build: (t) => t.text("hello"), expect: { value: str("hello") } },
  { name: "composite renders each part as text", build: (t) => t.composite(t.text("n="), t.id("a"), t.text("/"), t.nil()), expect: { value: str("n=7/") } },
  { name: "composite renders a Decimal by BigDecimal.toString", build: (t) => t.composite(t.text(""), t.id("price")), expect: { value: str("1.5") } },
  { name: "integer literal", build: (t) => t.int("42"), expect: { value: int(42) } },
  { name: "floating literal is refused", build: (t) => t.float("1.5"), expect: { unsupported: "expression.juel.floatLiteral" } },
  { name: "malformed integer lexeme", build: (t) => t.int("9223372036854775808"), expect: { unsupported: "expression.juel.malformed" } },
  // Arithmetic (NumberOperations; EL §1.7)
  { name: "Integer arithmetic and precedence", build: (t) => t.bin("add", t.id("a"), t.bin("mul", t.id("b"), t.int("2"))), expect: { value: int(13) } },
  { name: "numeric text in arithmetic", build: (t) => t.bin("add", t.id("s"), t.int("1")), expect: { value: int(8) } },
  { name: "both null add to zero", build: (t) => t.bin("add", t.nil(), t.nil()), expect: { value: int(0) } },
  { name: "null as zero", build: (t) => t.bin("add", t.id("nothing"), t.int("1")), expect: { value: int(1) } },
  { name: "text with e that is no Double fails", build: (t) => t.bin("add", t.str("hello"), t.int("1")), expect: { failure: "juel.error" } },
  { name: "text that is a Double is unsupported", build: (t) => t.bin("gt", t.bin("add", t.str("1.5"), t.int("1")), t.int("2")), expect: { unsupported: "juel.double" } },
  // `Double.valueOf` takes a type suffix only after a numeral, never after NaN or Infinity (`FloatingDecimal.readJavaFormatString`)
  { name: "NaN text is a Double", build: (t) => t.bin("add", t.str("1.5"), t.str("NaN")), expect: { unsupported: "juel.double" } },
  { name: "suffixed numeral text is a Double", build: (t) => t.bin("add", t.str("1.5"), t.str("-2d")), expect: { unsupported: "juel.double" } },
  { name: "NaN with a suffix is no Double", build: (t) => t.bin("add", t.str("1.5"), t.str("NaNd")), expect: { failure: "juel.error" } },
  { name: "Infinity with a suffix is no Double", build: (t) => t.bin("add", t.str("1.5"), t.str("-Infinityf")), expect: { failure: "juel.error" } },
  { name: "text without e that is no number fails", build: (t) => t.bin("add", t.str("abc"), t.int("1")), expect: { failure: "juel.error" } },
  { name: "Boolean in arithmetic fails", build: (t) => t.bin("add", t.id("flag"), t.int("1")), expect: { failure: "juel.error" } },
  { name: "Long wraps at 2^63", build: (t) => t.bin("lt", t.bin("add", t.int("9223372036854775807"), t.int("1")), t.int("0")), expect: { value: bool(true) } },
  { name: "modulo keeps the dividend's sign", build: (t) => t.bin("mod", t.un("neg", t.id("a")), t.id("b")), expect: { unsupported: "juel.resultOutsideDomain" } },
  { name: "modulo by zero is an arithmetic failure", build: (t) => t.bin("mod", t.id("a"), t.int("0")), expect: { failure: "juel.arithmetic" } },
  { name: "division is refused", build: (t) => t.bin("div", t.id("a"), t.id("b")), expect: { unsupported: "expression.juel.division" } },
  { name: "a negative result is outside the domain", build: (t) => t.bin("sub", t.id("b"), t.id("a")), expect: { unsupported: "juel.resultOutsideDomain" } },
  { name: "an Integer beyond 2^53-1 is outside the domain", build: (t) => t.bin("add", t.id("big"), t.int("1")), expect: { unsupported: "juel.resultOutsideDomain" } },
  // Decimals
  { name: "Decimal plus Integer", build: (t) => t.bin("add", t.id("price"), t.int("1")), expect: { value: decimal(25n, 1) } },
  { name: "Decimal times Integer is non-canonical", build: (t) => t.bin("mul", t.id("price"), t.int("2")), expect: { unsupported: "juel.resultOutsideDomain" } },
  { name: "Decimal equality is scale-sensitive", build: (t) => t.bin("eq", t.bin("mul", t.id("price"), t.int("2")), t.int("3")), expect: { value: bool(false) } },
  { name: "Decimal ordering is by value", build: (t) => t.bin("gt", t.bin("mul", t.id("price"), t.int("2")), t.int("2")), expect: { value: bool(true) } },
  { name: "Decimal modulo is a Double", build: (t) => t.bin("mod", t.id("price"), t.int("1")), expect: { unsupported: "juel.double" } },
  { name: "Decimal against exponent text", build: (t) => t.bin("eq", t.id("price"), t.str("15e-1")), expect: { value: bool(true) } },
  // Relational and equality (BooleanOperations; EL §1.8)
  { name: "text order is by code unit", build: (t) => t.bin("lt", t.str("10"), t.str("9")), expect: { value: bool(true) } },
  { name: "Integer against text compares numbers", build: (t) => t.bin("lt", t.int("10"), t.str("9")), expect: { value: bool(false) } },
  { name: "both null are <=", build: (t) => t.bin("le", t.nil(), t.nil()), expect: { value: bool(true) } },
  { name: "one null is not <", build: (t) => t.bin("lt", t.nil(), t.int("1")), expect: { value: bool(false) } },
  { name: "Boolean against a List fails", build: (t) => t.bin("lt", t.id("flag"), t.id("numbers")), expect: { failure: "juel.error" } },
  { name: "two Lists cannot be ordered", build: (t) => t.bin("lt", t.id("numbers"), t.id("numbers")), expect: { unsupported: "juel.identity" } },
  { name: "Boolean against text", build: (t) => t.bin("eq", t.id("flag"), t.id("t")), expect: { value: bool(true) } },
  { name: "null equals empty text is false", build: (t) => t.bin("eq", t.id("nothing"), t.str("")), expect: { value: bool(false) } },
  { name: "List against text is collection text", build: (t) => t.bin("eq", t.id("texts"), t.str("x")), expect: { unsupported: "juel.collectionText" } },
  { name: "equal Lists of Strings", build: (t) => t.bin("eq", t.id("texts"), t.id("texts")), expect: { value: bool(true) } },
  { name: "Lists of Integers of unknown class", build: (t) => t.bin("eq", t.id("numbers"), t.id("numbers")), expect: { unsupported: "juel.integerCarrier" } },
  // Logical, empty, choice (EL §1.9 to §1.11)
  { name: "and skips its right operand", build: (t) => t.bin("and", t.bool(false), t.id("missing")), expect: { value: bool(false) } },
  { name: "or skips its right operand", build: (t) => t.bin("or", t.id("flag"), t.id("missing")), expect: { value: bool(true) } },
  { name: "numeric text as a Boolean is false", build: (t) => t.bin("and", t.id("s"), t.id("flag")), expect: { value: bool(false) } },
  { name: "Integer as a Boolean fails", build: (t) => t.un("not", t.id("a")), expect: { failure: "juel.error" } },
  { name: "empty of an empty String", build: (t) => t.un("empty", t.id("blank")), expect: { value: bool(true) } },
  { name: "empty of a missing name fails", build: (t) => t.un("empty", t.id("missing")), expect: { failure: "unknown-variable" } },
  { name: "choice evaluates one branch", build: (t) => t.choice(t.id("flag"), t.int("1"), t.id("missing")), expect: { value: int(1) } },
  // Identifiers and property access (AstIdentifier, AstProperty; EL §1.6)
  { name: "missing name fails as unknown-variable", build: (t) => t.id("missing"), expect: { failure: "unknown-variable" } },
  { name: "Map key by dot", build: (t) => t.dot(t.id("order"), "id"), expect: { value: str("A-1") } },
  { name: "absent Map key is null", build: (t) => t.dot(t.id("order"), "none"), expect: { value: nil } },
  { name: "nested List element and key", build: (t) => t.dot(t.at(t.dot(t.id("order"), "lines"), t.int("0")), "sku"), expect: { value: str("S") } },
  { name: "List index out of range is null", build: (t) => t.at(t.id("numbers"), t.int("5")), expect: { value: nil } },
  { name: "List index from text", build: (t) => t.at(t.id("numbers"), t.str("1")), expect: { value: int(5) } },
  { name: "List index from non-numeric text fails", build: (t) => t.at(t.id("numbers"), t.str("x")), expect: { failure: "juel.error" } },
  { name: "property of null is null and skips the property", build: (t) => t.at(t.id("nothing"), t.id("missing")), expect: { value: nil } },
  { name: "unknown String property fails", build: (t) => t.dot(t.id("word"), "size"), expect: { failure: "juel.propertyNotFound" } },
  { name: "String bean property is unsupported", build: (t) => t.at(t.id("word"), t.str("empty")), expect: { unsupported: "juel.beanProperty" } },
  { name: "Map with a non-String key", build: (t) => t.at(t.id("order"), t.int("1")), expect: { unsupported: "juel.indexType" } },
  // Methods (AstMethod; the closed list)
  { name: "length counts UTF-16 units", build: (t) => t.call(t.id("emoji"), "length"), expect: { value: int(4) } },
  { name: "substring inside a surrogate pair", build: (t) => t.call(t.id("emoji"), "substring", t.int("2")), expect: { unsupported: "juel.surrogateSplit" } },
  { name: "substring out of range fails", build: (t) => t.call(t.id("word"), "substring", t.int("2"), t.int("9")), expect: { failure: "juel.error" } },
  { name: "multi-character replace", build: (t) => t.call(t.id("word"), "replace", t.str("bc"), t.str("xyz")), expect: { value: str("axyz") } },
  { name: "empty-target replace inserts everywhere", build: (t) => t.call(t.id("word"), "replace", t.str(""), t.str("-")), expect: { value: str("-a-b-c-") } },
  { name: "trim strips controls and spaces", build: (t) => t.call(t.str("\t a \u0001"), "trim"), expect: { value: str("a") } },
  { name: "ASCII upper case", build: (t) => t.call(t.id("word"), "toUpperCase"), expect: { value: str("ABC") } },
  { name: "non-ASCII case mapping is unsupported", build: (t) => t.call(t.str("é"), "toUpperCase"), expect: { unsupported: "juel.nonAsciiText" } },
  { name: "indexOf on a String", build: (t) => t.call(t.id("word"), "indexOf", t.str("c")), expect: { value: int(2) } },
  { name: "String length equals a Long literal", build: (t) => t.bin("eq", t.call(t.id("word"), "length"), t.int("3")), expect: { value: bool(true) } },
  { name: "List contains of an Integer-class value", build: (t) => t.call(t.id("numbers"), "contains", t.call(t.id("word"), "length")), expect: { unsupported: "juel.integerCarrier" } },
  { name: "List contains of a String", build: (t) => t.call(t.id("texts"), "contains", t.str("y")), expect: { value: bool(true) } },
  { name: "List contains of an unequal Integer", build: (t) => t.call(t.id("numbers"), "contains", t.int("4")), expect: { value: bool(false) } },
  { name: "List get out of range fails", build: (t) => t.call(t.id("texts"), "get", t.int("2")), expect: { failure: "juel.error" } },
  { name: "Map get and containsKey", build: (t) => t.bin("and", t.call(t.id("order"), "containsKey", t.str("id")), t.bin("eq", t.call(t.id("order"), "get", t.str("id")), t.str("A-1"))), expect: { value: bool(true) } },
  { name: "size is on Lists and Maps", build: (t) => t.call(t.id("order"), "size"), expect: { value: int(2) } },
  { name: "method on a null receiver fails", build: (t) => t.call(t.id("nothing"), "length"), expect: { failure: "juel.propertyNotFound" } },
  { name: "method on a wrong receiver", build: (t) => t.call(t.id("a"), "length"), expect: { unsupported: "juel.methodReceiver" } },
  { name: "String lacks a List method", build: (t) => t.call(t.id("word"), "size"), expect: { failure: "juel.error" } },
  { name: "String lacks a Map method", build: (t) => t.call(t.id("word"), "containsKey", t.str("a")), expect: { failure: "juel.error" } },
  { name: "List lacks a String method", build: (t) => t.call(t.id("texts"), "length"), expect: { failure: "juel.error" } },
  { name: "List lacks a Map method", build: (t) => t.call(t.id("texts"), "containsValue", t.str("x")), expect: { failure: "juel.error" } },
  { name: "Map lacks a String method", build: (t) => t.call(t.id("order"), "contains", t.str("id")), expect: { failure: "juel.error" } },
  { name: "Map replace is Java's writing Map.replace", build: (t) => t.call(t.id("order"), "replace", t.str("id"), t.str("B")), expect: { unsupported: "juel.methodReceiver" } },
  { name: "Boolean receiver of equals", build: (t) => t.call(t.id("flag"), "equals", t.bool(true)), expect: { unsupported: "juel.methodReceiver" } },
  { name: "method with a wrong argument kind", build: (t) => t.call(t.id("word"), "startsWith", t.int("1")), expect: { unsupported: "juel.methodArgument" } },
  { name: "unlisted method is refused", build: (t) => t.other(t.id("word"), "getClass"), expect: { unsupported: "expression.juel.method" } },
  { name: "computed method is refused", build: (t) => t.computed(t.id("word"), t.str("length")), expect: { unsupported: "expression.juel.computedMethod" } },
  { name: "function is refused", build: (t) => t.fn("now"), expect: { unsupported: "expression.juel.function" } },
  { name: "List to text is unsupported", build: (t) => t.composite(t.text("x"), t.id("texts")), expect: { unsupported: "juel.collectionText" } },
];

const evaluateTable = (row: Row) => {
  const table = new Table();
  row.build(table);
  const expression = { tag: "juel", nodes: table.nodes } as never;
  return hooks.evaluate({ variables: row.variables ?? context, nowMs: 0 } as never, expression) as unknown as Record<string, unknown>;
};

for (const row of rows) {
  test(`juel: ${row.name}`, () => {
    const actual = evaluateTable(row);
    if ("value" in row.expect) assert.deepEqual(actual, { tag: "value", result: row.expect.value });
    else if ("failure" in row.expect) assert.deepEqual(actual, { tag: "failure", code: row.expect.failure });
    else assert.deepEqual(actual, { tag: "unsupported", code: row.expect.unsupported });
  });
}

test("juel: an empty node table is malformed", () => {
  const actual = hooks.evaluate({ variables: [], nowMs: 0 } as never, { tag: "juel", nodes: [] } as never) as unknown;
  assert.deepEqual(actual, { tag: "unsupported", code: "expression.juel.malformed" });
});

test("juel: a text the reader left unparsed is unsupported, as admission refuses it", () => {
  const actual = hooks.evaluate({ variables: [], nowMs: 0 } as never, { tag: "foreign", language: "juel", source: "${x}" } as never) as unknown;
  assert.deepEqual(actual, { tag: "unsupported", code: "expression.outsideSimpleBoolean" });
});
