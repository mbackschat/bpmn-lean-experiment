/**
 * Locks the SingletonBusinessItem port domain of the serial-handoff amendment: String, Null, Boolean, Integer,
 * Decimal or Map from the portable value contract, with a 1,024-byte root String and no root List or StringList.
 *
 * The 1,024-byte bound is the oracle's own arithmetic over UTF-8 scalars, not the production byte counter, and the
 * legacy 20,480-byte root String stays valid elsewhere.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { VariableValueKind, isSingletonBusinessItem, isVariableValue } from "@bpmn-lean/semantic-core";
import { decimal, emptyMap, integer, list, map, nothing, order, revision, stringList, text, truth } from "./portable-handoff-fixture.ts";

test("accepts every scalar arm, Decimal and Map including the capsule's order and revision", () => {
  for (const value of [text("x"), text(""), nothing, truth(false), integer(0), decimal("-125", 2), emptyMap, order, revision]) {
    assert.equal(isSingletonBusinessItem(value), true, JSON.stringify(value));
  }
});

test("refuses a root List and a root StringList but accepts a List nested in a Map", () => {
  assert.equal(isSingletonBusinessItem(list()), false);
  assert.equal(isSingletonBusinessItem(list(integer(1))), false);
  assert.equal(isSingletonBusinessItem(stringList("a")), false);
  assert.equal(isSingletonBusinessItem(map(["items", list(integer(1), integer(1))])), true);
});

test("bounds a root String at exactly 1,024 UTF-8 bytes while every longer legacy String remains a valid value", () => {
  // Two-byte scalar: 512 of them are exactly the bound, and one ASCII byte more is the nearest over.
  const exact = "é".repeat(512);
  assert.equal(new TextEncoder().encode(exact).length, 1024);
  assert.equal(isSingletonBusinessItem(text(exact)), true);
  assert.equal(isSingletonBusinessItem(text(`${exact}a`)), false);
  assert.equal(isSingletonBusinessItem(text("a".repeat(1024))), true);
  assert.equal(isSingletonBusinessItem(text("a".repeat(1025))), false);
  // Four-byte scalars count by bytes, not by code units or code points.
  assert.equal(isSingletonBusinessItem(text("\u{1F600}".repeat(256))), true);
  assert.equal(isSingletonBusinessItem(text("\u{1F600}".repeat(257))), false);
  assert.equal(isVariableValue(text("a".repeat(5000))), true);
});

test("refuses an ill-formed value even where its kind is selected", () => {
  for (const malformed of [
    { kind: VariableValueKind.Decimal, coefficient: "120", scale: 1 },
    { kind: VariableValueKind.Decimal, coefficient: "1", scale: 7 },
    { kind: VariableValueKind.Map, value: [{ name: "b", value: nothing }, { name: "a", value: nothing }] },
    { kind: VariableValueKind.Map, value: [{ name: "a", value: stringList("legacy") }] },
    { kind: VariableValueKind.Integer, value: -1 },
    { kind: VariableValueKind.String, value: "\ud800" },
  ]) {
    assert.equal(isSingletonBusinessItem(malformed), false, JSON.stringify(malformed));
  }
});
