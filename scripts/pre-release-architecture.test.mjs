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
];

async function sourceFiles(relativeRoot) {
  const absoluteRoot = path.join(projectRoot, relativeRoot);
  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const nested = await Promise.all(
    entries.flatMap((entry) => {
      const relativePath = path.join(relativeRoot, entry.name);
      if (entry.isDirectory()) {
        return [sourceFiles(relativePath)];
      }
      return entry.isFile() ? [[relativePath]] : [];
    }),
  );
  return nested.flat();
}

test("keeps active code on one replace-in-place pre-release contract", async () => {
  const files = (await Promise.all(activeSourceRoots.map(sourceFiles))).flat();
  const findings = [];

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
  const patchedWorkflowSources = [];
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
