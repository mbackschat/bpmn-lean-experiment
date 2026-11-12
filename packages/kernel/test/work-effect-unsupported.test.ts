/**
 * An effect result the host reports as `unsupported` ends the input as the semantic outcome `unsupported` with the
 * host's code, for a Service Task as for any effect, and under the incident profile too: it is a value or behavior the
 * portable domain cannot represent, never a technical failure that could open an incident.
 *
 * `Start → T → End`, `T` a Service Task.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import { activity, base, serviceWork, task, withOptions, wired } from "./admission-refusal-support.ts";

function serviceProgram(options: Record<string, unknown>): Program {
  const decoded = decodeProgram(wired(withOptions(task(activity("T", serviceWork()))(base()), options)));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value;
}

function apply(program: Program, state: State | null, raw: Record<string, unknown>): Outcome {
  const stimulus = stimulusFromJson({ commandId: "c", ...raw });
  assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
  return step(hooks, program, state, stimulus.value[1]);
}

const start = { kind: "start", instanceId: "I", variables: [] };
const unsupported = {
  kind: "effectResult",
  occurrence: { processInstanceId: "I", elementId: "T", activation: 1 },
  outcome: { kind: "unsupported", code: "result-outside-domain" },
};

for (const [label, options] of [["host failures", {}], ["incidents", { technicalFailure: "incident" }]] as const) {
  test(`an unsupported effect result ends the input as unsupported with the host's code under ${label}`, () => {
    const program = serviceProgram(options);
    const started = apply(program, null, start);
    assert.ok(started.ok, JSON.stringify(started));
    assert.deepEqual(apply(program, started.value, unsupported),
      { ok: false, failure: { tag: "unsupported", code: "result-outside-domain" } });
  });
}

test("an unsupported effect result names its code", () => {
  const decoded = stimulusFromJson({ commandId: "c", ...unsupported, outcome: { kind: "unsupported" } });
  assert.equal(decoded.ok, false);
});
