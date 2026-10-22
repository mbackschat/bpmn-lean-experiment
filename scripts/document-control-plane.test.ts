import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AreaId,
  assertDetailImplementationMap,
  assertNoImplementationMapCount,
  assertPlanControlPlane,
  assertRootImplementationMap,
  assertTrackedPathRoutes,
  documentRouting,
  documentSection,
  parseOrderedWork,
  planGateTokenFindings,
  planReviewOwnerPaths,
  planReviewRoutingFindings,
  planReviewRestatementFindings,
  perFileSourceMapTrees,
  routeImplementationPath,
  reviewedPlanWordBudget,
  unclaimedSourceOwners,
  wordCount,
} from "./document-control-plane.ts";
import {
  ReviewStage,
  reviewReceiptOrNull,
  receiptRow,
} from "./independent-review-receipt.ts";
import {
  parseImplementationMapDirectory,
  validateStructuralMapRoutes,
  type ImplementationMapDirectoryEntry,
} from "./structural-map-routes.ts";
import { assuranceAssessmentFindings, assuranceChangedPaths, assuranceRegisterPath, parseAssuranceFindings } from "./assurance-register.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function maintainedMarkdownDocuments(root = projectRoot): Promise<ReadonlyMap<string, string>> {
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.md"],
    { cwd: root, encoding: "utf8" },
  ).split("\0").filter((file) =>
    file !== "" &&
    !file.startsWith("docs/archived/") &&
    !file.startsWith("docs/reference/")
  );
  const documents = await Promise.all(paths.map(async (file): Promise<readonly [string, string] | null> => {
    const absolute = path.join(root, file);
    try {
      if ((await lstat(absolute)).isSymbolicLink()) return null;
      return [file, await readFile(absolute, "utf8")] as const;
    } catch (cause) {
      // Git's --cached list retains unstaged removals; either filesystem read may find them absent.
      if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return null;
      throw cause;
    }
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

test("selected changed owners cannot omit assurance trigger assessment before or after commit", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  const register = await readFile(path.join(projectRoot, assuranceRegisterPath), "utf8");
  assert.deepEqual(assuranceAssessmentFindings(
    plan, assertPlanControlPlane(plan), parseAssuranceFindings(register), assuranceChangedPaths(projectRoot, plan),
  ), []);
});

test("the plan never restates a review state its receipt owns", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  const resume = documentSection(plan, "Exact resume point");
  const owners = await Promise.all(
    planReviewOwnerPaths(resume).map(async (relative) => {
      const documentPath = path.join("docs", relative);
      const document = await readFile(path.join(projectRoot, documentPath), "utf8");
      const receipt = reviewReceiptOrNull(document, documentPath);
      if (receipt === null) return [];
      const row = receiptRow(
        receipt,
        ReviewStage.Proposal,
        documentPath,
      );
      return [{ path: documentPath, verdict: row.verdict, target: row.target }];
    }),
  );
  assert.deepEqual(planReviewRoutingFindings(resume, owners.flat()), []);
  assert.deepEqual(planReviewRestatementFindings(resume, owners.flat()), []);
});

test("resume routes preserve pre-policy exemptions without excusing required or malformed receipts", () => {
  for (const documentPath of [
    "docs/TESTING-SPEC.md",
    "docs/SEMANTIC-PROCESS-IL-SPEC.md",
  ]) {
    assert.equal(reviewReceiptOrNull("# Contract\n", documentPath), null);
  }
  assert.throws(
    () => reviewReceiptOrNull("# Contract\n", "docs/capsules/NEW-CONTRACT-SPEC.md"),
    /must contain.*receipt/u,
  );
  assert.throws(
    () => reviewReceiptOrNull(
      "## Independent cold-review receipt\n",
      "docs/capsules/NEW-CONTRACT-SPEC.md",
    ),
    /three review stages/u,
  );
  assert.deepEqual(
    planReviewRoutingFindings("Next action: obtain the cold review.", []),
    ["resume point names review work but routes to no governed review owner"],
  );
});

test("rejects a stale review state and a misplaced gate token", () => {
  const settled = [{
    path: "docs/EXAMPLE-PROPOSAL.md",
    verdict: "approve-with-required-edits",
    target: "0123abc",
  }];
  assert.deepEqual(
    planReviewRestatementFindings("Next action: the second audit round is outstanding.", settled),
    [
      'resume point calls review work "outstanding" while docs/EXAMPLE-PROPOSAL.md records `approve-with-required-edits` at `0123abc`',
    ],
  );
  assert.deepEqual(
    planReviewRestatementFindings("Next action: obtain the required cold review before implementing.", settled),
    [],
    "instructing that a review be obtained is a next action, not a restated state",
  );
  assert.deepEqual(
    planReviewRestatementFindings("Next action: the audit is outstanding.", [{
      path: "docs/EXAMPLE-PROPOSAL.md",
      verdict: "pending",
      target: "not-recorded",
    }]),
    [],
    "an unsettled receipt and a pending plan agree",
  );
  assert.deepEqual(
    planReviewOwnerPaths(
      "Next action: see [decisions](RUNTIME-STATE-INVARIANT-PROPOSAL.md#owner-decisions) and [spec](capsules/CALL-ACTIVITY-SPEC.md).",
    ),
    ["RUNTIME-STATE-INVARIANT-PROPOSAL.md", "capsules/CALL-ACTIVITY-SPEC.md"],
    "an anchored link routes to the same governed owner",
  );
  const plan = [
    "## Current checkpoint",
    "",
    "The `test:temporal` gate has not run.",
    "",
    "## Ordered work",
    "",
    "## Current evidence",
    "",
    "- Command: `env CI=true ./scripts/verify.sh`. Status: `exit 0`.",
    "",
    "## Exact resume point",
    "",
  ].join("\n");
  assert.deepEqual(planGateTokenFindings(plan), [
    "gate token `test:temporal` belongs in Current evidence, which owns the command and exit status",
  ]);
});

test("binds pending state to review work rather than unrelated verification or runtime work", () => {
  const settled = [{ path: "docs/EXAMPLE-PROPOSAL.md", verdict: "approve", target: "0123abc" }];
  for (const resume of [
    "Complete Temporal verification is pending. Next action: obtain the closure review.",
    "A pending Timer survives replacement. The review receipt owns approval.",
    "The review is approved and verification remains outstanding.",
    "Awaiting package downloads before the cold review.",
    "The pending invoice-review model needs a retained fixture.",
    "Stop if a correction weakens guarantees or broadens an unreviewed profile.",
    "Do not publish unreviewed evidence. The proposal review receipt owns approval.",
  ]) assert.deepEqual(planReviewRestatementFindings(resume, settled), [], resume);
  for (const resume of [
    "The second audit round is outstanding.",
    "The closure review is still pending.",
    "Awaiting the required cold review.",
    "A pending independent audit blocks closure.",
    "Review: pending.",
    "The proposal remains unreviewed.",
    "An unreviewed proposal blocks implementation.",
    "The implementation is currently unreviewed.",
  ]) assert.equal(planReviewRestatementFindings(resume, settled).length, 1, resume);
});

test("requires a governed owner only when the resume point names review work", () => {
  assert.deepEqual(
    planReviewRoutingFindings(
      "Next action: generate an evidence vector from existing owners.",
      [],
    ),
    [],
  );
  assert.deepEqual(
    planReviewRoutingFindings(
      "Next action: obtain the required cold review before implementation.",
      [],
    ),
    ["resume point names review work but routes to no governed review owner"],
  );
  assert.deepEqual(
    planReviewRoutingFindings(
      "Next action: obtain the required cold review before implementation.",
      [{ path: "docs/EXAMPLE-PROPOSAL.md", verdict: "approve", target: "0123abc" }],
    ),
    [],
  );
  // A hyphenated compound is not review work: `\b` alone matches inside `invoice-review`.
  assert.deepEqual(
    planReviewRoutingFindings(
      "Next action: register the invoice-review model and its peer-reviewed corpus row.",
      [],
    ),
    [],
  );
});

test("uses only structural implementation-map routes across maintained Markdown", async () => {
  assert.deepEqual(validateStructuralMapRoutes(await maintainedMarkdownDocuments()), []);
});

for (const change of ["rename", "delete"] as const) {
  test(`Markdown inventory tolerates an unstaged tracked ${change} and retains pending documents`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "bpmn-markdown-inventory-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    execFileSync("git", ["init", "--quiet", root]);
    const old = path.join(root, "OLD-PROPOSAL.md");
    await writeFile(old, "old contract\n");
    await writeFile(path.join(root, "README.md"), "registry\n");
    execFileSync("git", ["add", "OLD-PROPOSAL.md", "README.md"], { cwd: root });
    await writeFile(path.join(root, "PENDING-PROPOSAL.md"), "pending contract\n");
    await symlink("README.md", path.join(root, "ALIAS.md"));
    const expected = new Map([
      ["README.md", "registry\n"],
      ["PENDING-PROPOSAL.md", "pending contract\n"],
    ]);
    switch (change) {
      case "rename":
        await rename(old, path.join(root, "NEW-SPEC.md"));
        expected.set("NEW-SPEC.md", "old contract\n");
        break;
      case "delete":
        await rm(old);
        break;
    }
    assert.deepEqual(await maintainedMarkdownDocuments(root), expected);
  });
}

test("Markdown inventory propagates a non-missing read failure", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "bpmn-markdown-read-error-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", root]);
  const document = path.join(root, "README.md");
  await writeFile(document, "registry\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  await rm(document);
  await mkdir(document);
  await assert.rejects(maintainedMarkdownDocuments(root), { code: "EISDIR" });
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

test("routes the nested scope-data artifacts to the data-flow family map beside their tree owner", () => {
  for (const [file, owner] of [
    ["BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean", AreaId.EngineRuntimeProof],
    ["BpmnSemantics/NestedScopeDataConformance.lean", AreaId.EngineRuntimeProof],
    ["scenarios/nested-embedded-scope-data/README.md", AreaId.AssuranceAdoption],
    ["BpmnSemantics/SemanticProcess/CallVariableMappingLaws.lean", AreaId.EngineRuntimeProof],
    ["BpmnSemantics/CallVariableMappingConformance.lean", AreaId.EngineRuntimeProof],
    ["scenarios/call-variable-mapping/README.md", AreaId.AssuranceAdoption],
    ["profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json", AreaId.EngineContractsSource],
  ] as const) assert.deepEqual(routeImplementationPath(file), [owner, AreaId.EngineDataFamily], file);
  for (const [file, owner] of [
    ["BpmnSemantics/SemanticProcess/ScopedData.lean", AreaId.EngineRuntimeProof],
    ["BpmnSemantics/NestedScopeDataLaws.lean", AreaId.EngineRuntimeProof],
    ["scenarios/activity-data-input-user-task/README.md", AreaId.AssuranceAdoption],
    ["profiles/bpmn-2.0.2-activity-data-input-output-user-task-draft/profile.json", AreaId.EngineContractsSource],
  ] as const) assert.deepEqual(routeImplementationPath(file), [owner], file);
});

/**
 * AA-16 oracle: a `docs/` path routes to the detail maps that link it, so session start loads the
 * subject's owners instead of every map. Fixtures vary only the link topology; the area directory is
 * the real root table because the area set is fixed by `AreaId`.
 */
async function routingFixture(linksByArea: Partial<Record<AreaId, string>>, activeMaps: ReadonlyArray<AreaId>) {
  const rootMap = await readFile(path.join(projectRoot, "docs/IMPLEMENTATION-MAP.md"), "utf8");
  const { directory } = parseImplementationMapDirectory(rootMap);
  const documents = new Map<string, string>();
  for (const [id, entry] of directory) documents.set(entry.path, linksByArea[id as AreaId] ?? "No links.\n");
  const activeLinks = activeMaps.map((id) => `[map](${path.posix.basename(directory.get(id)?.path ?? "")})`).join(", ");
  documents.set(
    "docs/PLAN.md",
    `## Ordered work\n\n1. \`ACTIVE-ITEM\` · **active** · Owner: [owner](OWNER.md) · Maps: ${activeLinks} · Action: proceed\n`,
  );
  return { directory: directory as ReadonlyMap<string, ImplementationMapDirectoryEntry>, routing: documentRouting(directory, documents) };
}

test("routes a docs path to the detail maps that link it and keeps all-map routing for an unlinked one", async () => {
  const { routing } = await routingFixture({
    [AreaId.EngineRuntimeProof]: "[single](SINGLE.md) [shared](capsules/SHARED.md#anchor) [code](../scripts/x.ts) [web](https://example.org/WEB.md)\n",
    [AreaId.BpmPlatform]: "[shared](capsules/SHARED.md) [self-link](BPM-PLATFORM-IMPLEMENTATION-MAP.md)\n",
  }, [AreaId.TemporalHosting]);
  assert.deepEqual(routeImplementationPath("docs/SINGLE.md", routing), [AreaId.EngineRuntimeProof]);
  assert.deepEqual(routeImplementationPath("docs/capsules/SHARED.md", routing), [
    AreaId.EngineRuntimeProof,
    AreaId.BpmPlatform,
  ]);
  assert.deepEqual(routeImplementationPath("docs/UNLINKED.md", routing), Object.values(AreaId));
  assert.deepEqual(routeImplementationPath("docs/WEB.md", routing), Object.values(AreaId), "an external URL links nothing");
  assert.deepEqual(routeImplementationPath("docs/UNLINKED.md"), Object.values(AreaId), "without routing evidence routing stays conservative");
});

test("routes a detail map to itself and the plan and router to the active item's maps", async () => {
  const { directory, routing } = await routingFixture({
    [AreaId.EngineRuntimeProof]: "[other map](TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md)\n",
  }, [AreaId.EngineContractsSource, AreaId.AssuranceAdoption]);
  const temporal = directory.get(AreaId.TemporalHosting)?.path;
  assert.ok(temporal !== undefined);
  assert.deepEqual(routeImplementationPath(temporal, routing), [AreaId.TemporalHosting], "a map linked by another map still routes to itself");
  for (const file of ["docs/PLAN.md", "docs/IMPLEMENTATION-MAP.md"]) {
    assert.deepEqual(routeImplementationPath(file, routing), [AreaId.EngineContractsSource, AreaId.AssuranceAdoption], file);
  }
  assert.deepEqual(routeImplementationPath("scripts/what-binds.ts", routing), [AreaId.AssuranceAdoption], "code routing ignores link evidence");
});

test("the repository routes every docs path to a subset of areas and its own maps and plan narrowly", async () => {
  const documents = await maintainedMarkdownDocuments();
  const rootMap = documents.get("docs/IMPLEMENTATION-MAP.md") ?? "";
  const { directory } = parseImplementationMapDirectory(rootMap);
  const routing = documentRouting(directory, documents);
  const active = parseOrderedWork(documents.get("docs/PLAN.md") ?? "").filter((entry) => entry.state === "active");
  assert.equal(active.length, 1);
  assert.deepEqual(
    routeImplementationPath("docs/PLAN.md", routing).map((id) => directory.get(id)?.path).sort(),
    active[0]?.detailMaps.map((destination) => path.posix.join("docs", destination)).sort(),
  );
  for (const [id, entry] of directory) assert.deepEqual(routeImplementationPath(entry.path, routing), [id]);
  assertTrackedPathRoutes([...documents.keys()].filter((file) => file.startsWith("docs/")), routing);
});

test("the router prose states no map count", async () => {
  const rootMap = await readFile(path.join(projectRoot, "docs/IMPLEMENTATION-MAP.md"), "utf8");
  for (const seeded of ["all six maps", "all 7 detail maps", "Seven maps route here."]) {
    assert.throws(
      () => assertRootImplementationMap(rootMap.replace("Cross-area invariants\n", `Cross-area invariants\n\n${seeded}\n`)),
      /map count/u,
      seeded,
    );
  }
});

test("the documentation-discipline introduction cannot duplicate the authoritative map population", async () => {
  const discipline = await readFile(path.join(projectRoot, "docs/DOC-DISCIPLINE.md"), "utf8");
  assertNoImplementationMapCount(documentSection(discipline, "Purpose and alignment"));
  for (const seeded of ["five cohesive detail maps", "seven detail implementation maps"]) {
    assert.throws(() => assertNoImplementationMapCount(seeded), /map count/u);
  }
});

test("the approved PLAN ceiling agrees with its policy and still rejects oversized task state", async () => {
  const plan = await readFile(path.join(projectRoot, "docs/PLAN.md"), "utf8");
  const discipline = await readFile(path.join(projectRoot, "docs/DOC-DISCIPLINE.md"), "utf8");
  const continuity = documentSection(discipline, "Specs and moving results");
  assert.match(continuity, new RegExp(`PLAN.md.*${reviewedPlanWordBudget.toLocaleString("en-US")}-word`));
  const oversized = plan.replace("## Current checkpoint\n", `## Current checkpoint\n\n${" excess".repeat(reviewedPlanWordBudget - wordCount(plan) + 1)}\n`);
  assert.throws(() => assertPlanControlPlane(oversized), /PLAN.md exceeds/u);
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
  const inactiveEntry = entries.find((entry) => entry.state !== "active");
  assert.ok(activeEntry !== undefined);
  assert.ok(inactiveEntry !== undefined);
  assert.throws(
    () => assertPlanControlPlane(plan.replace(`\`${inactiveEntry.id}\` · **${inactiveEntry.state}**`, `\`${activeEntry.id}\` · **queued**`)),
    /duplicate work ID/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(`Active work ID: \`${activeEntry.id}\`.`, "Active work ID: `MISSING-WORK`.")),
    /resume work ID/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      new RegExp(
        `(\`${activeEntry.id}\` · \\*\\*active\\*\\*.+? · Maps: )(.+?)( · Action:)`,
        "u",
      ),
      "$1none$3",
    )),
    /route to at least one detail map/u,
  );
  assert.throws(
    () => assertPlanControlPlane(plan.replace(
      new RegExp(
        `(\`${activeEntry.id}\` · \\*\\*active\\*\\* · Owners?: ).+?( · Maps:)`,
        "u",
      ),
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

test("keeps delegated Timer scope in the semantic family detail map", async () => {
  const runtimeMap = await readFile(
    path.join(projectRoot, "docs/ENGINE-SEMANTIC-FAMILY-IMPLEMENTATION-MAP.md"),
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

test("a per-file source map reports the source files no row claims", () => {
  const sourceMap = [
    "| Source owner | Responsibility |",
    "|---|---|",
    "| [scenario.ts](src/scenario.ts) | Stable observation and scenario evaluation |",
    "| [stimulus.ts](src/stimulus.ts) | Stimulus validation |",
  ].join("\n");

  assert.deepEqual(
    unclaimedSourceOwners(sourceMap, [
      "src/scenario.ts",
      "src/parallel-multi-instance-controller.ts",
      "src/stimulus.ts",
    ]),
    ["src/parallel-multi-instance-controller.ts"],
  );
  assert.deepEqual(unclaimedSourceOwners(sourceMap, ["src/scenario.ts", "src/stimulus.ts"]), []);
});

function sourceOwnerPaths(root: string, tree: string): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", `${tree}/src`],
    { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => path.relative(tree, file));
}

test("source-map coverage includes pending owners while excluding ignored outputs and tests", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "bpmn-source-map-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet", root]);
  await writeFile(path.join(root, ".gitignore"), "ignored.ts\n");
  for (const tree of ["packages/semantic-core", "packages/bpmn-source"]) {
    await mkdir(path.join(root, tree, "src"), { recursive: true });
    for (const name of ["tracked.ts", "pending.ts", "ignored.ts", "owner.test.ts"]) {
      await writeFile(path.join(root, tree, "src", name), "export {};\n");
    }
    execFileSync("git", ["add", `${tree}/src/tracked.ts`], { cwd: root });
    const owners = sourceOwnerPaths(root, tree).sort();
    assert.deepEqual(owners, ["src/pending.ts", "src/tracked.ts"], tree);
    assert.deepEqual(unclaimedSourceOwners("[tracked.ts](src/tracked.ts)", owners),
      ["src/pending.ts"], tree);
  }
});

test("the live corpus keeps every per-file source map complete", async () => {
  for (const tree of perFileSourceMapTrees) {
    const sourceMap = await readFile(path.join(projectRoot, tree, "SOURCE-MAP.md"), "utf8");
    const sources = sourceOwnerPaths(projectRoot, tree);

    assert.ok(sources.length > 0, `${tree} has no sources`);
    assert.deepEqual(
      unclaimedSourceOwners(sourceMap, sources),
      [],
      `${tree}/SOURCE-MAP.md assigns no responsibility to these sources`,
    );
  }
});
