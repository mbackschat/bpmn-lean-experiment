/**
 * The margin a witness must keep when it races a host-clock deadline.
 *
 * A boundary deadline is a semantic quantity, but the adapter arms it against the host clock
 * whenever logical time does not advance: `remainingMs` is `deadlineMs - logicalTimeMs`, and a
 * conformance host that never submits a logical instant leaves that equal to the whole deadline. A
 * witness whose path must reach its next observable state before the timer fires is therefore racing
 * real wall time, and it consumes that budget in host round trips it does not control.
 *
 * Such a race fails in the least useful way. It passes on a quiet machine, fails under a loaded one,
 * and reports the semantic symptom that the schedule caused rather than the schedule: a completion
 * rejected because interruption already won, or a readiness wait that never sees the state it is
 * waiting for. Nothing in the failure names the clock.
 *
 * Asserting the margin converts that invisible race into a reported number. The witness still fails
 * when it loses, but it now fails first while headroom remains, and it says by how much.
 */
import assert from "node:assert/strict";

/**
 * The largest fraction of a host-armed deadline a witness's racing path may consume.
 *
 * Half leaves a factor of two before the race is actually lost, which is the smallest margin that
 * survives the spread between development and hosted hardware: the differential catalog costs about
 * 515 ms per case on this repository's eight-core development machine and about 1,038 ms per case on
 * a four-core hosted runner, so a path measured at a third of its deadline locally is already at
 * two-thirds there.
 */
export const hostClockDeadlineMarginCeiling = 0.5;

/** One racing path's measured cost against the deadline it must beat. */
export type HostClockDeadlineMeasurement = Readonly<{
  /** Names the racing path in the failure, since one witness may race more than once. */
  label: string;
  /** Wall-clock milliseconds the racing path consumed. */
  elapsedMs: number;
  /**
   * Milliseconds the host actually armed, `deadlineMs - logicalTimeMs` at the arming observation.
   *
   * The absolute `deadlineMs` is the wrong budget and is only accidentally right: it equals the
   * armed span exactly when logical time is still zero, which is true of today's conformance hosts
   * and would silently overstate the margin under any schedule that advances it first.
   */
  remainingMs: number;
}>;

/**
 * Fails when a racing path consumed more than {@link hostClockDeadlineMarginCeiling} of its deadline.
 *
 * Call it with the wall-clock span between the racing path's first and last host round trip, not
 * with the whole test's duration: setup that precedes the deadline being armed is not part of the
 * race, and counting it would trip the assertion on cost the timer never bounded.
 */
export function assertHostClockDeadlineMargin(
  measurement: HostClockDeadlineMeasurement,
): void {
  const { label, elapsedMs, remainingMs } = measurement;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new TypeError(
      `${label} reported a nonsensical elapsed time of ${elapsedMs}ms`,
    );
  }
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    throw new TypeError(
      `${label} reported a nonsensical armed remainder of ${remainingMs}ms`,
    );
  }
  const consumed = elapsedMs / remainingMs;
  assert.ok(
    consumed <= hostClockDeadlineMarginCeiling,
    `${label} consumed ${(consumed * 100).toFixed(1)}% of its ${remainingMs}ms ` +
      `host-armed deadline (${elapsedMs.toFixed(0)}ms), above the ` +
      `${(hostClockDeadlineMarginCeiling * 100).toFixed(0)}% margin ceiling; the witness is racing ` +
      "the host clock and will fail on slower or busier hardware before this model's semantics do",
  );
}
