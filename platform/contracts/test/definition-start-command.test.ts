import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeCanonicalDefinitionVersionStartCommand,
  decodeDefinitionVersionStartCommand,
  serializeDefinitionVersionStartCommand,
} from "@bpmn-lean/platform-contracts";

const exactCommand = {
  initialVariables: [
    { name: "approved", value: { kind: "boolean", value: true } },
    { name: "attempt", value: { kind: "integer", value: 3 } },
    { name: "items", value: { kind: "stringList", value: ["contract", "invoice", "receipt"] } },
    { name: "note", value: { kind: "string", value: "ready" } },
    { name: "optional", value: { kind: "null" } },
  ],
} as const;

test("decodes and canonically serializes the complete Product 1 start-value domain", () => {
  assert.deepEqual(decodeDefinitionVersionStartCommand(exactCommand), exactCommand);

  const bytes = serializeDefinitionVersionStartCommand(exactCommand);
  assert.equal(
    new TextDecoder().decode(bytes),
    '{"initialVariables":[{"name":"approved","value":{"kind":"boolean","value":true}},{"name":"attempt","value":{"kind":"integer","value":3}},{"name":"items","value":{"kind":"stringList","value":["contract","invoice","receipt"]}},{"name":"note","value":{"kind":"string","value":"ready"}},{"name":"optional","value":{"kind":"null"}}]}',
  );
  assert.deepEqual(decodeCanonicalDefinitionVersionStartCommand(bytes), exactCommand);
});
test("selects one exact canonical empty-start representation for legacy recovery", () => {
  assert.equal(
    new TextDecoder().decode(serializeDefinitionVersionStartCommand({ initialVariables: [] })),
    '{"initialVariables":[]}',
  );
});

test("rejects open, missing, noncanonical, duplicate, and malformed start commands", () => {
  assert.throws(
    () => decodeDefinitionVersionStartCommand({ initialVariables: [], privateLocator: "workflow" }),
    /exactly its public fields/u,
  );
  assert.throws(() => decodeDefinitionVersionStartCommand({}), /missing required field|exactly/u);
  assert.throws(
    () => decodeDefinitionVersionStartCommand({
      initialVariables: [
        { name: "z", value: { kind: "null" } },
        { name: "a", value: { kind: "null" } },
      ],
    }),
    /canonical strict ascending order/u,
  );
  assert.throws(
    () => decodeDefinitionVersionStartCommand({
      initialVariables: [
        { name: "a", value: { kind: "null" } },
        { name: "a", value: { kind: "null" } },
      ],
    }),
    /canonical strict ascending order/u,
  );
  assert.throws(
    () => decodeDefinitionVersionStartCommand({
      initialVariables: [{ name: "input", value: { kind: "integer", value: -1 } }],
    }),
    /nonnegative safe integer/u,
  );
  assert.throws(
    () => decodeDefinitionVersionStartCommand({
      initialVariables: [{ name: "input", value: { kind: "stringList", value: ["\uD800"] } }],
    }),
    /well-formed Unicode/u,
  );
});

test("rejects holes and non-index array properties at every collection boundary", () => {
  const sparseBindings = new Array(1);
  assert.throws(
    () => decodeDefinitionVersionStartCommand({ initialVariables: sparseBindings }),
    /dense array/u,
  );

  const list = ["contract"];
  Object.defineProperty(list, "privateValue", { enumerable: true, value: "hidden" });
  assert.throws(
    () => decodeDefinitionVersionStartCommand({
      initialVariables: [{ name: "items", value: { kind: "stringList", value: list } }],
    }),
    /dense list/u,
  );
});

test("canonical recovery refuses equivalent but noncanonical, duplicate-key, and malformed bytes", () => {
  const encode = (value: string) => new TextEncoder().encode(value);
  assert.throws(
    () => decodeCanonicalDefinitionVersionStartCommand(encode('{ "initialVariables": [] }')),
    /malformed canonical definition start command/u,
  );
  assert.throws(
    () => decodeCanonicalDefinitionVersionStartCommand(encode('{"initialVariables":[],"initialVariables":[]}')),
    /malformed canonical definition start command/u,
  );
  assert.throws(
    () => decodeCanonicalDefinitionVersionStartCommand(Uint8Array.of(0xff)),
    /malformed canonical definition start command/u,
  );
});
