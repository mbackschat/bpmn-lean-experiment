/**
 * Timer lexemes, transcribed from `Kernel/IL/Timer.lean`: the one classification of a Timer lexeme, shared by
 * `admission/subscriptions.ts` (literals) and `feature/subscriptions.ts` (literals and evaluated values), with what
 * arming it needs. A lexeme is admitted, outside the subset (conforming ISO 8601 or committed by CIB, but refused), or
 * malformed for CIB's parser (CIB rolls back the command that arms it). The kernel calls a lexeme malformed only where
 * the pinned parser certainly fails; anything uncertain is outside.
 *
 * Every calendar computation is over UTC with logical time as milliseconds after `1970-01-01T00:00:00Z`. Duration and
 * date arithmetic runs on `bigint`, as Lean's `Nat` is unbounded, so an oversized result is refused by the bound rather
 * than rounded.
 */
import { TimerScheduleTag, assertNever, valueSourceLiteral, type TimerSchedule } from "./types.js";

/** Java's `Integer.MAX_VALUE`. */
export const maxComponent = 2_147_483_647;

/** The canonical schema's safe integer, `2^53 - 1`. */
export const maxDeadlineMs = Number.MAX_SAFE_INTEGER;

const msPerDay = 86_400_000;

/** Which Timer definition a lexeme fills; a cycle's dialect is read from the lexeme (a leading `R` is ISO 8601). */
export enum TimerKind { Duration = "duration", Date = "date", Cycle = "cycle" }

/**
 * A refusal family: admission answers its static code (`admission/subscriptions.ts#timerRefusal`), a run-time value its
 * dynamic-only twin.
 */
export enum TimerCode { Duration = "duration", Date = "date", Cycle = "cycle", Cron = "cron" }

export function dynamicCode(code: TimerCode): string {
  switch (code) {
    case TimerCode.Duration:
      return "timer-duration";
    case TimerCode.Date:
      return "timer-date";
    case TimerCode.Cycle:
      return "timer-cycle";
    case TimerCode.Cron:
      return "timer-cron";
  }
  return assertNever(code);
}

/** Calendar duration components; `PnW` is `7n` days. */
export interface Duration {
  readonly years: number;
  readonly months: number;
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly millis: number;
}

const zero: Duration = { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0, millis: 0 };

/** The allowed values of each Cron field in ascending order; a day field is `null` when it does not restrict. */
export interface CronFields {
  readonly seconds: readonly number[];
  readonly minutes: readonly number[];
  readonly hours: readonly number[];
  readonly daysOfMonth: readonly number[] | null;
  readonly months: readonly number[];
  readonly daysOfWeek: readonly number[] | null;
}

export enum ParsedTag { Duration = "duration", Date = "date", Cycle = "cycle", Cron = "cron" }

/** An admitted lexeme, independent of the arming instant; a cycle is undated with an exact period. */
export type Parsed =
  | { readonly tag: ParsedTag.Duration; readonly value: Duration }
  | { readonly tag: ParsedTag.Date; readonly instantMs: number }
  | { readonly tag: ParsedTag.Cycle; readonly periodMs: number; readonly count: number | null }
  | { readonly tag: ParsedTag.Cron; readonly text: string; readonly fields: CronFields };

export enum ClassifiedTag { Admitted = "admitted", Outside = "outside", Malformed = "malformed" }

export type Classified =
  | { readonly tag: ClassifiedTag.Admitted; readonly parsed: Parsed }
  | { readonly tag: ClassifiedTag.Outside; readonly code: TimerCode }
  | { readonly tag: ClassifiedTag.Malformed; readonly code: TimerCode };

const admitted = (parsed: Parsed): Classified => ({ tag: ClassifiedTag.Admitted, parsed });
const outside = (code: TimerCode): Classified => ({ tag: ClassifiedTag.Outside, code });
const malformed = (code: TimerCode): Classified => ({ tag: ClassifiedTag.Malformed, code });

// Calendar

function leap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return leap(year) ? 29 : 28;
    case 4: case 6: case 9: case 11:
      return 30;
    default:
      return 31;
  }
}

/** Days from the epoch to a proleptic Gregorian date of a year from 1 (H. Hinnant's `days_from_civil`). */
function daysFromCivil(year: bigint, month: bigint, day: bigint): bigint {
  const y = month <= 2n ? year - 1n : year;
  const era = y / 400n;
  const yoe = y - era * 400n;
  const mp = month > 2n ? month - 3n : month + 9n;
  const doy = (153n * mp + 2n) / 5n + day - 1n;
  const doe = yoe * 365n + yoe / 4n - yoe / 100n + doy;
  return era * 146_097n + doe - 719_468n;
}

/** The date of a day counted from the epoch (H. Hinnant's `civil_from_days`). */
function civilFromDays(days: number): readonly [number, number, number] {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return [month <= 2 ? yoe + era * 400 + 1 : yoe + era * 400, month, day];
}

/** `duration` added at `now`: years, then months (each clamping the day of month), then the exact fields. */
function addDuration(now: number, duration: Duration): bigint {
  const [startYear, startMonth, startDay] = civilFromDays(Math.floor(now / msPerDay));
  const big = BigInt;
  let year = big(startYear) + big(duration.years);
  const clamp = (y: bigint, m: number, d: number) => Math.min(d, daysInMonth(Number(y), m));
  let day = clamp(year, startMonth, startDay);
  const months = big(startMonth - 1) + big(duration.months);
  year += months / 12n;
  const month = Number(months % 12n) + 1;
  day = clamp(year, month, day);
  return daysFromCivil(year, big(month), big(day)) * big(msPerDay) + big(now % msPerDay) + big(duration.days) * big(msPerDay) +
    big(duration.hours) * 3_600_000n + big(duration.minutes) * 60_000n + big(duration.seconds) * 1000n + big(duration.millis);
}

// Lexical helpers

const isDigit = (char: string): boolean => char >= "0" && char <= "9";

function digitsValue(digits: readonly string[]): number {
  return digits.length === 0 ? 0 : Number(BigInt(digits.join("")) > BigInt(maxDeadlineMs) ? maxDeadlineMs : BigInt(digits.join("")));
}

/** Whether the digits name a value above `bound`, without rounding. */
function above(digits: readonly string[], bound: number): boolean {
  return digits.length > 0 && BigInt(digits.join("")) > BigInt(bound);
}

function spanDigits(chars: readonly string[]): readonly [string[], string[]] {
  let count = 0;
  while (count < chars.length && isDigit(chars[count] ?? "")) count += 1;
  return [chars.slice(0, count), chars.slice(count)];
}

/** `chars` split at `separator`, dropping trailing empty parts as Java's `String#split` does. */
function splitJava(chars: readonly string[], separator: string): string[][] {
  const parts = chars.join("").split(separator).map((part) => Array.from(part));
  while (parts.length > 0 && parts[parts.length - 1]?.length === 0) parts.pop();
  return parts;
}

// Durations

type Component = readonly [string, string[], string[]];

/** Read components whose designators come from `units` in order, until the input ends or reaches `T`. */
function readUnits(input: readonly string[], unitList: readonly string[]): readonly [Component[], string[]] | null {
  let chars = [...input];
  let units = [...unitList];
  const components: Component[] = [];
  while (chars.length > 0 && chars[0] !== "T") {
    const [digits, afterDigits] = spanDigits(chars);
    if (digits.length === 0 || afterDigits.length === 0) return null;
    let fraction: string[] = [];
    let rest = afterDigits;
    if (rest[0] === ".") {
      [fraction, rest] = spanDigits(rest.slice(1));
      if (fraction.length === 0 || rest.length === 0) return null;
    }
    const unit = rest[0] ?? "";
    const at = units.indexOf(unit);
    if (at < 0) return null;
    components.push([unit, digits, fraction]);
    units = units.slice(at + 1);
    chars = rest.slice(1);
  }
  return [components, chars];
}

/** The `xsd:duration` lexical form after `P`, as date and time components. */
function xsdDuration(chars: readonly string[]): readonly [Component[], Component[]] | null {
  const date = readUnits(chars, ["Y", "M", "D"]);
  if (date === null) return null;
  const [dateComponents, rest] = date;
  if (rest.length === 0) return dateComponents.length === 0 ? null : [dateComponents, []];
  const time = readUnits(rest.slice(1), ["H", "M", "S"]);
  return time === null || time[0].length === 0 || time[1].length > 0 ? null : [dateComponents, time[0]];
}

function componentValue(components: readonly Component[], unit: string): number {
  const found = components.find((component) => component[0] === unit);
  return found === undefined ? 0 : digitsValue(found[1]);
}

function classifyDuration(lexeme: string): Classified {
  const chars = Array.from(lexeme);
  if (chars.includes("/")) {
    return splitJava(chars, "/").length > 3 ? malformed(TimerCode.Duration) : outside(TimerCode.Duration);
  }
  if (chars[0] !== "P") return malformed(TimerCode.Duration);
  const rest = chars.slice(1);
  const [weeks, afterWeeks] = spanDigits(rest);
  if (weeks.length > 0 && afterWeeks.length === 1 && afterWeeks[0] === "W") {
    return above(weeks, maxComponent)
      ? outside(TimerCode.Duration)
      : admitted({ tag: ParsedTag.Duration, value: { ...zero, days: 7 * digitsValue(weeks) } });
  }
  const parsed = xsdDuration(rest);
  if (parsed === null) return malformed(TimerCode.Duration);
  const [date, time] = parsed;
  const all = [...date, ...time];
  const fraction = time.find((component) => component[0] === "S")?.[2] ?? [];
  if (all.some(([unit, , digits]) => unit !== "S" && digits.length > 0)) return malformed(TimerCode.Duration);
  if (fraction.length > 3 || all.some(([, digits]) => above(digits, maxComponent))) return outside(TimerCode.Duration);
  return admitted({
    tag: ParsedTag.Duration,
    value: {
      years: componentValue(date, "Y"), months: componentValue(date, "M"), days: componentValue(date, "D"),
      hours: componentValue(time, "H"), minutes: componentValue(time, "M"), seconds: componentValue(time, "S"),
      millis: digitsValue([...fraction, ..."000".slice(fraction.length)]),
    },
  });
}

// Dates

const dateAlphabet = (char: string): boolean => isDigit(char) || "+-:.,TtZzWw".includes(char);

/** `chars` against `template`, where `d` is a digit and `T` either case of the designator. */
function shaped(template: string, chars: readonly string[]): boolean {
  return template.length === chars.length && Array.from(template).every((expected, index) => {
    const char = chars[index] ?? "";
    return expected === "d" ? isDigit(char) : expected === "T" ? char === "T" || char === "t" : expected === char;
  });
}

function fieldDigits(chars: readonly string[], start: number, count: number): number {
  return digitsValue(chars.slice(start, start + count));
}

/** The offset in minutes east of UTC: `undefined` when not `Z` or `±hh:mm`, `null` when out of range. */
function offsetMinutes(zone: readonly string[]): number | null | undefined {
  if (zone.length === 1 && (zone[0] === "Z" || zone[0] === "z")) return 0;
  if (zone.length === 6 && (zone[0] === "+" || zone[0] === "-") && shaped("+dd:dd", ["+", ...zone.slice(1)])) {
    const hours = fieldDigits(zone, 1, 2);
    const minutes = fieldDigits(zone, 4, 2);
    if (hours > 23 || minutes > 59) return null;
    return (zone[0] === "-" ? -1 : 1) * (hours * 60 + minutes);
  }
  return undefined;
}

function classifyDate(lexeme: string): Classified {
  const chars = Array.from(lexeme);
  if (chars.length === 0) return malformed(TimerCode.Date);
  if (chars[0] === "P") return outside(TimerCode.Date);
  if (!chars.every(dateAlphabet)) return malformed(TimerCode.Date);
  if (!shaped("dddd-dd-ddTdd:dd:dd", chars.slice(0, 19))) return outside(TimerCode.Date);
  const rest = chars.slice(19);
  const [fraction, zone] = rest[0] === "." ? spanDigits(rest.slice(1)) : [[], rest];
  const fractionOk = rest[0] !== "." || fraction.length > 0;
  const offset = offsetMinutes(zone);
  if (!fractionOk || offset === undefined) return outside(TimerCode.Date);
  if (offset === null) return malformed(TimerCode.Date);
  const [year, month, day] = [fieldDigits(chars, 0, 4), fieldDigits(chars, 5, 2), fieldDigits(chars, 8, 2)];
  const [hour, minute, second] = [fieldDigits(chars, 11, 2), fieldDigits(chars, 14, 2), fieldDigits(chars, 17, 2)];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || hour > 23 || minute > 59 || second > 59) {
    return malformed(TimerCode.Date);
  }
  if (fraction.length > 3 || year < 1) return outside(TimerCode.Date);
  const millis = digitsValue([...fraction, ..."000".slice(fraction.length)]);
  const instant = daysFromCivil(BigInt(year), BigInt(month), BigInt(day)) * BigInt(msPerDay) +
    BigInt(hour * 3_600_000 + minute * 60_000 + second * 1000 + millis) - BigInt(offset) * 60_000n;
  return instant < 0n || instant > BigInt(maxDeadlineMs)
    ? outside(TimerCode.Date)
    : admitted({ tag: ParsedTag.Date, instantMs: Number(instant) });
}

// Cron (Quartz as CIB parses it by default, CIB-CFG; owner decision 2026-11-08)

type CronField = readonly number[] | "any" | "unspecified" | "outside" | "malformed";

function range(low: number, high: number, keep: (value: number) => boolean): number[] {
  const values: number[] = [];
  for (let value = low; value <= high; value += 1) if (keep(value)) values.push(value);
  return values;
}

function cronItems(low: number, high: number, items: readonly string[][]): CronField {
  const ranges: (readonly [number, number])[] = [];
  for (const item of items) {
    const [first, rest] = spanDigits(item);
    if (first.length === 0) return "outside";
    if (rest.length === 0) {
      ranges.push([digitsValue(first), digitsValue(first)]);
      continue;
    }
    if (rest[0] !== "-") return "outside";
    const [last, after] = spanDigits(rest.slice(1));
    if (last.length === 0 || after.length > 0) return "outside";
    ranges.push([digitsValue(first), digitsValue(last)]);
  }
  if (ranges.some(([first, last]) => first < low || last > high || first > high || last < low)) return "malformed";
  if (ranges.some(([first, last]) => first > last)) return "outside";
  return range(low, high, (value) => ranges.some(([first, last]) => first <= value && value <= last));
}

function cronField(low: number, high: number, text: readonly string[]): CronField {
  const joined = text.join("");
  if (joined === "*") return "any";
  if (joined === "?") return "unspecified";
  const parts = splitJava(text, "/");
  if (parts.length === 1) return cronItems(low, high, joined.split(",").map((item) => Array.from(item)));
  if (parts.length !== 2) return "outside";
  const [start = [], step = []] = parts;
  const [stepDigits, afterStep] = spanDigits(step);
  if (stepDigits.length === 0 || afterStep.length > 0) return "outside";
  const every = digitsValue(stepDigits);
  if (start.join("") === "*") return every === 0 ? "outside" : range(low, high, (value) => (value - low) % every === 0);
  const [fromDigits, afterFrom] = spanDigits(start);
  if (fromDigits.length === 0 || afterFrom.length > 0) return "outside";
  const from = digitsValue(fromDigits);
  if (from < low || from > high) return "malformed";
  return every === 0 ? "outside" : range(low, high, (value) => from <= value && (value - from) % every === 0);
}

const cronAlphabet = (char: string): boolean => /^[0-9A-Za-z]$/.test(char) || "*?/,-# ".includes(char);

/** The Quartz day of week (1 = Sunday) of a day counted from the epoch, a Thursday. */
const weekday = (day: number): number => ((day + 4) % 7) + 1;

function dayMatches(fields: CronFields, day: number): boolean {
  const [, month, dayOfMonth] = civilFromDays(day);
  return fields.months.includes(month) &&
    (fields.daysOfMonth === null || fields.daysOfMonth.includes(dayOfMonth)) &&
    (fields.daysOfWeek === null || fields.daysOfWeek.includes(weekday(day)));
}

/** The first second of a day at or after `fromSecond` the time fields allow. */
function secondOfDay(fields: CronFields, fromSecond: number): number | null {
  for (const hour of fields.hours) {
    for (const minute of fields.minutes) {
      const second = fields.seconds.find((value) => hour * 3600 + minute * 60 + value >= fromSecond);
      if (second !== undefined) return hour * 3600 + minute * 60 + second;
    }
  }
  return null;
}

/** The first matching instant strictly after `afterMs`; the Gregorian calendar repeats every 146,097 days. */
export function cronNext(fields: CronFields, afterMs: number): number | null {
  const start = (Math.floor(afterMs / 1000) + 1) * 1000;
  let fromSecond = Math.floor((start % msPerDay) / 1000);
  let day = Math.floor(start / msPerDay);
  for (let fuel = 146_098; fuel > 0; fuel -= 1, day += 1, fromSecond = 0) {
    const second = dayMatches(fields, day) ? secondOfDay(fields, fromSecond) : null;
    if (second !== null) return day * msPerDay + second * 1000;
  }
  return null;
}

function classifyCron(lexeme: string): Classified {
  const chars = Array.from(lexeme);
  if (!chars.every(cronAlphabet)) return malformed(TimerCode.Cron);
  const parts = lexeme.split(" ").filter((part) => part.length > 0).map((part) => Array.from(part));
  if (parts.length === 7) return outside(TimerCode.Cron);
  if (parts.length !== 6) return malformed(TimerCode.Cron);
  const [s = [], mi = [], h = [], dom = [], mo = [], dow = []] = parts;
  const read = [cronField(0, 59, s), cronField(0, 59, mi), cronField(0, 23, h), cronField(1, 31, dom), cronField(1, 12, mo), cronField(1, 7, dow)];
  if (read.includes("malformed")) return malformed(TimerCode.Cron);
  const full = (low: number, high: number, field: CronField): readonly number[] | null =>
    Array.isArray(field) ? field : field === "any" ? range(low, high, () => true) : null;
  const dayField = (field: CronField): readonly number[] | null | undefined =>
    Array.isArray(field) ? field : field === "any" || field === "unspecified" ? null : undefined;
  const [seconds, minutes, hours, months] = [full(0, 59, read[0]!), full(0, 59, read[1]!), full(0, 23, read[2]!), full(1, 12, read[4]!)];
  const [daysOfMonth, daysOfWeek] = [dayField(read[3]!), dayField(read[5]!)];
  if (seconds === null || minutes === null || hours === null || months === null || daysOfMonth === undefined || daysOfWeek === undefined) {
    return outside(TimerCode.Cron);
  }
  if (daysOfMonth !== null && daysOfWeek !== null) return outside(TimerCode.Cron);
  const fields: CronFields = { seconds, minutes, hours, daysOfMonth, months, daysOfWeek };
  return cronNext(fields, 0) === null ? outside(TimerCode.Cron) : admitted({ tag: ParsedTag.Cron, text: lexeme, fields });
}

// Cycles

function classifyCycle(lexeme: string): Classified {
  const chars = Array.from(lexeme);
  if (chars[0] !== "R") return classifyCron(lexeme);
  const parts = splitJava(chars, "/");
  if (parts.length === 3) return outside(TimerCode.Cycle);
  if (parts.length !== 2) return malformed(TimerCode.Cycle);
  const count = (parts[0] ?? []).slice(1);
  const period = parts[1] ?? [];
  let repetitions: number | null;
  if (count.length === 0) {
    repetitions = null;
  } else if (count.every(isDigit)) {
    if (above(count, maxComponent)) return malformed(TimerCode.Cycle);
    repetitions = digitsValue(count);
  } else {
    // `Integer.parseInt` also takes a sign, which the subset refuses; anything else throws.
    const [sign, ...digits] = count;
    return (sign === "+" || sign === "-") && digits.length > 0 && digits.every(isDigit) && !above(digits, maxComponent)
      ? outside(TimerCode.Cycle)
      : malformed(TimerCode.Cycle);
  }
  if (repetitions === 0) return outside(TimerCode.Cycle);
  if (period[0] !== "P") return malformed(TimerCode.Cycle);
  const classified = classifyDuration(period.join(""));
  switch (classified.tag) {
    case ClassifiedTag.Admitted: {
      if (classified.parsed.tag !== ParsedTag.Duration) return outside(TimerCode.Cycle);
      const value = classified.parsed.value;
      const periodMs = addDuration(0, { ...value, years: 0, months: 0 });
      return value.years !== 0 || value.months !== 0 || periodMs === 0n || periodMs > BigInt(maxDeadlineMs)
        ? outside(TimerCode.Cycle)
        : admitted({ tag: ParsedTag.Cycle, periodMs: Number(periodMs), count: repetitions });
    }
    case ClassifiedTag.Outside:
      return outside(TimerCode.Cycle);
    case ClassifiedTag.Malformed:
      return malformed(TimerCode.Cycle);
  }
  return assertNever(classified);
}

/** The one classification of a Timer lexeme. */
export function classify(kind: TimerKind, lexeme: string): Classified {
  switch (kind) {
    case TimerKind.Duration:
      return classifyDuration(lexeme);
    case TimerKind.Date:
      return classifyDate(lexeme);
    case TimerKind.Cycle:
      return classifyCycle(lexeme);
  }
  return assertNever(kind);
}

// Arming

/** How an armed Timer repeats; the fields of `TimerRecurrence`. `remaining` counts the firings left, `null` unbounded. */
export interface Repeat {
  readonly periodMs: number | null;
  readonly cron: string | null;
  readonly remaining: number | null;
}

export interface Armed {
  readonly deadlineMs: number;
  readonly recurrence: Repeat | null;
}

function bounded(deadlineMs: bigint | number): number | null {
  return BigInt(deadlineMs) <= BigInt(maxDeadlineMs) ? Number(deadlineMs) : null;
}

/** Arm an admitted lexeme at `now`; `null` when the deadline exceeds `maxDeadlineMs`. */
export function armAt(now: number, parsed: Parsed): Armed | null {
  switch (parsed.tag) {
    case ParsedTag.Duration: {
      const deadlineMs = bounded(addDuration(now, parsed.value));
      return deadlineMs === null ? null : { deadlineMs, recurrence: null };
    }
    case ParsedTag.Date: {
      const deadlineMs = bounded(parsed.instantMs);
      return deadlineMs === null ? null : { deadlineMs, recurrence: null };
    }
    case ParsedTag.Cycle: {
      const deadlineMs = bounded(BigInt(now) + BigInt(parsed.periodMs));
      return deadlineMs === null ? null : { deadlineMs, recurrence: { periodMs: parsed.periodMs, cron: null, remaining: parsed.count } };
    }
    case ParsedTag.Cron: {
      const next = cronNext(parsed.fields, now);
      const deadlineMs = next === null ? null : bounded(next);
      return deadlineMs === null ? null : { deadlineMs, recurrence: { periodMs: null, cron: parsed.text, remaining: null } };
    }
  }
  return assertNever(parsed);
}

/** The successor of a repeating Timer that fired at `deadlineMs`; `null` when the cycle ends. */
export function successor(deadlineMs: number, recurrence: Repeat): readonly [number, Repeat] | null {
  const remaining = recurrence.remaining === null ? null : Math.max(recurrence.remaining - 1, 0);
  if (remaining === 0) return null;
  let next: number | null = null;
  if (recurrence.periodMs !== null) {
    next = bounded(BigInt(deadlineMs) + BigInt(recurrence.periodMs));
  } else if (recurrence.cron !== null) {
    const classified = classifyCron(recurrence.cron);
    if (classified.tag === ClassifiedTag.Admitted && classified.parsed.tag === ParsedTag.Cron) {
      const found = cronNext(classified.parsed.fields, deadlineMs);
      next = found === null ? null : bounded(found);
    }
  }
  return next === null ? null : [next, { ...recurrence, remaining }];
}

// Host offers

export enum ResolvedTag { Duration = "duration", Date = "date", Cycle = "cycle", Cron = "cron" }

/**
 * A Timer schedule resolved to what a host arms: one duration, an absolute instant, a cycle's period and its
 * repetitions (`null` unbounded), or a Cron expression. A duration, a cycle and a Cron expression count from their
 * deployment's deploy time, an instant does not (population contract, M8-INT-A).
 */
export type Resolved =
  | { readonly tag: ResolvedTag.Duration; readonly ms: number }
  | { readonly tag: ResolvedTag.Date; readonly instantMs: number }
  | { readonly tag: ResolvedTag.Cycle; readonly periodMs: number; readonly repetitions: number | null }
  | { readonly tag: ResolvedTag.Cron; readonly text: string };

/**
 * The resolution `host.ts#definitionCapabilities` offers for a Timer start: an exact literal duration (no years or
 * months), a literal date, an undated ISO cycle or a literal Cron expression; every other form yields its dynamic-only
 * code, and admission refuses each at a root start first.
 */
export function resolve(schedule: TimerSchedule): { readonly ok: true; readonly value: Resolved } | { readonly ok: false; readonly code: string } {
  switch (schedule.tag) {
    case TimerScheduleTag.Duration: {
      const literal = valueSourceLiteral(schedule.value);
      const classified = literal === null ? null : classify(TimerKind.Duration, literal);
      if (classified?.tag === ClassifiedTag.Admitted && classified.parsed.tag === ParsedTag.Duration &&
        classified.parsed.value.years === 0 && classified.parsed.value.months === 0) {
        const ms = bounded(addDuration(0, classified.parsed.value));
        if (ms !== null) return { ok: true, value: { tag: ResolvedTag.Duration, ms } };
      }
      return { ok: false, code: dynamicCode(TimerCode.Duration) };
    }
    case TimerScheduleTag.Date: {
      const literal = valueSourceLiteral(schedule.value);
      const classified = literal === null ? null : classify(TimerKind.Date, literal);
      if (classified?.tag === ClassifiedTag.Admitted && classified.parsed.tag === ParsedTag.Date) {
        return { ok: true, value: { tag: ResolvedTag.Date, instantMs: classified.parsed.instantMs } };
      }
      return { ok: false, code: dynamicCode(TimerCode.Date) };
    }
    case TimerScheduleTag.Cycle: {
      const literal = valueSourceLiteral(schedule.value);
      const classified = literal === null ? null : classify(TimerKind.Cycle, literal);
      if (classified?.tag === ClassifiedTag.Admitted && classified.parsed.tag === ParsedTag.Cycle) {
        return { ok: true, value: { tag: ResolvedTag.Cycle, periodMs: classified.parsed.periodMs, repetitions: classified.parsed.count } };
      }
      if (classified?.tag === ClassifiedTag.Admitted && classified.parsed.tag === ParsedTag.Cron) {
        return { ok: true, value: { tag: ResolvedTag.Cron, text: classified.parsed.text } };
      }
      const cron = classified !== null && classified.tag !== ClassifiedTag.Admitted && classified.code === TimerCode.Cron;
      return { ok: false, code: dynamicCode(cron ? TimerCode.Cron : TimerCode.Cycle) };
    }
  }
  return assertNever(schedule);
}

/**
 * Whether a Cron match strictly after `afterMs`, or a successor of one, is `dueMs`; each match is a whole second after
 * the one before, so `fuel` of `(dueMs - afterMs) / 1000 + 2` reaches every match up to `dueMs`.
 */
function cronOccurs(fields: CronFields, dueMs: number, fuel: number, afterMs: number): boolean {
  let after = afterMs;
  for (let left = fuel; left > 0; left -= 1) {
    const next = cronNext(fields, after);
    if (next === null || next > dueMs) return false;
    if (next === dueMs) return true;
    after = next;
  }
  return false;
}

/**
 * Whether `dueMs` is an occurrence of a root Timer start resolved as `resolved` whose schedule counts from `originMs`,
 * its deployment's deploy time (M8-INT-A): a duration `originMs + d`; a date its own instant, also before the origin;
 * the `k`-th period after the origin for `1 ≤ k ≤ n`, every `k ≥ 1` when unbounded (CIB-INT-0008); a Cron match strictly
 * after the origin or after the match before it, as `successor` repeats it.
 */
export function occurs(originMs: number, dueMs: number, resolved: Resolved): boolean {
  switch (resolved.tag) {
    case ResolvedTag.Duration:
      return dueMs === originMs + resolved.ms;
    case ResolvedTag.Date:
      return dueMs === resolved.instantMs;
    case ResolvedTag.Cycle: {
      const elapsed = dueMs - originMs;
      return resolved.periodMs > 0 && elapsed > 0 && elapsed % resolved.periodMs === 0 &&
        (resolved.repetitions === null || Math.floor(elapsed / resolved.periodMs) <= resolved.repetitions);
    }
    case ResolvedTag.Cron: {
      const classified = classifyCron(resolved.text);
      if (classified.tag !== ClassifiedTag.Admitted || classified.parsed.tag !== ParsedTag.Cron) return false;
      return dueMs > originMs && cronOccurs(classified.parsed.fields, dueMs, Math.floor((dueMs - originMs) / 1000) + 2, originMs);
    }
  }
  return assertNever(resolved);
}
