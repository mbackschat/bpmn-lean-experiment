/**
 * Shared structural value comparison.
 *
 * Canonical-result comparison and target scenario binding both need the exact
 * first differing structural path rather than a boolean verdict. Keeping one
 * implementation prevents the two verifier-side checks from reporting
 * disagreements at different granularities.
 */

export type ValueDisagreement = Readonly<{
  path: string;
  expected: unknown;
  actual: unknown;
}>;

type JsonRecord = Readonly<Record<string, unknown>>;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function childPath(parent: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

export function firstValueDisagreement(
  expected: unknown,
  actual: unknown,
  path: string,
): ValueDisagreement | null {
  if (Object.is(expected, actual)) {
    return null;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return {
        path: `${path}.length`,
        expected: expected.length,
        actual: actual.length,
      };
    }
    for (const [index, expectedItem] of expected.entries()) {
      const difference = firstValueDisagreement(
        expectedItem,
        actual[index],
        `${path}[${index}]`,
      );
      if (difference !== null) {
        return difference;
      }
    }
    return null;
  }

  if (isJsonRecord(expected) && isJsonRecord(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
      .sort();
    for (const key of keys) {
      const difference = firstValueDisagreement(
        expected[key],
        actual[key],
        childPath(path, key),
      );
      if (difference !== null) {
        return difference;
      }
    }
    return null;
  }

  return { path, expected, actual };
}
