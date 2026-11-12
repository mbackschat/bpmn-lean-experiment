/**
 * The closure bound bounds a closure's cost, not only its length. A micro-step scans the state's lists, and a closure
 * can grow them at every micro-step, so a bound on micro-steps alone let a growing closure run for minutes before it
 * answered `closure-bound` (measured 2026-11-10: 77 s for the self-feeding split below, more than 120 s for its Sub-Process
 * variant). `Step.closureWorkBound` caps the state entries a closure's micro-steps run over together, and the idle
 * scope search computes the busy scope occurrences once per micro-step. Elapsed time is the oracle for the unbounded
 * closures, measured around the synchronous run because a `node:test` timeout cannot interrupt one: with both in place
 * each answers in well under a second, without them in 56 s and 84 s (measured 2026-11-10).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { runScenario } from "./lean-paired.ts";

import {
  activity, base, envelope, flow, gateway, juel, mapping, scope, start, userWork, withOptions,
} from "./admission-refusal-support.ts";

type Json = Record<string, any>;

const begin = (outgoing: string): Json => {
  const element = start("Start");
  (element.start as Json).payload.outgoing = [outgoing];
  return element;
};

const startOutcome = (program: Json): Json => {
  const result = runScenario(program, { stimuli: [{ kind: "start", commandId: "s", instanceId: "I", variables: [] }] }) as Json;
  return result.trace.find((entry: Json) => entry.kind === "command");
};

const refused = { kind: "command", commandId: "s", outcome: "unsupported", code: "closure-bound" };

/** The start's outcome and how long the synchronous run took, in milliseconds. */
const timed = (program: Json): readonly [Json, number] => {
  const began = performance.now();
  const outcome = startOutcome(program);
  return [outcome, performance.now() - began];
};

const promptly = 10_000;

/** `Loop` (manual) leaves through `Back` to itself and through `To_Wait` to `wait`, so every pass leaves one more wait. */
function selfFeeding(wait: Json[], waitFlowTarget: string): Json {
  return {
    ...base(),
    elements: [
      begin("To_Loop"),
      activity("Loop", "manual", envelope({ incoming: ["To_Loop", "Back"], outgoing: ["Back", "To_Wait"] })),
      ...wait,
    ],
    flows: [flow("To_Loop", "Start", "Loop"), flow("Back", "Loop", "Loop"), flow("To_Wait", "Loop", waitFlowTarget)],
  };
}

test("a closure that leaves a waiting User Task at every pass answers closure-bound promptly", () => {
  const [outcome, elapsed] = timed(selfFeeding([activity("Wait", userWork(), { incoming: ["To_Wait"], outgoing: [] })], "Wait"));
  assert.deepEqual(outcome, refused);
  assert.ok(elapsed < promptly, `answered after ${Math.round(elapsed)} ms`);
});

test("a closure that leaves a waiting Sub-Process at every pass answers closure-bound promptly", () => {
  const inner = start("SubStart", null, [], "Sub");
  (inner.start as Json).payload.outgoing = ["To_SubWait"];
  const program = selfFeeding([
    scope("Sub", "embedded", { children: ["SubStart", "SubWait"] }, { incoming: ["To_Wait"], outgoing: [] }),
    inner,
    activity("SubWait", userWork(), { incoming: ["To_SubWait"], outgoing: [] }, "Sub"),
  ], "Sub");
  const [outcome, elapsed] = timed({ ...program, flows: [...program.flows, flow("To_SubWait", "SubStart", "SubWait")] });
  assert.deepEqual(outcome, refused);
  assert.ok(elapsed < promptly, `answered after ${Math.round(elapsed)} ms`);
});

const n = { identifier: { name: "n" } };

/**
 * The retained `automatic-loop` cycle (`LoopStart → Count → More`, `Count` raising `n` by one, `More` looping while
 * `n < limit`), whose loop flow passes the manual `Again`, which also opens the User Task `Pending` (a plain Task reading its own scope, CIB-EXT-0031): a finite closure
 * of about five micro-steps a pass whose state grows by two entries a pass, so its work grows with the square of
 * `limit` while its length stays far inside `closureBound`.
 */
function growingLoop(): Json {
  return withOptions({
    ...base(),
    elements: [
      begin("Flow_Started"),
      gateway("LoopStart", { exclusive: { candidates: ["Flow_LoopStarted"], default: null } },
        { incoming: ["Flow_Started", "Flow_Again"], outgoing: ["Flow_LoopStarted"] }),
      activity("Count", "none", envelope({ incoming: ["Flow_LoopStarted"], outgoing: ["Flow_Counted"],
        outputs: [mapping("n", juel(n, { integer: { digits: "1" } }, { binary: { payload: { op: "add", left: 0, right: 1 } } }))] })),
      gateway("More", { exclusive: { candidates: ["Flow_More"], default: "Flow_Done" } },
        { incoming: ["Flow_Counted"], outgoing: ["Flow_More", "Flow_Done"] }),
      activity("Again", "manual", envelope({ incoming: ["Flow_More"], outgoing: ["Flow_Again", "Flow_Pend"] })),
      activity("Pending", userWork(), { incoming: ["Flow_Pend"], outgoing: [] }),
      activity("Report", userWork(), { incoming: ["Flow_Done"], outgoing: [] }),
    ],
    flows: [
      flow("Flow_Started", "Start", "LoopStart"), flow("Flow_LoopStarted", "LoopStart", "Count"),
      flow("Flow_Counted", "Count", "More"),
      flow("Flow_More", "More", "Again", juel(n, { identifier: { name: "limit" } }, { binary: { payload: { op: "lt", left: 0, right: 1 } } })),
      flow("Flow_Done", "More", "Report"), flow("Flow_Again", "Again", "LoopStart"), flow("Flow_Pend", "Again", "Pending"),
    ],
  }, { evaluator: "juel", outputContext: "activityScope" });
}

const loopOutcome = (limit: number): Json => {
  const integer = (value: number): Json => ({ kind: "integer", value });
  const result = runScenario(growingLoop(), { stimuli: [{ kind: "start", commandId: "s", instanceId: "I",
    variables: [{ name: "limit", value: integer(limit) }, { name: "n", value: integer(0) }] }] }) as Json;
  return result.trace.find((entry: Json) => entry.kind === "command");
};

test("a finite closure inside closureBound micro-steps but beyond closureWorkBound is refused", () => {
  assert.deepEqual(loopOutcome(3000), refused, "about 15000 micro-steps over about 4.5e7 state entries");
});

test("the same closure that opens 500 waits commits", () => {
  const outcome = loopOutcome(500);
  assert.equal(outcome.outcome, "committed", JSON.stringify(outcome));
});
