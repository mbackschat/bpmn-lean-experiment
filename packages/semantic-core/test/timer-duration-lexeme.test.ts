import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ExactTimerDurationRefusal,
  maxExactTimerDurationMs,
  parseExactTimerDuration,
} from "@bpmn-lean/semantic-core";

// The shared lexeme list of TED-PARSE-01; the Lean check in SemanticProcessAdmissionConformance
// evaluates the same lexemes, so a disagreement between the two parsers fails one of the two lanes.
const admitted: ReadonlyArray<readonly [string, number]> = [
  ["PT1S", 1_000],
  ["PT5S", 5_000],
  ["PT01S", 1_000],
  ["PT0H1S", 1_000],
  ["PT30S", 30_000],
  ["PT15M", 900_000],
  ["PT2H", 7_200_000],
  ["PT1H30M", 5_400_000],
  ["PT90M", 5_400_000],
  ["PT36H", 129_600_000],
  ["PT87660H", 315_576_000_000],
];

const refused: ReadonlyArray<readonly [string, ExactTimerDurationRefusal]> = [
  ["PT0S", ExactTimerDurationRefusal.Zero],
  ["PT0H0M0S", ExactTimerDurationRefusal.Zero],
  ["PT1.5S", ExactTimerDurationRefusal.Fractional],
  ["PT1,5S", ExactTimerDurationRefusal.Fractional],
  ["P1D", ExactTimerDurationRefusal.Nominal],
  ["P0DT1S", ExactTimerDurationRefusal.Nominal],
  ["P1W", ExactTimerDurationRefusal.Nominal],
  ["P1M", ExactTimerDurationRefusal.Nominal],
  ["P1Y", ExactTimerDurationRefusal.Nominal],
  ["PT", ExactTimerDurationRefusal.Malformed],
  ["P", ExactTimerDurationRefusal.Malformed],
  ["PTH", ExactTimerDurationRefusal.Malformed],
  ["PT-1S", ExactTimerDurationRefusal.Malformed],
  ["PT+1S", ExactTimerDurationRefusal.Malformed],
  ["PT1S1M", ExactTimerDurationRefusal.Malformed],
  ["PT1H1H", ExactTimerDurationRefusal.Malformed],
  ["pt1s", ExactTimerDurationRefusal.Malformed],
  [" PT1S", ExactTimerDurationRefusal.Malformed],
  ["PT1S ", ExactTimerDurationRefusal.Malformed],
  ["PT87661H", ExactTimerDurationRefusal.AboveMaximum],
  ["PT9007199254740993S", ExactTimerDurationRefusal.AboveMaximum],
  ["PT99999999999999999999H", ExactTimerDurationRefusal.AboveMaximum],
  ["2026-01-01T00:00:00Z", ExactTimerDurationRefusal.Date],
  ["2026-01-01T00:00:00Z/PT1H", ExactTimerDurationRefusal.Interval],
  ["PT1H/2026-01-01T00:00:00Z", ExactTimerDurationRefusal.Interval],
  ["R/PT1S", ExactTimerDurationRefusal.Repetition],
  ["R3/PT1S", ExactTimerDurationRefusal.Repetition],
];

test("every admitted exact duration has its one millisecond value within the maximum", () => {
  for (const [lexeme, ms] of admitted) {
    assert.deepEqual(parseExactTimerDuration(lexeme), { admitted: true, durationMs: ms }, lexeme);
    assert.ok(ms >= 1 && ms <= maxExactTimerDurationMs, lexeme);
  }
});

test("every other lexeme is refused with its class", () => {
  for (const [lexeme, refusal] of refused) {
    assert.deepEqual(parseExactTimerDuration(lexeme), { admitted: false, refusal }, lexeme);
  }
});

// The deliberate non-law of TED-PARSE-01: two lexemes may share one value.
test("the lexeme mapping is not injective", () => {
  assert.deepEqual(parseExactTimerDuration("PT90M"), parseExactTimerDuration("PT1H30M"));
});
