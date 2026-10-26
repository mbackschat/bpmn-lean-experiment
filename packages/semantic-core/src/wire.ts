/**
 * The current wire admits exact, non-normalized strings containing only
 * Unicode scalar values. JavaScript strings can also contain lone UTF-16
 * surrogates, so boundaries must check this explicitly.
 */
export function isWellFormedWireString(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        return false;
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/** Lexicographic order by Unicode scalar value, with no normalization. */
export function compareCanonicalStrings(left: string, right: string): number {
  if (!isWellFormedWireString(left) || !isWellFormedWireString(right)) {
    throw new TypeError("canonical wire strings require Unicode scalar values");
  }
  const leftScalars = [...left];
  const rightScalars = [...right];
  const sharedLength = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftScalar = requireCodePoint(leftScalars[index]);
    const rightScalar = requireCodePoint(rightScalars[index]);
    if (leftScalar !== rightScalar) {
      return leftScalar < rightScalar ? -1 : 1;
    }
  }
  return Math.sign(leftScalars.length - rightScalars.length);
}

/**
 * Exact UTF-8 byte length for one Unicode-scalar string, refusing a lone surrogate.
 *
 * One pass over UTF-16 code units, because Start capacity admission sizes full-allowance values on every journey
 * step: spreading each string into scalars took 11.4 s of a 20 s guarantor-loan envelope (profiled 2026-10-26).
 */
export function utf8ByteLength(value: string): number {
  if (typeof value !== "string") {
    throw new TypeError("UTF-8 sizing requires Unicode scalar values");
  }
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit <= 0x7f) {
      total += 1;
    } else if (unit <= 0x7ff) {
      total += 2;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        throw new TypeError("UTF-8 sizing requires Unicode scalar values");
      }
      total += 4;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError("UTF-8 sizing requires Unicode scalar values");
    } else {
      total += 3;
    }
  }
  return total;
}

function requireCodePoint(scalar: string | undefined): number {
  const codePoint = scalar?.codePointAt(0);
  if (codePoint === undefined) {
    throw new TypeError("canonical scalar comparison requires one code point");
  }
  return codePoint;
}
