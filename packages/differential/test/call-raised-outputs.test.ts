/**
 * PC-SCOPE-06 (CIB-EXT-0034): when a raised Error or Escalation reaches a called root, the Call's output mappings run
 * against the called instance and are written outward from the Call's scope occurrence, exactly as its normal return
 * writes them; the function yields that scope occurrence and the evaluated outputs (`tree/OutputVariablesPropagator.java:34-43`, `CallableElementActivityBehavior.java:133-139`). The test
 * reaches `Work.Call.raisedOutputs` in the built kernel directly, because the search's hook that calls it
 * (`PropagationHooks.callOutputs`) is registered by `Kernel.Registry`, not by this module. The witness is the dispatch
 * model of `scenarios/open-rows/call-exceptional-return`: after `Plan`, the `Route` instance holds `carrier` and has no
 * `slot`, so its outputs are `carrier` and a present null `routeSlot` (CIB-EXT-0021 copies an unset source as null).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { State } from "@bpmn-lean/kernel";

import { projectRoot } from "./pipeline-target-support.ts";
import { readSourceFor } from "./scenario-discovery.ts";
import type { ScenarioDocument } from "./scenario-discovery.ts";

type Json = Record<string, any>;
type Module = Readonly<Record<string, (...args: any[]) => any>>;

const kernelModule = async (relative: string): Promise<Module> =>
  await import(path.join(projectRoot, "packages/kernel/dist", relative)) as Module;

test("a raised event that reaches a called root writes its Call's outputs outward from the Call's scope", async () => {
  const base = "scenarios/open-rows/call-exceptional-return/normal-return-baseline";
  const scenario = JSON.parse(await readFile(path.join(projectRoot, `${base}.scenario.json`), "utf8")) as ScenarioDocument;
  const read = await readSourceFor(`${base}.scenario.json`, scenario.bpmn, scenario.profile);
  assert.equal(read.kind, "read");
  const decoded = decodeProgram((read as Extract<typeof read, { kind: "read" }>).program);
  assert.ok(decoded.ok);
  let state: State | null = null;
  for (const stimulus of (scenario.stimuli as Json[]).slice(0, 2)) {
    const parsed = stimulusFromJson(stimulus);
    assert.ok(parsed.ok);
    const stepped = step(hooks, decoded.value, state, parsed.value[1]);
    assert.ok(stepped.ok, JSON.stringify(stepped));
    state = stepped.value;
  }
  const after = state!;
  const route = after.scopes.find((scope) => scope.calledInstance !== null && scope.element === "CallActivity_Route");
  assert.ok(route !== undefined, JSON.stringify(after.scopes));

  const { raisedOutputs } = await kernelModule("feature/work/call.js");
  const { context } = await kernelModule("step.js");
  assert.equal(typeof raisedOutputs, "function", "Work.Call.raisedOutputs is missing");
  const outcome = raisedOutputs!(context!(hooks, decoded.value), route, after) as Json;
  assert.deepEqual(JSON.parse(JSON.stringify(outcome)), {
    ok: true,
    value: [route.parent, [["carrier", { tag: "string", value: "DHL" }], ["routeSlot", { tag: "null" }]]],
  });
});

test("a scope occurrence that is no called root is a semantic failure", async () => {
  const { raisedOutputs } = await kernelModule("feature/work/call.js");
  const { context } = await kernelModule("step.js");
  assert.equal(typeof raisedOutputs, "function", "Work.Call.raisedOutputs is missing");
  const program = JSON.parse(await readFile(path.join(projectRoot, "packages/kernel/test/fixtures/simple-boolean.program.json"), "utf8"));
  const decoded = decodeProgram(program);
  assert.ok(decoded.ok);
  const outcome = raisedOutputs!(context!(hooks, decoded.value), { id: 0, element: null, parent: null, occurrence: null, calledInstance: null },
    { signals: [] }) as Json;
  assert.deepEqual(outcome, { ok: false, failure: { tag: "semanticFailure", code: "called-root-without-call" } });
});
