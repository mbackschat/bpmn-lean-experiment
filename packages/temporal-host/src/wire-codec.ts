/**
 * The continuation codec for opaque kernel state: plain JSON, with each `bigint` (a decimal's coefficient) as a
 * one-key `{"$bigint": "<digits>"}` object. The kernel's state names variables only in tuple positions, never as
 * object keys, so no model content can take the marker's shape. A value JSON cannot carry exactly is refused.
 */
import type { JsonValue } from "./port.js";

const marker = "$bigint";

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

export function toWire(value: unknown): JsonValue {
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) throw new TypeError(`non-finite number ${String(value)} has no JSON form`);
      return value;
    case "bigint":
      return { [marker]: value.toString() };
    case "object": {
      if (value === null) return null;
      if (Array.isArray(value)) return value.map(toWire);
      if (!isPlainObject(value)) throw new TypeError("only plain objects have a JSON form");
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toWire(entry)]));
    }
    case "undefined":
    case "function":
    case "symbol":
      throw new TypeError(`${typeof value} has no JSON form`);
  }
}

export function fromWire(json: JsonValue): unknown {
  if (json === null || typeof json !== "object") return json;
  if (Array.isArray(json)) return json.map(fromWire);
  const entries = Object.entries(json);
  const [first] = entries;
  if (first !== undefined && first[0] === marker) {
    if (entries.length !== 1 || typeof first[1] !== "string" || !/^-?\d+$/u.test(first[1])) {
      throw new TypeError(`malformed ${marker} marker`);
    }
    return BigInt(first[1]);
  }
  return Object.fromEntries(entries.map(([key, entry]) => [key, fromWire(entry)]));
}
