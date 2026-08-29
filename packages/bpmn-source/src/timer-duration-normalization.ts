/**
 * The one owner that turns an admitted timer duration lexeme into milliseconds.
 *
 * The checked graph retains the exact source lexeme rather than a normalized number so that Lean and
 * TypeScript cannot drift on how a duration is read. That protection holds only while a single owner
 * performs the conversion: a lowering that writes its own millisecond literal beside a
 * `durationLiteral` it never reads keeps the old deadline when the model's lexeme changes, and no
 * gate separates the two.
 */

/**
 * Every admitted lexeme with its millisecond value.
 *
 * The table is the exhaustive source: the lexeme union below is derived from it, so a lexeme cannot
 * be admitted without a value here.
 */
const admittedTimerDurationsMs = {
  PT1S: 1_000,
  PT5S: 5_000,
} as const;

/** The duration lexemes the admitted profiles accept. */
export type AdmittedTimerDurationLiteral = keyof typeof admittedTimerDurationsMs;

/**
 * Milliseconds for one admitted lexeme.
 *
 * The result narrows with the argument, so a family whose profile admits exactly one lexeme keeps
 * its exact millisecond type at the call site instead of widening to the whole union.
 */
export function normalizeTimerDurationMs<L extends AdmittedTimerDurationLiteral>(
  durationLiteral: L,
): (typeof admittedTimerDurationsMs)[L] {
  return admittedTimerDurationsMs[durationLiteral];
}
