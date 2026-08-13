import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const legacyTarget = "02330ad0f980a5fc282cc0aa93600a9632b86c3e";
const legacyManifestPath = "adoption/a12/legacy/manifest.json";
const legacyInventoryPath =
  "adoption/a12/legacy/product-decision-inventory.json";
const legacyAdoptionEntryRoots = [
  "scripts/contract-artifact-projections.test.ts",
] as const;
const legacyEvidenceRoots = [
  "BpmnSemantics/",
  "examples/temporal-mvp/",
  "packages/bpmn-source/",
  "packages/differential/",
  "packages/semantic-core/",
  "packages/temporal-adapter/",
  "profiles/",
  "runners/cibseven/",
  "scenarios/",
  "scripts/contract-",
] as const;
const contextualLegacyDecisions = new Set([
  "A12",
  "A12-shaped",
  "Camunda/A12",
  "a12-adoption-coverage",
]);

type LegacyManifest = Readonly<{
  kind: "a12LegacyBaselineManifest";
  sourceTarget: string;
  entries: ReadonlyArray<Readonly<{
    originalPath: string;
    frozenPath: string;
    sha256: string;
  }>>;
}>;

type LegacyInventory = Readonly<{
  decisions: ReadonlyArray<string>;
}>;

export async function verifyA12LegacyManifest(
  projectRoot: string,
): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(projectRoot, legacyManifestPath), "utf8"),
  ) as LegacyManifest;
  assert.equal(manifest.kind, "a12LegacyBaselineManifest");
  assert.equal(manifest.sourceTarget, legacyTarget);
  execFileSync("git", ["merge-base", "--is-ancestor", legacyTarget, "HEAD"], {
    cwd: projectRoot,
    stdio: "ignore",
  });

  const originalPaths = manifest.entries.map(({ originalPath }) => originalPath);
  const frozenPaths = manifest.entries.map(({ frozenPath }) => frozenPath);
  assert.equal(new Set(originalPaths).size, originalPaths.length);
  assert.equal(new Set(frozenPaths).size, frozenPaths.length);
  assert.deepEqual(originalPaths, [...originalPaths].sort());

  for (const entry of manifest.entries) {
    assert.equal(
      entry.frozenPath,
      `adoption/a12/legacy/source-tree/${entry.originalPath}`,
    );
    const [frozenBytes, targetBytes] = await Promise.all([
      readFile(path.join(projectRoot, entry.frozenPath)),
      Promise.resolve(readLegacyBytes(projectRoot, entry.originalPath)),
    ]);
    assert.equal(sha256(frozenBytes), entry.sha256);
    assert.ok(
      frozenBytes.equals(targetBytes),
      `${entry.frozenPath} differs from ${legacyTarget}:${entry.originalPath}`,
    );
  }

  assert.deepEqual(
    await recursiveFiles(
      projectRoot,
      path.join(projectRoot, "adoption/a12/legacy/source-tree"),
    ),
    [...frozenPaths].sort(),
  );
  await verifyLegacyDependencyClosure(projectRoot, manifest);
}

export async function verifyPayloadFreeServiceTaskPreservation(
  projectRoot: string,
): Promise<void> {
  const profilePath =
    "profiles/cibseven-2.2.0-service-task-effect-draft/profile.json";
  const bpmnPath = "scenarios/service-task-effect/process.bpmn";
  const scenarioPath = "scenarios/service-task-effect/scenario.json";
  const evidencePath = "scenarios/service-task-effect/cibseven-evidence.json";
  const [baselineProfile, currentProfile, baselineBpmn, currentBpmn] =
    await Promise.all([
      Promise.resolve(readLegacyBytes(projectRoot, profilePath)),
      readFile(path.join(projectRoot, profilePath)),
      Promise.resolve(readLegacyBytes(projectRoot, bpmnPath)),
      readFile(path.join(projectRoot, bpmnPath)),
    ]);
  assert.ok(currentProfile.equals(baselineProfile), `${profilePath} changed`);
  assert.ok(currentBpmn.equals(baselineBpmn), `${bpmnPath} changed`);

  const baselineScenario = readLegacyBytes(projectRoot, scenarioPath);
  const scenarioValue = JSON.parse(baselineScenario.toString("utf8")) as {
    readonly bpmn: { readonly sha256: string };
  };
  const sourceIdentityEnd =
    `    "sha256": "${scenarioValue.bpmn.sha256}"\n  }`;
  const expectedScenario = Buffer.from(replaceExactlyOnce(
    baselineScenario.toString("utf8"),
    sourceIdentityEnd,
    `    "sha256": "${scenarioValue.bpmn.sha256}",\n` +
      "    \"sourceOverlay\": null\n  }",
    scenarioPath,
  ));
  const currentScenario = await readFile(path.join(projectRoot, scenarioPath));
  assert.ok(
    currentScenario.equals(expectedScenario),
    `${scenarioPath} changed outside the approved sourceOverlay field`,
  );

  const baselineEvidence = readLegacyBytes(projectRoot, evidencePath);
  const baselineScenarioSha256 = sha256(baselineScenario);
  const expectedScenarioSha256 = sha256(expectedScenario);
  const expectedEvidence = Buffer.from(replaceExactlyOnce(
    baselineEvidence.toString("utf8"),
    baselineScenarioSha256,
    expectedScenarioSha256,
    evidencePath,
  ));
  const expectedEvidenceValue = JSON.parse(
    expectedEvidence.toString("utf8"),
  ) as unknown;
  addRequiredEmptyIncidentCollections(expectedEvidenceValue);
  const expectedCurrentEvidence = Buffer.from(
    `${JSON.stringify(expectedEvidenceValue, null, 2)}\n`,
  );
  const currentEvidence = await readFile(path.join(projectRoot, evidencePath));
  assert.ok(
    currentEvidence.equals(expectedCurrentEvidence),
    `${evidencePath} changed outside the approved scenario digest rebinding and required empty incident collections`,
  );
}

function addRequiredEmptyIncidentCollections(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      addRequiredEmptyIncidentCollections(item);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  for (const nested of Object.values(record)) {
    addRequiredEmptyIncidentCollections(nested);
  }
  if (
    record.kind === "state" &&
    Array.isArray(record.openEffects) &&
    !("openIncidents" in record)
  ) {
    const reordered: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      reordered[key] = nested;
      if (key === "openEffects") {
        reordered.openIncidents = [];
      }
    }
    for (const key of Object.keys(record)) {
      delete record[key];
    }
    Object.assign(record, reordered);
  }
}

async function verifyLegacyDependencyClosure(
  projectRoot: string,
  manifest: LegacyManifest,
): Promise<void> {
  const baselinePaths = new Set(
    execFileSync("git", ["ls-tree", "-r", "--name-only", legacyTarget], {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    }).split("\n").filter(Boolean),
  );
  const inventory = JSON.parse(
    await readFile(path.join(projectRoot, legacyInventoryPath), "utf8"),
  ) as LegacyInventory;
  const declared = new Set(
    manifest.entries.map(({ originalPath }) => originalPath),
  );
  const visited = new Set<string>();
  const cache = new Map<string, string>();
  const required = new Set<string>(legacyAdoptionEntryRoots);
  for (const relativePath of baselinePaths) {
    if (
      legacyEvidenceRoots.some((root) => relativePath.startsWith(root)) &&
      isLegacySpecific(
        relativePath,
        legacySource(projectRoot, relativePath, cache),
        inventory.decisions,
      )
    ) {
      required.add(relativePath);
    }
  }
  const pending = [...required];

  while (pending.length > 0) {
    const relativePath = pending.pop();
    if (relativePath === undefined || visited.has(relativePath)) {
      continue;
    }
    visited.add(relativePath);
    const source = legacySource(projectRoot, relativePath, cache);
    for (const dependency of baselineDependencies(
      relativePath,
      source,
      baselinePaths,
      projectRoot,
      cache,
    )) {
      if (
        !visited.has(dependency) &&
        (required.has(dependency) || isLegacySpecific(
          dependency,
          legacySource(projectRoot, dependency, cache),
          inventory.decisions,
        ))
      ) {
        required.add(dependency);
        pending.push(dependency);
      }
    }
  }

  const missing = [...required].filter((relativePath) =>
    !declared.has(relativePath)
  ).sort();
  assert.deepEqual(
    missing,
    [],
    `A12-specific dependencies are absent from ${legacyManifestPath}`,
  );
}

function baselineDependencies(
  relativePath: string,
  source: string,
  baselinePaths: ReadonlySet<string>,
  projectRoot: string,
  cache: Map<string, string>,
): ReadonlyArray<string> {
  const dependencies = new Set<string>();
  if (/\.(?:[cm]?[jt]sx?)$/u.test(relativePath)) {
    const specifierPattern =
      /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/gu;
    for (const match of source.matchAll(specifierPattern)) {
      const specifier = match[1];
      if (specifier === undefined) {
        continue;
      }
      const resolved = resolveModule(relativePath, specifier, baselinePaths);
      if (resolved !== null) {
        dependencies.add(resolved);
      }
    }
  } else if (relativePath.endsWith(".lean")) {
    for (const match of source.matchAll(/^import\s+([A-Za-z0-9_.]+)$/gmu)) {
      const moduleName = match[1];
      if (moduleName === undefined) {
        continue;
      }
      const candidate = `${moduleName.replaceAll(".", "/")}.lean`;
      if (baselinePaths.has(candidate)) {
        dependencies.add(candidate);
      }
    }
  } else if (relativePath.endsWith(".java")) {
    const directory = path.posix.dirname(relativePath);
    for (const candidate of baselinePaths) {
      if (
        candidate !== relativePath &&
        candidate.startsWith(`${directory}/`) &&
        path.posix.dirname(candidate) === directory &&
        candidate.endsWith(".java")
      ) {
        const className = path.posix.basename(candidate, ".java");
        if (new RegExp(`\\b${className}\\b`, "u").test(source)) {
          legacySource(projectRoot, candidate, cache);
          dependencies.add(candidate);
        }
      }
    }
  }
  return [...dependencies];
}

function resolveModule(
  ownerPath: string,
  specifier: string,
  baselinePaths: ReadonlySet<string>,
): string | null {
  const packageEntryPoints: Readonly<Record<string, string>> = {
    "@bpmn-lean/bpmn-source": "packages/bpmn-source/src/index.ts",
    "@bpmn-lean/semantic-core": "packages/semantic-core/src/index.ts",
    "@bpmn-lean/temporal-adapter": "packages/temporal-adapter/src/index.ts",
  };
  if (specifier in packageEntryPoints) {
    return packageEntryPoints[specifier] ?? null;
  }
  if (!specifier.startsWith(".")) {
    return null;
  }
  const joined = path.posix.normalize(
    path.posix.join(path.posix.dirname(ownerPath), specifier),
  );
  const candidates = [
    joined,
    joined.replace(/\.js$/u, ".ts"),
    `${joined}.ts`,
    `${joined}.tsx`,
    `${joined}.js`,
    `${joined}.json`,
    `${joined}/index.ts`,
  ];
  return candidates.find((candidate) => baselinePaths.has(candidate)) ?? null;
}

function isLegacySpecific(
  relativePath: string,
  source: string,
  decisions: ReadonlyArray<string>,
): boolean {
  return (
    /(?:^|\/)(?:a12|create-document|boundary-error)/iu.test(relativePath) ||
    /CibSeven(?:CreateDocument|BoundaryError)/u.test(relativePath) ||
    decisions.some((decision) =>
      !contextualLegacyDecisions.has(decision) && source.includes(decision)
    )
  );
}

function legacySource(
  projectRoot: string,
  relativePath: string,
  cache: Map<string, string>,
): string {
  const cached = cache.get(relativePath);
  if (cached !== undefined) {
    return cached;
  }
  const source = readLegacyBytes(projectRoot, relativePath).toString("utf8");
  cache.set(relativePath, source);
  return source;
}

function readLegacyBytes(projectRoot: string, relativePath: string): Buffer {
  return execFileSync("git", ["show", `${legacyTarget}:${relativePath}`], {
    cwd: projectRoot,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function recursiveFiles(
  projectRoot: string,
  root: string,
): Promise<ReadonlyArray<string>> {
  const found: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        found.push(
          path.relative(projectRoot, absolutePath).split(path.sep).join("/"),
        );
      }
    }
  }
  await visit(root);
  return found.sort();
}

function replaceExactlyOnce(
  source: string,
  target: string,
  replacement: string,
  ownerPath: string,
): string {
  const first = source.indexOf(target);
  if (first < 0 || source.indexOf(target, first + target.length) >= 0) {
    throw new Error(`${ownerPath} does not contain exactly one approved replacement`);
  }
  return source.slice(0, first) + replacement + source.slice(first + target.length);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
