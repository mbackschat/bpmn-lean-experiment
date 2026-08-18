import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AreaId,
  assertDetailImplementationMap,
  assertPlanControlPlane,
  assertRootImplementationMap,
  assertTrackedPathRoutes,
  detailMapContracts,
  isUnroutedRootImplementationMapStatusLine,
  parseOrderedWork,
  routeImplementationPath,
} from "./document-control-plane.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function replaceSection(document: string, heading: string, body: string): string {
  const marker = `## ${heading}\n`;
  const start = document.indexOf(marker);
  assert.notEqual(start, -1, heading);
  const bodyStart = start + marker.length;
  const end = document.indexOf("\n## ", bodyStart);
  return `${document.slice(0, bodyStart)}\n${body}\n${end === -1 ? "" : document.slice(end)}`;
}

test("uses the compact routed documentation control plane", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  const implementationMap = await readFile(
    path.join(projectRoot, "docs/IMPLEMENTATION-MAP.md"),
    "utf8",
  );

  assertPlanControlPlane(plan);
  assertRootImplementationMap(implementationMap);

  for (const contract of detailMapContracts) {
    const document = await readFile(path.join(projectRoot, "docs", contract.file), "utf8");
    assertDetailImplementationMap(contract.file, document);
  }
});

test("routes every tracked, pending, and workspace-package path independently", async () => {
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: projectRoot, encoding: "utf8" },
  ).split("\0").filter(Boolean);
  assertTrackedPathRoutes(paths);

  const manifests = paths.filter((file) => file.endsWith("/package.json"));
  assert.ok(manifests.length > 0);
  for (const manifest of manifests) routeImplementationPath(manifest);
});

test("routes overrides and explicit multi-area paths without plan knowledge", () => {
  assert.deepEqual(routeImplementationPath("packages/bpmn-source/src/compile.ts"), [
    AreaId.EngineContractsSource,
  ]);
  assert.deepEqual(routeImplementationPath("platform/modules/work/src/index.ts"), [
    AreaId.BpmPlatform,
  ]);
  assert.deepEqual(routeImplementationPath("packages/engine-api/src/index.ts"), [
    AreaId.EngineContractsSource,
    AreaId.TemporalHosting,
  ]);
  assert.deepEqual(routeImplementationPath("deploy/evaluation/compose.yaml"), [
    AreaId.TemporalHosting,
    AreaId.BpmPlatform,
  ]);
  assert.throws(() => routeImplementationPath("unknown/product.ts"), /unrouted/u);
  assert.throws(() => routeImplementationPath("root-new-engine.ts"), /unrouted/u);
});

test("rejects hollow plan and root-map contracts", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  const rootMap = await readFile(path.join(projectRoot, "docs/IMPLEMENTATION-MAP.md"), "utf8");
  const entries = parseOrderedWork(plan);
  assert.ok(entries.length > 1);
  assert.throws(
    () => assertPlanControlPlane(plan.replace("`H2-WORKFLOW-CHAIN`", "`DOC-CONTROL-PLANE`")),
    /duplicate work ID/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace("Active work ID: `DOC-CONTROL-PLANE`.", "Active work ID: `MISSING-WORK`.")),
    /resume work ID/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replaceAll("-IMPLEMENTATION-MAP.md", "-MAP.md")),
    /route to at least one detail map/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace("Owner: [approved proposal]", "Owner: approved proposal")),
    /owner link/u,
  );
  assert.throws(
    () => assertPlanControlPlane(replaceSection(plan, "Current evidence", "")),
    /current evidence/u,
  );
  assert.throws(
    () => assertPlanControlPlane(
      replaceSection(plan, "Exact resume point", "Active work ID: `DOC-CONTROL-PLANE`."),
    ),
    /next action/u,
  );
  assert.throws(
    () => assertPlanControlPlane(
      replaceSection(
        plan,
        "Exact resume point",
        "Active work ID: `DOC-CONTROL-PLANE`.\n\nNext action: Do it.\n\nOracle: A gate.",
      ),
    ),
    /stop condition/u,
  );
  assert.throws(
    () => assertRootImplementationMap(replaceSection(rootMap, "Current claim", "")),
    /current claim/u,
  );
  assert.throws(
    () => assertRootImplementationMap(replaceSection(rootMap, "Cross-area invariants", "")),
    /cross-area invariants/u,
  );
  const dense = `${"word ".repeat(33)}tail`;
  assert.throws(
    () => assertRootImplementationMap(rootMap.replace("root documentation", dense)),
    /dense routing cell/u,
  );
});

test("keeps exact status references routed to a detail owner", async () => {
  const tracked = execFileSync("git", ["ls-files", "-z", "--", "*.md"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).split("\0").filter(Boolean);
  const maintainedOwners = tracked.filter(
    (file) =>
      !file.startsWith("docs/archived/") &&
      !file.startsWith("docs/reference/") &&
      file !== "docs/AGENT-DOCUMENTATION-CONTROL-PLANE-PROPOSAL.md",
  );
  const invalid: string[] = [];
  for (const file of maintainedOwners) {
    const document = await readFile(path.join(projectRoot, file), "utf8");
    for (const [index, line] of document.split("\n").entries()) {
      if (isUnroutedRootImplementationMapStatusLine(line)) {
        invalid.push(`${file}:${index + 1}: ${line}`);
      }
    }
  }
  assert.deepEqual(invalid, [], "exact-status claims must route beyond the root map");
});

test("ties root-map routing exemptions to the root-map reference", () => {
  for (const line of [
    "Exact implementation status belongs in [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md), beside one matching boundary route.",
    "The implemented owners are routed through executable guards. The [implementation map](../IMPLEMENTATION-MAP.md) owns the exact source allocation.",
    "Implementation inventory belongs only in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).",
    "The current live queue remains in [PLAN.md](../PLAN.md) and [IMPLEMENTATION-MAP.md](../IMPLEMENTATION-MAP.md).",
  ]) assert.equal(isUnroutedRootImplementationMapStatusLine(line), true, line);

  for (const line of [
    "Exact implementation status belongs in the [runtime and proof implementation map](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md).",
    "Implementation inventory belongs in the applicable detail maps routed by [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).",
    "Exact current source allocation belongs in the applicable detail maps routed by the [implementation map](../IMPLEMENTATION-MAP.md).",
    "Use [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) to route to the detail maps that own exact current status.",
    "[IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) routes exact implementation status to the applicable detail maps.",
  ]) assert.equal(isUnroutedRootImplementationMapStatusLine(line), false, line);
});

test("keeps the exact closed semantic-family owner complete", async () => {
  const runtimeMap = await readFile(
    path.join(projectRoot, "docs/ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md"),
    "utf8",
  );
  const currentBoundary = runtimeMap.slice(
    runtimeMap.indexOf("## Current boundary\n"),
    runtimeMap.indexOf("\n## Implemented\n"),
  );
  for (const family of [
    "cyclic control flow",
    "Message Start",
    "Timer Start",
    "Terminate End",
    "configured Task",
  ]) assert.match(currentBoundary, new RegExp(family, "iu"), family);
});

test("keeps delegated Timer scope in the runtime detail map", async () => {
  const runtimeMap = await readFile(
    path.join(projectRoot, "docs/ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md"),
    "utf8",
  );
  for (const heading of [
    "Interrupting Activity boundary Timer",
    "Non-interrupting boundary Timer",
    "Interrupting Sub-Process boundary Timer",
  ]) {
    const start = runtimeMap.indexOf(`## ${heading}\n`);
    assert.notEqual(start, -1, heading);
    const end = runtimeMap.indexOf("\n## ", start + 4);
    const body = runtimeMap.slice(start, end === -1 ? undefined : end);
    assert.match(body, /\*\*Implemented\.\*\*/u, heading);
    assert.match(body, /\*\*Absent/u, heading);
    assert.ok(body.split(/\s+/u).length >= 100, heading);
  }
});

test("keeps the root README navigational and the startup route explicit", async () => {
  const readme = await readFile(path.join(projectRoot, "README.md"), "utf8");
  const contributorGuide = await readFile(path.join(projectRoot, "CLAUDE.md"), "utf8");
  assert.doesNotMatch(readme, /^## Current state$/mu);
  for (const target of [
    "docs/PLAN.md",
    "docs/IMPLEMENTATION-MAP.md",
    "docs/BPM-PLATFORM-IMPLEMENTATION-MAP.md",
    "model-corpus/README.md",
  ]) assert.match(readme, new RegExp(target.replaceAll("/", "\\/"), "u"));
  for (const phrase of [
    "determine whether the user request retains or overrides",
    "detail map",
    "concrete target paths",
  ]) assert.match(contributorGuide, new RegExp(phrase, "iu"));
});
