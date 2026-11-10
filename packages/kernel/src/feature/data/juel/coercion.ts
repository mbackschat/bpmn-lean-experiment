/**
 * Data: Java's carriers for portable values and the EL coercions between them (`TypeConverterImpl`, EL §1.18), for
 * the Core JUEL evaluator; transcribed from `Kernel/Feature/Data/Juel/Coercion.lean`.
 */
import { ValueTag, assertNever, type Value } from "../../../il/types.js";
import { canonicalDecimal } from "../../../hooks.js";

/** Which Java class carries an Integer during one evaluation; only Java `equals` observes it. */
export enum Carrier {
  Long = "long",
  Integer = "integer",
  Unknown = "unknown",
}

export enum JValTag {
  Null = "null",
  Bool = "bool",
  Int = "int",
  Decimal = "decimal",
  String = "string",
  List = "list",
  Map = "map",
}

/** A value during evaluation: a portable value with Java's carrier, a Decimal at any scale. */
export type JVal =
  | { readonly tag: JValTag.Null }
  | { readonly tag: JValTag.Bool; readonly value: boolean }
  | { readonly tag: JValTag.Int; readonly value: bigint; readonly carrier: Carrier }
  | { readonly tag: JValTag.Decimal; readonly coefficient: bigint; readonly scale: bigint }
  | { readonly tag: JValTag.String; readonly value: string }
  | { readonly tag: JValTag.List; readonly items: readonly Value[] }
  | { readonly tag: JValTag.Map; readonly entries: readonly (readonly [string, Value])[] };

/** Why an evaluation stopped: an EL error the site decides on, or a surface the kernel does not represent. */
export type Stop = { readonly unsupported: boolean; readonly code: string };
export type Eval<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly stop: Stop };

export const ok = <T>(value: T): Eval<T> => ({ ok: true, value });
export const fail = <T>(code: string): Eval<T> => ({ ok: false, stop: { unsupported: false, code } });
export const unsupported = <T>(code: string): Eval<T> => ({ ok: false, stop: { unsupported: true, code } });
export const stopped = <T>(result: { readonly ok: false; readonly stop: Stop }): Eval<T> => result;

/** `ELException` and every other Java exception but the two below (`JuelExpression.java:62-76`). */
export const elError = "juel.error";
export const nullValue: JVal = { tag: JValTag.Null };
export const bool = (value: boolean): JVal => ({ tag: JValTag.Bool, value });
export const long = (value: bigint): JVal => ({ tag: JValTag.Int, value: BigInt.asIntN(64, value), carrier: Carrier.Long });
export const integer = (value: number): JVal => ({ tag: JValTag.Int, value: BigInt(value), carrier: Carrier.Integer });
export const text = (value: string): JVal => ({ tag: JValTag.String, value });
/** Decimal scales beyond this bound are a kernel limit: exact arithmetic on them is unbounded work. */
const scaleBound = 4096n;
const maxSafe = 9007199254740991n;

/** The portable value of a result, or `null` outside the domain (DATA-SEMANTICS-SPEC "Values"). */
export function portable(value: JVal): Value | null {
  switch (value.tag) {
    case JValTag.Null:
      return { tag: ValueTag.Null };
    case JValTag.Bool:
      return { tag: ValueTag.Bool, value: value.value };
    case JValTag.Int:
      return value.value >= 0n && value.value <= maxSafe ? { tag: ValueTag.Int, value: Number(value.value) } : null;
    case JValTag.Decimal:
      return canonicalDecimal(value.coefficient, value.scale)
        ? { tag: ValueTag.Decimal, coefficient: value.coefficient, scale: Number(value.scale) }
        : null;
    case JValTag.String:
      return utf8Bytes(value.value) <= 1024 ? { tag: ValueTag.String, value: value.value } : null;
    case JValTag.List:
      return { tag: ValueTag.List, items: value.items };
    case JValTag.Map:
      return { tag: ValueTag.Map, entries: value.entries };
  }
  return assertNever(value);
}

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** A context value as Java sees it: Integers of unknown class, a `stringList` as the ArrayList of Strings it is in CIB. */
export function fromValue(value: Value): JVal {
  switch (value.tag) {
    case ValueTag.Null:
      return nullValue;
    case ValueTag.Bool:
      return bool(value.value);
    case ValueTag.Int:
      return { tag: JValTag.Int, value: BigInt(value.value), carrier: Carrier.Unknown };
    case ValueTag.Decimal:
      return { tag: JValTag.Decimal, coefficient: value.coefficient, scale: BigInt(value.scale) };
    case ValueTag.String:
      return text(value.value);
    case ValueTag.StringList:
      return { tag: JValTag.List, items: value.items.map((item) => ({ tag: ValueTag.String, value: item })) };
    case ValueTag.List:
      return { tag: JValTag.List, items: value.items };
    case ValueTag.Map:
      return { tag: JValTag.Map, entries: value.entries };
  }
  return assertNever(value);
}
const isBlank = (value: JVal): boolean =>
  value.tag === JValTag.Null || (value.tag === JValTag.String && value.value === "");

export function toBool(value: JVal): Eval<boolean> {
  if (isBlank(value)) return ok(false);
  switch (value.tag) {
    case JValTag.Bool:
      return ok(value.value);
    case JValTag.String:
      return ok(value.value.length === 4 && value.value.toLowerCase() === "true" && /^[\x00-\x7f]*$/u.test(value.value));
    case JValTag.Null:
    case JValTag.Int:
    case JValTag.Decimal:
    case JValTag.List:
    case JValTag.Map:
      return fail(elError);
  }
  return assertNever(value);
}

export const isAscii = (value: string): boolean => /^[\x00-\x7f]*$/u.test(value);

export function toLong(value: JVal): Eval<bigint> {
  if (isBlank(value)) return ok(0n);
  switch (value.tag) {
    case JValTag.Int:
      return ok(value.value);
    case JValTag.Decimal:
      return ok(BigInt.asIntN(64, truncated(value.coefficient, value.scale)));
    case JValTag.String: {
      // dynamic-only: `Long.valueOf` reads Unicode digits the kernel does not model.
      if (!isAscii(value.value)) return unsupported("juel.nonAsciiText");
      const parsed = signedDigits(value.value);
      return parsed !== null && BigInt.asIntN(64, parsed) === parsed ? ok(parsed) : fail(elError);
    }
    case JValTag.Null:
    case JValTag.Bool:
    case JValTag.List:
    case JValTag.Map:
      return fail(elError);
  }
  return assertNever(value);
}

/** `Long.parseLong`'s ASCII grammar: an optional sign and at least one digit. */
export function signedDigits(source: string): bigint | null {
  return /^[+-]?[0-9]+$/u.test(source) ? BigInt(source.startsWith("+") ? source.slice(1) : source) : null;
}

/** `coefficient × 10^-scale` truncated toward zero. */
function truncated(coefficient: bigint, scale: bigint): bigint {
  return scale >= 0n ? coefficient / 10n ** scale : coefficient * 10n ** -scale;
}

export type Decimal = readonly [bigint, bigint];

export function toDecimal(value: JVal): Eval<Decimal> {
  if (isBlank(value)) return ok([0n, 0n]);
  switch (value.tag) {
    case JValTag.Decimal:
      return ok([value.coefficient, value.scale]);
    case JValTag.Int:
      // dynamic-only: `new BigDecimal(double)` first rounds an Integer beyond 2^53 to a double.
      return value.value <= 2n ** 53n && value.value >= -(2n ** 53n) ? ok([value.value, 0n]) : unsupported("juel.double");
    case JValTag.String: {
      // dynamic-only: `new BigDecimal(String)` reads Unicode digits the kernel does not model.
      if (!isAscii(value.value)) return unsupported("juel.nonAsciiText");
      return decimalText(value.value);
    }
    case JValTag.Null:
    case JValTag.Bool:
    case JValTag.List:
    case JValTag.Map:
      return fail(elError);
  }
  return assertNever(value);
}

/** `new BigDecimal(String)`: sign, digits with at most one point and at least one digit, an optional exponent. */
function decimalText(source: string): Eval<Decimal> {
  const match = /^([+-]?)([0-9]*)(?:\.([0-9]*))?(?:[eE]([+-]?[0-9]+))?$/u.exec(source);
  if (match === null) return fail(elError);
  const [, sign = "", whole = "", fraction = "", exponent = "0"] = match;
  if (whole.length + fraction.length === 0) return fail(elError);
  const scale = BigInt(fraction.length) - BigInt(exponent);
  if (scale < -2147483648n || scale > 2147483647n) return fail(elError);
  // dynamic-only: a scale this large is exact in Java but unbounded work here.
  if (scale > scaleBound || scale < -scaleBound) return unsupported("juel.decimalRange");
  const coefficient = BigInt(whole + fraction);
  return ok([sign === "-" ? -coefficient : coefficient, scale]);
}

/** `Double.valueOf` acceptance after `String.trim`; the Double itself is never built. */
function doubleText(source: string): boolean {
  const trimmed = javaTrim(source);
  return /^[+-]?(?:NaN|Infinity|(?:(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?|0[xX](?:[0-9a-fA-F]+\.?|[0-9a-fA-F]*\.[0-9a-fA-F]+)[pP][+-]?[0-9]+)[fFdD]?)$/u
    .test(trimmed);
}

function convertsToDouble(value: JVal): boolean {
  if (isBlank(value)) return true;
  switch (value.tag) {
    case JValTag.Int:
    case JValTag.Decimal:
      return true;
    case JValTag.String:
      return doubleText(value.value);
    case JValTag.Null:
    case JValTag.Bool:
    case JValTag.List:
    case JValTag.Map:
      return false;
  }
  return assertNever(value);
}

/** A rule whose result is a Double: either conversion fails as Java's does, or the Double is a kernel limit. */
export function double(left: JVal, right: JVal): Eval<JVal> {
  // dynamic-only: whether an operand converts to a Double depends on the run's data.
  return convertsToDouble(left) && convertsToDouble(right) ? unsupported("juel.double") : fail(elError);
}

export function toText(value: JVal): Eval<string> {
  switch (value.tag) {
    case JValTag.Null:
      return ok("");
    case JValTag.Bool:
      return ok(value.value ? "true" : "false");
    case JValTag.Int:
      return ok(value.value.toString());
    case JValTag.Decimal:
      return ok(decimalString(value.coefficient, value.scale));
    case JValTag.String:
      return ok(value.value);
    case JValTag.List:
    case JValTag.Map:
      // dynamic-only: Java renders a collection by its host class.
      return unsupported("juel.collectionText");
  }
  return assertNever(value);
}

/** `BigDecimal.toString`: plain notation unless the scale is negative or the adjusted exponent is below −6. */
function decimalString(coefficient: bigint, scale: bigint): string {
  const sign = coefficient < 0n ? "-" : "";
  const digits = (coefficient < 0n ? -coefficient : coefficient).toString();
  const adjusted = -scale + BigInt(digits.length - 1);
  if (scale >= 0n && adjusted >= -6n) {
    if (scale === 0n) return sign + digits;
    const point = digits.length - Number(scale);
    return point > 0
      ? `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
      : `${sign}0.${"0".repeat(-point)}${digits}`;
  }
  const mantissa = digits.length > 1 ? `${digits.slice(0, 1)}.${digits.slice(1)}` : digits;
  return `${sign}${mantissa}E${adjusted > 0n ? "+" : ""}${adjusted.toString()}`;
}

/** A String with `.`, `e` or `E` (`NumberOperations.isDotEe`). */
export const dotEe = (value: JVal): boolean => value.tag === JValTag.String && /[.eE]/u.test(value.value);

/** Java `String.trim`: strip characters up to U+0020 at both ends. */
export function javaTrim(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start += 1;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end -= 1;
  return value.slice(start, end);
}
