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
    variables: [{ scope: 0, entries: [["amount", { tag: "decimal", coefficient: 123456789012345678901234567890n, scale: 2 }]] }],
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
