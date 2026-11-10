/**
 * Under the scope-chain submission rule a mapped User Task's completion may name the task's own locals, its frame
 * first (UTL-TASK-01; docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#user-task-completion-data). The task's inputs make
 * it a CIB scope whose execution holds them (`BpmnParse.java:4797-4814`), and `TaskService.complete` sets each value
 * through that execution (`AbstractVariableScope#setVariable`), so a name only the task declares is written there and
 * ends with the task. The oracle is the retained CIB answer of
 * `scope-data-visibility/scope-chain-task-locals`, which commits.
 *
 * `S → T → E`, `T` a User Task with the input `own := "from-input"`, under the CIB submission options and the
 * scope-chain rule.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, State } from "@bpmn-lean/kernel";

import { activity, base, literalValue, mapping, task, userWork, withOptions, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const str = (value: string): Json => ({ kind: "string", value });

const program = wired(withOptions(task(activity("T", userWork(), { inputs: [mapping("own", literalValue(str("from-input")))], outputs: [] }))(base()), {
  submission: "installsVariables", undeclaredWrite: "atInstanceRoot", scopeChainSubmissionBytes: 16384,
}));

const completion = (...values: [string, Json][]): Json => ({
  kind: "command",
  occurrence: { processInstanceId: "I", elementId: "T", activation: 1 },
  action: { kind: "completeUserTask", values: values.map(([name, value]) => ({ name, value })) },
});

/** Start the instance, run `stimulus` and return its outcome. */
function after(stimulus: Json): Outcome {
  const decoded = decodeProgram(program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  let state: State | null = null;
  let outcome: Outcome | null = null;
  for (const raw of [{ kind: "start", instanceId: "I", variables: [] }, stimulus]) {
    const parsed = stimulusFromJson({ commandId: "c", ...raw });
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.refusal);
    outcome = step(hooks, decoded.value, state, parsed.value[1]);
    if (!outcome.ok) return outcome;
    state = outcome.value;
  }
  return outcome!;
}

const root = (outcome: Outcome): unknown => outcome.ok
  ? Object.fromEntries((outcome.value.variables.find((entry) => entry.scope === 0)?.entries ?? []).map(([name, value]) => [name, value]))
  : outcome.failure;

test("a completion naming the task's own local commits, and the local ends with the task", () => {
  assert.deepEqual(root(after(completion(["own", str("task-written")]))), {});
});

test("a completion naming a variable no scope on the chain declares is still rejected", () => {
  assert.deepEqual(root(after(completion(["other", str("x")]))), { tag: "rejected", code: "submission-undeclared-name" });
});
