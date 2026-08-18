import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AreaId,
  assertDetailImplementationMap,
  assertPlanControlPlane,
  assertRootImplementationMap,
  assertTrackedPathRoutes,
  parseOrderedWork,
  routeImplementationPath,
} from "./document-control-plane.ts";
import {
  parseImplementationMapDirectory,
  validateStructuralMapRoutes,
} from "./structural-map-routes.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function maintainedMarkdownDocuments(): Promise<ReadonlyMap<string, string>> {
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.md"],
    { cwd: projectRoot, encoding: "utf8" },
  ).split("\0").filter((file) =>
    file !== "" &&
    !file.startsWith("docs/archived/") &&
    !file.startsWith("docs/reference/")
  );
  const documents = await Promise.all(paths.map(async (file): Promise<readonly [string, string] | null> => {
    const absolute = path.join(projectRoot, file);
    if ((await lstat(absolute)).isSymbolicLink()) return null;
    return [file, await readFile(absolute, "utf8")] as const;
  }));
  return new Map(documents.filter((entry): entry is readonly [string, string] => entry !== null));
}

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

  const directory = parseImplementationMapDirectory(implementationMap);
  assert.deepEqual(directory.errors, []);
  for (const entry of directory.directory.values()) {
    const document = await readFile(path.join(projectRoot, entry.path), "utf8");
    assertDetailImplementationMap(entry.path, document);
  }
});

test("uses only structural implementation-map routes across maintained Markdown", async () => {
  assert.deepEqual(validateStructuralMapRoutes(await maintainedMarkdownDocuments()), []);
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

test("rejects every noncanonical repository-relative routing path", () => {
  for (const candidate of [
    "/packages/bpmn-source/src/compile.ts",
    "C:/packages/bpmn-source/src/compile.ts",
    "packages\\bpmn-source\\src\\compile.ts",
    "packages//bpmn-source/src/compile.ts",
    "./packages/bpmn-source/src/compile.ts",
    "packages/./bpmn-source/src/compile.ts",
    "packages/bpmn-source/../semantic-core/src/runtime.ts",
    "platform/../packages/bpmn-source/src/compile.ts",
    "packages/semantic-core/../../platform/apps/web/src/main.tsx",
  ]) assert.throws(() => routeImplementationPath(candidate), /canonical repository-relative path/u, candidate);
});

test("rejects hollow plan and root-map contracts", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  const rootMap = await readFile(path.join(projectRoot, "docs/IMPLEMENTATION-MAP.md"), "utf8");
  const entries = parseOrderedWork(plan);
  assert.ok(entries.length > 1);
  const activeEntry = entries.find((entry) => entry.state === "active");
  const queuedEntry = entries.find((entry) => entry.state === "queued");
  assert.ok(activeEntry !== undefined);
  assert.ok(queuedEntry !== undefined);
  assert.throws(
    () => assertPlanControlPlane(plan.replace(`\`${queuedEntry.id}\` · **queued**`, `\`${activeEntry.id}\` · **queued**`)),
    /duplicate work ID/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(`Active work ID: \`${activeEntry.id}\`.`, "Active work ID: `MISSING-WORK`.")),
    /resume work ID/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      /(1\. `[^`]+` · \*\*active\*\*.+? · Maps: )(.+?)( · Action:)/u,
      "$1none$3",
    )),
    /route to at least one detail map/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      /(1\. `[^`]+` · \*\*active\*\* · Owner: ).+?( · Maps:)/u,
      "$1proposal$2",
    )),
    /owner link/u,
  );
  assert.throws(
    () => assertPlanControlPlane(replaceSection(plan, "Current evidence", "")),
    /current evidence/u,
  );
  assert.throws(
    () => assertPlanControlPlane(
      replaceSection(plan, "Exact resume point", `Active work ID: \`${activeEntry.id}\`.`),
    ),
    /next action/u,
  );
  assert.throws(
    () => assertPlanControlPlane(
      replaceSection(
        plan,
        "Exact resume point",
        `Active work ID: \`${activeEntry.id}\`.\n\nNext action: Do it.\n\nOracle: A gate.`,
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
