import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  muePreviewBetaCheckpoints,
} from "../platform/apps/web/src/mue-preview-beta-checkpoints.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const expectedCheckpoints = [
  {
    id: "SEQUENTIAL-MULTI-INSTANCE",
    title: "Sequential Multi-Instance",
    evidenceKind: "productionJourney",
    productSurface: "Operations",
    boundary: "Closure-reviewed bounded natural and Timer-interrupted Sequential Multi-Instance journey",
    remainingLimit: "broader Multi-Instance behavior remains outside the slice.",
  },
  {
    id: "INTERNAL-COMMUTATION",
    title: "Internal Commutation",
    evidenceKind: "reviewedCheckpointOnly",
    productSurface: "None",
    boundary: "Approved first green final-implementation semantic checkpoint",
    remainingLimit: "scheduled-mode admission, region footprints, and arbitrary-batch theorem remain open.",
  },
  {
    id: "PARALLEL-MULTI-INSTANCE",
    title: "Parallel Multi-Instance",
    evidenceKind: "registeredExecutableCapability",
    productSurface: "About",
    boundary: "Closure-reviewed bounded parallel User Task capability",
    remainingLimit: "no dedicated Product 2 journey is claimed.",
  },
  {
    id: "MECHANISM-MATURITY-EVIDENCE",
    title: "Mechanism Maturity Evidence",
    evidenceKind: "generatedEvidence",
    productSurface: "About",
    boundary: "Complete generated family vector with separate dimensions",
    remainingLimit: "it is not a support percentage or semantic capability.",
  },
  {
    id: "DATA-AND-TASK-MECHANISMS",
    title: "Data and Task Mechanisms",
    evidenceKind: "registeredExecutableCapability",
    productSurface: "About",
    boundary: "Closure-reviewed direct Activity input and output slices",
    remainingLimit: "no Work form or browser data-editing workflow is claimed.",
  },
  {
    id: "EVENT-SUBSCRIPTIONS",
    title: "Event Subscriptions",
    evidenceKind: "productionJourney",
    productSurface: "Definitions / Triggers",
    boundary: "Closure-reviewed one-key definition-scoped Message correlation",
    remainingLimit: "composite keys, buffering, broadcast, and other Message loci remain open.",
  },
  {
    id: "COMPENSATION-TRANSACTIONS",
    title: "Compensation and Transactions",
    evidenceKind: "reviewedCheckpointOnly",
    productSurface: "None",
    boundary: "First reviewed end-to-end private Compensation checkpoint",
    remainingLimit: "profile registration, public commands, corpus, and Product 2 capability remain absent.",
  },
] as const;

test("binds the Product 2 Beta catalog to the exact PLAN denominator and reviewed matrix", async () => {
  const [plan, specification] = await Promise.all([
    read("docs/PLAN.md"),
    read("docs/MUE-PREVIEW-BETA-SPEC.md"),
  ]);

  assert.deepEqual(
    betaContentIds(plan),
    expectedCheckpoints.map(({ id }) => id),
    "PLAN owns the exhaustive Beta content IDs and order",
  );
  assert.deepEqual(muePreviewBetaCheckpoints, expectedCheckpoints);
  assert.equal(Object.isFrozen(muePreviewBetaCheckpoints), true);
  assert.equal(
    muePreviewBetaCheckpoints.every((checkpoint) => Object.isFrozen(checkpoint)),
    true,
    "the static catalog must also be immutable at runtime",
  );
  assert.deepEqual(
    specificationMatrix(specification),
    expectedCheckpoints.map(({ id, evidenceKind, productSurface, boundary, remainingLimit }) => ({
      id,
      evidenceKind,
      productSurface,
      boundary: `${boundary}; ${remainingLimit}`,
    })),
    "the implemented specification and Product 2 catalog must retain one matrix",
  );
});

test("keeps Beta acceptance build-once, reuse-only, and aligned across its owners", async () => {
  const [rootSource, webGuide, webSourceMap, showcaseRegistry, uiQualityGuide, testingSpec, contributorGuide, architecture, rootGuide, platformMap, assuranceMap, docsRegistry, plan] = await Promise.all([
    read("package.json"),
    read("platform/apps/web/README.md"),
    read("platform/apps/web/SOURCE-MAP.md"),
    read("showcase/README.md"),
    read("showcase/platform-ui-quality/README.md"),
    read("docs/TESTING-SPEC.md"),
    read("docs/CONTRIBUTOR-SETUP-GUIDE.md"),
    read("docs/ARCHITECTURE.md"),
    read("CLAUDE.md"),
    read("docs/BPM-PLATFORM-IMPLEMENTATION-MAP.md"),
    read("docs/ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md"),
    read("docs/README.md"),
    read("docs/PLAN.md"),
  ]);
  const root = scripts(rootSource);
  const betaRelease = root["test:release:mue-preview-beta"];

  assert.equal(
    betaRelease,
    "pnpm build:release-product2 && pnpm test:showcase:mue-preview-alpha:built && pnpm test:showcase:m2-correlated-message-ingress:built && pnpm test:ui-quality:built",
  );
  assert.equal(betaRelease?.match(/\bbuild:/gu)?.length, 1);
  assert.equal(existsSync(path.join(projectRoot, "showcase/mue-preview-beta")), false);

  for (const [owner, source] of [
    ["web guide", webGuide],
    ["showcase registry", showcaseRegistry],
    ["UI-quality guide", uiQualityGuide],
    ["testing specification", testingSpec],
    ["contributor setup", contributorGuide],
    ["architecture", architecture],
    ["root contributor guidance", rootGuide],
    ["platform map", platformMap],
    ["assurance map", assuranceMap],
    ["documentation registry", docsRegistry],
    ["PLAN", plan],
  ] as const) {
    assert.match(source, /MUE Preview Beta/u, `${owner} must name the Beta checkpoint`);
  }
  for (const [owner, source] of [
    ["UI-quality guide", uiQualityGuide],
    ["testing specification", testingSpec],
    ["contributor setup", contributorGuide],
    ["architecture", architecture],
    ["root contributor guidance", rootGuide],
    ["assurance map", assuranceMap],
  ] as const) {
    assert.match(source, /test:release:mue-preview-beta/u, `${owner} must name the executable Beta gate`);
  }
  assert.match(webSourceMap, /mue-preview-beta-checkpoints\.ts/u);
  assert.match(webGuide, /not full MUE closure or BPMN conformance/u);
  assert.match(platformMap, /seven reviewed checkpoint boundaries/u);
});

function betaContentIds(plan: string): ReadonlyArray<string> {
  const start = plan.indexOf("### MUE Preview Beta critical path\n");
  const end = plan.indexOf("\n#### Risk-first execution bands", start);
  assert.notEqual(start, -1, "PLAN must retain the Beta critical-path section");
  assert.notEqual(end, -1, "PLAN must retain the Beta risk-band boundary");
  return [...plan.slice(start, end).matchAll(/^\| `([A-Z][A-Z0-9-]*)` \|/gmu)]
    .map((match) => match[1])
    .filter((id): id is string => id !== undefined);
}

function specificationMatrix(specification: string): ReadonlyArray<Readonly<{
  id: string;
  evidenceKind: string;
  productSurface: string;
  boundary: string;
}>> {
  return [...specification.matchAll(
    /^\| `([A-Z][A-Z0-9-]*)` \| `([^`]+)` \| ([^|]+) \| (.+) \|$/gmu,
  )].map((match) => {
    const [, id, evidenceKind, productSurface, boundary] = match;
    assert.ok(id !== undefined && evidenceKind !== undefined && productSurface !== undefined && boundary !== undefined);
    return { id, evidenceKind, productSurface: productSurface.trim(), boundary };
  });
}

function scripts(source: string): Readonly<Record<string, string>> {
  return (JSON.parse(source) as Readonly<{ scripts?: Readonly<Record<string, string>> }>).scripts ?? {};
}

async function read(relativePath: string): Promise<string> {
  return await readFile(path.join(projectRoot, relativePath), "utf8");
}
