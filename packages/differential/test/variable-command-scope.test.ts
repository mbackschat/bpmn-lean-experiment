/**
 * A `setVariables` or `removeVariables` command addresses an occurrence and acts from that occurrence's own scope
 * outward: CIB's runner calls `RuntimeService#setVariables` on the waiting activity's execution
 * (`CibSevenCommandExecutor`), whose `AbstractVariableScope#setVariable` writes the nearest scope that has the name, the
 * activity's input-mapped locals first. The witness is `scenarios/open-rows/conditional-evaluation/filter-on-shadowed-name`,
 * whose `Host_Local` maps a local `level2` that the third input sets; its retained evidence shows the local at 2 and
 * the process's `level2` still 1.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { runScenario } from "@bpmn-lean/kernel";

import { projectRoot } from "./pipeline-target-support.ts";
import { readSourceFor } from "./scenario-discovery.ts";
import type { ScenarioDocument } from "./scenario-discovery.ts";

type Json = Record<string, any>;

async function lastState(name: string, stimuli?: (scenario: ScenarioDocument) => unknown[]): Promise<Json> {
  const scenarioPath = `scenarios/open-rows/conditional-evaluation/${name}.scenario.json`;
  const scenario = JSON.parse(await readFile(path.join(projectRoot, scenarioPath), "utf8")) as ScenarioDocument;
  const read = await readSourceFor(scenarioPath, scenario.bpmn, scenario.profile);
  assert.equal(read.kind, "read", JSON.stringify(read));
  const program = (read as Extract<typeof read, { kind: "read" }>).program;
  const run = { ...scenario, stimuli: stimuli === undefined ? scenario.stimuli : stimuli(scenario) };
  const result = runScenario(program, run) as Json;
  const states = (result["trace"] as Json[]).filter((entry) => entry["kind"] === "state");
  return states[states.length - 1] as Json;
}

const local = (state: Json, element: string): unknown =>
  (state["scopes"] as Json[]).find((scope) => scope["scope"]["elementId"] === element)?.["variables"];

test("setVariables on an activity with an input-mapped local writes that local", async () => {
  const state = await lastState("filter-on-shadowed-name");
  assert.deepEqual(local(state, "Host_Local"), [{ name: "level2", value: { kind: "integer", value: 2 } }]);
  assert.deepEqual(state["variables"].find((binding: Json) => binding["name"] === "level2")?.value, { kind: "integer", value: 1 });
});

test("an open User Task publishes its input-mapped locals as they are now, not as they were at activation", async () => {
  const state = await lastState("filter-on-shadowed-name");
  const task = (state["openWaits"] as Json[]).find((wait) => wait["id"]["elementId"] === "Host_Local");
  assert.deepEqual(task?.["detail"]["inputs"], [{ name: "level2", value: { kind: "integer", value: 2 } }]);
});

test("removeVariables on an activity with an input-mapped local removes that local first", async () => {
  const state = await lastState("filter-on-shadowed-name", (scenario) => {
    const [start, setProcess, setLocal] = scenario.stimuli as Json[];
    return [start, setProcess, { ...setLocal, commandId: "s03-remove-local-level2", action: { kind: "removeVariables", names: ["level2"] } }];
  });
  assert.deepEqual(local(state, "Host_Local") ?? [], []);
  assert.deepEqual(state["variables"].find((binding: Json) => binding["name"] === "level2")?.value, { kind: "integer", value: 1 });
});
