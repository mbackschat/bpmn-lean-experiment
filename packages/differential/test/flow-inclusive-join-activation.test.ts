/**
 * PC-CF-04: a parked Inclusive join fires as soon as Table 13.3's condition holds, also when no token arrives at it
 * (the last position that could reach an empty input ends elsewhere), under every profile; CIB's arrival-only trigger is
 * candidate CIB-DEV-0002 and owns the disagreement. Which positions can reach the join is profile data
 * (`ProfileOptions.inclusiveJoinReach`): the standards reading follows a host's Boundary Events, CIB's `isReachable`
 * does not (CIB-INT-0020). The witnesses are `scenarios/open-rows/inclusive-join-activation` and the retained
 * `unselected-path`; each test sets the option explicitly, so it holds whichever relations the profile lists. The
 * nested witnesses lock that a join is offered again only when no completion is still queued, so a downstream join
 * cannot fire before the inner join's token is on its flow (audit of round 7, findings 1 and 5).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { runScenario } from "@bpmn-lean/kernel";

import { readSourceFor } from "./scenario-discovery.ts";
import type { ScenarioDocument } from "./scenario-discovery.ts";
import { projectRoot } from "./pipeline-target-support.ts";

type Json = Record<string, any>;
type Reach = "withBoundaries" | "outgoingOnly";

/** The open waits after each committed input, as `element#activation`. */
async function waits(scenarioPath: string, reach: Reach): Promise<string[][]> {
  const scenario = JSON.parse(await readFile(path.join(projectRoot, scenarioPath), "utf8")) as ScenarioDocument;
  const read = await readSourceFor(scenarioPath, scenario.bpmn, scenario.profile);
  assert.equal(read.kind, "read", JSON.stringify(read));
  const program = (read as Extract<typeof read, { kind: "read" }>).program as Json;
  const result = runScenario({ ...program, options: { ...program.options, inclusiveJoinReach: reach } }, scenario) as Json;
  assert.deepEqual(result.outcome, { kind: "semantic", outcome: "committed" }, JSON.stringify(result.trace));
  return result.trace.filter((entry: Json) => entry.kind === "state")
    .map((state: Json) => state.openWaits.map((wait: Json) => `${wait.id.elementId}#${wait.id.activation}`));
}

const activation = (name: string): string => `scenarios/open-rows/inclusive-join-activation/${name}.scenario.json`;

for (const reach of ["withBoundaries", "outgoingOnly"] as const) {
  test(`a join whose blocking branch ends at its own End fires then (${reach})`, async () => {
    const states = await waits("scenarios/open-rows/inclusive-join-compositions/unselected-path-parked-then-unselected.scenario.json", reach);
    assert.deepEqual(states.at(-1), ["Decide#1"]);
  });

  test(`a join whose blocking work is withdrawn by its Boundary Event fires then (${reach})`, async () => {
    assert.deepEqual(await waits(activation("boundary-exit-parked-then-withdrawn"), reach), [["ReviewA#1", "ReviewB#1", "Withdrawn#1"], ["ReviewB#1", "Withdrawn#1"], ["Decide#1"]]);
  });
}

test("a Boundary Event that can still reach the join keeps it waiting under the standards reach", async () => {
  const parked = [["Escalated#1", "ReviewA#1", "ReviewB#1"], ["Escalated#1", "ReviewB#1"]];
  assert.deepEqual(await waits(activation("boundary-path-parked-then-closed"), "withBoundaries"), [...parked, ["Decide#1"]]);
  assert.deepEqual(await waits(activation("boundary-path-parked-then-escalated"), "withBoundaries"), [...parked, ["Decide#1"]]);
});

test("CIB's reach ignores the Boundary Event, so its later token fires the join again", async () => {
  const fired = [["Escalated#1", "ReviewA#1", "ReviewB#1"], ["Decide#1", "Escalated#1", "ReviewB#1"]];
  assert.deepEqual(await waits(activation("boundary-path-parked-then-closed"), "outgoingOnly"), [...fired, ["Decide#1"]]);
  assert.deepEqual(await waits(activation("boundary-path-parked-then-escalated"), "outgoingOnly"), [...fired, ["Decide#1", "Decide#2"]]);
});

const nested = ["nested-inclusive", "nested-inclusive-outer-first", "nested-parallel", "nested-parallel-outer-first"];

for (const reach of ["withBoundaries", "outgoingOnly"] as const) {
  for (const model of nested) {
    test(`${model}: the outer join fires once, after the inner join (${reach})`, async () => {
      assert.deepEqual((await waits(activation(`${model}-a-then-inner`), reach)).at(-1), ["Decide#1"]);
    });
  }

  for (const model of ["nested-skip", "nested-skip-outer-first"]) {
    test(`${model}: an inner join that fires without an arrival fires the outer join once (${reach})`, async () => {
      assert.deepEqual((await waits(activation(`${model}-a-then-skipped`), reach)).at(-1), ["Decide#1"]);
    });
  }

  test(`a join whose blocking work ends by an uncaught business Error fires then (${reach})`, async () => {
    assert.deepEqual(await waits(activation("raised-path-parked-then-failed"), reach), [["CheckB#1", "ReviewA#1"], ["CheckB#1"], ["Decide#1"]]);
  });
}
