import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const activeSourceRoots = [
  "BpmnSemantics",
  "packages/bpmn-source/src",
  "packages/bpmn-source/test",
  "packages/differential/src",
  "packages/differential/test",
  "packages/semantic-core/src",
  "packages/semantic-core/test",
  "packages/temporal-adapter/src",
  "packages/temporal-adapter/test",
  "runners/cibseven/src",
];

const prohibitedSourceFragments = [
  ["schema", "Version"].join(""),
  ["traceSchema", "Version"].join(""),
  ["m0", "-sequential-user-task"].join(""),
  ["m1", "-user-task"].join(""),
  ["bpmn-source-sequential-user-task", "@0."].join(""),
  ["SequentialUserTask", "ExecutableIr"].join(""),
  ["BpmnExecutable", "IrKind"].join(""),
  ["bpmn-source", "-sequential-user-task"].join(""),
  ["hasSupported", "ExecutionSurface"].join(""),
  ["hasSequential", "ExecutionSurface"].join(""),
  ["hasTimer", "ExecutionSurface"].join(""),
  ["hasEffect", "ExecutionSurface"].join(""),
  ["hasBoundaryError", "ExecutionSurface"].join(""),
  ["hasBalancedParallel", "ExecutionSurface"].join(""),
];

async function sourceFiles(
  relativeRoot: string,
): Promise<ReadonlyArray<string>> {
  const absoluteRoot = path.join(projectRoot, relativeRoot);
  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const nested = await Promise.all(
    entries.flatMap((entry) => {
      const relativePath = path.join(relativeRoot, entry.name);
      if (entry.isDirectory()) {
        return [sourceFiles(relativePath)];
      }
      return entry.isFile()
        ? [Promise.resolve<ReadonlyArray<string>>([relativePath])]
        : [];
    }),
  );
  return nested.flat();
}

test("keeps active code on one replace-in-place pre-release contract", async () => {
  const files = (await Promise.all(activeSourceRoots.map(sourceFiles))).flat();
  const findings: string[] = [];

  for (const relativePath of files) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    for (const fragment of prohibitedSourceFragments) {
      if (source.includes(fragment)) {
        findings.push(`${relativePath}: ${fragment}`);
      }
    }
  }

  assert.deepEqual(findings, []);
});

test("starts every cached ephemeral server through the owner that creates its cache", async () => {
  // A cached ephemeral executable needs its download directory to exist first.
  // The owner creates it, so a second configuration site would reintroduce a
  // gate that passes only where an earlier run left the cache behind.
  const executableMarker = ["cached", "-download"].join("");
  const owner = path.join(
    "packages/temporal-adapter/src",
    "ephemeral-server.ts",
  );
  const scanRoots = [
    ...activeSourceRoots,
    "packages/bpmn-source/calibration",
    "packages/temporal-adapter/calibration",
    "scripts",
  ];
  const files = (await Promise.all(scanRoots.map(sourceFiles))).flat();
  const configurationSites: string[] = [];

  for (const relativePath of files) {
    if (relativePath === owner) {
      continue;
    }
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    if (source.includes(executableMarker)) {
      configurationSites.push(relativePath);
    }
  }

  assert.deepEqual(
    configurationSites,
    [],
    `only ${owner} may configure a cached ephemeral server executable`,
  );
  const ownerSource = await readFile(path.join(projectRoot, owner), "utf8");
  assert.match(
    ownerSource,
    /mkdir\([^)]*\{\s*recursive:\s*true\s*\}/u,
    `${owner} must create the download directory before starting a server`,
  );
});

test("keeps pre-release Temporal replay evidence disposable", async () => {
  const temporalTestFiles = await sourceFiles("packages/temporal-adapter/test");
  assert.deepEqual(
    temporalTestFiles.filter((relativePath) =>
      relativePath.endsWith([".history", ".json"].join("")),
    ),
    [],
  );

  const temporalSources = await sourceFiles(
    "packages/temporal-adapter/src",
  );
  const patchedWorkflowSources: string[] = [];
  for (const relativePath of temporalSources) {
    const source = await readFile(
      path.join(projectRoot, relativePath),
      "utf8",
    );
    if (source.includes(["patch", "ed("].join(""))) {
      patchedWorkflowSources.push(relativePath);
    }
  }
  assert.deepEqual(patchedWorkflowSources, []);
});
