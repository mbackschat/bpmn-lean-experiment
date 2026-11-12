/**
 * A User Task completion under `SubmissionRule.installsVariables` (CIB-EXT-0005): CIB's `TaskService.complete` sets
 * every submitted value through the task's own execution before the task leaves (`AbstractVariableScope#setVariable`:
 * the nearest scope holding the name, else the process instance), so a name the task holds as a local input stays local
 * and ends with the task, any other name reaches its nearest owner or the root, and the outgoing conditions, which CIB
 * evaluates before the output parameters (CIB-INT-0011), read the installed values but not the outputs. The output
 * mappings still read the submitted values only; what CIB reads beyond them is PC-DATA-06's.
 *
 * `Start → Review`, whose flows `To_A` and `To_D` lead to the User Tasks `A` and `D`; the oracle is the root variables
 * and the open tasks after one completion of `Review`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { State } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;

const header = (id: string, sourceType: string): Json => ({ id, origin: { definition: null, sourceId: id }, sourceType, parent: null });
const equals = (name: string, value: string): Json => ({ simpleBoolean: { body: { stringEquals: { name, value } } } });
const text = (value: string): Json => ({ literal: { value: { kind: "string", value } } });
const read = (name: string): Json => ({ variable: { name } });
const mapping = (target: string, source: Json): Json => ({ target, source, dialect: "ioParameter" });

type Shape = Readonly<{ inputs?: Json[]; outputs?: Json[]; toA?: Json | null }>;

const userTask = (id: string, incoming: string[], outgoing: string[], over: Shape = {}): Json => ({
  activity: {
    header: header(id, "userTask"),
    payload: {
      work: {
        user: {
          payload: {
            name: null, assignee: null, candidateUsers: [], candidateGroups: [], formKey: null, formFields: [], dueDate: null,
            followUpDate: null, priority: null,
          },
        },
      },
      envelope: {
        incoming, outgoing, inputs: over.inputs ?? [], outputs: over.outputs ?? [], boundaries: [], multiInstance: null,
        compensationHandlers: [], forCompensation: false, defaultFlow: null, asyncBefore: false, asyncAfter: false,
      },
    },
  },
});

function program(shape: Shape): Json {
  const branches = ["A", "D"] as const;
  return {
    ...slice,
    options: {
      ...(slice["options"] as Json), submission: "installsVariables", undeclaredWrite: "atInstanceRoot", conditionOrder: "beforeOutputs",
    },
    elements: [
      { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: ["To_Review"] } } },
      userTask("Review", ["To_Review"], ["To_A", "To_D"], shape),
      ...branches.flatMap((branch) => [
        userTask(branch, [`To_${branch}`], [`End_${branch}_In`]),
        {
          event: {
            header: header(`End_${branch}`, "endEvent"),
            payload: { role: { throw: { record: "none" } }, placement: "finish", incoming: [`End_${branch}_In`], outgoing: [], alternativeThrows: [] },
          },
        },
      ]),
    ],
    flows: [
      { id: "To_Review", source: "Start", target: "Review", condition: null },
      { id: "To_A", source: "Review", target: "A", condition: shape.toA ?? null },
      { id: "To_D", source: "Review", target: "D", condition: null },
      ...branches.map((branch) => ({ id: `End_${branch}_In`, source: branch, target: `End_${branch}`, condition: null })),
    ],
  };
}

type After = Readonly<{ root: Record<string, unknown>; open: readonly string[] }>;

/** Start, complete `Review` with `values`, and return the root variables and the open tasks, or the failure. */
function afterReview(json: Json, values: Record<string, string> | ReadonlyArray<readonly [string, string]>): After | unknown {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const stimuli = [
    { kind: "start", commandId: "start", instanceId: "I", variables: [] },
    {
      kind: "command", commandId: "review", occurrence: { processInstanceId: "I", elementId: "Review", activation: 1 },
      action: {
        kind: "completeUserTask",
        values: (Array.isArray(values) ? values : Object.entries(values)).map(([name, value]) => ({ name, value: { kind: "string", value } })),
      },
    },
  ];
  let state: State | null = null;
  for (const raw of stimuli) {
    const stimulus = stimulusFromJson(raw);
    assert.ok(stimulus.ok);
    const outcome = step(decoded.value, state, stimulus.value[1]);
    if (!outcome.ok) return outcome.failure;
    state = outcome.value;
  }
  const rootEntries = state!.variables.find((entry) => entry.scope === 0)?.entries ?? [];
  return {
    root: Object.fromEntries(rootEntries.map(([name, value]) => [name, (value as { value: unknown }).value])),
    open: state!.openItems.map((item) => item.element).sort(),
  };
}

const local = [mapping("verdict", text("pending"))];

test("a mapped task's completion installs every submitted value and maps its outputs from the submission", () => {
  assert.deepEqual(afterReview(program({ inputs: local, outputs: [mapping("decision", read("verdict"))] }), { bogus: "x", verdict: "approve" }),
    { root: { bogus: "x", decision: "approve" }, open: ["A", "D"] });
});

test("a submitted name the task holds as a local input ends with the task", () => {
  assert.deepEqual(afterReview(program({ inputs: local }), { verdict: "approve", note: "n" }),
    { root: { note: "n" }, open: ["A", "D"] });
});

test("an outgoing condition reads an installed value but not an output under the CIB condition order", () => {
  assert.deepEqual(afterReview(program({ toA: equals("verdict", "fast") }), { verdict: "fast" }),
    { root: { verdict: "fast" }, open: ["A", "D"] });
  assert.deepEqual(afterReview(program({ outputs: [mapping("route", read("verdict"))], toA: equals("route", "fast") }), { verdict: "fast" }),
    { root: { route: "fast", verdict: "fast" }, open: ["D"] });
});

test("a completion submitting one name twice is rejected, since a submission sets each name once", () => {
  assert.deepEqual(afterReview(program({}), [["verdict", "approve"], ["verdict", "reject"]]),
    { tag: "rejected", code: "duplicate-output" });
});
