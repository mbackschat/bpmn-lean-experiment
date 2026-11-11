/**
 * Logical time is an explicit input: a stimulus's optional `at` advances the clock before the input's transition, so a
 * Timer armed by that input counts from it; an `at` before the clock is rejected, and an absent one leaves the clock
 * unchanged. The model holds a User Task before a two-second Timer, the case where a Timer would otherwise be armed in
 * the past after a long human wait.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, State } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;

const header = (id: string, sourceType: string): Json => ({ id, origin: { definition: null, sourceId: id }, sourceType, parent: null });
const envelope = (incoming: string, outgoing: string): Json => ({
  incoming: [incoming], outgoing: [outgoing], inputs: [], outputs: [], boundaries: [], multiInstance: null, compensationHandlers: [], forCompensation: false,
  defaultFlow: null, asyncBefore: false, asyncAfter: false,
});

const decoded = decodeProgram({
  ...slice,
  elements: [
    { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: ["To_Task"] } } },
    {
      activity: {
        header: header("Task", "userTask"),
        payload: {
          work: {
            user: {
              payload: {
                name: "Wait", assignee: null, candidateUsers: [], candidateGroups: [], formKey: null, formFields: [], dueDate: null,
                followUpDate: null, priority: null,
              },
            },
          },
          envelope: envelope("To_Task", "To_Timer"),
        },
      },
    },
    {
      event: {
        header: header("Timer", "intermediateCatchEvent"),
        payload: {
          role: { catch: { subscription: { trigger: { timer: { payload: { schedule: { duration: { value: { literal: { value: "PT2S" } } } } } } }, outputs: [], alternatives: [], parallelMultiple: false } } },
          placement: "intermediate", incoming: ["To_Timer"], outgoing: ["To_End"], alternativeThrows: [],
        },
      },
    },
    { event: { header: header("End", "endEvent"), payload: { role: { throw: { record: "none" } }, placement: "finish", incoming: ["To_End"], outgoing: [], alternativeThrows: [] } } },
  ],
  flows: [
    { id: "To_Task", source: "Start", target: "Task", condition: null },
    { id: "To_Timer", source: "Task", target: "Timer", condition: null },
    { id: "To_End", source: "Timer", target: "End", condition: null },
  ],
});
assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
const program = decoded.value;

const start = (at?: number): Json => ({
  kind: "start", commandId: "start", instanceId: "Instance_1", variables: [], ...(at === undefined ? {} : { at }),
});
const complete = (at?: number): Json => ({
  kind: "command", commandId: "complete", action: { kind: "completeUserTask", values: [] }, ...(at === undefined ? {} : { at }),
  occurrence: { processInstanceId: "Instance_1", elementId: "Task", activation: 1 },
});

function run(state: State | null, stimulus: Json): Outcome {
  const input = stimulusFromJson(stimulus);
  assert.ok(input.ok);
  return step(hooks, program, state, input.value[1]);
}

function committed(outcome: Outcome): State {
  assert.ok(outcome.ok, outcome.ok ? "" : outcome.failure.code);
  return outcome.value;
}

const deadlines = (state: State): unknown[] =>
  state.openItems.flatMap((item) => (item.kind.tag === "timer" ? [item.kind.detail.deadlineMs] : []));

test("a Timer armed by an input counts from the input's logical time", () => {
  const started = committed(run(null, start(1_000)));
  assert.equal(started.logicalTimeMs, 1_000);
  const waited = committed(run(started, complete(61_000)));
  assert.equal(waited.logicalTimeMs, 61_000);
  assert.deepEqual(deadlines(waited), [63_000]);
});

test("an absent time leaves the clock unchanged", () => {
  const started = committed(run(null, start()));
  assert.equal(started.logicalTimeMs, 0);
  assert.deepEqual(deadlines(committed(run(committed(run(null, start(1_000))), complete()))), [3_000]);
});

test("a time before the clock is rejected", () => {
  const outcome = run(committed(run(null, start(1_000))), complete(500));
  assert.deepEqual(outcome.ok ? null : outcome.failure, { tag: "rejected", code: "logical-time-backward" });
});

const fire = (logicalTimeMs: number, at?: number): Json => ({
  kind: "timerFire", commandId: "fire", logicalTimeMs, ...(at === undefined ? {} : { at }),
  occurrence: { processInstanceId: "Instance_1", elementId: "Timer", activation: 1 },
});

// A host applies a firing when it wakes, at or after the deadline the firing names; the Timer is due, so the late
// firing commits at the host's time rather than being refused as `timer-not-due`.
test("a Timer firing applied after its deadline commits at the later time", () => {
  const waited = committed(run(committed(run(null, start(1_000))), complete(1_000)));
  const fired = committed(run(waited, fire(3_000, 3_005)));
  assert.equal(fired.logicalTimeMs, 3_005);
  assert.equal(fired.status, "completed");
});

test("a Timer firing applied before its deadline is not due", () => {
  const waited = committed(run(committed(run(null, start(1_000))), complete(1_000)));
  const outcome = run(waited, fire(3_000, 2_999));
  assert.deepEqual(outcome.ok ? null : outcome.failure, { tag: "rejected", code: "timer-not-due" });
});
