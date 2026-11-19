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

const stringMarker = "$";
/** A String shorter than this many UTF-16 code units is written in place; its reference would save too little. */
export const internedLength = 8;

/**
 * The continuation form of encoded kernel state (spike T75): `{ strings, body }`, where every String of at least
 * `internedLength` code units that occurs at least twice in `json` is written once in `strings`, in code-unit order, and
 * referenced in `body` as `{"$": index}`. A scope or occurrence key repeats its parent's path in every family that names
 * it, so most of the repetition removed is key text, IL identifiers and payload strings copied into open items.
 * The reference cannot be confused with content: kernel state names an object member only from a fixed set of field names,
 * and a business Map is `{tag, entries}` with its keys as Strings in entry tuples, so no state object has `$` as a member.
 * `write` still throws on such an object, an invariant guard that valid data cannot reach.
 */
export function internStrings(json: JsonValue): JsonValue {
  const counts = new Map<string, number>();
  const scan = (value: JsonValue): void => {
    if (typeof value === "string") {
      if (value.length >= internedLength) counts.set(value, (counts.get(value) ?? 0) + 1);
    } else if (Array.isArray(value)) value.forEach(scan);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(scan);
  };
  scan(json);
  const strings = [...counts].filter(([, count]) => count >= 2).map(([text]) => text).sort();
  const index = new Map(strings.map((text, at) => [text, at]));
  const write = (value: JsonValue): JsonValue => {
    if (typeof value === "string") {
      const at = index.get(value);
      return at === undefined ? value : { [stringMarker]: at };
    }
    if (Array.isArray(value)) return value.map(write);
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length === 1 && entries[0]![0] === stringMarker) throw new TypeError(`an object whose only member is ${stringMarker}`);
      return Object.fromEntries(entries.map(([key, member]) => [key, write(member)]));
    }
    return value;
  };
  return { strings, body: write(json) };
}

/** The inverse of `internStrings`; a malformed form or an index outside `strings` is a `TypeError`, a harness error. */
export function expandStrings(json: JsonValue): JsonValue {
  const form = json !== null && typeof json === "object" && !Array.isArray(json) ? (json as { readonly [key: string]: JsonValue }) : null;
  const table = form?.["strings"];
  if (form === null || !Array.isArray(table) || !("body" in form)) throw new TypeError("malformed interned state");
  const strings = table as readonly JsonValue[];
  const read = (value: JsonValue): JsonValue => {
    if (Array.isArray(value)) return value.map(read);
    if (value !== null && typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length === 1 && entries[0]![0] === stringMarker) {
        const at = entries[0]![1];
        const text = typeof at === "number" && Number.isInteger(at) ? strings[at] : undefined;
        if (typeof text !== "string") throw new TypeError(`no interned String ${JSON.stringify(at)}`);
        return text;
      }
      return Object.fromEntries(entries.map(([key, member]) => [key, read(member)]));
    }
    return value;
  };
  return read(form["body"]!);
}
