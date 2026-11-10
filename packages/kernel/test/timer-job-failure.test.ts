/**
 * A Timer firing whose closure cannot go on reads `ContinuationFailure`: rolled back with the state before it under
 * `rolledBack`, the Timer still open at its deadline (CIB lowers the job's retries, which is outside the claim,
 * PC-TIMER-03), and `unsupported` as `timer-job-failure` under `incident`, which no row models for a timer job. The
 * witness reaches the failure through an Activity that takes none of its conditioned outgoing flows (CIB-INT-0012).
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
  event: { header: header(id, "endEvent"), payload: { role: { throw: { record: "none" } }, placement: "finish", incoming: [incoming], outgoing: [], alternativeThrows: [] } },
});

/** `Start → Timer → Check`, a work-less Task whose two outgoing flows both carry a condition that never holds. */
const decode = (continuationFailure: string) => decodeProgram({
  ...slice,
  options: { ...(slice.options as Json), continuationFailure },
  elements: [
    { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: ["To_Timer"] } } },
    {
      event: {
        header: header("Timer", "intermediateCatchEvent"),
        payload: {
          role: { catch: { subscription: { trigger: { timer: { payload: { schedule: { duration: { value: { literal: { value: "PT2S" } } } } } } }, outputs: [], alternatives: [], parallelMultiple: false } } },
          placement: "intermediate", incoming: ["To_Timer"], outgoing: ["To_Check"], alternativeThrows: [],
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

function programFor(continuationFailure: string) {
  const decoded = decode(continuationFailure);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value;
}

function run(program: ReturnType<typeof programFor>, state: State | null, stimulus: Json): Outcome {
  const input = stimulusFromJson(stimulus);
  assert.ok(input.ok);
  return step(hooks, program, state, input.value[1]);
}

function fireFailing(continuationFailure: string): { started: State; fired: Outcome } {
  const program = programFor(continuationFailure);
  const started = run(program, null, { kind: "start", commandId: "start", instanceId: "Instance_1", variables: [] });
  assert.ok(started.ok, started.ok ? "" : started.failure.code);
  const fired = run(program, started.value, {
    kind: "timerFire", commandId: "fire", logicalTimeMs: 2000,
    occurrence: { processInstanceId: "Instance_1", elementId: "Timer", activation: 1 },
  });
  return { started: started.value, fired };
}

test("a Timer firing whose closure cannot go on rolls back under ContinuationFailure.rolledBack", () => {
  const { fired } = fireFailing("rolledBack");
  assert.equal(fired.ok ? null : fired.failure.tag, "rolledBack");
});

test("a Timer firing whose closure cannot go on is unsupported under ContinuationFailure.incident", () => {
  const { fired } = fireFailing("incident");
  assert.deepEqual(fired.ok ? null : fired.failure, { tag: "unsupported", code: "timer-job-failure" });
});
