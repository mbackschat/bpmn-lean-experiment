/**
 * A User Task as a Multi-Instance body under `SubmissionRule.installsVariables` (CIB-EXT-0005, PC-HUM-01/PC-HUM-02):
 * CIB's `TaskService.complete` sets each submitted value through the instance's task execution
 * (`AbstractVariableScope#setVariable`), so a loop without an output data item admits the submission and every name
 * reaches its nearest owner or the root; a loop that declares an output data item keeps the standards reading, which
 * holds the submitted item as the instance's local. The oracle is the retained CIB answer of
 * `human-task-metadata-composition/body-metadata`, where two bodies completed out of order leave the later submission
 * at the root.
 *
 * A submitted name equal to a loop counter would rewrite CIB's loop state, which the kernel computes rather than holds:
 * sequentially the task runs in the body's execution, whose `loopCounter` and `nrOfInstances` the next instance reads
 * (`SequentialMultiInstanceActivityBehavior.java:48-59`); in parallel the body's `nrOfActiveInstances` and
 * `nrOfCompletedInstances` decide its end (`ParallelMultiInstanceActivityBehavior.java:84-87,123`). Such a submission is
 * `unsupported` (`multiInstance.resultShadowsInstance`), as a result named like a counter is. The input data item is the
 * instance's own local, so a submission of that name stays with the instance and changes nothing the loop reads.
 *
 * `S → T → E`, `T` a User Task looping over the two items of `items`, under CIB's counters.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { State } from "@bpmn-lean/kernel";

import { activity, base, loop, task, userWork, withOptions, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const installs = { submission: "installsVariables", undeclaredWrite: "atInstanceRoot", multiInstanceCounters: "cibLocals" };

function program(options: Json, outputDataItem: string | null, mode = "parallel") {
  const decoded = decodeProgram(withOptions(wired(task(activity("T", userWork(), {
    multiInstance: loop({ outputDataItem, mode }),
  }))(base())), options));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value;
}

const stimulus = (raw: Record<string, unknown>) => {
  const decoded = stimulusFromJson({ commandId: "c", ...raw });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value[1];
};

const complete = (activation: number, name: string, value: string) => stimulus({
  kind: "command", occurrence: { processInstanceId: "I", elementId: "T", activation },
  action: { kind: "completeUserTask", values: [{ name, value: { kind: "string", value } }] },
});

/** The root variables and the open activations of `T` (or the status once ended) after each completion in turn. */
function run(outputDataItem: string | null, completions: ReadonlyArray<readonly [number, string, string]>, mode = "parallel"): unknown[] {
  const decoded = program(installs, outputDataItem, mode);
  const started = step(hooks, decoded, null, stimulus({
    kind: "start", instanceId: "I", variables: [{ name: "items", value: { kind: "stringList", value: ["a", "b"] } }],
  }));
  assert.ok(started.ok, JSON.stringify(started));
  const seen = (state: State): unknown => ({
    root: Object.fromEntries((state.variables.find((entry) => entry.scope === 0)?.entries ?? [])
      .filter(([name]) => name !== "items").map(([name, value]) => [name, (value as { value: unknown }).value])),
    open: state.status === "running"
      ? state.openItems.map((item) => state.occurrences.find((entry) => entry.id === item.occurrence)?.activation)
      : state.status,
  });
  const trace: unknown[] = [];
  let state = started.value;
  for (const [activation, name, value] of completions) {
    const outcome = step(hooks, decoded, state, complete(activation, name, value));
    if (outcome.ok) state = outcome.value;
    trace.push(outcome.ok ? seen(outcome.value) : outcome.failure);
  }
  return trace;
}

test("a User Task body without an output data item is admitted only when the submission installs variables", () => {
  // The counters option is left at its default here: `cibLocals` is admitted only beside JUEL loop expressions.
  assert.equal(admit(program({ submission: "installsVariables", undeclaredWrite: "atInstanceRoot" }, null)), null);
  assert.equal(admit(program({}, null)), "multiInstance.outputDataItem");
});

test("each body's submission reaches the root, the later completion winning", () => {
  assert.deepEqual(run(null, [[2, "grade", "A"], [1, "grade", "B"]]), [
    { root: { grade: "A" }, open: [1] },
    { root: { grade: "B" }, open: "completed" },
  ]);
});

test("a declared output data item keeps the standards reading under the installing submission", () => {
  assert.deepEqual(run("result", [[1, "result", "r1"], [2, "other", "x"]]), [
    { root: {}, open: [2] },
    { tag: "rejected", code: "undeclared-output" },
  ]);
});

test("a sequential body's submission reaches the root as each instance completes in turn", () => {
  assert.deepEqual(run(null, [[1, "grade", "A"], [2, "grade", "B"]], "sequential"), [
    { root: { grade: "A" }, open: [2] },
    { root: { grade: "B" }, open: "completed" },
  ]);
});

test("a submission naming a loop counter is unsupported in both modes", () => {
  const shadows = { tag: "unsupported", code: "multiInstance.resultShadowsInstance" };
  assert.deepEqual(run(null, [[1, "nrOfCompletedInstances", "9"]]), [shadows]);
  assert.deepEqual(run(null, [[1, "loopCounter", "9"]], "sequential"), [shadows]);
});

test("a submission naming the input data item stays with the instance", () => {
  assert.deepEqual(run(null, [[1, "item", "x"], [2, "grade", "B"]]), [
    { root: {}, open: [2] },
    { root: { grade: "B" }, open: "completed" },
  ]);
});
