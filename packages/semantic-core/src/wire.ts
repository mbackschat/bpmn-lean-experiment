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

function requireCodePoint(scalar: string | undefined): number {
  const codePoint = scalar?.codePointAt(0);
  if (codePoint === undefined) {
    throw new TypeError("canonical scalar comparison requires one code point");
  }
  return codePoint;
}
