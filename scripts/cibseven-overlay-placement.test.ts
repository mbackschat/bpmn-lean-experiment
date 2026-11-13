import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { oracleEvidenceCases } from "./contract-artifact-cases.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

// The CIB runner receives no scenario path, so it finds a source overlay by digest beside the BPMN source only
// (`runners/cibseven/README.md`); an overlay kept only beside the scenario leaves the schedule a harness failure before
// CIB answers, as the three `public-delivery` schedules did in Verify run 43370273960 (#129).
test("every scenario the CIB oracle runs has its source overlay beside its BPMN source", async () => {
  const unplaced: string[] = [];
  for (const { scenarioRelativePath } of oracleEvidenceCases) {
    const { bpmn } = JSON.parse(await readFile(path.join(projectRoot, scenarioRelativePath), "utf8")) as
      { bpmn: { relativePath: string; sourceOverlay: { sha256: string } | null } };
    if (bpmn.sourceOverlay === null) continue;
    const directory = path.join(projectRoot, path.dirname(bpmn.relativePath));
    const digests = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).map(async (name) =>
      createHash("sha256").update(await readFile(path.join(directory, name))).digest("hex")));
    if (!digests.includes(bpmn.sourceOverlay.sha256)) unplaced.push(scenarioRelativePath);
  }
  assert.deepEqual(unplaced, []);
});
