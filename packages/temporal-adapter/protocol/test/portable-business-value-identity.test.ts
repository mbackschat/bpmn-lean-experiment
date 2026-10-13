/**
 * Locks `PBV-IDENTITY-01` for content-bound command identity: every node of a Decimal, List or Map contributes to the
 * typed tuple, and the pre-existing scalar tuples keep their exact bytes.
 *
 * Expected encodings are written out literally so the oracle is independent of the recursive encoder under test.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  EffectExecutionResultKind,
  MessageChannelKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type { BusinessValue, Stimulus } from "@bpmn-lean/semantic-core";

import { canonicalStimulusEncoding, contentBoundUpdateId } from "../dist/index.js";

const text = (value: string): BusinessValue => ({ kind: VariableValueKind.String, value });
const integer = (value: number): BusinessValue => ({ kind: VariableValueKind.Integer, value });
const nothing: BusinessValue = { kind: VariableValueKind.Null };
const decimal = (coefficient: string, scale: number): BusinessValue =>
  ({ kind: VariableValueKind.Decimal, coefficient, scale });
const list = (...value: BusinessValue[]): BusinessValue => ({ kind: VariableValueKind.List, value });
const map = (...entries: Array<readonly [string, BusinessValue]>): BusinessValue =>
  ({ kind: VariableValueKind.Map, value: entries.map(([name, value]) => ({ name, value })) });

const line = (quantity: number, sku: string): BusinessValue =>
  map(["quantity", integer(quantity)], ["sku", text(sku)]);
const address = map(["city", text("Berlin")], ["line2", nothing]);
const order = map(
  ["address", address],
  ["items", list(line(1, "A"), line(1, "A"))],
  ["total", decimal("12345", 2)],
);

const start = (value: BusinessValue, commandId = "start-order"): Stimulus => ({
  kind: StimulusKind.StartProcess,
  commandId,
  processId: "Process_Order",
  instanceId: "Instance_Order",
  initialVariables: [{ name: "order", value }],
});

const encodedOrder =
  '["map",[["address",["map",[["city",["string","Berlin"]],["line2",["null"]]]]],' +
  '["items",["list",[["map",[["quantity",["integer",1]],["sku",["string","A"]]]],' +
  '["map",[["quantity",["integer",1]],["sku",["string","A"]]]]]]],' +
  '["total",["decimal","12345",2]]]]';

test("encodes Decimal, List and Map recursively as typed tuples", () => {
  assert.equal(
    canonicalStimulusEncoding(start(order)),
    `["startProcess","start-order","Process_Order","Instance_Order",[["order",${encodedOrder}]]]`,
  );
  const encode = (value: BusinessValue): string =>
    canonicalStimulusEncoding(start(value)).slice('["startProcess","start-order","Process_Order","Instance_Order",[["order",'.length, -3);
  assert.equal(encode(decimal("-125", 2)), '["decimal","-125",2]');
  assert.equal(encode(decimal("9223372036854775807", 0)), '["decimal","9223372036854775807",0]');
  assert.equal(encode(decimal("-9223372036854775808", 6)), '["decimal","-9223372036854775808",6]');
  assert.equal(encode(list()), '["list",[]]');
  assert.equal(encode(map()), '["map",[]]');
  assert.equal(encode(list(nothing, text("a"), nothing)), '["list",[["null"],["string","a"],["null"]]]');
  assert.equal(encode(map(["", nothing], ["a", list()])), '["map",[["",["null"]],["a",["list",[]]]]]');
});

test("keeps every pre-existing scalar tuple byte-for-byte", () => {
  const encoded = canonicalStimulusEncoding({
    kind: StimulusKind.StartProcess,
    commandId: "start",
    processId: "P",
    instanceId: "I",
    initialVariables: [
      { name: "a", value: { kind: VariableValueKind.Boolean, value: true } },
      { name: "b", value: { kind: VariableValueKind.Integer, value: 7 } },
      { name: "c", value: { kind: VariableValueKind.String, value: "x" } },
      { name: "d", value: { kind: VariableValueKind.StringList, value: ["x", "x"] } },
      { name: "e", value: { kind: VariableValueKind.Null } },
    ],
  });
  assert.equal(
    encoded,
    '["startProcess","start","P","I",[["a",["boolean",true]],["b",["integer",7]],["c",["string","x"]],["d",["stringList",["x","x"]]],["e",["null"]]]]',
  );
});

test("every nested leaf, order, multiplicity, absence, type tag and component changes the content identity", () => {
  const baseline = contentBoundUpdateId(start(order));
  assert.equal(contentBoundUpdateId(start(order)), baseline);
  assert.equal(contentBoundUpdateId(start(JSON.parse(JSON.stringify(order)))), baseline);

  const mutations: ReadonlyArray<readonly [string, BusinessValue]> = [
    ["a changed nested leaf", map(
      ["address", address],
      ["items", list(line(1, "A"), line(1, "B"))],
      ["total", decimal("12345", 2)],
    )],
    ["a changed nested Integer", map(
      ["address", address],
      ["items", list(line(1, "A"), line(2, "A"))],
      ["total", decimal("12345", 2)],
    )],
    ["a removed duplicate member", map(
      ["address", address],
      ["items", list(line(1, "A"))],
      ["total", decimal("12345", 2)],
    )],
    ["swapped unequal members", map(
      ["address", address],
      ["items", list(line(2, "A"), line(1, "A"))],
      ["total", decimal("12345", 2)],
    )],
    ["a Null entry replaced by absence", map(
      ["address", map(["city", text("Berlin")])],
      ["items", list(line(1, "A"), line(1, "A"))],
      ["total", decimal("12345", 2)],
    )],
    ["a Null entry replaced by an empty String", map(
      ["address", map(["city", text("Berlin")], ["line2", text("")])],
      ["items", list(line(1, "A"), line(1, "A"))],
      ["total", decimal("12345", 2)],
    )],
    ["a renamed entry", map(
      ["address", address],
      ["lines", list(line(1, "A"), line(1, "A"))],
      ["total", decimal("12345", 2)],
    )],
    ["a changed Decimal scale", map(
      ["address", address],
      ["items", list(line(1, "A"), line(1, "A"))],
      ["total", decimal("12345", 3)],
    )],
    ["a changed Decimal sign", map(
      ["address", address],
      ["items", list(line(1, "A"), line(1, "A"))],
      ["total", decimal("-12345", 2)],
    )],
    ["a Decimal replaced by the Integer with the same digits", map(
      ["address", address],
      ["items", list(line(1, "A"), line(1, "A"))],
      ["total", integer(12345)],
    )],
  ];
  const identities = new Set([baseline]);
  for (const [label, mutated] of mutations) {
    const identity = contentBoundUpdateId(start(mutated));
    assert.notEqual(identity, baseline, label);
    identities.add(identity);
  }
  assert.equal(identities.size, mutations.length + 1, "all mutations are pairwise distinct");

  assert.notEqual(contentBoundUpdateId(start(integer(1))), contentBoundUpdateId(start(decimal("1", 0))));
  assert.notEqual(contentBoundUpdateId(start(nothing)), contentBoundUpdateId(start(list())));
  assert.notEqual(contentBoundUpdateId(start(list())), contentBoundUpdateId(start(map())));
  assert.notEqual(
    contentBoundUpdateId(start(list(text("a"), text("b")))),
    contentBoundUpdateId({
      ...start(nothing),
      initialVariables: [{ name: "order", value: { kind: VariableValueKind.StringList, value: ["a", "b"] } }],
    } as Stimulus),
    "a generic List of Strings is a different type from the legacy StringList",
  );
});

test("object field order and whitespace-free wire spelling do not change identity", () => {
  const reordered = {
    value: [{ value: { value: "A", kind: "string" }, name: "sku" }],
    kind: "map",
  } as unknown as BusinessValue;
  assert.equal(
    contentBoundUpdateId(start(reordered)),
    contentBoundUpdateId(start(map(["sku", text("A")]))),
  );
  const decimalReordered = { scale: 2, coefficient: "12345", kind: "decimal" } as unknown as BusinessValue;
  assert.equal(contentBoundUpdateId(start(decimalReordered)), contentBoundUpdateId(start(decimal("12345", 2))));
});

test("encodes the value at every ingress that carries one and refuses an ill-formed nested value", () => {
  const completion = canonicalStimulusEncoding({
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete",
    taskId: { processInstanceId: "I", elementId: "T", activation: 1 },
    submittedValues: [{ name: "answer", value: list(decimal("-125", 2)) }],
  });
  assert.equal(completion, '["completeUserTaskInstance","complete",["I","T",1],[["answer",["list",[["decimal","-125",2]]]]]]');
  const effect = canonicalStimulusEncoding({
    kind: StimulusKind.CompleteEffect,
    commandId: "effect",
    effectId: { processInstanceId: "I", elementId: "E", activation: 1 },
    result: { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "r", value: map(["k", nothing]) }] },
  });
  assert.equal(effect, '["completeEffect","effect",["I","E",1],["success",[["r",["map",[["k",["null"]]]]]]]]');
  const payload = canonicalStimulusEncoding({
    kind: StimulusKind.DeliverPayloadMessage,
    commandId: "payload",
    subscriptionId: { processInstanceId: "I", elementId: "M", activation: 1 },
    channel: { kind: MessageChannelKind.DirectMessage, messageId: "Message_1" },
    payload: decimal("5", 1),
  });
  assert.equal(payload, '["deliverPayloadMessage","payload",["I","M",1],["directMessage","Message_1"],["decimal","5",1]]');

  for (const malformed of [
    decimal("01", 0),
    decimal("123450", 3),
    list(decimal("0", 1)),
    map(["b", nothing], ["a", nothing]),
    map(["a", nothing], ["a", nothing]),
    { kind: "list", value: [{ kind: "stringList", value: [] }] } as unknown as BusinessValue,
  ]) {
    assert.throws(() => canonicalStimulusEncoding(start(malformed)), TypeError, JSON.stringify(malformed));
  }
});

test("a maximum-size value stays inside the per-binding, per-patch and per-command tuple limits", () => {
  // 15 full Strings plus one filler reach the 16,384-byte canonical value ceiling; tuples are shorter than tagged JSON.
  const members: BusinessValue[] = Array.from({ length: 15 }, () => text("a".repeat(1024)));
  const room = 16_384 - Buffer.byteLength(JSON.stringify({
    kind: "list",
    value: [...members, text("")],
  }), "utf8");
  assert.ok(room > 0 && room <= 1024);
  const maximum = list(...members, text("a".repeat(room)));
  const encoded = canonicalStimulusEncoding(start(maximum));
  assert.ok(Buffer.byteLength(encoded, "utf8") <= 20_480);
});
