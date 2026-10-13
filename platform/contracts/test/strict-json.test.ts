import assert from "node:assert/strict";
import { test } from "node:test";

import { parseStrictJson, parseWireJson } from "@bpmn-lean/platform-contracts";

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

test("selected wire numbers retain canonical safe integers and reject aliases before conversion", () => {
  for (const token of ["1.0000000000000001", "9007199254740991.1", "1e-400", "1e400", "1.0", "1e1", "-0", "9007199254740992", "9007199254740993"]) {
    assert.throws(() => parseWireJson(encode(`{"value":${token}}`)), SyntaxError, token);
  }
  assert.deepEqual(parseWireJson(encode('[0,1,10,9007199254740991]')), [0, 1, 10, Number.MAX_SAFE_INTEGER]);
});

test("wire selection follows decoded member paths while generic payloads retain their numbers", () => {
  const value = parseWireJson(encode('{"activation":1,"fields":{"activation":1.25e+2,"nested":[-0,1e-400]}}'), (path) => path[0] !== "fields");
  assert.deepEqual(value, { activation: 1, fields: { activation: 125, nested: [-0, 0] } });
  assert.throws(() => parseWireJson(encode('{"\\u0061ctivation":1.0,"fields":{"activation":1.5}}'), (path) => path[0] !== "fields"), SyntaxError);
  assert.throws(() => parseWireJson(new Uint8Array([0xff])), SyntaxError);
  assert.throws(() => parseWireJson(encode('{"value":1,"\\u0076alue":2}')), SyntaxError);
  assert.throws(() => parseWireJson(encode('{"value":"\\uD800"}')), SyntaxError);
  const own = parseWireJson(encode('{"__proto__":{"polluted":true}}'));
  assert.equal(Object.hasOwn(own as object, "__proto__"), true);
  assert.equal(Object.getPrototypeOf(own), Object.prototype);
});

test("wire byte admission rejects a UTF-8 BOM while generic JSON retains its decoder behavior", () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encode('{"value":0}')]);
  assert.deepEqual(parseStrictJson(bytes), { value: 0 });
  assert.throws(() => parseWireJson(bytes), SyntaxError);
});
