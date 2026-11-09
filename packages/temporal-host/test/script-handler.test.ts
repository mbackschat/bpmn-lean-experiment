/**
 * JavaScript Script Tasks run in Node's built-in `vm` (owner decision on PC-AUTO-05/06): the context holds the
 * effect's arguments, read-only and built inside the context, and no host object; the completion value becomes the
 * result variable; any failure to produce a portable value is the effect's technical failure. The `vm` is no security
 * boundary, so these tests lock the contract, not isolation against hostile models.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const { evaluateScript, UnsupportedScriptFormat } = await import(
  new URL("../dist/script-handler.js", import.meta.url).href
) as typeof import("../src/script-handler.ts");
const { EffectResultKind } = await import(new URL("../dist/port.js", import.meta.url).href) as
  typeof import("../src/port.ts");

const occurrence = { processInstanceId: "I", elementId: "Script", activation: 1 };
const options = { timeoutMs: 200 };

function run(source: string, resultVariable: string | null = "result", context = [
  { name: "price", value: { kind: "integer", value: 3 } },
] as const) {
  return evaluateScript({
    key: "effect:k",
    occurrence,
    script: { format: "javascript", source, resultVariable },
    context,
  }, options);
}

function value(source: string): unknown {
  const result = run(source);
  assert.equal(result.kind, EffectResultKind.Success, source);
  return result.kind === EffectResultKind.Success ? result.outputs[0]?.value : undefined;
}

test("the completion value is written to the result variable", () => {
  assert.deepEqual(run("price * 2"), {
    kind: EffectResultKind.Success,
    outputs: [{ name: "result", value: { kind: "integer", value: 6 } }],
  });
});

test("a Script without a result variable writes nothing", () => {
  assert.deepEqual(run("price * 2", null), { kind: EffectResultKind.Success, outputs: [] });
});

test("model variables are read-only and the context offers no host object", () => {
  assert.deepEqual(value("price = 10; price"), { kind: "integer", value: 3 });
  assert.equal(run("'use strict'; price = 10;").kind, EffectResultKind.TechnicalFailure);
  assert.deepEqual(value("[typeof process, typeof require, typeof setTimeout, typeof console].join()"),
    { kind: "string", value: "undefined,undefined,undefined,undefined" });
});

test("argument values are built inside the context, so no host constructor is reachable through them", () => {
  const listed = [{ name: "items", value: { kind: "list", value: [{ kind: "integer", value: 1 }] } }] as const;
  const evaluate = (source: string) => evaluateScript({
    key: "effect:k",
    occurrence,
    script: { format: "JavaScript", source, resultVariable: "r" },
    context: listed,
  }, options);
  assert.deepEqual(evaluate("Object.getPrototypeOf(items) === Array.prototype"), {
    kind: EffectResultKind.Success,
    outputs: [{ name: "r", value: { kind: "boolean", value: true } }],
  });
  assert.equal(evaluate("items.constructor.constructor('return 1')()").kind, EffectResultKind.TechnicalFailure);
});

test("values convert between the portable value form and JavaScript", () => {
  const context = [
    { name: "d", value: { kind: "decimal", coefficient: "125", scale: 2 } },
    { name: "tags", value: { kind: "stringList", value: ["a", "b"] } },
    { name: "m", value: { kind: "map", value: [{ name: "k", value: { kind: "boolean", value: true } }] } },
    { name: "nothing", value: { kind: "null" } },
  ] as const;
  const result = evaluateScript({
    key: "effect:k",
    occurrence,
    script: { format: "javascript", source: "({ d: d * 2, tags: tags.concat(['c']), k: m.k, nothing, half: 1.5, big: -12 })", resultVariable: "r" },
    context,
  }, options);
  assert.deepEqual(result, {
    kind: EffectResultKind.Success,
    outputs: [{
      name: "r",
      value: {
        kind: "map",
        value: [
          { name: "d", value: { kind: "decimal", coefficient: "25", scale: 1 } },
          { name: "tags", value: { kind: "list", value: ["a", "b", "c"].map((item) => ({ kind: "string", value: item })) } },
          { name: "k", value: { kind: "boolean", value: true } },
          { name: "nothing", value: { kind: "null" } },
          { name: "half", value: { kind: "decimal", coefficient: "15", scale: 1 } },
          { name: "big", value: { kind: "integer", value: -12 } },
        ],
      },
    }],
  });
  assert.deepEqual(value("undefined"), { kind: "null" });
});

test("an exception, a timeout or a non-portable result is the effect's technical failure", () => {
  for (const source of ["throw new Error('x')", "while (true) {}", "(function () {})", "Symbol('s')", "1 / 0", "Promise.resolve(1)"]) {
    assert.deepEqual(run(source), { kind: EffectResultKind.TechnicalFailure }, source);
  }
});

test("a Script in another language is a host refusal, never a semantic result", () => {
  assert.throws(() => evaluateScript({
    key: "effect:k",
    occurrence,
    script: { format: "groovy", source: "1", resultVariable: null },
    context: [],
  }, options), UnsupportedScriptFormat);
});
