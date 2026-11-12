/**
 * Under `SubmissionRule.installsVariables` and `UndeclaredWrite.atInstanceRoot` (CIB-EXT-0005) a Multi-Instance User
 * Task instance's submission is set through the instance's task execution, as for any task: CIB reads no `outputDataItem` (CIB-LIM-0001, `BpmnParse.java:1841-1873`), so `TaskService.complete` sets the submitted
 * name where `AbstractVariableScope#setVariable` finds it, here the root. The kernel still fills the instance's slot from
 * it (BPMN 2.0.2 §13.3.7). The oracle is the instance root's variables after the first completion, which the retained
 * `multi-instance-completion-failures/user-*-final` CIB results show.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { runScenario } from "./lean-paired.ts";

type Json = Record<string, unknown>;

const slice = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;
const header = (id: string, sourceType: string): Json => ({ id, origin: { definition: null, sourceId: id }, sourceType, parent: null });

function program(submission: string, mode: string): Json {
  return {
    ...slice,
    options: { ...(slice["options"] as Json), submission, undeclaredWrite: "atInstanceRoot", evaluator: "juel", multiInstanceBinding: "loopReferences",
      multiInstanceCounters: "cibLocals", multiInstanceInputFailure: "rollback", multiInstanceCount: "javaInt" },
    elements: [
      { start: { header: header("Start", "startEvent"), payload: { subscription: null, outgoing: ["To_T"] } } },
      { activity: { header: header("T", "userTask"), payload: {
        work: { user: { payload: { name: null, assignee: null, candidateUsers: [], candidateGroups: [], formKey: null,
          formFields: [], dueDate: null, followUpDate: null, priority: null } } },
        envelope: { incoming: ["To_T"], outgoing: ["To_End"], inputs: [], outputs: [], boundaries: [], multiInstance: {
          mode, count: { collection: { items: { variable: { name: "items" } } } }, elementVariable: null,
          completionCondition: null, inputDataItem: "DataInput_Item", outputDataItem: "DataOutput_Result",
          outputCollection: null, asyncBefore: false, asyncAfter: false,
          loopDataInputRef: "items", inputDataItemName: "item",
        }, compensationHandlers: [], forCompensation: false, defaultFlow: null, asyncBefore: false, asyncAfter: false } } } },
      { event: { header: header("End", "endEvent"), payload: { role: { throw: { record: "none" } }, placement: "finish",
        incoming: ["To_End"], outgoing: [], alternativeThrows: [] } } },
    ],
    flows: [{ id: "To_T", source: "Start", target: "T", condition: null }, { id: "To_End", source: "T", target: "End", condition: null }],
  };
}

const stimuli: Json[] = [
  { kind: "start", commandId: "start", instanceId: "I", variables: [{ name: "items", value: { kind: "stringList", value: ["a", "b"] } }] },
  { kind: "command", commandId: "complete-1", occurrence: { processInstanceId: "I", elementId: "T", activation: 1 },
    action: { kind: "completeUserTask", values: [{ name: "DataOutput_Result", value: { kind: "string", value: "ok-1" } }] } },
];

/** The instance root's variable names after the first completion, with its outcome. */
function afterFirst(json: Json): unknown {
  const trace = (runScenario(json, { kind: "scenario", id: "mi", profile: "p", stimuli }) as { trace: Json[] }).trace;
  const index = trace.findIndex((entry) => entry["commandId"] === "complete-1");
  const state = trace[index + 1]!;
  return [trace[index]!["outcome"], (state["variables"] as Json[]).map((variable) => variable["name"])];
}

test("an installed instance submission reaches the root in both modes, and the OutputSet reading keeps it in the slot", () => {
  for (const mode of ["parallel", "sequential"]) {
    assert.deepEqual(afterFirst(program("installsVariables", mode)), ["committed", ["DataOutput_Result", "items"]], mode);
    assert.deepEqual(afterFirst(program("outputSet", mode)), ["committed", ["items"]], mode);
  }
});
