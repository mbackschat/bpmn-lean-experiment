/**
 * PC-BASIC-03: the order a closure gives a split's branches is profile data (`ProfileOptions.branchSchedule`), never a
 * meaning every profile shares. BPMN 2.0.2 lets concurrent branches interleave in any order (Table 13.1, §13.3.1), so
 * the standards reading refuses a model in which two branches of one split can write one name with no wait between
 * (`flow.concurrentWrite`); CIB runs the first-declared branch first, each to its next wait, join or end (CIB-OP-0016),
 * and the last-declared branch's write is the one left. The witnesses are `scenarios/open-rows/split-branch-order`, whose
 * `uneven-fork` and `nested-fork` separate depth-first from interleaved branches, and `subprocess-fork` locks that an
 * automatic Sub-Process completes before the sibling branch starts, as CIB ends it in the operation that ends its last
 * execution (`PvmAtomicOperationActivityEnd:105`); each test sets the option explicitly.
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

async function run(name: string, branchSchedule: string): Promise<Json> {
  const scenarioPath = `scenarios/open-rows/split-branch-order/${name}.scenario.json`;
  const scenario = JSON.parse(await readFile(path.join(projectRoot, scenarioPath), "utf8")) as ScenarioDocument;
  const read = await readSourceFor(scenarioPath, scenario.bpmn, scenario.profile);
  assert.equal(read.kind, "read", JSON.stringify(read));
  const program = (read as Extract<typeof read, { kind: "read" }>).program as Json;
  return runScenario({ ...program, options: { ...program.options, branchSchedule } }, scenario) as Json;
}

const witnesses = [
  "parallel-fork-both-branches", "start-split-both-branches", "inclusive-split-both-selected", "uneven-fork-both-branches",
  "nested-fork-all-branches", "subprocess-fork-both-branches",
];

for (const name of witnesses) {
  test(`${name}: CIB's schedule leaves the last-declared branch's write`, async () => {
    const result = await run(name, "declarationDepthFirst");
    const [state] = result.trace.filter((entry: Json) => entry.kind === "state");
    assert.ok(state !== undefined, JSON.stringify(result.trace));
    assert.deepEqual(state.variables.find((binding: Json) => binding.name === "outcome")?.value, { kind: "string", value: "alpha" });
  });

  test(`${name}: the standards reading refuses two branches writing one name`, async () => {
    const result = await run(name, "orderInvariant");
    assert.deepEqual(result.trace[0], { kind: "deployment", outcome: "unsupported", code: "flow.concurrentWrite" });
  });
}
