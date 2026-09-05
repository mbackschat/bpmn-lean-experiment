import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const matrixOwner = "docs/capsules/ACTIVITY-DATA-INPUT-OUTPUT-MEDIATION-PROPOSAL.md";
const operationFamilyOwner = "docs/INTERNAL-COMMUTATION-PROPOSAL.md";
const typeScriptOperationOwner = "packages/semantic-core/src/semantic-process-contract.ts";
const leanOperationOwner = "BpmnSemantics/SemanticProcessContract.lean";

type ConsumerSource = Readonly<{
  path: string;
  source: string;
}>;

type CensusSources = Readonly<{
  matrix: string;
  operationFamilies: string;
  typeScriptOperations: string;
  leanOperations: string;
  consumers: ReadonlyArray<ConsumerSource>;
}>;

function read(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function productionConsumerSources(): ReadonlyArray<ConsumerSource> {
  return execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "BpmnSemantics.lean",
      "BpmnSemantics",
      "packages",
      "platform/contracts/src",
    ],
    { cwd: projectRoot, encoding: "utf8" },
  ).split("\n")
    .filter((relativePath) =>
      // TESTING-SPEC keeps Experiments separately gated; conformance modules are terminal witnesses,
      // not production readers of the closed operation union.
      (relativePath.endsWith(".ts") || relativePath.endsWith(".lean")) &&
      !relativePath.includes("/test/") &&
      !relativePath.includes("/Experiments/") &&
      !relativePath.endsWith("Conformance.lean")
    )
    .sort()
    .map((relativePath) => ({ path: relativePath, source: read(relativePath) }));
}

function liveSources(): CensusSources {
  return {
    matrix: read(matrixOwner),
    operationFamilies: read(operationFamilyOwner),
    typeScriptOperations: read(typeScriptOperationOwner),
    leanOperations: read(leanOperationOwner),
    consumers: productionConsumerSources(),
  };
}

function headingSection(source: string, heading: string): string {
  const marker = `### ${heading}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `absent heading: ${heading}`);
  const bodyStart = start + marker.length;
  const next = source.indexOf("\n### ", bodyStart);
  return source.slice(bodyStart, next === -1 ? source.length : next);
}

function braceSpan(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `absent: ${marker}`);
  const openIndex = source.indexOf("{", markerIndex + marker.length);
  assert.notEqual(openIndex, -1, `no opening brace after: ${marker}`);
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return source.slice(openIndex + 1, index);
  }
  return assert.fail(`unbalanced: ${marker}`);
}

function typeScriptOperationKinds(source: string): ReadonlySet<string> {
  return new Set(
    [...braceSpan(source, "export enum SemanticOperationKind").matchAll(
      /^\s*[A-Z][A-Za-z0-9]+\s*=\s*"([a-z][A-Za-z0-9]+)",?$/gmu,
    )].flatMap((match) => match[1] === undefined ? [] : [match[1]]),
  );
}

function leanOperationKinds(source: string): ReadonlySet<string> {
  const marker = "inductive SemanticOperation where";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `absent: ${marker}`);
  const end = source.indexOf("\n  deriving", start + marker.length);
  assert.notEqual(end, -1, `absent deriving clause for: ${marker}`);
  return new Set(
    [...source.slice(start + marker.length, end).matchAll(
      /^\s*\|\s+([a-z][A-Za-z0-9]+)/gmu,
    )].flatMap((match) => match[1] === undefined ? [] : [match[1]]),
  );
}

function classifiedOperationKinds(source: string): ReadonlySet<string> {
  return new Set(
    [...headingSection(source, "Complete operation-family census").matchAll(
      /`([a-z][A-Za-z0-9]+)`/gu,
    )].flatMap((match) => match[1] === undefined ? [] : [match[1]]),
  );
}

function classifiedConsumerPaths(source: string): ReadonlySet<string> {
  const classified = new Set<string>();
  for (const line of headingSection(
    source,
    "Complete operation-variant producer/consumer matrix",
  ).split("\n")) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells[0] === "Boundary") continue;
    const disposition = cells[2] ?? "";
    assert.match(disposition, /^(?:Change|No change)(?::| )/u, `unclassified matrix row: ${line}`);
    for (const match of (cells[1] ?? "").matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/gu)) {
      const target = match[1];
      if (target === undefined) continue;
      classified.add(path.posix.normalize(path.posix.join("docs/capsules", target)));
    }
  }
  assert.ok(classified.size > 0, "consumer matrix is empty");
  return classified;
}

function isComposedActivityDataConsumer(source: ConsumerSource): boolean {
  if (source.path.endsWith(".lean")) {
    return (
      source.source.includes(".awaitDataInputUserTask") &&
      source.source.includes(".awaitDataOutputUserTask")
    ) || (
      source.source.includes(".dataInputUserTask") &&
      source.source.includes(".dataOutputUserTask")
    );
  }
  return (
    source.source.includes("SemanticOperationKind.AwaitDataInputUserTask") &&
    source.source.includes("SemanticOperationKind.AwaitDataOutputUserTask")
  ) || (
    source.source.includes("CheckedNodeKind.DataInputUserTask") &&
    source.source.includes("CheckedNodeKind.DataOutputUserTask")
  );
}

function setDifference(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): ReadonlyArray<string> {
  return [...left].filter((value) => !right.has(value)).sort();
}

function consumerCensusFindings(sources: CensusSources): ReadonlyArray<string> {
  const findings: string[] = [];
  const typeScript = typeScriptOperationKinds(sources.typeScriptOperations);
  const lean = leanOperationKinds(sources.leanOperations);
  const classifiedOperations = classifiedOperationKinds(sources.operationFamilies);
  const classifiedConsumers = classifiedConsumerPaths(sources.matrix);

  for (const operation of setDifference(typeScript, lean)) {
    findings.push(`TypeScript operation absent from Lean: ${operation}`);
  }
  for (const operation of setDifference(lean, typeScript)) {
    findings.push(`Lean operation absent from TypeScript: ${operation}`);
  }
  for (const operation of setDifference(typeScript, classifiedOperations)) {
    findings.push(`TypeScript operation absent from family census: ${operation}`);
  }
  for (const operation of setDifference(lean, classifiedOperations)) {
    findings.push(`Lean operation absent from family census: ${operation}`);
  }
  for (const consumer of sources.consumers.filter(isComposedActivityDataConsumer)) {
    if (!classifiedConsumers.has(consumer.path)) {
      findings.push(`unclassified composed Activity-data consumer: ${consumer.path}`);
    }
  }
  return findings.sort();
}

test("keeps the composed Activity-data consumer matrix complete", () => {
  assert.deepEqual(consumerCensusFindings(liveSources()), []);
});

test("rejects a composed Activity-data consumer absent from the implementation matrix", () => {
  const sources = liveSources();
  const consumers = [...sources.consumers, {
    path: "packages/semantic-core/src/synthetic-consumer.ts",
    source: "case SemanticOperationKind.AwaitDataInputUserTask:\ncase SemanticOperationKind.AwaitDataOutputUserTask:\n",
  }];

  assert.ok(
    consumerCensusFindings({ ...sources, consumers }).includes(
      "unclassified composed Activity-data consumer: packages/semantic-core/src/synthetic-consumer.ts",
    ),
  );
});

test("rejects an operation added to both semantic accounts without family classification", () => {
  const sources = liveSources();
  const typeScriptOperations = sources.typeScriptOperations.replace(
    "export enum SemanticOperationKind {",
    "export enum SemanticOperationKind {\n  SyntheticOperation = \"syntheticOperation\",",
  );
  const leanOperations = sources.leanOperations.replace(
    "inductive SemanticOperation where",
    "inductive SemanticOperation where\n  | syntheticOperation",
  );

  const findings = consumerCensusFindings({
    ...sources,
    typeScriptOperations,
    leanOperations,
  });
  assert.ok(findings.includes(
    "TypeScript operation absent from family census: syntheticOperation",
  ));
  assert.ok(findings.includes(
    "Lean operation absent from family census: syntheticOperation",
  ));
});
