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
  parseOrderedWork,
  routeImplementationPath,
} from "./document-control-plane.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

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
});

test("rejects duplicate work IDs, dangling resume IDs, missing routes, and dense routing cells", async () => {
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
  const dense = `${"word ".repeat(33)}tail`;
  assert.throws(
    () => assertRootImplementationMap(rootMap.replace("root documentation", dense)),
    /dense routing cell/u,
  );
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
