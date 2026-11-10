/**
 * A Timer firing whose closure cannot go on is `unsupported` as `timer-job-failure`, never a rollback: CIB fires a timer
 * in a job, whose failure is a retry and then an incident, and no track models a failed timer job yet
 * (EXPRESSION-SEMANTICS-SPEC, failure outcomes per stimulus). The witness reaches the failure through an Activity that
 * takes none of its conditioned outgoing flows (CIB-INT-0012), so the same closure run from a command rolls back.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, State } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;

const header = (id: string, sourceType: string): Json => ({ id, origin: { definition: null, sourceId: id }, sourceType, parent: null });
const never: Json = { simpleBoolean: { body: { literal: { value: false } } } };
const end = (id: string, incoming: string): Json => ({
  event: { header: header(id, "endEvent"), payload: { role: { throw: { record: "none" } }, placement: "finish", incoming: [incoming], outgoing: [] } },
});

/** `Start → Timer → Check`, a work-less Task whose two outgoing flows both carry a condition that never holds. */
const decoded = decodeProgram({
  ...slice,
  elements: [
    { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: ["To_Timer"] } } },
    {
      event: {
        header: header("Timer", "intermediateCatchEvent"),
        payload: {
          role: { catch: { subscription: { trigger: { timer: { payload: { schedule: { duration: { value: { literal: { value: "PT2S" } } } } } } }, outputs: [] } } },
          placement: "intermediate", incoming: ["To_Timer"], outgoing: ["To_Check"],
        },
      },
    },
    {
      activity: {
        header: header("Check", "task"),
        payload: {
          work: "none",
          envelope: {
            incoming: ["To_Check"], outgoing: ["To_A", "To_B"], inputs: [], outputs: [], boundaries: [], multiInstance: null,
            compensationHandler: null, defaultFlow: null, asyncBefore: false, asyncAfter: false,
          },
        },
      },
    },
    end("End_A", "To_A"),
    end("End_B", "To_B"),
  ],
  flows: [
    { id: "To_Timer", source: "Start", target: "Timer", condition: null },
    { id: "To_Check", source: "Timer", target: "Check", condition: null },
    { id: "To_A", source: "Check", target: "End_A", condition: never },
    { id: "To_B", source: "Check", target: "End_B", condition: never },
  ],
});
assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
const program = decoded.value;

function run(state: State | null, stimulus: Json): Outcome {
  const input = stimulusFromJson(stimulus);
  assert.ok(input.ok);
  return step(hooks, program, state, input.value[1]);
}

test("a Timer firing whose closure cannot go on is unsupported, not rolled back", () => {
  const started = run(null, { kind: "start", commandId: "start", instanceId: "Instance_1", variables: [] });
  assert.ok(started.ok, started.ok ? "" : started.failure.code);
  const fired = run(started.value, {
    kind: "timerFire", commandId: "fire", logicalTimeMs: 2000,
    occurrence: { processInstanceId: "Instance_1", elementId: "Timer", activation: 1 },
  });
  assert.deepEqual(fired.ok ? null : fired.failure, { tag: "unsupported", code: "timer-job-failure" });
});
