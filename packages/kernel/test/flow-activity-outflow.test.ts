/**
 * PC-CF-07: an Activity's conditioned and default outgoing flows. Its completion takes every outgoing flow whose
 * condition holds or that has none, the default only when no other flow is taken, and rolls the command back when it
 * has outgoing flows but takes none (BPMN 2.0.2 §13.3.1 and Figure 13.1: a mixed parallel and inclusive split, whose
 * no-match exception is Table 13.3's; CIB `BpmnActivityBehavior#performOutgoingBehavior`, CIB-INT-0012). Under
 * `ConditionOrder.afterOutputs` the conditions read what the completion wrote, under `beforeOutputs` they do not
 * (CIB-INT-0011).
 *
 * The runtime cases run the step directly, so they hold whatever admission decides; the admission cases say which
 * shapes reach it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { admit, decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { State } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;

const header = (id: string, sourceType: string): Json => ({ id, origin: { definition: null, sourceId: id }, sourceType, parent: null });
const literal = (value: boolean): Json => ({ simpleBoolean: { body: { literal: { value } } } });
const routeIs = (value: string): Json => ({ simpleBoolean: { body: { stringEquals: { name: "route", value } } } });

const envelope = (incoming: string[], outgoing: string[], defaultFlow: string | null = null): Json => ({
  incoming, outgoing, inputs: [], outputs: [], boundaries: [], multiInstance: null, compensationHandler: null, defaultFlow,
  asyncBefore: false, asyncAfter: false,
});

const userTask = (id: string, incoming: string[], outgoing: string[], defaultFlow: string | null = null): Json => ({
  activity: {
    header: header(id, "userTask"),
    payload: {
      work: {
        user: {
          payload: {
            name: null, assignee: null, candidateUsers: [], candidateGroups: [], formKey: null, formFields: [["route", "string"]],
            dueDate: null, followUpDate: null, priority: null,
          },
        },
      },
      envelope: envelope(incoming, outgoing, defaultFlow),
    },
  },
});

type Shape = Readonly<{
  /** The condition of each of `Review`'s three outgoing flows, to `A`, `B` and `D`; `null` leaves a flow unconditioned. */
  conditions: readonly [Json | null, Json | null, Json | null];
  /** `To_D` is `Review`'s default flow. */
  defaultD?: boolean;
  conditionOrder?: "afterOutputs" | "beforeOutputs";
}>;

/** `Start → Review`, whose flows `To_A`, `To_B` and `To_D` lead to the User Tasks `A`, `B` and `D`, each to its End. */
function program(shape: Shape): Json {
  const branches = ["A", "B", "D"] as const;
  return {
    ...slice,
    // The completion installs `route` at the instance root (CIB-EXT-0005), so that a condition can read it.
    options: {
      ...(slice["options"] as Json), submission: "installsVariables", undeclaredWrite: "atInstanceRoot",
      conditionOrder: shape.conditionOrder ?? "afterOutputs",
    },
    elements: [
      { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: ["To_Review"] } } },
      userTask("Review", ["To_Review"], branches.map((branch) => `To_${branch}`), shape.defaultD === true ? "To_D" : null),
      ...branches.flatMap((branch) => [
        userTask(branch, [`To_${branch}`], [`End_${branch}_In`]),
        {
          event: {
            header: header(`End_${branch}`, "endEvent"),
            payload: { role: { throw: { record: "none" } }, placement: "finish", incoming: [`End_${branch}_In`], outgoing: [] },
          },
        },
      ]),
    ],
    flows: [
      { id: "To_Review", source: "Start", target: "Review", condition: null },
      ...branches.flatMap((branch, index) => [
        { id: `To_${branch}`, source: "Review", target: branch, condition: shape.conditions[index] },
        { id: `End_${branch}_In`, source: branch, target: `End_${branch}`, condition: null },
      ]),
    ],
  };
}

const stimuli: readonly unknown[] = [
  { kind: "start", commandId: "start", instanceId: "I", variables: [] },
  {
    kind: "command", commandId: "review", occurrence: { processInstanceId: "I", elementId: "Review", activation: 1 },
    action: { kind: "completeUserTask", values: [{ name: "route", value: { kind: "string", value: "fast" } }] },
  },
];

/** The User Tasks open after `Review` completes, or the completion's failure. */
function afterReview(json: Json): readonly string[] | unknown {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  let state: State | null = null;
  for (const raw of stimuli) {
    const stimulus = stimulusFromJson(raw);
    assert.ok(stimulus.ok);
    const outcome = step(hooks, decoded.value, state, stimulus.value[1]);
    if (!outcome.ok) return outcome.failure;
    state = outcome.value;
  }
  return state!.openItems.map((item) => item.element).sort();
}

test("an Activity takes every outgoing flow whose condition holds", () => {
  assert.deepEqual(afterReview(program({ conditions: [literal(true), literal(true), literal(false)] })), ["A", "B"]);
  assert.deepEqual(afterReview(program({ conditions: [literal(false), literal(true), literal(false)] })), ["B"]);
});

test("an unconditioned flow of an Activity is always taken beside its conditioned ones", () => {
  assert.deepEqual(afterReview(program({ conditions: [literal(false), literal(false), null] })), ["D"]);
  assert.deepEqual(afterReview(program({ conditions: [literal(true), null, null] })), ["A", "B", "D"]);
});

test("an Activity's default flow is taken exactly when no other flow is", () => {
  assert.deepEqual(afterReview(program({ conditions: [literal(false), literal(false), null], defaultD: true })), ["D"]);
  assert.deepEqual(afterReview(program({ conditions: [literal(true), literal(false), null], defaultD: true })), ["A"]);
  assert.deepEqual(afterReview(program({ conditions: [literal(false), null, null], defaultD: true })), ["B"]);
});

test("an Activity that takes none of its outgoing flows rolls its command back", () => {
  assert.deepEqual(afterReview(program({ conditions: [literal(false), literal(false), literal(false)] })),
    { tag: "rolledBack", code: "activity-no-outgoing-flow" });
});

test("the condition order decides whether an outgoing condition reads the completion's own write", () => {
  const reading = { conditions: [routeIs("fast"), literal(false), null] } as const;
  assert.deepEqual(afterReview(program(reading)), ["A", "D"]);
  assert.deepEqual(afterReview(program({ ...reading, conditionOrder: "beforeOutputs" })), ["D"]);
});

test("admission reads conditions on an Activity's outgoing flows but not on its default flow", () => {
  assert.equal(admit(decoded(program({ conditions: [literal(true), literal(false), null] }))), null);
  const conditionedDefault = program({ conditions: [literal(true), literal(false), literal(true)], defaultD: true });
  assert.equal(admit(decoded(conditionedDefault)), "flow.conditionalOutflow");
});

function decoded(json: Json) {
  const result = decodeProgram(json);
  assert.ok(result.ok, result.ok ? "" : result.refusal);
  return result.value;
}
