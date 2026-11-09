/**
 * An input whose closure fails after it crossed an asynchronous continuation is `unsupported`, not rolled back
 * (CIB-EXT-0027 in docs/CIB-BPMN-RELATION-REGISTER.md): CIB commits the part before the boundary and fails only the job
 * after it. The failure is an Exclusive Gateway with no true condition and no default, which rolls a synchronous closure
 * back (CIB-INT-0003); the controls show the marks alone change nothing and a failure before the boundary still rolls back.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeProgram, hooks, runScenario, step, stimulusFromJson } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;
const scenario = JSON.parse(readFileSync(
  new URL("../../../scenarios/exclusive-gateway-simple-boolean/scenario.json", import.meta.url), "utf8")) as Json & { stimuli: unknown[] };

const header = (id: string, sourceType: string): Json => ({ id, origin: { definition: null, sourceId: id }, sourceType, parent: null });

/** `Start → first → second → End`, where `Task` is an abstract Task and `Choice` an Exclusive Gateway whose one
 * candidate's condition is false. */
function program(order: readonly ["Task" | "Choice", "Task" | "Choice"], marks: Readonly<{ before: boolean; after: boolean }>): Json {
  const flowInto = (element: string): string => `To_${element}`;
  const [first, second] = order;
  const outOf = (element: string): string => (element === first ? flowInto(second) : flowInto("End"));
  const task = {
    activity: {
      header: header("Task", "task"),
      payload: {
        work: "none",
        envelope: {
          incoming: [flowInto("Task")], outgoing: [outOf("Task")], inputs: [], outputs: [], boundaries: [], multiInstance: null,
          compensationHandler: null, defaultFlow: null, asyncBefore: marks.before, asyncAfter: marks.after,
        },
      },
    },
  };
  const choice = {
    gateway: {
      header: header("Choice", "exclusiveGateway"),
      payload: { kind: { exclusive: { candidates: [outOf("Choice")], default: null } }, incoming: [flowInto("Choice")], outgoing: [outOf("Choice")] },
    },
  };
  const condition = (source: string): unknown => (source === "Choice" ? { simpleBoolean: { body: { literal: { value: false } } } } : null);
  return {
    ...slice,
    elements: [
      { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: [flowInto(first)] } } },
      task,
      choice,
      { event: { header: header("End", "endEvent"), payload: { role: { throw: { record: "none" } }, placement: "finish", incoming: [flowInto("End")], outgoing: [] } } },
    ],
    flows: [
      { id: flowInto(first), source: "Start", target: first, condition: null },
      { id: flowInto(second), source: first, target: second, condition: condition(first) },
      { id: flowInto("End"), source: second, target: "End", condition: condition(second) },
    ],
  };
}

function startFailure(json: Json): unknown {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const stimulus = stimulusFromJson(scenario.stimuli[0]);
  assert.ok(stimulus.ok && stimulus.value[1] !== null);
  const outcome = step(hooks, decoded.value, null, stimulus.value[1]);
  return outcome.ok ? "committed" : outcome.failure;
}

const startOnly = { ...scenario, stimuli: [scenario.stimuli[0]] };
const commandOutcome = (json: Json): unknown =>
  (runScenario(json, startOnly) as { trace: ReadonlyArray<Json> }).trace.find((entry) => entry["kind"] === "command")?.["outcome"];

test("a closure that fails after an asyncBefore Activity began is unsupported", () => {
  const marked = program(["Task", "Choice"], { before: true, after: false });
  assert.deepEqual(startFailure(marked), { tag: "unsupported", code: "async-boundary-failure" });
  assert.equal(commandOutcome(marked), "unsupported");
});

test("a closure that fails after an asyncAfter Activity completed is unsupported", () => {
  assert.deepEqual(startFailure(program(["Task", "Choice"], { before: false, after: true })),
    { tag: "unsupported", code: "async-boundary-failure" });
});

test("without a mark, or failing before the boundary, the closure still rolls back", () => {
  const rolledBack = { tag: "rolledBack", code: "exclusive-gateway-no-outgoing-flow" };
  assert.deepEqual(startFailure(program(["Task", "Choice"], { before: false, after: false })), rolledBack);
  assert.deepEqual(startFailure(program(["Choice", "Task"], { before: true, after: true })), rolledBack);
  assert.equal(commandOutcome(program(["Choice", "Task"], { before: true, after: true })), "rolledBack");
});
