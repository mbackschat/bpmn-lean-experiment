/**
 * Repeated technical failures of one effect occurrence under `TechnicalFailure.incident` (CIB-EXT-0013): each failure
 * opens a new incident generation on the same occurrence, a retry reopens the effect with its failure count, and a
 * command naming an earlier generation is stale. The oracle is the retained CIB answer of
 * `automation-incident-composition/fulfilment-repeated-incident`, where the second failure after a retry opens
 * generation 2 and the effect republishes with `failures` 1 and then 2.
 *
 * `Start → T → End`, `T` a Service Task.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, State } from "@bpmn-lean/kernel";

import { activity, base, serviceWork, task, withOptions, wired } from "./admission-refusal-support.ts";

const program = (() => {
  const decoded = decodeProgram(wired(withOptions(task(activity("T", serviceWork()))(base()), {
    technicalFailure: "incident", incidentProcessCancellation: true,
  })));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value;
})();

const occurrence = { processInstanceId: "I", elementId: "T", activation: 1 };
const fail = { kind: "effectResult", occurrence, outcome: { kind: "technicalFailure" } };
const retry = (generation: number) => ({ kind: "command", occurrence, action: { kind: "retryIncident", generation } });

function apply(state: State | null, raw: Record<string, unknown>): Outcome {
  const stimulus = stimulusFromJson({ commandId: "c", ...raw });
  assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
  return step(hooks, program, state, stimulus.value[1]);
}

function run(...stimuli: Record<string, unknown>[]): State {
  let state: State | null = null;
  for (const raw of stimuli) {
    const outcome = apply(state, raw);
    assert.ok(outcome.ok, JSON.stringify(outcome));
    state = outcome.value;
  }
  return state!;
}

/** The open item of `T`: an incident's generation and failure count, or an effect's failure count. */
function itemOfT(state: State): Readonly<{ incident: number | null; failures: number | null }> {
  const [item] = state.openItems.filter((entry) => entry.element === "T");
  assert.ok(item !== undefined, "T has no open item");
  const { tag, detail } = item.kind as unknown as { tag: string; detail: Record<string, unknown> };
  const effect = (tag === "incident" ? detail["effect"] : detail) as { failures: number };
  return { incident: tag === "incident" ? detail["generation"] as number : null, failures: effect.failures };
}

const start = { kind: "start", instanceId: "I", variables: [] };

test("a failure after a retry opens the next incident generation on the same occurrence", () => {
  assert.deepEqual(itemOfT(run(start, fail)), { incident: 1, failures: 1 });
  assert.deepEqual(itemOfT(run(start, fail, retry(1))), { incident: null, failures: 1 });
  assert.deepEqual(itemOfT(run(start, fail, retry(1), fail)), { incident: 2, failures: 2 });
  assert.deepEqual(itemOfT(run(start, fail, retry(1), fail, retry(2))), { incident: null, failures: 2 });
});

test("a retry naming an earlier incident generation is stale", () => {
  const outcome = apply(run(start, fail, retry(1), fail), retry(1));
  assert.deepEqual(outcome, { ok: false, failure: { tag: "rejected", code: "incident-generation-stale" } });
});
