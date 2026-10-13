import assert from "node:assert/strict";
import { test } from "node:test";

import { parseStrictJson, parseWireJson, parseWireJsonBytes } from "./strict-json.ts";

test("generic strict JSON retains ordinary numeric values outside the wire policy", () => {
  const decoded = parseStrictJson<{ values: number[] }>('{"values":[-0,1.25e+2,1e-400,1e400]}');
  assert.deepEqual(decoded.values, [-0, 125, 0, Infinity]);
  assert.equal(Object.is(decoded.values[0], -0), true);
});

test("wire documents reject noncanonical and lossy numeric tokens at every nesting depth", () => {
  for (const token of ["1.0000000000000001", "9007199254740991.1", "1e-400", "1e400", "1.0", "1e1", "-0", "9007199254740992", "9007199254740993"]) {
    for (const source of [token, `[{"value":${token}}]`]) {
      assert.throws(() => parseWireJson(source), SyntaxError, source);
    }
  }
  assert.deepEqual(parseWireJson('[0,1,10,9007199254740991,"1.0",true,null]'), [0, 1, 10, Number.MAX_SAFE_INTEGER, "1.0", true, null]);
});

test("both JSON entries retain inert own members and refuse duplicate decoded keys and surrogates", () => {
  for (const parse of [parseStrictJson, parseWireJson]) {
    const own = parse<Record<string, unknown>>('{"__proto__":{"polluted":true},"constructor":1}');
    assert.equal(Object.getPrototypeOf(own), Object.prototype);
    assert.equal(Object.hasOwn(own, "__proto__"), true);
    assert.equal(Object.hasOwn(own, "constructor"), true);
    assert.equal(({} as { polluted?: boolean }).polluted, undefined);
    for (const source of ['{"id":"one","\\u0069d":"two"}', '[{"𝄞":1,"\\uD834\\uDD1E":2}]', '"\\uD800"', '{"\\uDC00":1}']) {
      assert.throws(() => parse(source), SyntaxError, source);
    }
    assert.deepEqual(parse('{"𝄞":"\\uD834\\uDD1E"}'), { "𝄞": "𝄞" });
  }
});

test("strict token scanning rejects malformed grammar without changing valid arrays and objects", () => {
  for (const source of ["", "01", "1.", "1e", "true false", "[1,]", '{"a":}', '{"a" 1}', '{"a":1,}', '"\\q"', '"line\nfeed"']) {
    assert.throws(() => parseStrictJson(source), SyntaxError, source);
  }
  assert.deepEqual(parseStrictJson(' { "empty": [], "record": {}, "values": [0, {"a": 1}] } '), { empty: [], record: {}, values: [0, { a: 1 }] });
});

test("wire byte admission rejects malformed UTF-8 without replacing source characters", () => {
  for (const bytes of [new Uint8Array([0xff]), new Uint8Array([0xe2, 0x82]), new Uint8Array([0xef, 0xbb, 0xbf, 0x30])]) {
    assert.throws(() => parseWireJsonBytes(bytes));
  }
  assert.deepEqual(parseWireJsonBytes(new TextEncoder().encode('{"value":"𝄞"}')), { value: "𝄞" });
});
