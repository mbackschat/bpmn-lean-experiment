import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const temporalSourceRoots = ["packages/temporal-host/src"];

const activeSourceRoots = [
  "Kernel",
  "packages/kernel/src",
  "packages/kernel/test",
  "packages/bpmn-source/src",
  "packages/bpmn-source/test",
  "packages/differential/src",
  "packages/differential/test",
  "packages/engine-api/src",
  ...temporalSourceRoots,
  "packages/temporal-host/test",
  "runners/cibseven/src",
];

const retiredOperationName = ["term", "inate"].join("");

/**
 * Vocabulary a replace-in-place change retired from the product surface.
 *
 * Checked in active source like `prohibitedSourceFragments`. Fragments are split so this guard does
 * not match its own list.
 */
const retiredProductVocabulary = [
  ["dummy", "UserTask"].join(""),
  ["DummyUserTask", "Response"].join(""),
  ["DummyUserTask", "Actor"].join(""),
  ["DummyUserTask", "RefusalCode"].join(""),
  ["Actor", "Refused"].join(""),
  ["CompletionNot", "Committed"].join(""),
  ["temporal-mvp/accep", "ted.json"].join(""),
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

const kernelTerminateFiles: ReadonlySet<string> = new Set([
  "packages/bpmn-source/src/kernel-reader/assembly.ts",
  "packages/bpmn-source/src/kernel-reader/events.ts",
  "packages/kernel/src/il/types.ts",
  "contracts/schemas/vocabulary.schema.json",
]);

function retiredSourceFindings(
  relativePath: string,
  source: string,
): string[] {
  return source.split("\n").flatMap((line, index) => {
    // The kernel IL's Terminate End Event throw is BPMN's own name, not the retired operation; the reader writes it,
    // assembly copies it, the generated vocabulary lists it and the generated row fixtures of guard 21 carry it.
    const kernelTerminate = kernelTerminateFiles.has(relativePath) || relativePath.startsWith("packages/kernel/test/fixtures/rows/");
    const hasRetiredWireLiteral = !kernelTerminate && new RegExp(
      `(["'])${retiredOperationName}\\1`,
      "u",
    ).test(line);
    if (!hasRetiredWireLiteral) {
      return [];
    }
    return [`${relativePath}:${index + 1}: ${retiredOperationName}`];
  });
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

  const retiredOperationFiles = [
    ...files,
    ...await sourceFiles("contracts/schemas"),
  ];
  for (const relativePath of retiredOperationFiles) {
    findings.push(...retiredSourceFindings(
      relativePath,
      await readFile(path.join(projectRoot, relativePath), "utf8"),
    ));
  }

  for (const relativePath of files) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    for (const fragment of retiredProductVocabulary) {
      if (source.includes(fragment)) {
        findings.push(`${relativePath}: ${fragment}`);
      }
    }
  }

  assert.deepEqual(findings, []);
});

test("distinguishes the retired terminate wire operation from Terminate End", () => {
  assert.deepEqual(
    retiredSourceFindings("fixture.ts", 'const operation = { kind: "terminate" };'),
    ["fixture.ts:1: terminate"],
  );
  assert.deepEqual(
    retiredSourceFindings(
      "Kernel/Fixture.lean",
      "  | terminate (before : RuntimeState)\nconst kind = 'terminateScope'",
    ),
    [],
  );
});

test("starts every cached ephemeral server through the owner that creates its cache", async () => {
  // A cached ephemeral executable needs its download directory to exist first.
  // The owner creates it, so a second configuration site would reintroduce a
  // gate that passes only where an earlier run left the cache behind.
  const executableMarker = ["cached", "-download"].join("");
  const owner = path.join(
    "packages/temporal-host/src",
    "ephemeral-server.ts",
  );
  const scanRoots = [
    ...activeSourceRoots,
    "packages/bpmn-source/calibration",
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

// Before an approved durable baseline the host carries no Workflow patch branch and no retained Event History
// (CLAUDE.md, pre-release evolution); either would be a compatibility path for histories nobody must keep.
test("keeps the pre-release Temporal host free of replay evidence and patch branches", async () => {
  const temporalTestFiles = await sourceFiles("packages/temporal-host/test");
  assert.ok(temporalTestFiles.length > 0, "the Temporal host test directory must be read");
  assert.deepEqual(
    temporalTestFiles.filter((relativePath) =>
      relativePath.endsWith([".history", ".json"].join("")),
    ),
    [],
  );

  const temporalSources = (
    await Promise.all(temporalSourceRoots.map(sourceFiles))
  ).flat();
  assert.ok(temporalSources.length > 0, "the Temporal host sources must be read");
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
