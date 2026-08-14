export function compareFlowNodeCanonicalStrings(
  left: string,
  right: string,
): number {
  const leftScalars = Array.from(left, (scalar) => scalar.codePointAt(0)!);
  const rightScalars = Array.from(right, (scalar) => scalar.codePointAt(0)!);
  const length = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftScalars[index]! - rightScalars[index]!;
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return Math.sign(leftScalars.length - rightScalars.length);
}

export function isDenseFlowNodeArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && Reflect.ownKeys(value).length === value.length + 1 &&
    Reflect.ownKeys(value).every((key) => key === "length" ||
      (typeof key === "string" && /^(?:0|[1-9][0-9]*)$/u.test(key) && Number(key) < value.length));
}
