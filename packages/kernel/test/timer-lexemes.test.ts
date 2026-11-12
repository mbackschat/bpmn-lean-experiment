/**
 * Timer lexemes and their deadlines (PC-TIMER-01, I2): a lexeme is admitted, outside the subset (refused statically
 * under every profile) or malformed for CIB's parser (refused under `malformedTimer = refused`). An admitted one arms
 * at its calendar deadline over UTC from logical time 0 = `1970-01-01T00:00:00Z`. The expected deadlines are the
 * retained CIB answers (`timer-duration-forms/*`, `timer-date-forms/*`) where one exists; the calendar cases pin the
 * order of field addition and the ISO week, where CIB's `PnW` differs (DEV candidate).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;

const header = (id: string, sourceType: string): Json => ({ id, origin: { definition: null, sourceId: id }, sourceType, parent: null });
const literal = (value: string): Json => ({ literal: { value } });

const catchEvent = (id: string, schedule: Json, incoming: string, outgoing: string): Json => ({
  event: {
    header: header(id, "intermediateCatchEvent"),
    payload: {
      role: { catch: { subscription: { trigger: { timer: { payload: { schedule } } }, outputs: [], alternatives: [], parallelMultiple: false } } },
      placement: "intermediate", incoming: [incoming], outgoing: [outgoing], alternativeThrows: [],
    },
  },
});

/** `Start → [Delay →] Wait → End`; `Delay` waits `delay` first, so `Wait` arms at a later logical time. */
function programJson(schedule: Json, delay: string | null): Json {
  const elements: Json[] = [
    { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: ["f0"] } } },
    catchEvent("Wait", schedule, delay === null ? "f0" : "f1", "f2"),
    { event: { header: header("End", "endEvent"), payload: { role: { throw: { record: "none" } }, placement: "finish", incoming: ["f2"], outgoing: [], alternativeThrows: [] } } },
  ];
  const flows: Json[] = [
    { id: "f0", source: "Start", target: delay === null ? "Wait" : "Delay", condition: null },
    { id: "f2", source: "Wait", target: "End", condition: null },
  ];
  if (delay !== null) {
    elements.push(catchEvent("Delay", { duration: { value: literal(delay) } }, "f0", "f1"));
    flows.push({ id: "f1", source: "Delay", target: "Wait", condition: null });
  }
  return { ...slice, variables: [], processes: [], elements, flows };
}

function decoded(schedule: Json, delay: string | null = null): Program {
  const result = decodeProgram(programJson(schedule, delay));
  assert.ok(result.ok, result.ok ? "" : result.refusal);
  return result.value;
}

function run(program: Program, state: State | null, stimulus: Json): Outcome {
  const input = stimulusFromJson(stimulus);
  assert.ok(input.ok);
  return step(program, state, input.value[1]);
}

/** The deadline of the open Timer of `element`. */
function deadline(state: State, element: string): number | null {
  const item = state.openItems.find((open) => open.element === element);
  const kind = item?.kind as { tag: string; detail: { deadlineMs: number } } | undefined;
  return kind?.tag === "timer" ? kind.detail.deadlineMs : null;
}

/** Arm `Wait` (after `Delay` fired at its deadline) and return the state. */
function armed(program: Program, delay: string | null): State {
  const started = run(program, null, { kind: "start", commandId: "start", instanceId: "I", variables: [] });
  assert.ok(started.ok, started.ok ? "" : started.failure.code);
  if (delay === null) return started.value;
  const at = deadline(started.value, "Delay");
  assert.notEqual(at, null);
  const fired = run(program, started.value, {
    kind: "timerFire", commandId: "delay", logicalTimeMs: at, occurrence: { processInstanceId: "I", elementId: "Delay", activation: 1 },
  });
  assert.ok(fired.ok, fired.ok ? "" : fired.failure.code);
  return fired.value;
}

const durations: ReadonlyArray<readonly [string, string | null, number]> = [
  ["PT30M", null, 1_800_000],
  ["PT0.5S", null, 500],
  ["PT0S", null, 0],
  ["P1D", null, 86_400_000],
  ["P1W", null, 604_800_000],
  ["P1M", null, 2_678_400_000],
  ["P1DT12H", null, 129_600_000],
  ["PT87661H", null, 315_579_600_000],
  ["P1Y", null, 31_536_000_000],
  // From 1970-02-01: February has 28 days.
  ["P1M", "PT744H", 5_097_600_000],
  // From 1970-01-30: months first (to 02-28, clamped), then the day: 1970-03-01.
  ["P1M1D", "PT696H", 5_097_600_000],
  // The ISO week is seven days, also across February (CIB's `newDuration(long)` gives 32 days here).
  ["P5W", "PT744H", 5_702_400_000],
];

for (const [lexeme, delay, expected] of durations) {
  test(`timeDuration ${lexeme}${delay === null ? "" : ` armed after ${delay}`} is due at ${expected}`, () => {
    const program = decoded({ duration: { value: literal(lexeme) } }, delay);
    assert.equal(admit(program), null);
    assert.equal(deadline(armed(program, delay), "Wait"), expected);
  });
}

const dates: ReadonlyArray<readonly [string, number]> = [
  ["1970-01-01T01:00:00Z", 3_600_000],
  ["1970-01-01T01:00:00.500Z", 3_600_500],
  ["1970-01-01T01:00:00+00:00", 3_600_000],
  ["1970-01-01t01:00:00z", 3_600_000],
  ["1970-01-01T03:00:00+02:00", 3_600_000],
  ["2100-01-01T00:00:00Z", 4_102_444_800_000],
];

for (const [lexeme, expected] of dates) {
  test(`timeDate ${lexeme} is due at ${expected}`, () => {
    const program = decoded({ date: { value: literal(lexeme) } });
    assert.equal(admit(program), null);
    assert.equal(deadline(armed(program, null), "Wait"), expected);
  });
}

test("a past date keeps its own instant and fires with a later `at`", () => {
  const program = decoded({ date: { value: literal("1970-01-01T01:00:00Z") } }, "PT2H");
  const state = armed(program, "PT2H");
  assert.equal(deadline(state, "Wait"), 3_600_000);
  const occurrence = { processInstanceId: "I", elementId: "Wait", activation: 1 };
  const backward = run(program, state, { kind: "timerFire", commandId: "late", logicalTimeMs: 3_600_000, occurrence });
  assert.deepEqual(backward.ok ? null : backward.failure, { tag: "rejected", code: "logical-time-backward" });
  const fired = run(program, state, { kind: "timerFire", commandId: "late", logicalTimeMs: 3_600_000, at: 7_200_000, occurrence });
  assert.ok(fired.ok, fired.ok ? "" : fired.failure.code);
});

const refused: ReadonlyArray<readonly [Json, string]> = [
  // Outside the subset: CIB commits them.
  [{ duration: { value: literal("PT1.2345S") } }, "timer.duration"],
  [{ duration: { value: literal("1970-01-01T00:00:00Z/PT5S") } }, "timer.duration"],
  [{ duration: { value: literal("PT9999999999S") } }, "timer.duration"],
  [{ date: { value: literal("1970-01-01T01:00:00") } }, "timer.date"],
  [{ date: { value: literal("1969-12-31T23:00:00Z") } }, "timer.date"],
  [{ date: { value: literal("P1D") } }, "timer.date"],
  [{ date: { value: literal("1970-01-01T00:00:00.1234Z") } }, "timer.date"],
  // Malformed for CIB's parser, refused under `malformedTimer = refused`.
  [{ duration: { value: literal("-PT5S") } }, "timer.duration"],
  [{ duration: { value: literal("PT5") } }, "timer.duration"],
  [{ duration: { value: literal("pt5s") } }, "timer.duration"],
  [{ date: { value: literal("1970-13-45T25:61:61Z") } }, "timer.date"],
];

for (const [schedule, code] of refused) {
  test(`${JSON.stringify(schedule)} is refused as ${code}`, () => {
    assert.equal(admit(decoded(schedule)), code);
  });
}

/**
 * Malformed versus outside, separated under `malformedTimer = rollsBackArming`, which admits a malformed literal (its
 * arming rolls back) and refuses an outside one. Malformed is claimed only where CIB's parser certainly fails: the
 * pinned `DurationHelper` (more than three parts; a non-`P` lexeme; a `P…/P…` interval, whose second part Joda's date
 * parser cannot read), the JDK's `DurationImpl` grammar, and Cron rules only in the field retained evidence certifies.
 */
const cibAdmits = (schedule: Json): string | null => {
  const json = programJson(schedule, null);
  const result = decodeProgram({ ...json, options: { ...(json.options as Json), malformedTimer: "rollsBackArming" } });
  assert.ok(result.ok, result.ok ? "" : result.refusal);
  return admit(result.value);
};
const duration = (lexeme: string): Json => ({ duration: { value: literal(lexeme) } });
const cycle = (lexeme: string): Json => ({ cycle: { value: literal(lexeme), dialect: "cron" } });

const certainlyMalformed: readonly Json[] = [
  duration("PT1H/PT2H"), duration("P1D/P2D/x"), duration("PT.S"), duration("PT.5M"), duration("P.5D"), duration("PT1.M"),
  cycle("5x * * * * ?"), cycle("x/5 * * * * ?"), cycle("*/5x * * * * ?"), cycle("5- * * * * ?"), cycle("5/0 * * * * ?"),
  cycle("*/0 * * * * ?"), cycle("*/5/2 * * * * ?"), cycle("? 0 9 * * *"),
];
for (const schedule of certainlyMalformed) {
  test(`${JSON.stringify(schedule)} is malformed: admitted to roll back at arming under rollsBackArming`, () => {
    assert.equal(cibAdmits(schedule), null);
  });
}

const uncertain: ReadonlyArray<readonly [Json, string]> = [
  [duration("PT1.S"), "timer.duration"], [duration("PT.5S"), "timer.duration"], [duration("PT1H.25S"), "timer.duration"],
  [duration("1970-01-01T00:00:00Z/PT5S"), "timer.duration"],
  [cycle("0 5x * * * ?"), "timer.cron"], [cycle("0 0 5- * * ?"), "timer.cron"], [cycle("0 0 9 */5/2 * ?"), "timer.cron"],
  [cycle("0 ? 9 * * ?"), "timer.cron"], [cycle("0 */0 * * * ?"), "timer.cron"],
];
for (const [schedule, code] of uncertain) {
  test(`${JSON.stringify(schedule)} is outside: refused as ${code} under rollsBackArming`, () => {
    assert.equal(cibAdmits(schedule), code);
  });
}
