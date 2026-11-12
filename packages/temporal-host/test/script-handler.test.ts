/**
 * JavaScript Script Tasks run in Node's built-in `vm`
 * ([script semantics](../../../docs/kernel/semantics/SCRIPT-SEMANTICS-SPEC.md), items 4 to 8): the context holds the
 * effect's arguments as writable globals built inside the context, the ECMAScript 2021 intrinsics and no host object;
 * the completion value becomes the result variable when the portable domain has it; what the profile cannot represent
 * is `unsupported`, and a throw or the timeout is the technical failure. The `vm` is no security boundary, so these
 * tests lock the contract, not isolation against hostile models.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const { evaluateScript, UnsupportedScriptFormat } = await import(
  new URL("../dist/script-handler.js", import.meta.url).href
) as typeof import("../src/script-handler.ts");
const { EffectResultKind } = await import(new URL("../dist/port.js", import.meta.url).href) as
  typeof import("../src/port.ts");

type Binding = { readonly name: string; readonly value: Record<string, unknown> };

const occurrence = { processInstanceId: "I", elementId: "Script", activation: 1 };
const options = { timeoutMs: 200 };
const price: Binding = { name: "price", value: { kind: "integer", value: 3 } };

function run(source: string, resultVariable: string | null = "result", context: readonly Binding[] = [price], format = "javascript") {
  return evaluateScript({ key: "effect:k", occurrence, script: { format, source, resultVariable }, context: context as never }, options);
}

const written = (value: unknown, name = "result") => ({ kind: EffectResultKind.Success, outputs: [{ name, value }] });
const unsupported = (code: string) => ({ kind: EffectResultKind.Unsupported, code });
const technicalFailure = { kind: EffectResultKind.TechnicalFailure };

test("the completion value is written to the result variable", () => {
  assert.deepEqual(run("price * 2"), written({ kind: "integer", value: 6 }));
});

test("without a result variable the completion value is discarded, whatever it is", () => {
  for (const source of ["price * 2", "({})", "-1", "1.5"]) assert.deepEqual(run(source, null), { kind: EffectResultKind.Success, outputs: [] }, source);
});

test("undefined and null write nothing", () => {
  for (const source of ["undefined", "null", "void 0"]) assert.deepEqual(run(source), { kind: EffectResultKind.Success, outputs: [] }, source);
});

test("a result inside the portable domain: a boolean, an integer in 0..2^31-1 and a well-formed String of at most 1,024 UTF-8 bytes", () => {
  assert.deepEqual(run("true"), written({ kind: "boolean", value: true }));
  assert.deepEqual(run("2147483647"), written({ kind: "integer", value: 2147483647 }));
  assert.deepEqual(run("0"), written({ kind: "integer", value: 0 }));
  assert.deepEqual(run("'x'.repeat(1024)"), written({ kind: "string", value: "x".repeat(1024) }));
  assert.deepEqual(run("'\\u00e9'.repeat(512)"), written({ kind: "string", value: "é".repeat(512) }));
});

test("any other result is unsupported, never a technical failure", () => {
  for (const source of [
    "-1", "1.5", "2147483648", "NaN", "1 / 0", "'a\\uD800b'", "'x'.repeat(1025)", "'\\u00e9'.repeat(513)", "({})", "[1]",
    "(function () {})", "Symbol('s')", "10n", "Promise.resolve(1)",
  ]) assert.deepEqual(run(source), unsupported("script-result-unrepresentable"), source);
});

test("arguments are writable globals whose assignments stay in the context", () => {
  assert.deepEqual(run("price = 10; price"), written({ kind: "integer", value: 10 }));
  assert.deepEqual(run("total = price + 1; total"), written({ kind: "integer", value: 4 }));
});

test("collections are frozen and maps have no prototype", () => {
  const context: Binding[] = [
    { name: "items", value: { kind: "list", value: [{ kind: "string", value: "a" }] } },
    { name: "tags", value: { kind: "stringList", value: ["x", "y"] } },
    { name: "order", value: { kind: "map", value: [{ name: "id", value: { kind: "integer", value: 7 } }] } },
  ];
  assert.deepEqual(run("[items.length, items[0], tags.join('+'), order.id, Object.getPrototypeOf(order) === null, Object.isFrozen(items), Object.isFrozen(order)].join('|')",
    "result", context), written({ kind: "string", value: "1|a|x+y|7|true|true|true" }));
  assert.deepEqual(run("items.push('b')", "result", context), technicalFailure);
});

test("a read of a variable the profile leaves out is unsupported, even when the Script catches it", () => {
  const context: Binding[] = [price, { name: "rate", value: { kind: "decimal", coefficient: "125", scale: 2 } }];
  assert.deepEqual(run("rate * 2", "result", context), unsupported("script-value-unrepresentable"));
  assert.deepEqual(run("try { rate } catch (e) {} price", "result", context), unsupported("script-value-unrepresentable"));
  assert.deepEqual(run("price", "result", context), written({ kind: "integer", value: 3 }));
});

test("a reference to execution or Java is unsupported", () => {
  for (const source of ["execution.getVariable('price')", "Java.type('java.lang.Integer')", "typeof execution"]) {
    assert.deepEqual(run(source), unsupported("script-host-object"), source);
  }
});

test("the context offers no host object, and eval reaches only the context", () => {
  assert.deepEqual(run("[typeof process, typeof require, typeof setTimeout, typeof console, typeof WebAssembly, typeof Temporal].join()"),
    written({ kind: "string", value: "undefined,undefined,undefined,undefined,undefined,undefined" }));
  assert.deepEqual(run("eval('1 + 2')"), written({ kind: "integer", value: 3 }));
  const listed: Binding[] = [{ name: "items", value: { kind: "list", value: [{ kind: "integer", value: 1 }] } }];
  assert.deepEqual(run("Object.getPrototypeOf(items) === Array.prototype && items.constructor.constructor('return typeof process')() === 'undefined'",
    "result", listed), written({ kind: "boolean", value: true }));
});

test("the built-ins of later editions are taken out, so calling one fails as on GraalJS 21.3.12", () => {
  assert.deepEqual(run("[typeof String.prototype.replaceAll, typeof Array.prototype.at, typeof Object.hasOwn, typeof Array.prototype.findLast].join('|')"),
    written({ kind: "string", value: "function|undefined|undefined|undefined" }));
  for (const source of ["[1].at(0)", "Object.hasOwn({}, 'a')", "[1].toSorted()", "Object.groupBy([], (x) => x)", "'a'.at(0)", "[3].findLastIndex((x) => x)"]) {
    assert.deepEqual(run(source), technicalFailure, source);
  }
});

test("an exception, a syntax error or the timeout is the effect's technical failure", () => {
  for (const source of ["throw new Error('x')", "while (true) {}", "unknownName", "'use strict'; (", "throw 1"]) {
    assert.deepEqual(run(source), technicalFailure, source);
  }
});

test("the format is read ignoring ASCII case, and any other language is a host refusal", () => {
  for (const format of ["JavaScript", "ECMAScript", "js", "JS"]) assert.deepEqual(run("1", "result", [], format), written({ kind: "integer", value: 1 }), format);
  for (const format of ["groovy", "juel", "javascrİpt"]) assert.throws(() => run("1", null, [], format), UnsupportedScriptFormat, format);
});
