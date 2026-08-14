import assert from "node:assert/strict";
import { test } from "node:test";

import { parseStrictJson } from "@bpmn-lean/platform-contracts";

const encode = (source: string): Uint8Array => new TextEncoder().encode(source);

test("parses the complete JSON value grammar without changing valid values", () => {
  const value = parseStrictJson(encode(
    ' { "text": "line\\n/𝄞", "values": [null, true, false, -0, 1.25e+2] } ',
  ));

  assert.deepEqual(value, {
    text: "line\n/𝄞",
    values: [null, true, false, -0, 125],
  });
  assert.equal(Object.is((value as { values: unknown[] }).values[3], -0), true);
});

test("rejects duplicate object keys after JSON escape decoding at every depth", () => {
  for (const source of [
    '{"actionId":"one","actionId":"two"}',
    '{"outer":{"elementId":"one","\\u0065lementId":"two"}}',
    '{"𝄞":1,"\\uD834\\uDD1E":2}',
  ]) {
    assert.throws(() => parseStrictJson(encode(source)), SyntaxError, source);
  }
});

test("rejects malformed UTF-8, JSON syntax, control characters, and unpaired surrogates", () => {
  const inputs = [
    new Uint8Array([0xff]),
    encode(""),
    encode("01"),
    encode("1."),
    encode("[1,]"),
    encode('{"value":"line\nfeed"}'),
    encode('"\\uD800"'),
    encode('"\\uDC00"'),
    encode('"\\uD800\\u0041"'),
    encode("true false"),
  ];
  for (const input of inputs) {
    assert.throws(() => parseStrictJson(input), SyntaxError);
  }
});

test("preserves __proto__ as an inert own JSON member", () => {
  const value = parseStrictJson(encode('{"__proto__":{"polluted":true}}')) as Record<
    string,
    unknown
  >;

  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(Object.hasOwn(value, "__proto__"), true);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});
