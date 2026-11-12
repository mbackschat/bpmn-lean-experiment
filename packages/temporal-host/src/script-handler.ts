/**
 * JavaScript Script Tasks, run as a recorded effect
 * ([script semantics](../../../docs/kernel/semantics/SCRIPT-SEMANTICS-SPEC.md), items 4 to 8): the Activity's result is
 * committed like any effect result, so replay never runs a Script again.
 *
 * The Script runs in Node's built-in `vm` under a timeout, as one classic script in a fresh context whose global
 * object holds the effect's arguments and the ECMAScript 2021 intrinsics: the built-ins of later editions that
 * `removed` lists, and every host object, are taken out, so a Script calling one fails as it does on CIB's GraalJS
 * `21.3.12`. The arguments are writable globals built from JSON inside the context, so that no host prototype, and
 * through it no host `Function`, is reachable, and an assignment stays in the context, which is discarded. The `vm` is
 * no security boundary: Scripts are trusted model content. What the profile cannot represent (a read of a variable it
 * leaves out, a reference to `execution` or `Java`, a result outside the portable domain) is `unsupported`; a throw or
 * the timeout is the effect's technical failure, which the profile turns into an incident or a rollback.
 */
import vm from "node:vm";

import type { ScriptRequest } from "./host-machine.js";
import { EffectResultKind, type EffectResult, type JsonValue } from "./port.js";

export interface ScriptOptions {
  readonly timeoutMs: number;
}

/** A Script in a language other than JavaScript reached the host: admission refuses them, so this is a host fault. */
export class UnsupportedScriptFormat extends Error {
  override readonly name = "UnsupportedScriptFormat";
}

/** The names CIB's JSR-223 lookup gives its JavaScript engine (`DefaultScriptEngineResolver`), ignoring ASCII case. */
const javascriptNames = ["javascript", "js", "ecmascript"];

/** Java's `int` range within the portable Integer domain, the result CIB stores as an `Integer` (P1). */
const maxResultInteger = 2 ** 31 - 1;

/** The portable String bound ([data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#values)). */
const maxResultBytes = 1024;

/**
 * A variable's value as the context builds it: a primitive as itself, a list as `["l", items]`, a map as
 * `["m", [[name, value], …]]`; `null` stands for JSON `null` only.
 */
type ScriptForm = string | number | boolean | null | readonly ["l", readonly ScriptForm[]] | readonly ["m", readonly (readonly [string, ScriptForm])[]];

class LeftOut extends Error {}

function record(value: JsonValue | undefined): { readonly [key: string]: JsonValue } {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("malformed script argument");
  }
  return value as { readonly [key: string]: JsonValue };
}

function items(value: JsonValue | undefined): readonly JsonValue[] {
  if (!Array.isArray(value)) throw new TypeError("malformed script argument list");
  return value;
}

/**
 * A `variableValue` in the context's form (item 4): String, Boolean, Null and Integer as themselves, a list or
 * `stringList` as an array, a map as an object; a decimal, or a collection holding one, has no form and is left out.
 */
function scriptForm(value: JsonValue): ScriptForm {
  const object = record(value);
  switch (object["kind"]) {
    case "null": return null;
    case "boolean": case "integer": case "string": return object["value"] as boolean | number | string;
    case "stringList": return ["l", items(object["value"]) as readonly string[]];
    case "list": return ["l", items(object["value"]).map(scriptForm)];
    case "map": return ["m", items(object["value"]).map((entry) => {
      const binding = record(entry);
      return [String(binding["name"]), scriptForm(binding["value"] ?? null)] as const;
    })];
    case "decimal": throw new LeftOut();
    default: throw new TypeError(`unknown value kind ${String(object["kind"])}`);
  }
}

/** A completion value in the portable form (item 5), `null` for none to write, `undefined` when it has none. */
function resultValue(value: unknown): JsonValue | null | undefined {
  switch (typeof value) {
    case "undefined": return null;
    case "boolean": return { kind: "boolean", value };
    case "number":
      return Number.isInteger(value) && value >= 0 && value <= maxResultInteger ? { kind: "integer", value: value + 0 } : undefined;
    case "string":
      return value.isWellFormed() && Buffer.byteLength(value, "utf8") <= maxResultBytes ? { kind: "string", value } : undefined;
    case "object": return value === null ? null : undefined;
    case "bigint": case "function": case "symbol": return undefined;
  }
}

/**
 * Runs in the fresh context: takes out the host objects and the listed later-edition built-ins, defines each argument
 * as a writable global from JSON parsed inside the context, frozen, a map as a null-prototype object, and guards each
 * left-out name and `execution` and `Java` with an accessor that records the access and throws. It returns the probe
 * the host reads after the run: the first unsupported access's code, or `null`. An assignment to a guarded name
 * replaces the accessor with a plain value, since the Script then reads its own value, not the variable.
 */
const prepare = `(function (text) {
  "use strict";
  const iterators = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
  const typed = Object.getPrototypeOf(Uint8Array).prototype;
  const removed = [
    [globalThis, ["console", "WebAssembly", "Temporal", "Iterator", "DisposableStack", "AsyncDisposableStack", "SuppressedError", "Float16Array"]],
    [Array.prototype, ["at", "findLast", "findLastIndex", "toReversed", "toSorted", "toSpliced", "with"]],
    [typed, ["at", "findLast", "findLastIndex", "toReversed", "toSorted", "with"]],
    [String.prototype, ["at", "isWellFormed", "toWellFormed"]],
    [Array, ["fromAsync"]],
    [Object, ["hasOwn", "groupBy"]],
    [Map, ["groupBy"]],
    [Promise, ["withResolvers", "try"]],
    [Set.prototype, ["union", "intersection", "difference", "symmetricDifference", "isSubsetOf", "isSupersetOf", "isDisjointFrom"]],
    [iterators, ["map", "filter", "take", "drop", "flatMap", "reduce", "toArray", "forEach", "some", "every", "find"]],
    [RegExp, ["escape"]],
    [Math, ["f16round"]],
    [Error, ["isError"]],
    [Atomics, ["waitAsync", "pause"]],
    [ArrayBuffer.prototype, ["maxByteLength", "resizable", "resize", "transfer", "transferToFixedLength", "detached"]],
    [SharedArrayBuffer.prototype, ["maxByteLength", "growable", "grow"]],
    [Uint8Array, ["fromBase64", "fromHex"]],
    [Uint8Array.prototype, ["toBase64", "setFromBase64", "toHex", "setFromHex"]],
    [DataView.prototype, ["getFloat16", "setFloat16"]],
    [Symbol, ["dispose", "asyncDispose"]],
  ];
  for (const [owner, names] of removed) for (const name of names) Reflect.deleteProperty(owner, name);
  const build = (form) => {
    if (form === null || typeof form !== "object") return form;
    if (form[0] === "l") return Object.freeze(form[1].map(build));
    const map = Object.create(null);
    for (const [name, value] of form[1]) map[name] = build(value);
    return Object.freeze(map);
  };
  const plain = (name, value) =>
    Object.defineProperty(globalThis, name, { value, writable: true, enumerable: true, configurable: true });
  let access = null;
  const guard = (name, code) => Object.defineProperty(globalThis, name, {
    get() { if (access === null) access = code; throw new ReferenceError(name + " has no value in this context"); },
    set(value) { plain(name, value); },
    enumerable: true, configurable: true,
  });
  for (const [name, form, kept] of JSON.parse(text)) {
    if (kept) plain(name, build(form)); else guard(name, "script-value-unrepresentable");
  }
  guard("execution", "script-host-object");
  guard("Java", "script-host-object");
  return () => access;
})`;

function unsupported(code: string): EffectResult {
  return { kind: EffectResultKind.Unsupported, code };
}

/**
 * Evaluates the Script over the effect's arguments. Without a result variable the completion value is discarded
 * whatever it is, as CIB writes nothing then (`ScriptTaskActivityBehavior.java:56-59`).
 */
export function evaluateScript(request: ScriptRequest, options: ScriptOptions): EffectResult {
  const { format, source, resultVariable } = request.script;
  if (!javascriptNames.includes(format.replace(/[A-Z]/gu, (letter) => letter.toLowerCase()))) {
    throw new UnsupportedScriptFormat(`script-format-unsupported: ${format}`);
  }
  // A malformed argument is a host fault and throws here, before the context exists.
  const argumentsText = JSON.stringify(request.context.map((binding) => {
    try {
      return [binding.name, scriptForm(binding.value), true];
    } catch (error) {
      if (error instanceof LeftOut) return [binding.name, null, false];
      throw error;
    }
  }));
  const context = vm.createContext({}, { codeGeneration: { strings: true, wasm: false }, microtaskMode: "afterEvaluate" });
  const probe = (vm.runInContext(prepare, context) as (text: string) => () => string | null)(argumentsText);
  let completion: unknown;
  let failed = false;
  try {
    completion = new vm.Script(source, { filename: `script:${request.occurrence.elementId}` })
      .runInContext(context, { timeout: options.timeoutMs });
  } catch {
    // The Script's own exception, its syntax error or its timeout, which CIB reports as the command's or job's failure.
    failed = true;
  }
  const access = probe();
  if (access !== null) return unsupported(access);
  if (failed) return { kind: EffectResultKind.TechnicalFailure };
  if (resultVariable === null) return { kind: EffectResultKind.Success, outputs: [] };
  const value = resultValue(completion);
  if (value === undefined) return unsupported("script-result-unrepresentable");
  return { kind: EffectResultKind.Success, outputs: value === null ? [] : [{ name: resultVariable, value }] };
}
