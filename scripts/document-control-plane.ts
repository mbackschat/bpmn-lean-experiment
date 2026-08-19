import assert from "node:assert/strict";

import { scanMarkdownLinks } from "./markdown-link-lexer.ts";
import {
  parseImplementationMapDirectory,
  type ImplementationMapDirectoryEntry,
} from "./structural-map-routes.ts";

export const AreaId = Object.freeze({
  EngineContractsSource: "ENGINE-CONTRACTS-SOURCE",
  EngineRuntimeProof: "ENGINE-RUNTIME-PROOF",
  TemporalHosting: "TEMPORAL-HOSTING",
  BpmPlatform: "BPM-PLATFORM",
  AssuranceAdoption: "ASSURANCE-ADOPTION",
} as const);

export type AreaId = (typeof AreaId)[keyof typeof AreaId];

export const allAreaIds: ReadonlyArray<AreaId> = Object.freeze(Object.values(AreaId));

export function assertCanonicalRepositoryPath(file: string): void {
  const segments = file.split("/");
  if (
    file === "" || file.startsWith("/") || /^[A-Za-z]:\//u.test(file) ||
    file.includes("\\") || /[\0\r\n]/u.test(file) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) throw new Error(`not a canonical repository-relative path: ${file}`);
}

export function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

export function levelTwoHeadings(document: string): ReadonlyArray<string> {
  return [...document.matchAll(/^## (.+)$/gmu)].map((match) => match[1] ?? "");
}

export function documentSection(document: string, heading: string): string {
  const marker = `## ${heading}\n`;
  const start = document.indexOf(marker);
  assert.notEqual(start, -1, `missing ${marker.trim()}`);
  const bodyStart = start + marker.length;
  const end = document.indexOf("\n## ", bodyStart);
  return document.slice(bodyStart, end === -1 ? undefined : end).trim();
}

export type OrderedWorkEntry = Readonly<{
  id: string;
  state: "active" | "queued" | "later";
  detailMaps: ReadonlyArray<string>;
}>;

export function parseOrderedWork(plan: string): ReadonlyArray<OrderedWorkEntry> {
  return documentSection(plan, "Ordered work").split("\n").flatMap((line) => {
    const match = /^\d+\. `([A-Z][A-Z0-9-]*)` · \*\*(active|queued|later)\*\* · Owners?: (.+?) · Maps?: (.+?) · Action: \S.+$/u.exec(line);
    if (match === null) return [];
    const [, id, state, ownerField = "", mapsField = ""] = match;
    assert.ok(id !== undefined && state !== undefined);
    assert.ok(scanMarkdownLinks(ownerField).length > 0, `${id} must name an owner link before its map routes`);
    const maps = scanMarkdownLinks(mapsField).map(({ destination }) => destination);
    assert.ok(maps.length > 0, `${id} must route to at least one detail map`);
    return [{ id, state: state as OrderedWorkEntry["state"], detailMaps: maps }];
  });
}

export function assertPlanControlPlane(plan: string): OrderedWorkEntry {
  assert.deepEqual(levelTwoHeadings(plan), [
    "Current checkpoint",
    "Ordered work",
    "Current evidence",
    "Exact resume point",
  ]);
  assert.ok(wordCount(plan) <= 2000, "PLAN.md exceeds its 2,000-word backstop");
  assert.ok(
    wordCount(documentSection(plan, "Exact resume point")) <= 250,
    "the exact resume point exceeds its 250-word backstop",
  );
  assert.match(
    documentSection(plan, "Current checkpoint"),
    /\[[^\]]+\]\([^)]+\)/u,
    "the current checkpoint needs an owner link",
  );
  const evidence = documentSection(plan, "Current evidence");
  const evidenceEntries = evidence.split("\n").filter((line) => line.startsWith("- "));
  assert.ok(evidenceEntries.length > 0, "current evidence needs at least one structured entry");
  assert.ok(evidenceEntries.length <= 2, "current evidence may contain at most two structured entries");
  assert.equal(
    evidence.split("\n").filter((line) => line.trim().length > 0).length,
    evidenceEntries.length,
    "current evidence contains unstructured narration",
  );
  for (const entry of evidenceEntries) {
    assert.match(entry, /Command: `[^`]+`/u, "current evidence entry needs a command");
    assert.match(entry, /Status: `exit \d+`/u, "current evidence entry needs an exit status");
    assert.match(entry, /Date: `\d{4}-\d{2}-\d{2}`/u, "current evidence entry needs a date");
    assert.match(entry, /Commit: `[0-9a-f]{7,40}`/u, "current evidence entry needs an immutable commit");
  }
  const orderedWork = documentSection(plan, "Ordered work");
  const numberedLines = orderedWork.split("\n").filter((line) => /^\d+\. /u.test(line));
  const entries = parseOrderedWork(plan);
  assert.equal(entries.length, numberedLines.length, "every ordered item must use the stable work contract");
  assert.doesNotMatch(orderedWork, /\*\*completed\*\*/u, "completed work must leave PLAN.md");
  assert.ok(entries.length > 0, "ordered work contains no stable work item");
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length, "duplicate work ID");
  const active = entries.filter((entry) => entry.state === "active");
  assert.equal(active.length, 1, "ordered work must contain exactly one active item");
  const activeEntry = active[0];
  assert.ok(activeEntry !== undefined);
  assert.match(
    documentSection(plan, "Exact resume point"),
    new RegExp("^Active work ID: `" + activeEntry.id + "`\\.$", "mu"),
    "resume work ID must equal the active ordered-work ID",
  );
  const resume = documentSection(plan, "Exact resume point");
  assert.match(resume, /^Next action: \S.+$/mu, "resume needs a concrete next action");
  assert.match(resume, /^Oracle: \S.+$/mu, "resume needs a required oracle");
  assert.match(resume, /^Stop if \S.+$/mu, "resume needs a genuine stop condition");
  // Placed last on purpose: a structural contract failure must be reported before a
  // content-placement finding, or this masks the message the hollow-contract fixtures assert.
  assert.deepEqual(planGateTokenFindings(plan), []);
  return activeEntry;
}

/**
 * Gate script tokens the plan may name only inside `## Current evidence`.
 *
 * That section carries the command, exit status, date, and commit contract, so a claim about a gate is
 * checkable there. The same token in the checkpoint narrative is an unowned copy, and the shape that
 * copy takes in practice is a negative claim about a gate that has not run yet, which the next
 * successful run silently falsifies.
 */
export function planGateTokenFindings(plan: string): ReadonlyArray<string> {
  const evidence = documentSection(plan, "Current evidence");
  const tokens = new Set(
    [...plan.matchAll(/`((?:test|check):[a-z0-9:-]+)`/gu)]
      .map((match) => match[1])
      .filter((token): token is string => token !== undefined),
  );
  return [...tokens]
    .filter((token) => !evidence.includes(`\`${token}\``))
    .map((token) =>
      `gate token \`${token}\` belongs in Current evidence, which owns the command and exit status`
    );
}

/** One governed document the plan links, paired with the review state its own receipt records. */
export type PlanReviewOwner = Readonly<{
  path: string;
  verdict: string;
  target: string;
}>;

/**
 * Governed review owners the resume point routes to, tolerating an anchor.
 *
 * The fragment is deliberately optional: a resume point that deep-links a document's decisions or
 * receipt section routes to the same owner, and a rule defeated by `#anchor` would report no owner and
 * pass vacuously. That is exactly what the anti-vacuity assertion beside this caught on its first run.
 */
export function planReviewOwnerPaths(resume: string): ReadonlyArray<string> {
  return [
    ...new Set(
      [...resume.matchAll(/\]\(([A-Za-z0-9./-]+-(?:PROPOSAL|SPEC)\.md)(?:#[A-Za-z0-9-]+)?\)/gu)]
        .map((match) => match[1])
        .filter((candidate): candidate is string => candidate !== undefined),
    ),
  ];
}

const settledReviewVerdicts = new Set(["approve", "approve-with-required-edits", "reject"]);
const pendingReviewWords = ["outstanding", "pending", "awaiting", "unreviewed"];

/**
 * The plan may not describe a review stage that a receipt already owns.
 *
 * A resume point may instruct that a review be obtained, because that is a next action. It may not
 * report the stage's state, because the receipt records that with an immutable target and the two
 * copies then drift in one direction only: the receipt advances and the plan keeps the sentence that
 * was true when it was written.
 */
export function planReviewRestatementFindings(
  resume: string,
  owners: ReadonlyArray<PlanReviewOwner>,
): ReadonlyArray<string> {
  return owners
    .filter((owner) =>
      settledReviewVerdicts.has(owner.verdict) && /^[0-9a-f]{7,40}$/u.test(owner.target)
    )
    .flatMap((owner) =>
      pendingReviewWords
        .filter((word) => new RegExp(`\\b${word}\\b`, "u").test(resume))
        .map((word) =>
          `resume point calls review work "${word}" while ${owner.path} records \`${owner.verdict}\` at \`${owner.target}\``
        )
    );
}

export function assertRootImplementationMap(rootMap: string): void {
  assert.deepEqual(levelTwoHeadings(rootMap), [
    "Current claim",
    "Routing",
    "Cross-area invariants",
  ]);
  assert.ok(wordCount(rootMap) <= 2000, "root implementation map exceeds 2,000 words");
  assert.ok(wordCount(documentSection(rootMap, "Current claim")) > 0, "current claim must not be empty");
  assert.ok(
    wordCount(documentSection(rootMap, "Cross-area invariants")) > 0,
    "cross-area invariants must not be empty",
  );
  const parsed = parseImplementationMapDirectory(rootMap);
  assert.deepEqual(parsed.errors, []);
  for (const line of documentSection(rootMap, "Routing").split("\n").filter((candidate) => candidate.startsWith("|"))) {
    for (const cell of line.split("|").slice(1, -1)) {
      assert.ok(wordCount(cell) <= 32, `dense routing cell exceeds 32 words: ${cell}`);
    }
  }
  assert.deepEqual([...parsed.directory.keys()].sort(), [...allAreaIds].sort());
}

export function assertDetailImplementationMap(
  file: string,
  document: string,
): void {
  const headings = levelTwoHeadings(document);
  const base = [
    "Current boundary",
    "Implemented",
    "Explicitly absent",
    "Evidence owners",
    "Nearest unsupported claims",
  ];
  let previous = -1;
  for (const heading of base) {
    const index = headings.indexOf(heading);
    assert.ok(index > previous, `${file} lacks ordered base section ${heading}`);
    previous = index;
  }
  assert.ok(wordCount(document) <= 4000, `${file} exceeds 4,000 words`);
}

function rootPathRoutes(file: string): ReadonlyArray<AreaId> {
  switch (file) {
    case "AGENTS.md":
    case "CLAUDE.md":
    case "README.md":
      return allAreaIds;
    case "BpmnSemantics.lean":
    case "lake-manifest.json":
    case "lakefile.toml":
    case "lean-toolchain":
      return [AreaId.EngineRuntimeProof, AreaId.AssuranceAdoption];
    case ".dockerignore":
    case "Dockerfile":
    case "compose.yaml":
      return [AreaId.TemporalHosting, AreaId.BpmPlatform];
    case ".gitignore":
    case ".node-version":
    case ".nvmrc":
    case "LICENSE":
    case "tsconfig.harness.json":
    case "tsconfig.platform-harness.json":
    case "tsconfig.platform-postgresql-harness.json":
      return [AreaId.AssuranceAdoption];
    case "package.json":
    case "pnpm-lock.yaml":
    case "pnpm-workspace.yaml":
      return allAreaIds;
    default:
      throw new Error(`unrouted root implementation-bearing path: ${file}`);
  }
}

function packageRoutes(pathParts: ReadonlyArray<string>): ReadonlyArray<AreaId> {
  switch (pathParts[1]) {
    case "bpmn-source":
    case "contract-types":
      return [AreaId.EngineContractsSource];
    case "semantic-core":
      return [AreaId.EngineRuntimeProof];
    case "differential":
      return [AreaId.AssuranceAdoption];
    case "engine-api":
      return [AreaId.EngineContractsSource, AreaId.TemporalHosting];
    case "temporal-adapter":
      return [AreaId.TemporalHosting];
    default:
      throw new Error(`unrouted workspace package path: ${pathParts.join("/")}`);
  }
}

export function routeImplementationPath(file: string): ReadonlyArray<AreaId> {
  assertCanonicalRepositoryPath(file);
  const pathParts = file.split("/");
  if (pathParts.length === 1) return rootPathRoutes(file);
  switch (pathParts[0]) {
    case ".github":
    case "adoption":
    case "model-corpus":
    case "runners":
    case "scenarios":
    case "scripts":
      return [AreaId.AssuranceAdoption];
    case "BpmnSemantics":
      return [AreaId.EngineRuntimeProof];
    case "contracts":
    case "profiles":
      return [AreaId.EngineContractsSource];
    case "deploy":
      return [AreaId.TemporalHosting, AreaId.BpmPlatform];
    case "docs":
      return allAreaIds;
    case "examples":
      return [AreaId.TemporalHosting];
    case "packages":
      return packageRoutes(pathParts);
    case "platform":
    case "showcase":
    case "workers":
      return [AreaId.BpmPlatform];
    default:
      throw new Error(`unrouted implementation-bearing path: ${file}`);
  }
}

export type ImplementationMapRoute = Readonly<{
  id: AreaId;
  file: string;
}>;

export function implementationMapRoutes(
  file: string,
  directory: ReadonlyMap<string, ImplementationMapDirectoryEntry>,
): ReadonlyArray<ImplementationMapRoute> {
  return routeImplementationPath(file).map((id) => {
    const entry = directory.get(id);
    assert.ok(entry !== undefined, `${file} has unknown route ${id}`);
    return { id, file: entry.path };
  });
}

export function assertTrackedPathRoutes(paths: ReadonlyArray<string>): void {
  for (const file of paths) {
    const routes = routeImplementationPath(file);
    assert.ok(routes.length > 0, `${file} has no detail-map route`);
    assert.equal(new Set(routes).size, routes.length, `${file} has duplicate routes`);
    for (const route of routes) assert.ok(allAreaIds.includes(route), `${file} has unknown route ${route}`);
  }
}
