/**
 * A write to an item the process declares lands at the instance root under the standards reading
 * (`UndeclaredWrite.refused`, BPMN 2.0.2 §10.4.1: a target is a declared item), before any value is bound to it; a
 * name the process does not declare is still refused. The writer is a User Task's output Data Association, fed by
 * the completion's submitted Data Output.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { State } from "@bpmn-lean/kernel";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;
const scenario = JSON.parse(readFileSync(
  new URL("../../../scenarios/exclusive-gateway-simple-boolean/scenario.json", import.meta.url), "utf8")) as Json & { stimuli: unknown[] };

const header = (id: string, sourceType: string): Json => ({ id, origin: { definition: null, sourceId: id }, sourceType, parent: null });

/** `Start → Task → End`; completing the User Task `Task` writes its Data Output `Output_Decision` to `target`. */
function program(target: string, declared: readonly string[]): Json {
  return {
    ...slice,
    variables: declared,
    elements: [
      { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: ["To_Task"] } } },
      {
        activity: {
          header: header("Task", "userTask"),
          payload: {
            work: {
              user: {
                payload: {
                  name: "Decide", assignee: null, candidateUsers: [], candidateGroups: [], formKey: null, formFields: [], dueDate: null,
                  followUpDate: null, priority: null,
                },
              },
            },
            envelope: {
              incoming: ["To_Task"], outgoing: ["To_End"], inputs: [], boundaries: [], multiInstance: null, compensationHandler: null,
              outputs: [{ target, source: { variable: { name: "Output_Decision" } }, dialect: "dataAssociation" }],
              defaultFlow: null, asyncBefore: false, asyncAfter: false,
            },
          },
        },
      },
      { event: { header: header("End", "endEvent"), payload: { role: { throw: { record: "none" } }, placement: "finish", incoming: ["To_End"], outgoing: [] } } },
    ],
    flows: [
      { id: "To_Task", source: "Start", target: "Task", condition: null },
      { id: "To_End", source: "Task", target: "End", condition: null },
    ],
  };
}

const completion = {
  kind: "completeUserTaskInstance",
  commandId: "complete-decide",
  taskId: { processInstanceId: "SimpleBooleanInstance_1", elementId: "Task", activation: 1 },
  submittedValues: [{ name: "Output_Decision", value: { kind: "string", value: "recorded" } }],
};

/** The root's variables after the start and the completion, or the completion's failure. */
function complete(json: Json): unknown {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  let state: State | null = null;
  for (const raw of [scenario.stimuli[0], completion]) {
    const stimulus = stimulusFromJson(raw);
    assert.ok(stimulus.ok && stimulus.value[1] !== null);
    const outcome = step(hooks, decoded.value, state, stimulus.value[1]);
    if (!outcome.ok) return outcome.failure;
    state = outcome.value;
  }
  return state?.variables;
}

test("a write to a declared process item lands at the instance root", () => {
  assert.deepEqual(complete(program("Property_Outcome", ["Property_Outcome"])),
    [{ scope: 0, entries: [["Property_Outcome", { tag: "string", value: "recorded" }]] }]);
});

test("a write to an undeclared name is refused under the standards reading", () => {
  assert.deepEqual(complete(program("Property_Outcome", ["Property_Other"])), { tag: "semanticFailure", code: "undeclared-write" });
});
