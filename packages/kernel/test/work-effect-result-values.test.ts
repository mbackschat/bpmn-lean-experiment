/**
 * An effect result value no output mapping reads, under `ResultValues.activityLocals` (CIB-EXT-0015). CIB's delegate
 * writes every result value as a local of its execution (`CibSevenScriptedEffect#writeLocal`); a task with
 * `camunda:inputOutput` is a scope (`BpmnParse.java:4797-4814`), so that local ends with the task, while on a task
 * without one it lands on the flow execution, which the kernel's OutputSet reading rejects instead. The oracle is the
 * retained CIB answer of `send-task-configured-send/send-result-with-output`, whose mapped Send Task commits a result
 * carrying an undeclared value and writes nothing.
 *
 * `Start → T → End`, `T` a Service Task.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, State } from "@bpmn-lean/kernel";

import { activity, base, mapping, serviceWork, task, variable, withOptions, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

function resultWithReceipt(envelope: Json, effectResultValues: string): Outcome {
  const decoded = decodeProgram(wired(withOptions(task(activity("T", serviceWork(), envelope))(base()), {
    effectResultValues, undeclaredWrite: "atInstanceRoot",
  })));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  let state: State | null = null;
  const stimuli = [
    { kind: "start", instanceId: "I", variables: [{ name: "order", value: { kind: "string", value: "A-17" } }] },
    {
      kind: "effectResult", occurrence: { processInstanceId: "I", elementId: "T", activation: 1 },
      outcome: { kind: "success", outputs: [{ name: "receipt", value: { kind: "string", value: "r-1" } }] },
    },
  ];
  let outcome: Outcome | null = null;
  for (const raw of stimuli) {
    const stimulus = stimulusFromJson({ commandId: "c", ...raw });
    assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
    outcome = step(decoded.value, state, stimulus.value[1]);
    if (!outcome.ok) return outcome;
    state = outcome.value;
  }
  return outcome!;
}

const rootNames = (outcome: Outcome): unknown =>
  outcome.ok ? outcome.value.variables.find((entry) => entry.scope === 0)?.entries.map(([name]) => name) : outcome;

const mapped = { inputs: [mapping("correlationId", variable("order"))] };

test("a mapped task's result value no output reads ends with the task under activity locals", () => {
  assert.deepEqual(rootNames(resultWithReceipt(mapped, "activityLocals")), ["order"]);
});

test("the OutputSet reading still rejects it, and so does a task without mappings, which CIB makes no scope", () => {
  const undeclared = { ok: false, failure: { tag: "rejected", code: "undeclared-output" } };
  assert.deepEqual(resultWithReceipt(mapped, "outputSet"), undeclared);
  assert.deepEqual(resultWithReceipt({}, "activityLocals"), undeclared);
});
