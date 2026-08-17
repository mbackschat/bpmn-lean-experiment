import assert from "node:assert/strict";

export const AreaId = Object.freeze({
  EngineContractsSource: "ENGINE-CONTRACTS-SOURCE",
  EngineRuntimeProof: "ENGINE-RUNTIME-PROOF",
  TemporalHosting: "TEMPORAL-HOSTING",
  BpmPlatform: "BPM-PLATFORM",
  AssuranceAdoption: "ASSURANCE-ADOPTION",
} as const);

export type AreaId = (typeof AreaId)[keyof typeof AreaId];

export const detailMapContracts = [
  {
    id: AreaId.EngineContractsSource,
    state: "implemented",
    file: "ENGINE-CONTRACTS-AND-SOURCE-IMPLEMENTATION-MAP.md",
    label: "Engine contracts and source",
    sourceFamilies:
      "`contracts/`, `profiles/`, `packages/contract-types/`, `packages/bpmn-source/`, `packages/engine-api/`, routed `docs/` and root documentation",
  },
  {
    id: AreaId.EngineRuntimeProof,
    state: "implemented",
    file: "ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md",
    label: "Engine runtime and proof",
    sourceFamilies:
      "`BpmnSemantics/`, `packages/semantic-core/`, root Lean entry points, routed `docs/` and root documentation",
  },
  {
    id: AreaId.TemporalHosting,
    state: "active",
    file: "TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md",
    label: "Temporal hosting",
    sourceFamilies:
      "`packages/temporal-adapter/`, `packages/engine-api/`, `examples/temporal-mvp/`, deployment roots, routed `docs/` and root documentation",
  },
  {
    id: AreaId.BpmPlatform,
    state: "implemented",
    file: "BPM-PLATFORM-IMPLEMENTATION-MAP.md",
    label: "BPM platform",
    sourceFamilies:
      "`platform/`, `showcase/`, `workers/`, deployment roots, routed `docs/` and root documentation",
  },
  {
    id: AreaId.AssuranceAdoption,
    state: "implemented",
    file: "ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md",
    label: "Assurance and adoption",
    sourceFamilies:
      "`adoption/`, `model-corpus/`, `packages/differential/`, `runners/`, `scenarios/`, `scripts/`, root tooling, root Lean entry points, routed `docs/` and root documentation",
  },
] as const;

const detailMapFiles = new Set<string>(detailMapContracts.map((contract) => contract.file));
const allAreaIds = detailMapContracts.map((contract) => contract.id);

export function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

export function levelTwoHeadings(document: string): ReadonlyArray<string> {
  return [...document.matchAll(/^## (.+)$/gmu)].map((match) => match[1] ?? "");
}

function section(document: string, heading: string): string {
  const marker = `## ${heading}\n`;
  const start = document.indexOf(marker);
  assert.notEqual(start, -1, `missing ${marker.trim()}`);
  const bodyStart = start + marker.length;
  const end = document.indexOf("\n## ", bodyStart);
  return document.slice(bodyStart, end === -1 ? undefined : end).trim();
}

function linkedDetailMaps(value: string): ReadonlyArray<string> {
  return [...value.matchAll(/\]\(([^)#]+-IMPLEMENTATION-MAP\.md)(?:#[^)]+)?\)/gu)]
    .flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

export type OrderedWorkEntry = Readonly<{
  id: string;
  state: "active" | "queued" | "later";
  detailMaps: ReadonlyArray<string>;
}>;

export function parseOrderedWork(plan: string): ReadonlyArray<OrderedWorkEntry> {
  return section(plan, "Ordered work").split("\n").flatMap((line) => {
    const match = /^\d+\. `([A-Z][A-Z0-9-]*)` · \*\*(active|queued|later)\*\* · /u.exec(line);
    if (match === null) return [];
    const [, id, state] = match;
    assert.ok(id !== undefined && state !== undefined);
    const maps = linkedDetailMaps(line);
    assert.ok(maps.length > 0, `${id} must route to at least one detail map`);
    for (const map of maps) assert.ok(detailMapFiles.has(map), `${id} routes to unknown ${map}`);
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
    wordCount(section(plan, "Exact resume point")) <= 250,
    "the exact resume point exceeds its 250-word backstop",
  );
  const orderedWork = section(plan, "Ordered work");
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
    section(plan, "Exact resume point"),
    new RegExp("^Active work ID: `" + activeEntry.id + "`\\.$", "mu"),
    "resume work ID must equal the active ordered-work ID",
  );
  return activeEntry;
}

type RoutingRow = Readonly<{
  id: string;
  state: string;
  file: string;
  label: string;
  sourceFamilies: string;
}>;

export function parseRoutingRows(rootMap: string): ReadonlyArray<RoutingRow> {
  return section(rootMap, "Routing").split("\n").flatMap((line) => {
    if (!line.startsWith("| `")) return [];
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    assert.equal(cells.length, 4, `malformed routing row: ${line}`);
    const [idCell, stateCell, mapCell, sourceFamilies] = cells;
    const map = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(mapCell ?? "");
    assert.ok(map !== null, `malformed detail-map cell: ${mapCell}`);
    return [{
      id: (idCell ?? "").replaceAll("`", ""),
      state: (stateCell ?? "").replaceAll("`", ""),
      label: map[1] ?? "",
      file: map[2] ?? "",
      sourceFamilies: sourceFamilies ?? "",
    }];
  });
}

export function assertRootImplementationMap(rootMap: string): void {
  assert.deepEqual(levelTwoHeadings(rootMap), [
    "Current claim",
    "Routing",
    "Cross-area invariants",
  ]);
  assert.ok(wordCount(rootMap) <= 2000, "root implementation map exceeds 2,000 words");
  const rows = parseRoutingRows(rootMap);
  for (const line of section(rootMap, "Routing").split("\n").filter((candidate) => candidate.startsWith("|"))) {
    for (const cell of line.split("|").slice(1, -1)) {
      assert.ok(wordCount(cell) <= 32, `dense routing cell exceeds 32 words: ${cell}`);
    }
  }
  assert.deepEqual(
    rows,
    detailMapContracts.map((contract) => ({
      id: contract.id,
      state: contract.state,
      file: contract.file,
      label: contract.label,
      sourceFamilies: contract.sourceFamilies,
    })),
  );
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, "duplicate area ID");
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
    default:
      return [AreaId.AssuranceAdoption];
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

export function assertTrackedPathRoutes(paths: ReadonlyArray<string>): void {
  for (const file of paths) {
    const routes = routeImplementationPath(file);
    assert.ok(routes.length > 0, `${file} has no detail-map route`);
    assert.equal(new Set(routes).size, routes.length, `${file} has duplicate routes`);
    for (const route of routes) assert.ok(allAreaIds.includes(route), `${file} has unknown route ${route}`);
  }
}
