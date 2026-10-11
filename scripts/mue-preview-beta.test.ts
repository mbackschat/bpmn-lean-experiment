import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  muePreviewBetaCheckpoints,
} from "../platform/apps/web/src/mue-preview-beta-checkpoints.ts";
import { muePreviewBetaTestOracle } from "./mue-preview-beta-test-oracle.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("binds the Product 2 Beta catalog to its frozen specification denominator and reviewed matrix", async () => {
  const specification = await read("docs/MUE-PREVIEW-BETA-SPEC.md");

  assert.deepEqual(
    betaContentIds(specification),
    muePreviewBetaTestOracle.map(({ id }) => id),
    "the Beta specification owns the exhaustive historical content IDs and order",
  );
  assert.deepEqual(muePreviewBetaCheckpoints, muePreviewBetaTestOracle.map((checkpoint) => ({
    id: checkpoint.id,
    title: checkpoint.title,
    evidenceKind: checkpoint.evidenceKind,
    productSurface: checkpoint.productSurface,
    boundary: checkpoint.boundary,
    remainingLimit: checkpoint.remainingLimit,
  })));
  assert.equal(Object.isFrozen(muePreviewBetaCheckpoints), true);
  assert.equal(
    muePreviewBetaCheckpoints.every((checkpoint) => Object.isFrozen(checkpoint)),
    true,
    "the static catalog must also be immutable at runtime",
  );
  assert.deepEqual(
    specificationMatrix(specification),
    muePreviewBetaTestOracle.map(({ id, evidenceKind, productSurface, boundary, remainingLimit }) => ({
      id,
      evidenceKind,
      productSurface,
      boundary: `${boundary}; ${remainingLimit}`,
    })),
    "the implemented specification and Product 2 catalog must retain one matrix",
  );
});

test("keeps Beta acceptance build-once, reuse-only, and aligned across its owners", async () => {
  const [rootSource, webGuide, webSourceMap, showcaseRegistry, uiQualityGuide, testingSpec, contributorGuide, architecture, rootGuide, platformMap, assuranceMap, docsRegistry] = await Promise.all([
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
  ]);
  const root = scripts(rootSource);
  const betaRelease = root["test:release:mue-preview-beta"];

  assert.deepEqual(
    commandLegs(betaRelease).filter((leg) => leg.endsWith(":built")),
    [
      "pnpm test:showcase:mue-preview-alpha:built",
      "pnpm test:showcase:m2-correlated-message-ingress:built",
      "pnpm test:ui-quality:built",
    ],
    "the package-owned release command must reuse the three ordered prebuilt acceptance legs",
  );
  assert.equal(existsSync(path.join(projectRoot, "showcase/mue-preview-beta")), false);

  assert.match(headingSection(webGuide, "## What you can do"), /\*\*About:\*\*[^\n]+MUE Preview Beta/u);
  assert.match(showcaseRegistry, /^\[MUE Preview Beta\]\(\.\.\/docs\/MUE-PREVIEW-BETA-SPEC\.md\)/mu);
  assert.match(headingSection(uiQualityGuide, "## Scope"), /exact seven MUE Preview Beta rows/u);
  assert.match(headingSection(uiQualityGuide, "## Commands"), /^\.\/scripts\/pnpm\.sh run test:release:mue-preview-beta$/mu);
  assert.match(headingSection(testingSpec, "## Focused gate matrix"), /^\| Complete MUE Preview Beta release acceptance \|[^\n]+`\.\/scripts\/pnpm\.sh run test:release:mue-preview-beta`/mu);
  assert.match(headingSection(contributorGuide, "## Clean-clone path"), /^\.\/scripts\/pnpm\.sh run test:release:mue-preview-beta$/mu);
  assert.match(headingSection(architecture, "## Showcases"), /MUE Preview Beta is a release composition/u);
  assert.match(headingSection(rootGuide, "## Verification"), /^\.\/scripts\/pnpm\.sh run test:release:mue-preview-beta$/mu);
  assert.match(headingSection(platformMap, "### BPM platform"), /A separate immutable MUE Preview Beta About catalog/u);
  assert.match(headingSection(assuranceMap, "### Project foundation"), /one exact MUE Preview Beta integration guard[^\n]+`test:release:mue-preview-beta`/u);
  assert.match(headingSection(docsRegistry, "## Fast navigation"), /^\| Understand or run the MUE Preview Beta integration \| \[MUE Preview Beta integration specification\]\(MUE-PREVIEW-BETA-SPEC\.md\)/mu);
  assert.match(webSourceMap, /mue-preview-beta-checkpoints\.ts/u);
  assert.match(webGuide, /not full MUE closure or BPMN conformance/u);
  assert.match(platformMap, /seven reviewed checkpoint boundaries/u);
});

test("does not accept Beta wording moved outside its owning section", () => {
  const moved = "# Guide\n\n## What you can do\n\nNo release checkpoint is owned here.\n\n## Notes\n\nMUE Preview Beta\n";

  assert.doesNotMatch(headingSection(moved, "## What you can do"), /MUE Preview Beta/u);
});

function betaContentIds(specification: string): ReadonlyArray<string> {
  const start = specification.indexOf("### Historical Beta content boundary\n");
  const end = specification.indexOf("\n#### Risk-first execution bands", start);
  assert.notEqual(start, -1, "the Beta specification must retain its historical content boundary");
  assert.notEqual(end, -1, "the Beta specification must retain its closed risk-band boundary");
  return [...specification.slice(start, end).matchAll(/^\| `([A-Z][A-Z0-9-]*)` \|/gmu)]
    .map((match) => match[1])
    .filter((id): id is string => id !== undefined);
}

function specificationMatrix(specification: string): ReadonlyArray<Readonly<{
  id: string;
  evidenceKind: string;
  productSurface: string;
  boundary: string;
}>> {
  return [...headingSection(specification, "## Public checkpoint catalog").matchAll(
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

function commandLegs(command: string | undefined): ReadonlyArray<string> {
  return command?.split(" && ") ?? [];
}

function headingSection(markdown: string, heading: string): string {
  const start = markdown.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `missing ${heading}`);
  const level = heading.indexOf(" ");
  const followingHeading = new RegExp(`^#{1,${level}} `, "mu").exec(
    markdown.slice(start + heading.length + 1),
  );
  const end = followingHeading === null
    ? markdown.length
    : start + heading.length + 1 + followingHeading.index;
  return markdown.slice(start, end);
}

async function read(relativePath: string): Promise<string> {
  return await readFile(path.join(projectRoot, relativePath), "utf8");
}
