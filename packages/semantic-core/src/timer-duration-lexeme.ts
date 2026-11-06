/**
 * The one TypeScript owner of the exact ISO 8601 Timer duration grammar.
 *
 * It admits `PT[nH][nM][nS]`: non-negative integer components in that order, each at most once,
 * at least one present, with a total from 1 ms to `maxExactTimerDurationMs`. Lean's private
 * `exactTimerDurationMs?` in the semantic `Lowering` module reads the same grammar,
 * and both are checked against one shared lexeme list (TED-PARSE-01 of
 * docs/capsules/TIMER-EXACT-DURATIONS-PROPOSAL.md).
 *
 * The refused forms are conforming BPMN but deferred (CIB limitation entry of that proposal):
 * zero needs an immediate-due hosting rule, fractions a precision rule, and nominal components and
 * dated intervals the calendar and zone account that absolute dates also need.
 */

/**
 * Ten Julian years of exact time. Far inside the safe wire integer, so an armed deadline stays a
 * safe integer for every logical time below `2^53 - 1 - maxExactTimerDurationMs` (TED-BOUND-01).
 */
export const maxExactTimerDurationMs = 315_576_000_000;

export enum ExactTimerDurationRefusal {
  Zero = "zero",
  Fractional = "fractional",
  Nominal = "nominal",
  Interval = "interval",
  Date = "date",
  Repetition = "repetition",
  AboveMaximum = "aboveMaximum",
  Malformed = "malformed",
}

export type ExactTimerDurationParse =
  | Readonly<{ admitted: true; durationMs: number }>
  | Readonly<{ admitted: false; refusal: ExactTimerDurationRefusal }>;

const exactDuration = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u;
const componentMs = [3_600_000n, 60_000n, 1_000n] as const;

/** Milliseconds for an exact duration lexeme, or the class of form that is refused. */
export function parseExactTimerDuration(lexeme: string): ExactTimerDurationParse {
  const match = exactDuration.exec(lexeme);
  if (match === null || lexeme === "PT") {
    return { admitted: false, refusal: refusalClass(lexeme) };
  }
  // BigInt keeps huge digit runs exact, so an oversized lexeme is refused as above the maximum
  // rather than rounded into range by floating point.
  const total = match.slice(1).reduce(
    (sum, digits, index) => digits === undefined ? sum : sum + BigInt(digits) * componentMs[index]!,
    0n,
  );
  if (total === 0n) return { admitted: false, refusal: ExactTimerDurationRefusal.Zero };
  if (total > BigInt(maxExactTimerDurationMs)) {
    return { admitted: false, refusal: ExactTimerDurationRefusal.AboveMaximum };
  }
  return { admitted: true, durationMs: Number(total) };
}

/**
 * Milliseconds for a lowering, which is total: a refused lexeme yields `0`, which the positive
 * `AwaitTimer` pin in operation admission refuses, as Lean's `normalizeTimerDuration` does.
 */
export function normalizeExactTimerDurationMs(lexeme: string): number {
  const parsed = parseExactTimerDuration(lexeme);
  return parsed.admitted ? parsed.durationMs : 0;
}

function refusalClass(lexeme: string): ExactTimerDurationRefusal {
  if (/^R\d*\//u.test(lexeme)) return ExactTimerDurationRefusal.Repetition;
  if (lexeme.includes("/")) return ExactTimerDurationRefusal.Interval;
  if (/^\d{4}-\d{2}-\d{2}/u.test(lexeme)) return ExactTimerDurationRefusal.Date;
  if (/^PT(?:\d+[HM])*\d+[.,]\d+S$/u.test(lexeme)) return ExactTimerDurationRefusal.Fractional;
  if (/^P(?:\d+[YMWD])+(?:T.*)?$/u.test(lexeme)) return ExactTimerDurationRefusal.Nominal;
  return ExactTimerDurationRefusal.Malformed;
}
