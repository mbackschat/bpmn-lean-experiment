/**
 * Timer lexemes, transcribed from `Kernel/IL/Timer.lean`: the exact ISO 8601 grammar the profile admits for Timer
 * literals, shared by `admission/subscriptions.ts` and `feature/subscriptions.ts`.
 *
 * A duration is `PT[nH][nM][nS]` with non-negative integer components in that order, each at most once, at least
 * one present, totalling 1 ms to `maxDurationMs` (TED-PARSE-01). A cycle is the unbounded repetition
 * `R/<duration>`. Components are summed as `bigint`, as Lean's `Nat` is unbounded, so an oversized component is
 * refused by the bound rather than by overflow.
 */

/** Ten Julian years (TED-BOUND-01). */
export const maxDurationMs = 315_576_000_000;

const durationUnits: readonly (readonly [string, bigint])[] = [
  ["H", 3_600_000n],
  ["M", 60_000n],
  ["S", 1_000n],
];

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

/** Read `[nH][nM][nS]`, each unit after the previous one, accumulating milliseconds. */
function components(chars: readonly string[]): bigint | null {
  let rest = chars;
  let units = durationUnits;
  let total = 0n;
  let seen = false;
  while (rest.length > 0) {
    let count = 0;
    while (count < rest.length && isDigit(rest[count] ?? "")) {
      count += 1;
    }
    if (count === 0 || count === rest.length) {
      return null;
    }
    const unit = rest[count];
    const at = units.findIndex((entry) => entry[0] === unit);
    const scale = units[at]?.[1];
    if (scale === undefined) {
      return null;
    }
    total += BigInt(rest.slice(0, count).join("")) * scale;
    seen = true;
    units = units.slice(at + 1);
    rest = rest.slice(count + 1);
  }
  return seen ? total : null;
}

/** Milliseconds of an exact duration lexeme, `null` for any refused form. */
export function durationMs(lexeme: string): number | null {
  const chars = Array.from(lexeme);
  if (chars[0] !== "P" || chars[1] !== "T") {
    return null;
  }
  const total = components(chars.slice(2));
  return total !== null && total > 0n && total <= BigInt(maxDurationMs) ? Number(total) : null;
}

/** The period of an unbounded cycle lexeme `R/<duration>`, `null` for any refused form. */
export function cyclePeriodMs(lexeme: string): number | null {
  const chars = Array.from(lexeme);
  return chars[0] === "R" && chars[1] === "/" ? durationMs(chars.slice(2).join("")) : null;
}
