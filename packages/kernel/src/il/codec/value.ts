/**
 * JSON combinators and the Value codec, transcribed from `Kernel/IL/Codec/Value.lean` and the Lean derived JSON
 * instances `Kernel/IL/Codec.lean` relies on: the structure, constructor and enum readers every IL codec is built from,
 * and a `Value` in the scenario contract's `variableValue` form. Part of `il/codec.ts`, which re-exports what other
 * modules read.
 */
import { ValueTag, assertNever, type Value } from "../types.js";
import type { Binding } from "../../state.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type Decoded<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: string };

export interface Codec<T> {
  readonly decode: (json: unknown) => Decoded<T>;
  readonly encode: (value: T) => JsonValue;
}

/** The untyped view the generic structure and constructor tables work through. */
interface LooseCodec {
  readonly decode: (json: unknown) => Decoded<unknown>;
  readonly encode: (value: unknown) => JsonValue;
}

type Fields<T> = { readonly [K in keyof T]-?: Codec<T[K]> };

type Constructors<T extends { readonly tag: string }> = {
  readonly [K in T["tag"]]: Fields<Omit<Extract<T, { readonly tag: K }>, "tag">>;
};

export function accept<T>(value: T): Decoded<T> {
  return { ok: true, value };
}

export function refuse<T>(refusal: string): Decoded<T> {
  return { ok: false, refusal };
}

export function isObject(json: unknown): json is Readonly<Record<string, unknown>> {
  return typeof json === "object" && json !== null && !Array.isArray(json);
}

/** Lean's `Json.getObjVal?`: the key must be present. */
export function objVal(json: unknown, key: string): Decoded<unknown> {
  if (!isObject(json)) {
    return refuse("object expected");
  }
  return Object.hasOwn(json, key) ? accept(json[key]) : refuse(`property not found: ${key}`);
}

/** Lean's `Json.getObjValD`: an absent key, or a non-object, reads as `null`. */
export function objValD(json: unknown, key: string): unknown {
  return isObject(json) && Object.hasOwn(json, key) ? json[key] : null;
}

/** Lean's `Json.getTag?`: a string, or the only key of an object. */
export function tagOf(json: unknown): string | null {
  if (typeof json === "string") {
    return json;
  }
  if (isObject(json)) {
    const keys = Object.keys(json);
    return keys.length === 1 ? (keys[0] ?? null) : null;
  }
  return null;
}

export function loose<T>(codec: Codec<T>): LooseCodec {
  return codec as unknown as LooseCodec;
}

export const string: Codec<string> = {
  decode: (json) => (typeof json === "string" ? accept(json) : refuse("String expected")),
  encode: (value) => value,
};

export const bool: Codec<boolean> = {
  decode: (json) => (typeof json === "boolean" ? accept(json) : refuse("Bool expected")),
  encode: (value) => value,
};

export const nat: Codec<number> = {
  decode: (json) =>
    typeof json === "number" && Number.isSafeInteger(json) && json >= 0
      ? accept(json)
      : refuse("Natural number expected"),
  encode: (value) => value,
};

export const int: Codec<number> = {
  decode: (json) =>
    typeof json === "number" && Number.isSafeInteger(json) ? accept(json) : refuse("Integer expected"),
  encode: (value) => value,
};

export function list<T>(item: Codec<T>): Codec<readonly T[]> {
  return {
    decode: (json) => {
      if (!Array.isArray(json)) {
        return refuse("expected JSON array");
      }
      const items: T[] = [];
      for (const [index, entry] of json.entries()) {
        const decoded = item.decode(entry);
        if (!decoded.ok) {
          return refuse(`[${index}]: ${decoded.refusal}`);
        }
        items.push(decoded.value);
      }
      return accept(items);
    },
    encode: (values) => values.map(item.encode),
  };
}

export function option<T>(inner: Codec<T>): Codec<T | null> {
  return {
    decode: (json) => (json === null ? accept(null) : inner.decode(json)),
    encode: (value) => (value === null ? null : inner.encode(value)),
  };
}

export function pair<A, B>(first: Codec<A>, second: Codec<B>): Codec<readonly [A, B]> {
  return {
    decode: (json) => {
      if (!Array.isArray(json) || json.length !== 2) {
        return refuse("expected pair");
      }
      const a = first.decode(json[0]);
      if (!a.ok) {
        return a;
      }
      const b = second.decode(json[1]);
      return b.ok ? accept([a.value, b.value] as const) : b;
    },
    encode: (value) => [first.encode(value[0]), second.encode(value[1])],
  };
}

/** A Lean structure: every field in declaration order, each read through `getObjValD`. */
export function struct<T>(name: string, fields: Fields<T>): Codec<T> {
  const entries = Object.entries(fields).map(([key, codec]) => [key, loose(codec as Codec<unknown>)] as const);
  return {
    decode: (json) => {
      const out: Record<string, unknown> = {};
      for (const [key, codec] of entries) {
        const decoded = codec.decode(objValD(json, key));
        if (!decoded.ok) {
          return refuse(`${name}.${key}: ${decoded.refusal}`);
        }
        out[key] = decoded.value;
      }
      return accept(out as T);
    },
    encode: (value) => {
      const record = value as Readonly<Record<string, unknown>>;
      return Object.fromEntries(entries.map(([key, codec]) => [key, codec.encode(record[key])]));
    },
  };
}

/** A Lean inductive with named constructor arguments; a constructor with no arguments is nullary. */
export function inductive<T extends { readonly tag: string }>(name: string, constructors: Constructors<T>): Codec<T> {
  const table = new Map(
    Object.entries(constructors).map(([tag, fields]) => [
      tag,
      Object.entries(fields as Readonly<Record<string, Codec<unknown>>>).map(
        ([key, codec]) => [key, loose(codec)] as const,
      ),
    ]),
  );
  return {
    decode: (json) => {
      const tag = tagOf(json);
      if (tag === null) {
        return refuse(`${name}: no inductive tag found`);
      }
      const fields = table.get(tag);
      if (fields === undefined) {
        return refuse(`${name}: no inductive constructor matched`);
      }
      const out: Record<string, unknown> = { tag };
      if (fields.length === 0) {
        return accept(out as T);
      }
      const payload = objVal(json, tag);
      if (!payload.ok) {
        return refuse(`${name}.${tag}: ${payload.refusal}`);
      }
      for (const [key, codec] of fields) {
        const raw = objVal(payload.value, key);
        const decoded = raw.ok ? codec.decode(raw.value) : raw;
        if (!decoded.ok) {
          return refuse(`${name}.${tag}.${key}: ${decoded.refusal}`);
        }
        out[key] = decoded.value;
      }
      return accept(out as T);
    },
    encode: (value) => {
      const fields = table.get(value.tag) ?? [];
      if (fields.length === 0) {
        return value.tag;
      }
      const record = value as unknown as Readonly<Record<string, unknown>>;
      return { [value.tag]: Object.fromEntries(fields.map(([key, codec]) => [key, codec.encode(record[key])])) };
    },
  };
}

/** A Lean inductive whose constructors are all nullary, mirrored as a plain string enum. */
export function nullary<E extends string>(name: string, members: Readonly<Record<E, E>>): Codec<E> {
  const table = new Map<string, E>(Object.entries<E>(members));
  return {
    decode: (json) => {
      const tag = tagOf(json);
      const member = tag === null ? undefined : table.get(tag);
      return member === undefined ? refuse(`${name}: no inductive constructor matched`) : accept(member);
    },
    encode: (value) => value,
  };
}

// Value: the scenario contract's `variableValue`, as `Kernel.Codec.valueFromJson` reads it.

/** Lean's `String.toInt?`: an optional `-`, then digits with single `_` separators between digits. */
export function leanToInt(text: string): bigint | null {
  const digits = text.startsWith("-") ? text.slice(1) : text;
  if (!/^[0-9]+(?:_[0-9]+)*$/u.test(digits)) {
    return null;
  }
  const magnitude = BigInt(digits.replaceAll("_", ""));
  return text.startsWith("-") ? -magnitude : magnitude;
}

function entryFromJson(entry: unknown): Decoded<Binding> {
  const name = string.decode(objValD(entry, "name"));
  if (!name.ok) {
    return name;
  }
  const raw = objVal(entry, "value");
  const value = raw.ok ? valueCodec.decode(raw.value) : raw;
  return value.ok ? accept([name.value, value.value] as const) : value;
}

export function entriesFromJson(json: unknown): Decoded<readonly Binding[]> {
  return list<Binding>({ decode: entryFromJson, encode: entryToJson }).decode(json);
}

export function entryToJson(entry: Binding): JsonValue {
  return { name: entry[0], value: valueCodec.encode(entry[1]) };
}

export function mapDecoded<A, B>(decoded: Decoded<A>, wrap: (value: A) => B): Decoded<B> {
  return decoded.ok ? accept(wrap(decoded.value)) : decoded;
}

const valueKinds: ReadonlyMap<string, (json: unknown) => Decoded<Value>> = new Map<
  string,
  (json: unknown) => Decoded<Value>
>([
  ["null", () => accept<Value>({ tag: ValueTag.Null })],
  ["boolean", (json) => mapDecoded(bool.decode(objValD(json, "value")), (value) => ({ tag: ValueTag.Bool, value }))],
  ["integer", (json) => mapDecoded(int.decode(objValD(json, "value")), (value) => ({ tag: ValueTag.Int, value }))],
  [
    "decimal",
    (json) => {
      const coefficient = string.decode(objValD(json, "coefficient"));
      if (!coefficient.ok) {
        return coefficient;
      }
      const parsed = leanToInt(coefficient.value);
      if (parsed === null) {
        return refuse(`invalid decimal coefficient ${coefficient.value}`);
      }
      return mapDecoded(nat.decode(objValD(json, "scale")), (scale) => ({
        tag: ValueTag.Decimal,
        coefficient: parsed,
        scale,
      }));
    },
  ],
  ["string", (json) => mapDecoded(string.decode(objValD(json, "value")), (value) => ({ tag: ValueTag.String, value }))],
  [
    "stringList",
    (json) => mapDecoded(list(string).decode(objValD(json, "value")), (items) => ({ tag: ValueTag.StringList, items })),
  ],
  [
    "list",
    (json) => mapDecoded(list(valueCodec).decode(objValD(json, "value")), (items) => ({ tag: ValueTag.List, items })),
  ],
  ["map", (json) => mapDecoded(entriesFromJson(objValD(json, "value")), (entries) => ({ tag: ValueTag.Map, entries }))],
]);

function valueToJson(value: Value): JsonValue {
  switch (value.tag) {
    case ValueTag.Null:
      return { kind: "null" };
    case ValueTag.Bool:
      return { kind: "boolean", value: value.value };
    case ValueTag.Int:
      return { kind: "integer", value: value.value };
    case ValueTag.Decimal:
      return { kind: "decimal", coefficient: value.coefficient.toString(), scale: value.scale };
    case ValueTag.String:
      return { kind: "string", value: value.value };
    case ValueTag.StringList:
      return { kind: "stringList", value: [...value.items] };
    case ValueTag.List:
      return { kind: "list", value: value.items.map(valueToJson) };
    case ValueTag.Map:
      return { kind: "map", value: value.entries.map(entryToJson) };
  }
  return assertNever(value);
}

export const valueCodec: Codec<Value> = {
  decode: (json) => {
    const kind = string.decode(objValD(json, "kind"));
    if (!kind.ok) {
      return kind;
    }
    const decoder = valueKinds.get(kind.value);
    return decoder === undefined ? refuse(`unknown value kind ${kind.value}`) : decoder(json);
  },
  encode: valueToJson,
};


/** A nullary enum whose members are their own wire names. */
export function members<E extends string>(name: string, values: Readonly<Record<string, E>>): Codec<E> {
  return nullary<E>(name, Object.fromEntries(Object.values(values).map((value) => [value, value])) as Record<E, E>);
}
