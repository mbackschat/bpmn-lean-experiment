/**
 * Locks the recursive portable value contract of `PORTABLE-BUSINESS-VALUES-PROPOSAL` rules PBV-TYPE-01, PBV-TREE-01,
 * PBV-AMOUNT-01, PBV-BOUND-01, PBV-IDENTITY-01 and PBV-COPY-01 at the shared validation, equality and copy owner.
 *
 * The oracle is the proposal's finite limits and the capsule's 12-node order, with every byte length computed here
 * from a rebuilt canonical object rather than from the production validator.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SimpleBooleanExpressionKind,
  StimulusKind,
  VariableValueKind,
  cloneVariableBinding,
  cloneVariableValue,
  isVariableBinding,
  isVariablePatch,
  isVariableValue,
  isWellFormedStimulus,
  sameVariablePatch,
  evaluateSimpleBooleanExpression,
  sameVariableValue,
} from "@bpmn-lean/semantic-core";
import type { BusinessValue, VariableValue } from "@bpmn-lean/semantic-core";

const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
const integer = (value: number): BusinessValue => ({ kind: VariableValueKind.Integer, value });
const truth = (value: boolean): BusinessValue => ({ kind: VariableValueKind.Boolean, value });
const nothing: BusinessValue = { kind: VariableValueKind.Null };
const decimal = (coefficient: string, scale: number): BusinessValue =>
  ({ kind: VariableValueKind.Decimal, coefficient, scale });
const list = (...value: BusinessValue[]): BusinessValue => ({ kind: VariableValueKind.List, value });
const map = (...entries: Array<readonly [string, BusinessValue]>): BusinessValue =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) });

const line = (quantity: number, sku: string): BusinessValue =>
  map(["quantity", integer(quantity)], ["sku", text(sku)]);
const order: BusinessValue = map(
  ["address", map(["city", text("Berlin")], ["line2", nothing])],
  ["items", list(line(1, "A"), line(1, "A"))],
  ["total", decimal("12345", 2)],
);
const revision: BusinessValue = map(
  ["address", map(["city", text("Berlin")], ["line2", nothing])],
  ["items", list(line(2, "B"), line(1, "A"))],
  ["total", decimal("-125", 2)],
);

/** Rebuilds canonical field order independently of the production validator, then measures UTF-8 bytes. */
function canonicalBytes(value: BusinessValue): number {
  const canonical = (node: BusinessValue): unknown => {
    switch (node.kind) {
      case VariableValueKind.List:
        return { kind: node.kind, value: node.value.map(canonical) };
      case VariableValueKind.Map:
        return { kind: node.kind, value: node.value.map((entry) => ({ name: entry.name, value: canonical(entry.value) })) };
      default:
        return node;
    }
  };
  return Buffer.byteLength(JSON.stringify(canonical(value)), "utf8");
}

function nodeCount(value: BusinessValue): number {
  switch (value.kind) {
    case VariableValueKind.List: return 1 + value.value.reduce((sum, member) => sum + nodeCount(member), 0);
    case VariableValueKind.Map: return 1 + value.value.reduce((sum, entry) => sum + nodeCount(entry.value), 0);
    default: return 1;
  }
}

function accepts(label: string, value: unknown): void {
  assert.equal(isVariableValue(value), true, `${label} must be a valid value`);
  assert.equal(isVariableBinding({ name: "candidate", value }), true, `${label} must be a valid binding value`);
}

function rejects(label: string, value: unknown): void {
  assert.equal(isVariableValue(value), false, `${label} must be rejected`);
  assert.equal(isVariableBinding({ name: "candidate", value }), false, `${label} must be rejected in a binding`);
  assert.equal(isVariablePatch([{ name: "candidate", value }]), false, `${label} must be rejected in a patch`);
}

/** Nests a leaf under `containers` alternating List and Map nodes, outermost first. */
function nest(containers: number, leaf: BusinessValue, alternate = false): BusinessValue {
  let value = leaf;
  for (let level = containers; level >= 1; level -= 1) {
    value = alternate && level % 2 === 0 ? map(["k", value]) : list(value);
  }
  return value;
}

const sortedNames = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `k${String(index).padStart(2, "0")}`);

/** A List whose canonical JSON is exactly `target` bytes, using only 1,024-byte String members. */
function listOfCanonicalBytes(target: number): BusinessValue {
  const members: BusinessValue[] = [];
  for (;;) {
    const room = target - canonicalBytes(list(...members, text("")));
    assert.ok(room >= 0, "target below the structural minimum");
    if (room <= 1024) {
      return list(...members, text("a".repeat(room)));
    }
    members.push(text("a".repeat(1024)));
  }
}

/** A List of Lists of Nulls with exactly `total` value nodes, root included. */
function listOfNodes(total: number): BusinessValue {
  let leaves = total - 1 - 32;
  const rows: BusinessValue[] = [];
  for (let row = 0; row < 32; row += 1) {
    const count = Math.min(32, leaves);
    leaves -= count;
    rows.push(list(...Array.from({ length: count }, () => nothing)));
  }
  assert.equal(leaves, 0);
  return list(...rows);
}

test("PBV-TYPE-01 keeps Boolean, String, Integer, Decimal, Null and the empty collections pairwise distinct", () => {
  const values: ReadonlyArray<BusinessValue> = [
    truth(true), text("true"), integer(1), decimal("1", 0), nothing, list(), map(), list(text("1")),
  ];
  for (const [leftIndex, left] of values.entries()) {
    accepts(`value ${leftIndex}`, left);
    for (const [rightIndex, right] of values.entries()) {
      assert.equal(sameVariableValue(left, right), leftIndex === rightIndex, `${leftIndex} against ${rightIndex}`);
    }
  }
  const legacy: VariableValue = { kind: VariableValueKind.StringList, value: ["1"] };
  assert.equal(sameVariableValue(list(text("1")), legacy), false);
  assert.equal(sameVariableValue(legacy, list(text("1"))), false);
});

test("PBV-TREE-01 accepts the 12-node order and its revision and detects every structural mutation", () => {
  assert.equal(nodeCount(order), 12);
  for (const [label, value] of [["order", order], ["revision", revision]] as const) {
    accepts(label, value);
    accepts(`${label} after a JSON round trip`, JSON.parse(JSON.stringify(value)));
  }
  assert.equal(sameVariableValue(order, JSON.parse(JSON.stringify(order))), true);
  assert.equal(sameVariableValue(order, revision), false);

  const mutations: ReadonlyArray<readonly [string, BusinessValue]> = [
    ["one item removed", map(
      ["address", map(["city", text("Berlin")], ["line2", nothing])],
      ["items", list(line(1, "A"))],
      ["total", decimal("12345", 2)],
    )],
    ["unequal items swapped", map(
      ["address", map(["city", text("Berlin")], ["line2", nothing])],
      ["items", list(line(1, "A"), line(2, "A"))],
      ["total", decimal("12345", 2)],
    )],
    ["Null replaced by absence", map(
      ["address", map(["city", text("Berlin")])],
      ["items", list(line(1, "A"), line(1, "A"))],
      ["total", decimal("12345", 2)],
    )],
    ["Null replaced by an empty String", map(
      ["address", map(["city", text("Berlin")], ["line2", text("")])],
      ["items", list(line(1, "A"), line(1, "A"))],
      ["total", decimal("12345", 2)],
    )],
    ["total scale changed", map(
      ["address", map(["city", text("Berlin")], ["line2", nothing])],
      ["items", list(line(1, "A"), line(1, "A"))],
      ["total", decimal("12345", 3)],
    )],
    ["total replaced by the same Integer digits", map(
      ["address", map(["city", text("Berlin")], ["line2", nothing])],
      ["items", list(line(1, "A"), line(1, "A"))],
      ["total", integer(12345)],
    )],
  ];
  for (const [label, mutated] of mutations) {
    accepts(label, mutated);
    assert.equal(sameVariableValue(order, mutated), false, label);
    assert.equal(sameVariableValue(mutated, order), false, label);
  }
  const reordered = list(line(1, "A"), line(2, "B"));
  assert.equal(sameVariableValue(reordered, list(line(2, "B"), line(1, "A"))), false);
  assert.equal(sameVariableValue(list(line(1, "A")), list(line(1, "A"), line(1, "A"))), false);
});

test("PBV-TREE-01 admits an order as a well-formed Start stimulus and keeps its patch comparison exact", () => {
  const start = (value: BusinessValue) => ({
    kind: StimulusKind.StartProcess,
    commandId: "start-order",
    processId: "Process_Order",
    instanceId: "Instance_Order",
    initialVariables: [{ name: "order", value }],
  });
  assert.equal(isWellFormedStimulus(start(order)), true);
  assert.equal(isWellFormedStimulus(start(list(decimal("01", 0)))), false);
  assert.equal(sameVariablePatch([{ name: "order", value: order }], [{ name: "order", value: structuredClone(order) }]), true);
  assert.equal(sameVariablePatch([{ name: "order", value: order }], [{ name: "order", value: revision }]), false);
});

test("PBV-AMOUNT-01 preserves exact signed coefficients and scales at every bound", () => {
  const valid: ReadonlyArray<readonly [string, number]> = [
    ["12345", 2], ["-125", 2], ["0", 0], ["9223372036854775807", 0], ["-9223372036854775808", 0],
    ["9007199254740993", 0], ["1", 6], ["-1", 6], ["10", 0], ["5", 1], ["-9223372036854775808", 6],
  ];
  for (const [coefficient, scale] of valid) {
    const value = decimal(coefficient, scale);
    accepts(`${coefficient}/${scale}`, value);
    assert.equal(sameVariableValue(value, cloneVariableValue(value)), true);
    assert.equal(sameVariableValue(value, decimal(coefficient, scale)), true);
  }
  // A Double round trip would turn this coefficient into 9007199254740992.
  const beyondDouble = cloneVariableValue(decimal("9007199254740993", 0));
  assert.deepEqual(beyondDouble, decimal("9007199254740993", 0));
  assert.equal(sameVariableValue(beyondDouble, decimal("9007199254740992", 0)), false);
  assert.equal(sameVariableValue(decimal("12345", 2), decimal("-12345", 2)), false);
  assert.equal(sameVariableValue(decimal("12345", 2), decimal("1234", 1)), false);

  const invalid: ReadonlyArray<readonly [string, unknown, unknown]> = [
    ["one over the positive bound", "9223372036854775808", 0],
    ["one over the negative bound", "-9223372036854775809", 0],
    ["a far over-bound coefficient", "9".repeat(4096), 0],
    ["negative zero", "-0", 0],
    ["a leading zero", "01", 0],
    ["a leading zero after a minus", "-01", 0],
    ["a plus sign", "+1", 0],
    ["an exponent", "1e2", 0],
    ["a decimal point", "1.5", 0],
    ["an empty coefficient", "", 0],
    ["a lone minus", "-", 0],
    ["surrounding whitespace", " 1", 0],
    ["a trailing newline", "1\n", 0],
    ["a non-ASCII digit", "٣", 0],
    ["a trailing zero at positive scale", "123450", 3],
    ["a negative trailing zero at positive scale", "-120", 1],
    ["a zero coefficient at positive scale", "0", 1],
    ["scale seven", "1", 7],
    ["a negative scale", "1", -1],
    ["negative zero scale", "1", -0],
    ["a fractional scale", "1", 1.5],
    ["a String scale", "1", "1"],
    ["a NaN scale", "1", Number.NaN],
    ["an infinite scale", "1", Number.POSITIVE_INFINITY],
    ["a Number coefficient", 12345, 2],
    ["a Null coefficient", null, 0],
    ["a BigInt coefficient", 12345n, 2],
  ];
  for (const [label, coefficient, scale] of invalid) {
    rejects(label, { kind: "decimal", coefficient, scale });
  }
  for (const [label, shape] of [
    ["a missing scale", { kind: "decimal", coefficient: "1" }],
    ["a missing coefficient", { kind: "decimal", scale: 0 }],
    ["an extra field", { kind: "decimal", coefficient: "1", scale: 0, value: 1 }],
    ["a value field instead of the components", { kind: "decimal", value: "1" }],
    ["a bare kind", { kind: "decimal" }],
  ] as const) {
    rejects(label, shape);
  }
  // A Decimal member inherits the same domain: an invalid component rejects the whole tree.
  rejects("a nested invalid Decimal", list(decimal("123450", 3)));
  rejects("a nested over-bound Decimal", map(["total", decimal("9223372036854775808", 0)]));
});

test("PBV-BOUND-01 enforces container depth, member count, node count and canonical bytes at exact and one-over", () => {
  accepts("a root Decimal at container depth zero", decimal("1", 0));
  for (const alternate of [false, true]) {
    accepts(`four nested containers alternate=${alternate}`, nest(4, nothing, alternate));
    rejects(`five nested containers alternate=${alternate}`, nest(5, nothing, alternate));
  }
  accepts("four nested containers ending in an empty List", nest(3, list()));
  rejects("five nested containers ending in an empty List", nest(4, list()));
  accepts("a Decimal leaf under four nested containers", nest(4, decimal("1", 0)));
  rejects("a Decimal leaf under five nested containers", nest(5, decimal("1", 0)));

  const cycle: { kind: string; value: unknown[] } = { kind: "list", value: [] };
  cycle.value.push(cycle);
  rejects("a cyclic in-memory List", cycle);

  accepts("32 List members", list(...Array.from({ length: 32 }, () => nothing)));
  rejects("33 List members", list(...Array.from({ length: 33 }, () => nothing)));
  accepts("32 Map entries", map(...sortedNames(32).map((name) => [name, nothing] as const)));
  rejects("33 Map entries", map(...sortedNames(33).map((name) => [name, nothing] as const)));

  const atNodeLimit = listOfNodes(256);
  assert.equal(nodeCount(atNodeLimit), 256);
  accepts("256 value nodes", atNodeLimit);
  const overNodeLimit = listOfNodes(257);
  assert.equal(nodeCount(overNodeLimit), 257);
  rejects("257 value nodes", overNodeLimit);

  const atByteLimit = listOfCanonicalBytes(16_384);
  assert.equal(canonicalBytes(atByteLimit), 16_384);
  accepts("16384 canonical bytes", atByteLimit);
  const overByteLimit = listOfCanonicalBytes(16_385);
  assert.equal(canonicalBytes(overByteLimit), 16_385);
  rejects("16385 canonical bytes", overByteLimit);
  // Raw text is 4,096 bytes, but each control character escapes to six canonical bytes.
  const escaped = list(...Array.from({ length: 4 }, () => text("\u0001".repeat(1024))));
  assert.ok(canonicalBytes(escaped) > 16_384);
  rejects("escaped control characters over the canonical byte limit", escaped);
  // Field order of an in-memory object does not change the measured canonical bytes.
  accepts("a reordered object at the byte limit", { value: (atByteLimit as { value: unknown }).value, kind: "list" });
  rejects("a reordered object one byte over", { value: (overByteLimit as { value: unknown }).value, kind: "list" });
});

test("PBV-BOUND-01 measures nested Strings and Map names in UTF-8 bytes, not code units", () => {
  accepts("a 1024-byte nested String", list(text("a".repeat(1024))));
  rejects("a 1025-byte nested String", list(text("a".repeat(1025))));
  accepts("1023 bytes of three-byte scalars", list(text("€".repeat(341))));
  rejects("1026 bytes of three-byte scalars", list(text("€".repeat(342))));
  accepts("1024 bytes of four-byte scalars", list(text("\u{1d11e}".repeat(256))));
  rejects("1028 bytes of four-byte scalars", list(text("\u{1d11e}".repeat(257))));
  accepts("a 1024-byte Map name", map(["a".repeat(1024), nothing]));
  rejects("a 1025-byte Map name", map(["a".repeat(1025), nothing]));
  accepts("1024 bytes of four-byte scalars in a Map name", map(["\u{1d11e}".repeat(256), nothing]));
  rejects("1028 bytes of four-byte scalars in a Map name", map(["\u{1d11e}".repeat(257), nothing]));
  accepts("an empty Map name", map(["", nothing]));
  // The root String arm keeps its established domain; the 1024-byte bound belongs to nested Strings only.
  accepts("a 2000-byte root String", text("a".repeat(2000)));
  rejects("a lone high surrogate in a nested String", list(text("\ud800")));
  rejects("a lone low surrogate in a nested String", list(text("\udc00")));
  rejects("a lone surrogate in a Map name", map(["\ud800", nothing]));
});

test("PBV-BOUND-01 requires canonical Map order by Unicode scalar value and rejects aliases", () => {
  const entry = (name: string) => [name, nothing] as const;
  accepts("ascending names", map(entry("a"), entry("ab"), entry("b")));
  accepts("the empty name first", map(entry(""), entry("a")));
  accepts("scalar order across the surrogate range", map(entry("￿"), entry("\u{10000}")));
  accepts("a precomposed letter after ASCII", map(entry("z"), entry("é")));
  for (const [label, entries] of [
    ["descending names", [entry("b"), entry("a")]],
    ["duplicate names", [entry("a"), entry("a")]],
    ["a prefix after its extension", [entry("ab"), entry("a")]],
    ["the empty name last", [entry("a"), entry("")]],
    ["UTF-16 order across the surrogate range", [entry("\u{10000}"), entry("￿")]],
    ["a duplicate after a valid run", [entry("a"), entry("b"), entry("b")]],
  ] as const) {
    rejects(label, map(...entries));
  }
  rejects("an unsorted Map nested in a List", list(map(entry("b"), entry("a"))));
});

test("PBV-BOUND-01 validates the complete tree before any use", () => {
  const validPrefix = Array.from({ length: 31 }, () => nothing);
  rejects("a valid prefix then an invalid last List member", list(...validPrefix, decimal("01", 0)));
  rejects("a valid prefix then an unsorted last Map entry", map(
    ...sortedNames(31).map((name) => [name, nothing] as const), ["a", nothing],
  ));
  rejects("a valid first entry then an invalid last entry", map(["a", nothing], ["b", decimal("0", 1)]));
  rejects("a valid sibling then a deep invalid leaf", list(nothing, list(list(list(decimal("1", 7))))));
  accepts("a legacy StringList at the root", { kind: "stringList", value: ["a"] });
  rejects("a legacy StringList inside a List", list({ kind: "stringList", value: ["a"] } as unknown as BusinessValue));
  rejects("a legacy StringList as a Map entry value", map(["a", { kind: "stringList", value: [] } as unknown as BusinessValue]));
  rejects("a legacy StringList at depth four", nest(3, { kind: "stringList", value: [] } as unknown as BusinessValue));
});

test("PBV-IDENTITY-01 rejects malformed nested nodes and unknown or missing fields at every depth", () => {
  const hostile: ReadonlyArray<readonly [string, unknown]> = [
    ["an unknown nested kind", { kind: "list", value: [{ kind: "object" }] }],
    ["a missing nested kind", { kind: "list", value: [{ value: "a" }] }],
    ["a nested Boolean carrying a String", { kind: "list", value: [{ kind: "boolean", value: "true" }] }],
    ["a nested Null carrying a value", { kind: "list", value: [{ kind: "null", value: null }] }],
    ["a nested String carrying a Number", { kind: "list", value: [{ kind: "string", value: 1 }] }],
    ["a nested negative Integer", { kind: "list", value: [{ kind: "integer", value: -1 }] }],
    ["a nested fractional Integer", { kind: "list", value: [{ kind: "integer", value: 1.5 }] }],
    ["a nested unsafe Integer", { kind: "list", value: [{ kind: "integer", value: 9007199254740992 }] }],
    ["a nested negative-zero Integer", { kind: "list", value: [{ kind: "integer", value: -0 }] }],
    ["a nested Integer carrying a String", { kind: "list", value: [{ kind: "integer", value: "1" }] }],
    ["a nested Null member", { kind: "list", value: [null] }],
    ["a nested undefined member", { kind: "list", value: [undefined] }],
    ["a nested bare String member", { kind: "list", value: ["a"] }],
    ["a nested array member", { kind: "list", value: [[]] }],
    ["an extra List field", { kind: "list", value: [], extra: 1 }],
    ["a missing List value", { kind: "list" }],
    ["a List value that is an object", { kind: "list", value: {} }],
    ["a List value that is a String", { kind: "list", value: "a" }],
    ["a Map value that is an object", { kind: "map", value: {} }],
    ["an extra Map field", { kind: "map", value: [], extra: 1 }],
    ["a missing Map value", { kind: "map" }],
    ["a Map entry that is null", { kind: "map", value: [null] }],
    ["a Map entry that is an array", { kind: "map", value: [["a", { kind: "null" }]] }],
    ["a Map entry without a name", { kind: "map", value: [{ value: { kind: "null" } }] }],
    ["a Map entry without a value", { kind: "map", value: [{ name: "a" }] }],
    ["a Map entry with an extra field", { kind: "map", value: [{ name: "a", value: { kind: "null" }, extra: 1 }] }],
    ["a Map entry with a Number name", { kind: "map", value: [{ name: 1, value: { kind: "null" } }] }],
    ["a Map entry with a Null name", { kind: "map", value: [{ name: null, value: { kind: "null" } }] }],
    ["a Map entry with an undefined value", { kind: "map", value: [{ name: "a", value: undefined }] }],
    ["a Map entry with a bare value", { kind: "map", value: [{ name: "a", value: "b" }] }],
    ["an object without own fields inheriting a kind", Object.create({ kind: "null" })],
    ["a nested object inheriting its fields", { kind: "list", value: [Object.create({ kind: "null" })] }],
  ];
  for (const [label, value] of hostile) {
    rejects(label, value);
  }
  const sparse: unknown[] = [];
  sparse.length = 1;
  rejects("a sparse List", { kind: "list", value: sparse });
  const decorated: unknown[] = [{ kind: "null" }];
  Reflect.set(decorated, "extra", true);
  rejects("a List array with an extra own property", { kind: "list", value: decorated });
  const sparseEntries: unknown[] = [];
  sparseEntries.length = 1;
  rejects("a sparse Map", { kind: "map", value: sparseEntries });
});

test("PBV-IDENTITY-01 accepts differing object field order but compares one typed value", () => {
  const reordered = {
    value: [{ value: { value: "A", kind: "string" }, name: "sku" }],
    kind: "map",
  };
  accepts("a Map with reordered fields", reordered);
  assert.equal(sameVariableValue(reordered as unknown as VariableValue, map(["sku", text("A")])), true);
  const decimalReordered = { scale: 2, coefficient: "12345", kind: "decimal" };
  accepts("a Decimal with reordered fields", decimalReordered);
  assert.equal(sameVariableValue(decimalReordered as unknown as VariableValue, decimal("12345", 2)), true);
});

test("PBV-COPY-01 detaches every nested array and object and ignores later caller mutation", () => {
  const caller = structuredClone(order);
  const clone = cloneVariableValue(caller);
  assert.deepEqual(clone, order);
  assertNoSharedReferences(caller, clone);

  const members = walk(caller, "value", 1, "value", "value") as unknown[];
  Reflect.set(walk(members, 0, "value", 1, "value") as object, "value", "MUTATED");
  members.push(members[0]);
  Reflect.set(walk(caller, "value", 2, "value") as object, "coefficient", "1");
  (walk(caller, "value") as unknown[]).push({ name: "zzz", value: { kind: "null" } });
  assert.deepEqual(clone, order);
  assert.equal(isVariableValue(clone), true);

  const binding = { name: "order", value: order };
  const copiedBinding = cloneVariableBinding(binding);
  assert.deepEqual(copiedBinding, binding);
  assertNoSharedReferences(binding, copiedBinding);
  assert.deepEqual(cloneVariableValue({ kind: VariableValueKind.StringList, value: ["a", "a"] }),
    { kind: VariableValueKind.StringList, value: ["a", "a"] });
  assert.deepEqual(cloneVariableValue(nothing), nothing);
  assert.deepEqual(cloneVariableValue(list()), list());
  assert.deepEqual(cloneVariableValue(map()), map());
});

/** Follows a property or index path through a value to the node a caller could still mutate. */
function walk(node: unknown, ...path: ReadonlyArray<string | number>): unknown {
  return path.reduce<unknown>((current, key) => Reflect.get(current as object, key), node);
}

test("the Simple Boolean evaluator treats a present Decimal, List or Map like any other non-String, non-Null value", () => {
  const present: ReadonlyArray<VariableValue> = [
    decimal("1", 0), list(), list(text("approved")), map(), map(["state", text("approved")]),
    { kind: VariableValueKind.Integer, value: 1 }, { kind: VariableValueKind.StringList, value: ["approved"] },
  ];
  for (const value of present) {
    const bindings = [{ name: "candidate", value }];
    const evaluate = (expression: Parameters<typeof evaluateSimpleBooleanExpression>[0]) =>
      evaluateSimpleBooleanExpression(expression, bindings);
    assert.equal(evaluate({ kind: SimpleBooleanExpressionKind.IsPresent, variable: "candidate" }), true, value.kind);
    assert.equal(evaluate({ kind: SimpleBooleanExpressionKind.IsNull, variable: "candidate" }), false, value.kind);
    // No coercion: a collection or Decimal never equals the text it might print as.
    assert.equal(
      evaluate({ kind: SimpleBooleanExpressionKind.StringEquals, variable: "candidate", value: "approved" }),
      false,
      value.kind,
    );
    assert.equal(
      evaluate({ kind: SimpleBooleanExpressionKind.StringEquals, variable: "candidate", value: "1" }),
      false,
      value.kind,
    );
  }
  assert.throws(
    () => evaluateSimpleBooleanExpression(
      { kind: SimpleBooleanExpressionKind.IsPresent, variable: "candidate" },
      [{ name: "candidate", value: list() }, { name: "candidate", value: list() }],
    ),
    /duplicate bindings/u,
  );
});

function assertNoSharedReferences(original: unknown, copy: unknown): void {
  if (original === null || typeof original !== "object") {
    return;
  }
  assert.notEqual(original, copy, "a container must not be shared with its copy");
  for (const key of Object.keys(original)) {
    assertNoSharedReferences(Reflect.get(original, key), Reflect.get(copy as object, key));
  }
}
