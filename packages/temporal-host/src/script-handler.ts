/**
 * JavaScript Script Tasks, run as a recorded effect (owner decision of 2026-11-08 on PC-AUTO-05/06): the Activity's
 * result is committed like any effect result, so replay never runs a Script again.
 *
 * The Script runs in Node's built-in `vm` under a timeout. Its context holds the effect's arguments as read-only
 * globals, parsed from JSON inside the context so that no host prototype, and through it no host `Function`, is
 * reachable; string code generation is off, and no host object (`process`, `require`, timers, `console`) is
 * installed. The `vm` is no security boundary: Scripts are trusted model content. The completion value is the
 * result; a throw, a timeout or a value without a portable form is the effect's technical failure, which the profile
 * turns into a retry, an incident or a rollback.
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

/** The names CIB's JSR-223 lookup gives its JavaScript engine (`ScriptingEngines#getScriptEngineForLanguage`). */
const javascriptNames = ["javascript", "js", "ecmascript"];

class NotPortable extends Error {}

/** A `variableValue` as plain JavaScript data; a decimal becomes the nearest double, as a Script's arithmetic needs. */
function plain(value: JsonValue): unknown {
  const object = record(value);
  switch (object["kind"]) {
    case "null": return null;
    case "boolean": case "integer": case "string": case "stringList": return object["value"];
    case "decimal": return Number(`${String(object["coefficient"])}e-${String(object["scale"])}`);
    case "list": return items(object["value"]).map(plain);
    case "map": return Object.fromEntries(items(object["value"]).map((entry) => {
      const binding = record(entry);
      return [String(binding["name"]), plain(binding["value"] ?? null)];
    }));
    default: throw new NotPortable(`unknown value kind ${String(object["kind"])}`);
  }
}

function record(value: JsonValue | undefined): { readonly [key: string]: JsonValue } {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    throw new NotPortable("malformed value");
  }
  return value as { readonly [key: string]: JsonValue };
}

function items(value: JsonValue | undefined): readonly JsonValue[] {
  if (!Array.isArray(value)) throw new NotPortable("malformed value list");
  return value;
}

/** The shortest decimal form of a finite double, as an unscaled coefficient and a scale. */
function decimal(number: number): JsonValue {
  const [mantissa = "", exponentText = "0"] = number.toExponential().split("e");
  const negative = mantissa.startsWith("-");
  const [whole = "", fraction = ""] = mantissa.replace("-", "").split(".");
  const scale = fraction.length - Number(exponentText);
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/u, "");
  const coefficient = scale < 0 ? `${digits}${"0".repeat(-scale)}` : digits;
  return { kind: "decimal", coefficient: `${negative ? "-" : ""}${coefficient}`, scale: Math.max(0, scale) };
}

/**
 * A Script's value in the portable form. Its objects belong to the Script's realm, so prototypes are compared
 * structurally, and every array is rebuilt here with `Array.from`, since `map` would keep the Script realm's `Array`.
 */
function portable(value: unknown): JsonValue {
  switch (typeof value) {
    case "undefined": return { kind: "null" };
    case "boolean": return { kind: "boolean", value };
    case "string": return { kind: "string", value };
    case "number":
      if (!Number.isFinite(value)) throw new NotPortable("non-finite number");
      return Number.isSafeInteger(value) ? { kind: "integer", value } : decimal(value);
    case "bigint": return { kind: "decimal", coefficient: value.toString(), scale: 0 };
    case "object": {
      if (value === null) return { kind: "null" };
      if (Array.isArray(value)) return { kind: "list", value: Array.from(value as readonly unknown[], portable) };
      const prototype = Object.getPrototypeOf(value) as object | null;
      if (Object.prototype.toString.call(value) !== "[object Object]" ||
          (prototype !== null && Object.getPrototypeOf(prototype) !== null)) {
        throw new NotPortable("only plain objects have a portable form");
      }
      return { kind: "map", value: Object.entries(value).map(([name, entry]) => ({ name, value: portable(entry) })) };
    }
    case "function": case "symbol": throw new NotPortable(`${typeof value} has no portable form`);
  }
}

/**
 * Defines each argument as a frozen, non-writable global of the context, from JSON parsed inside it, after removing
 * the inspector-bound `console` V8 installs in every new context.
 */
const defineArguments = `(function (text) {
  "use strict";
  delete globalThis.console;
  const freeze = (value) => {
    if (value !== null && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  for (const [name, value] of JSON.parse(text)) {
    Object.defineProperty(globalThis, name, { value: freeze(value), writable: false, enumerable: true, configurable: false });
  }
})`;

export function evaluateScript(request: ScriptRequest, options: ScriptOptions): EffectResult {
  const { format, source, resultVariable } = request.script;
  if (!javascriptNames.includes(format.toLowerCase())) {
    throw new UnsupportedScriptFormat(`script-format-unsupported: ${format}`);
  }
  const argumentsText = JSON.stringify(request.context.map((binding) => [binding.name, plain(binding.value)]));
  try {
    const context = vm.createContext({}, {
      codeGeneration: { strings: false, wasm: false },
      microtaskMode: "afterEvaluate",
    });
    const define = vm.runInContext(defineArguments, context) as (text: string) => void;
    define(argumentsText);
    const completion: unknown = new vm.Script(source, { filename: `script:${request.occurrence.elementId}` })
      .runInContext(context, { timeout: options.timeoutMs });
    const outputs = resultVariable === null ? [] : [{ name: resultVariable, value: portable(completion) }];
    return { kind: EffectResultKind.Success, outputs };
  } catch {
    // Every throw here is the Script's own failure (its exception, its timeout, its non-portable value), which CIB
    // reports as the job's failure; a malformed argument, a host fault, was thrown before the context was built.
    return { kind: EffectResultKind.TechnicalFailure };
  }
}
