/**
 * Java's lexical rules for numeric text, transcribed from `Kernel/IL/Types/Lexical.lean`: the one place each Java
 * text-to-number rule the kernel reproduces is stated. Every rule covers ASCII text only: Java reads digits through
 * `Character.digit`, which also accepts other Unicode digits, so a caller first refuses non-ASCII text with `isAscii`
 * and its own stable code. Part of `il/types.ts`, which re-exports it.
 */
/**
 * Java `int` (`Integer.MIN_VALUE` to `Integer.MAX_VALUE`): the range of `Integer.parseInt`, of a DMN `integer` value
 * (`IntegerDataTypeTransformer.java:32-44`) and of a Multi-Instance count CIB reads through `intValue`.
 */
export function withinJavaInt(value: number | bigint): boolean {
  const n = BigInt(value);
  return n >= -2147483648n && n <= 2147483647n;
}

export const isAscii = (text: string): boolean => /^[\u0000-\u007f]*$/u.test(text);

/**
 * The grammar `Integer.parseInt` and `Long.parseLong` share, before their range: an optional sign (at most one leading
 * `-` or `+`) and at least one ASCII digit.
 */
export function signedDigits(text: string): bigint | null {
  return /^[+-]?[0-9]+$/u.test(text) ? BigInt(text.startsWith("+") ? text.slice(1) : text) : null;
}

/** `Integer.parseInt` over ASCII text: `signedDigits` within Java's `int`. */
export function parseJavaInt(text: string): bigint | null {
  const parsed = signedDigits(text);
  return parsed !== null && withinJavaInt(parsed) ? parsed : null;
}

/** `Long.parseLong` over ASCII text: `signedDigits` within Java's `long`. */
export function parseJavaLong(text: string): bigint | null {
  const parsed = signedDigits(text);
  return parsed !== null && BigInt.asIntN(64, parsed) === parsed ? parsed : null;
}

/**
 * A JUEL integer literal: digits only, since a leading minus is the unary operator, within `Long.valueOf`'s range
 * (`Parser.java:140`); unlike `signedDigits` it refuses a sign.
 */
export function integerLexeme(digits: string): bigint | null {
  if (!/^[0-9]+$/u.test(digits)) return null;
  const value = BigInt(digits);
  return value <= 9223372036854775807n ? value : null;
}
