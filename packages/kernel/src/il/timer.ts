/**
 * Timer lexemes, transcribed from `Kernel/IL/Timer.lean`: the exact ISO 8601 grammar the profile admits for Timer
 * literals, shared by `admission/subscriptions.ts` and `feature/subscriptions.ts`.
 *
 * A duration is `PT[nH][nM][nS]` with non-negative integer components in that order, each at most once, at least
 * one present, totalling 1 ms to `maxDurationMs` (TED-PARSE-01). A cycle is the unbounded repetition
 * `R/<duration>`. Components are summed as `bigint`, as Lean's `Nat` is unbounded, so an oversized component is
 * refused by the bound rather than by overflow.
 */
import { CycleDialect, TimerScheduleTag, assertNever, valueSourceLiteral, type TimerSchedule } from "./types.js";

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

export enum ResolvedTag { Duration = "duration", Cycle = "cycle" }

/**
 * A Timer schedule resolved to the delays a host arms: one duration, or a cycle's period and its repetitions (`null`
 * unbounded).
 */
export type Resolved =
  | { readonly tag: ResolvedTag.Duration; readonly ms: number }
  | { readonly tag: ResolvedTag.Cycle; readonly periodMs: number; readonly repetitions: number | null };

/**
 * The one resolution of a Timer schedule, shared by `feature/subscriptions.ts`, which arms it, and
 * `host.ts#definitionCapabilities`, which offers a Timer start's schedule to its host. Every refused form yields its
 * dynamic-only code; admission refuses each of them first (`timer.duration`, `timer.date`, `timer.cycle`,
 * `timer.cron`). The grammar admits only unbounded cycles, so `repetitions` is always `null`.
 */
export function resolve(schedule: TimerSchedule): { readonly ok: true; readonly value: Resolved } | { readonly ok: false; readonly code: string } {
  switch (schedule.tag) {
    case TimerScheduleTag.Duration: {
      const literal = valueSourceLiteral(schedule.value);
      const ms = literal === null ? null : durationMs(literal);
      return ms === null ? { ok: false, code: "timer-duration" } : { ok: true, value: { tag: ResolvedTag.Duration, ms } };
    }
    case TimerScheduleTag.Date:
      return { ok: false, code: "timer-date" };
    case TimerScheduleTag.Cycle:
      switch (schedule.dialect) {
        case CycleDialect.Iso8601: {
          const literal = valueSourceLiteral(schedule.value);
          const periodMs = literal === null ? null : cyclePeriodMs(literal);
          return periodMs === null
            ? { ok: false, code: "timer-cycle" }
            : { ok: true, value: { tag: ResolvedTag.Cycle, periodMs, repetitions: null } };
        }
        case CycleDialect.Cron:
          return { ok: false, code: "timer-cron" };
      }
      return assertNever(schedule.dialect);
  }
  return assertNever(schedule);
}
