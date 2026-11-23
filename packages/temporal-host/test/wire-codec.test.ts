/**
 * The continuation codec: kernel state crosses Continue-As-New and Temporal payloads as JSON, and a decimal's
 * `bigint` coefficient must survive the trip exactly. Anything JSON cannot carry faithfully is a harness error.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const codec = await import(new URL("../dist/wire-codec.js", import.meta.url).href) as
  typeof import("../src/wire-codec.ts");

test("plain data and big decimal coefficients round-trip exactly", () => {
  const state = {
    instanceId: "I",
    variables: [["", [["amount", { tag: "decimal", coefficient: 123456789012345678901234567890n, scale: 2 }]]]],
    failure: null,
    flags: [true, false],
  };
  const wire = codec.toWire(state);
  assert.deepEqual(JSON.parse(JSON.stringify(wire)), wire);
  assert.deepEqual(codec.fromWire(wire), state);
});

test("a value JSON cannot carry is refused rather than silently changed", () => {
  assert.throws(() => codec.toWire({ missing: undefined }), TypeError);
  assert.throws(() => codec.toWire([Number.NaN]), TypeError);
  assert.throws(() => codec.toWire(new Map()), TypeError);
});

test("an object that merely looks like the marker is refused on decode", () => {
  assert.throws(() => codec.fromWire({ $bigint: 7 }), TypeError);
});

const longText = "interned-text";

test("a String of 8 code units occurring twice is interned, one of 7 or one occurring once is written in place", () => {
  const eight = "12345678";
  const seven = "1234567";
  assert.deepEqual(codec.internStrings([eight, eight, seven, seven, "only-once-here"]),
    { strings: [eight], body: [{ $: 0 }, { $: 0 }, seven, seven, "only-once-here"] });
});

test("interning round-trips and orders its table by code unit whatever the traversal order", () => {
  const forward = { first: ["zzzzzzzz", "aaaaaaaa", "zzzzzzzz"], second: { x: "aaaaaaaa", y: "mmmmmmmm", z: "mmmmmmmm" } };
  const backward = { second: { z: "mmmmmmmm", y: "mmmmmmmm", x: "aaaaaaaa" }, first: ["aaaaaaaa", "zzzzzzzz", "zzzzzzzz"] };
  const encoded = codec.internStrings(forward);
  assert.deepEqual((encoded as { strings: string[] }).strings, ["aaaaaaaa", "mmmmmmmm", "zzzzzzzz"]);
  assert.deepEqual((codec.internStrings(backward) as { strings: string[] }).strings, (encoded as { strings: string[] }).strings);
  assert.equal(JSON.stringify(codec.internStrings(forward)), JSON.stringify(encoded), "the same value gives the same bytes");
  assert.deepEqual(codec.expandStrings(JSON.parse(JSON.stringify(encoded))), forward);
});

test("a decoded reference outside the table is a harness error", () => {
  assert.throws(() => codec.expandStrings({ strings: [longText], body: { $: 1 } }), TypeError);
  assert.throws(() => codec.expandStrings({ strings: [longText], body: { $: -1 } }), TypeError);
  assert.throws(() => codec.expandStrings({ strings: [longText], body: { $: "0" } }), TypeError);
  assert.throws(() => codec.expandStrings({ strings: [longText], body: [{ $: 5 }] }), TypeError);
  assert.throws(() => codec.expandStrings([longText]), TypeError);
  assert.deepEqual(codec.expandStrings({ strings: [longText], body: [{ $: 0 }] }), [longText]);
});

test("an object whose only member is the reference marker cannot be written", () => {
  assert.throws(() => codec.internStrings({ $: 0 }), TypeError);
});
