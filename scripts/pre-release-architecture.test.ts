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

const maintainedReadmes = [
  "README.md",
  "packages/bpmn-source/README.md",
  "packages/differential/README.md",
  "packages/semantic-core/README.md",
  "packages/temporal-adapter/README.md",
  "runners/cibseven/README.md",
  "contracts/README.md",
];

const retiredOperationName = ["term", "inate"].join("");

/**
 * Vocabulary a replace-in-place change retired from the product surface.
 *
 * Unlike `prohibitedSourceFragments`, these are checked in maintained documentation as well as
 * active source, because the recurring escape is prose that keeps describing a removed identifier
 * or a deleted example file long after the code changed. Fragments are split so this guard does not
 * match its own list.
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
  retiredOperationName,
];

const permittedRetiredSourceLines = new Map<string, ReadonlySet<string>>([
  [
    "packages/temporal-adapter/src/runner.ts",
    new Set([
      'handle.terminate("conformance scenario input exhausted"),',
    ]),
  ],
  [
    "packages/temporal-adapter/src/bypass-mutation.ts",
    new Set([
      "handle.terminate(`retained ${configuration.description}`),",
    ]),
  ],
  [
    "packages/temporal-adapter/test/call-activity-temporal.test.ts",
    new Set([
      'await earlyHandle.terminate("Call early-return mutation observed");',
      'await erasedHandle.terminate("Call identity-erasure mutation observed");',
    ]),
  ],
]);

const permittedRetiredDocumentationContexts = new Map([
  [
    "docs/IMPLEMENTATION-MAP.md",
    "replace `terminate` with `reachNoneEnd` plus quiescent `completeScope`",
  ],
  [
    "docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md",
    "replaced `terminate` with `reachNoneEnd` plus synthetic `completeScope`",
  ],
]);

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

function retiredSourceFindings(
  relativePath: string,
  source: string,
): string[] {
  const permittedLines = permittedRetiredSourceLines.get(relativePath) ??
    new Set<string>();
  return source.split("\n").flatMap((line, index) => {
    if (!new RegExp(`\\b${retiredOperationName}\\b`, "iu").test(line)) {
      return [];
    }
    return permittedLines.has(line.trim())
      ? []
      : [`${relativePath}:${index + 1}: ${retiredOperationName}`];
  });
}

function retiredDocumentationFindings(
  relativePath: string,
  source: string,
): string[] {
  const marker = `\`${retiredOperationName}\``;
  const permittedContext =
    permittedRetiredDocumentationContexts.get(relativePath);
  return source.split("\n").flatMap((line, index) => {
    const occurrences = line.split(marker).length - 1;
    if (occurrences === 0) {
      return [];
    }
    return occurrences === 1 && permittedContext !== undefined &&
        line.includes(permittedContext)
      ? []
      : [`${relativePath}:${index + 1}: ${marker}`];
  });
}

test("keeps active code and maintained documentation on one replace-in-place pre-release contract", async () => {
  const files = (await Promise.all(activeSourceRoots.map(sourceFiles))).flat();
  const findings: string[] = [];

  for (const relativePath of files) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    for (const fragment of prohibitedSourceFragments) {
      if (fragment === retiredOperationName) {
        findings.push(...retiredSourceFindings(relativePath, source));
      } else if (source.includes(fragment)) {
        findings.push(`${relativePath}: ${fragment}`);
      }
    }
  }

  const documentationFiles = (await sourceFiles("docs")).filter(
    (relativePath) =>
      relativePath.endsWith(".md") &&
      !relativePath.startsWith(path.join("docs", "archived") + path.sep),
  );
  for (const relativePath of documentationFiles) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    findings.push(...retiredDocumentationFindings(relativePath, source));
  }

  // Retired product vocabulary is a documentation defect as much as a source defect: a reader
  // following a deleted example filename or a removed configuration field is misled either way.
  const vocabularyFiles = [
    ...files,
    ...documentationFiles,
    ...maintainedReadmes,
  ];
  for (const relativePath of vocabularyFiles) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    for (const fragment of retiredProductVocabulary) {
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
