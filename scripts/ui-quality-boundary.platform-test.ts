/**
 * Keeps visual browser evidence in the Product 2 fixed-fixture lane instead of adding Chromium,
 * screenshots, or Temporal startup to Product 1's semantic feedback loop.
 */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("requires source-grounded Product 2 UI/UX decisions before implementation", async () => {
  const [guide, projectDesign, uiDesign, testingSpec, research, sources, processLedger] =
    await Promise.all([
      read("CLAUDE.md"),
      read("docs/PROJECT-DESIGN.md"),
      read("docs/BPM-PLATFORM-UI-DESIGN-SPEC.md"),
      read("docs/TESTING-SPEC.md"),
      read("docs/research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md"),
      read("docs/SOURCES.md"),
      read("docs/PROCESS-ASSESSMENT-LEDGER.md"),
    ]);

  assert.deepEqual(productUiPreflightViolations({
    guide,
    processLedger,
    projectDesign,
    research,
    sources,
    testingSpec,
    uiDesign,
  }), []);
});

test("rejects a UI/UX process that postpones precedent research or leaves deviations unexplained", () => {
  const complete = {
    guide: "Product 2 UI/UX source preflight. Inspect CIB Seven first before production code.",
    processLedger: "UI/UX precedent was postponed until after implementation | 2 | `executable guard` | ui-quality-boundary.platform-test.ts",
    projectDesign: "## Source-grounded Product 2 interaction design\nBefore production code, inspect the pristine pinned source and current documentation. Record adopt, deliberately deviate, and exclude decisions. Do not copy source code.",
    research: "Current 2.2 Process Definition View and Process Instance View. The matching implementation was inspected in the pristine pinned checkout recorded by SOURCES.md#cib-seven.",
    sources: "CIB Seven Tasklist and Cockpit | Process Definition View | Process Instance View",
    testingSpec: "The source-grounded UI/UX preflight runs ./scripts/doctor.sh research before the first production edit.",
    uiDesign: "## Source-grounded design preflight\nBefore production code, inspect current documentation and the pinned source checkout. Record adopt, deliberately deviate, and exclude decisions, then name the acceptance oracle. Do not copy source code.",
  } as const;
  assert.deepEqual(productUiPreflightViolations(complete), []);
  assert.deepEqual(productUiPreflightViolations({
    ...complete,
    projectDesign: "## Source-grounded Product 2 interaction design\nLook at a screenshot later.",
    uiDesign: "## Source-grounded design preflight\nVisual review follows implementation.",
  }), [
    "project-design-preflight",
    "ui-design-preflight",
  ]);
});

test("keeps Product 2 UI quality outside every Product 1 feedback loop", async () => {
  const [verify, hostedVerify, testingSpec, workflow, rootManifest, showcaseManifest, playwrightConfig] =
    await Promise.all([
      read("scripts/verify.sh"),
      read(".github/workflows/verify.yml"),
      read("docs/TESTING-SPEC.md"),
      read(".github/workflows/ui-quality.yml"),
      read("package.json"),
      read("showcase/platform-ui-quality/package.json"),
      read("showcase/platform-ui-quality/playwright.config.ts"),
    ]);

  assert.doesNotMatch(verify, /ui-quality|playwright|chromium/iu);
  assert.doesNotMatch(verify, /test:release:m\d+/u);
  assert.match(workflow, /test:ui-quality/u);
  assert.doesNotMatch(
    workflow,
    /BpmnSemantics|packages\/semantic-core|packages\/bpmn-source|runners\/cibseven|scripts\/verify\.sh|temporal/iu,
  );
  assert.match(workflow, /platform\/apps\/web\/\*\*/u);
  assert.match(workflow, /platform\/ui-kit\/\*\*/u);
  assert.match(workflow, /tsconfig\.platform-harness\.json/u);
  assert.match(workflow, /showcase\/m1-definition-deployment\/\*\*/u);
  assert.match(workflow, /showcase\/m2-definition-scheduling\/\*\*/u);
  assert.match(workflow, /showcase\/m2-message-start-ingress\/\*\*/u);
  assert.match(workflow, /showcase\/m2-process-instance-search\/\*\*/u);
  assert.match(workflow, /showcase\/m3-human-work\/\*\*/u);
  assert.match(workflow, /showcase\/m4-incident-operations\/\*\*/u);
  assert.match(workflow, /showcase\/platform-ui-quality\/\*\*/u);
  assert.doesNotMatch(workflow, /^\s*- "(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)"$/mu);
  assert.match(
    workflow,
    /image:\s*mcr\.microsoft\.com\/playwright@sha256:c091b21d9fae78c76e85cd4356431e9b018402f172a214fc7d7a5e9a7e29d8ac/u,
  );
  assert.doesNotMatch(workflow, /playwright install/u);
  assert.match(workflow, /regenerate_baselines/u);
  assert.match(workflow, /release_acceptance/u);
  assert.match(workflow, /test:showcase:m1/u);
  assert.match(workflow, /test:showcase:m2/u);
  assert.match(workflow, /test:showcase:m3-human-work/u);
  assert.match(workflow, /test:release:m4/u);
  assert.match(workflow, /product-2-ui-quality-baseline-candidates/u);
  assert.doesNotMatch(hostedVerify, /playwright install|Install Chromium/iu);
  assert.doesNotMatch(hostedVerify, /test:showcase:m[123]/u);
  assert.doesNotMatch(hostedVerify, /test:platform-m1|test:platform-web/u);
  assert.match(workflow, /test:platform-operations-checkpoint/u);
  assert.match(
    workflow,
    /test:platform-operations-checkpoint[\s\S]{0,200}test:showcase:types[\s\S]{0,200}test:ui-quality/u,
  );
  assert.match(testingSpec, /Product 2 browser work remains outside `verify\.sh` and the hosted verification workflow/u);
  assert.doesNotMatch(testingSpec, /Linux matrix leg also installs Playwright/u);

  const root = JSON.parse(rootManifest) as Readonly<{
    scripts?: Readonly<Record<string, string>>;
  }>;
  assert.equal(
    root.scripts?.["test:showcase:types"],
    "pnpm --filter '@bpmn-lean/showcase-*...' --if-present run build && pnpm --filter './showcase/**' --if-present run type-test",
  );
  assert.equal(
    root.scripts?.["test:ui-quality"],
    "pnpm build:platform-web && pnpm --filter @bpmn-lean/showcase-platform-ui-quality test:e2e",
  );
  assert.equal(
    root.scripts?.["test:release:m3"],
    "pnpm test:showcase:m3-human-work && pnpm test:ui-quality",
  );
  assert.equal(
    root.scripts?.["test:release:m4"],
    "pnpm test:showcase:m4-incident-operations && pnpm test:ui-quality",
  );
  assert.equal(
    root.scripts?.["test:ui-quality:update-snapshots"],
    "pnpm build:platform-web && pnpm --filter @bpmn-lean/showcase-platform-ui-quality test:e2e:update-snapshots",
  );
  assert.deepEqual(
    checkpointOrderViolations(
      root.scripts?.["test:platform-work-checkpoint"] ?? "",
      "test:platform-process-search-checkpoint",
      ["@bpmn-lean/contract-types", "@bpmn-lean/temporal-client"],
    ),
    [],
    "the predecessor checkpoint must build the clean workspace before direct package tests consume dist exports",
  );

  const showcase = JSON.parse(showcaseManifest) as Readonly<{
    dependencies?: Readonly<Record<string, string>>;
    devDependencies?: Readonly<Record<string, string>>;
    scripts?: Readonly<Record<string, string>>;
  }>;
  assert.deepEqual(showcase.dependencies, undefined);
  assert.deepEqual(showcase.devDependencies, { "@playwright/test": "1.62.1" });
  assert.equal(
    showcase.scripts?.["test:e2e:update-snapshots"],
    "pnpm run type-test && playwright test --grep @visual --update-snapshots",
  );
  assert.doesNotMatch(playwrightConfig, /Temporal|platform-server|showcase:m3-human-work/iu);
  assert.match(playwrightConfig, /vite preview/u);

  const browserTest = await read("showcase/platform-ui-quality/e2e/ui-quality.spec.ts");
  assert.match(browserTest, /process\.platform !== "linux"/u);
  assert.match(browserTest, /Shared visual baselines are Linux-only/u);
  assert.match(browserTest, /toHaveScreenshot/u);
});

test("keeps feature styling inside CSS Modules and the exact UI token vocabulary", async () => {
  const [main, uiKit, definitionWorkspace, definitionDiagram] = await Promise.all([
    read("platform/apps/web/src/main.tsx"),
    read("platform/ui-kit/src/ui-kit.css"),
    read("platform/apps/web/src/definition-workspace.module.css"),
    read("platform/apps/web/src/definition-diagram.module.css"),
  ]);

  assert.doesNotMatch(main, /import "\.\/(?:styles|message-start-publication|process-instance-search)\.css"/u);
  assert.match(uiKit, /\*,\s*\*::before,\s*\*::after \{\s*box-sizing: border-box;/u);
  assert.match(uiKit, /body \{[\s\S]*font: var\(--ui-font-body\);/u);

  const boundaryOwners = [
    "definition-start-panel",
    "definition-schedule-panel",
    "message-start-publication-panel",
    "process-instance-search-panel",
  ] as const;
  for (const owner of boundaryOwners) {
    const [component, module] = await Promise.all([
      read(`platform/apps/web/src/${owner}.tsx`),
      read(`platform/apps/web/src/${owner}.module.css`),
    ]);
    assert.match(component, new RegExp(`import styles from "\\./${owner}\\.module\\.css";`, "u"));
    assert.doesNotMatch(component, /className="/u);
    assert.doesNotMatch(
      module,
      /#[0-9a-f]{3,8}\b|rgb\(|box-shadow:\s*(?!var\(--ui-focus-ring\))/iu,
      `${owner} must use the exact shared token vocabulary`,
    );
    assert.doesNotMatch(module, /:disabled[\s\S]{0,100}opacity\s*:/u);
  }

  assert.doesNotMatch(definitionWorkspace, /box-shadow/u);
  assert.doesNotMatch(definitionDiagram, /box-shadow/u);

  const featureOwners = [
    "app-shell",
    "definition-diagram",
    "definition-schedule-panel",
    "definition-start-panel",
    "definition-workspace",
    "message-start-publication-panel",
    "process-instance-search-panel",
    "work-inbox",
  ] as const;
  for (const owner of featureOwners) {
    const module = await read(`platform/apps/web/src/${owner}.module.css`);
    const component = await read(`platform/apps/web/src/${owner}.tsx`).catch(() => "");
    assert.deepEqual(
      uiBoundaryViolations(module, component, {
        allowBpmnMarkerGlobal: owner === "definition-diagram",
        allowViewportQuery: owner === "app-shell",
      }),
      [],
      `${owner} must keep shared interaction and component reflow in their owning modules`,
    );
  }
});

test("diagram visual evidence waits for the completed render and marker mutation", async () => {
  const [component, fixtures] = await Promise.all([
    read("platform/apps/web/src/definition-diagram.tsx"),
    read("showcase/platform-ui-quality/e2e/fixtures.ts"),
  ]);

  assert.match(
    component,
    /data-diagram-status=\{rendering \? "rendering" : renderError === null \? "ready" : "failed"\}/u,
  );
  assert.match(fixtures, /\[data-ui="definition-diagram-surface"\]\[data-diagram-status="ready"\]/u);
  assert.doesNotMatch(fixtures, /Rendering diagram[\s\S]{0,160}\.catch\(\(\) => undefined\)/u);
});

test("rejects planted feature styling and control ownership violations", () => {
  const plantedModule = `
    .owner :global([data-ui="data-table"] td) { padding: 10px; }
    .action[data-hovered] { background: var(--ui-color-accent-hover); }
    .surface { border-radius: 8px; gap: 1rem; }
    @media (max-width: 900px) { .form { grid-template-columns: 1fr; } }
  `;
  const plantedComponent = `<button type="submit">Run action</button>`;

  assert.deepEqual(
    uiBoundaryViolations(plantedModule, plantedComponent),
    [
      "feature-global-shared-internal",
      "feature-component-state",
      "feature-local-token-near-match",
      "feature-viewport-component-query",
      "raw-action-button",
    ],
  );

  const exactBpmnMarkers = `
    .canvas :global(.djs-shape.bpmn-platform-current > .djs-visual > :first-child) {}
    .canvas :global(.djs-connection.bpmn-platform-incident > .djs-visual > path) {}
    .canvas :global(.djs-connection.bpmn-platform-selected > .djs-visual > defs > marker > path) {}
  `;
  assert.deepEqual(
    uiBoundaryViolations(exactBpmnMarkers, "", { allowBpmnMarkerGlobal: true }),
    [],
  );
  assert.deepEqual(
    uiBoundaryViolations(
      `${exactBpmnMarkers}.canvas :global(.djs-shape.bpmn-platform-active) {}`,
      "",
      { allowBpmnMarkerGlobal: true },
    ),
    ["feature-global-shared-internal"],
  );
});

test("rejects a checkpoint that consumes workspace dist before its predecessor build", () => {
  assert.deepEqual(
    checkpointOrderViolations(
      "pnpm --filter @bpmn-lean/temporal-client test && pnpm test:platform-process-search-checkpoint",
      "test:platform-process-search-checkpoint",
      ["@bpmn-lean/temporal-client"],
    ),
    ["@bpmn-lean/temporal-client"],
  );
});

test("declares every browser showcase's production web runtime dependency", async () => {
  const showcaseEntries = await readdir(path.join(projectRoot, "showcase"), {
    withFileTypes: true,
  });
  const violations: string[] = [];
  for (const entry of showcaseEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const owner = `showcase/${entry.name}`;
    const playwrightConfig = await read(`${owner}/playwright.config.ts`).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    });
    if (playwrightConfig === null) {
      continue;
    }
    const manifest = await read(`${owner}/package.json`);
    if (hasUndeclaredWebRuntime(playwrightConfig, manifest)) {
      violations.push(owner);
    }
  }

  assert.deepEqual(
    violations,
    [],
    "a clean showcase build must include the web application and its dist-only dependencies",
  );
});

test("rejects a planted browser showcase with an out-of-graph web runtime", () => {
  assert.equal(
    hasUndeclaredWebRuntime(
      'command: "pnpm --filter @bpmn-lean/platform-web exec vite"',
      '{"devDependencies":{"@playwright/test":"1.62.1"}}',
    ),
    true,
  );
});

test("keeps real browser primary-navigation selectors inside the production workspace set", async () => {
  const appShell = await read("platform/apps/web/src/app-shell.tsx");
  const showcaseEntries = await readdir(path.join(projectRoot, "showcase"), {
    withFileTypes: true,
  });
  const specs: string[] = [];
  for (const entry of showcaseEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const e2eDirectory = `showcase/${entry.name}/e2e`;
    const e2eEntries = await readdir(path.join(projectRoot, e2eDirectory), {
      withFileTypes: true,
    }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    });
    for (const e2eEntry of e2eEntries) {
      if (e2eEntry.isFile() && e2eEntry.name.endsWith(".spec.ts")) {
        specs.push(await read(`${e2eDirectory}/${e2eEntry.name}`));
      }
    }
  }

  assert.deepEqual(primaryNavigationViolations(appShell, specs), []);
});

test("rejects a planted stale primary-navigation selector", () => {
  assert.deepEqual(
    primaryNavigationViolations(
      'const workspaceDetails = [{ label: "Work" }, { label: "Operations" }];',
      [
        'page.getByRole("navigation", { name: "Primary navigation" })\n'
          + '.getByRole("button", { name: "Process instances", exact: true })',
      ],
    ),
    ["Process instances"],
  );
});

function uiBoundaryViolations(
  module: string,
  component: string,
  options: Readonly<{
    allowBpmnMarkerGlobal?: boolean;
    allowViewportQuery?: boolean;
  }> = {},
): string[] {
  const violations: string[] = [];
  let globalsRemoved = module;
  if (options.allowBpmnMarkerGlobal === true) {
    for (const marker of ["current", "incident", "selected"] as const) {
      globalsRemoved = globalsRemoved
        .replaceAll(
          `:global(.djs-shape.bpmn-platform-${marker} > .djs-visual > :first-child)`,
          `.bpmn-platform-${marker}-shape`,
        )
        .replaceAll(
          `:global(.djs-connection.bpmn-platform-${marker} > .djs-visual > path)`,
          `.bpmn-platform-${marker}-connection`,
        )
        .replaceAll(
          `:global(.djs-connection.bpmn-platform-${marker} > .djs-visual > defs > marker > path)`,
          `.bpmn-platform-${marker}-marker`,
        );
    }
  }
  if (/:global\(/u.test(globalsRemoved)) {
    violations.push("feature-global-shared-internal");
  }
  if (/\[data-(?:disabled|focused|focus-visible|hovered|pending|pressed|selected)\]/u.test(module)) {
    violations.push("feature-component-state");
  }
  const exactProperty = /(?:^|[;{\n])\s*(?:border-radius|font(?:-size|-weight)?|gap|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?)\s*:\s*([^;}\n]+)/gu;
  if (Array.from(module.matchAll(exactProperty), (match) => match[1] ?? "")
    .some((value) => /(?:\d*\.\d+|[1-9]\d*)(?:em|px|rem|vh|vw|%)/u.test(value) || /^\s*[1-9]\d*\s*$/u.test(value))) {
    violations.push("feature-local-token-near-match");
  }
  if (options.allowViewportQuery !== true && /@media\s*\(\s*max-width\s*:/u.test(module)) {
    violations.push("feature-viewport-component-query");
  }
  if (/<button\b/u.test(component)) {
    violations.push("raw-action-button");
  }
  return violations;
}

async function read(relativePath: string): Promise<string> {
  return await readFile(path.join(projectRoot, relativePath), "utf8");
}

function checkpointOrderViolations(
  script: string,
  predecessor: string,
  packages: readonly string[],
): readonly string[] {
  const commands = script.split("&&").map((command) => command.trim());
  const predecessorIndex = commands.findIndex((command) => command === `pnpm ${predecessor}`);
  return packages.filter((packageName) => {
    const consumerIndex = commands.findIndex(
      (command) => command === `pnpm --filter ${packageName} test`,
    );
    return predecessorIndex < 0 || consumerIndex < 0 || consumerIndex < predecessorIndex;
  });
}

function hasUndeclaredWebRuntime(playwrightConfig: string, manifestText: string): boolean {
  if (!/--filter @bpmn-lean\/platform-web\b/u.test(playwrightConfig)) {
    return false;
  }
  if (/--filter @bpmn-lean\/platform-web run build\b/u.test(playwrightConfig)) {
    return false;
  }
  const manifest = JSON.parse(manifestText) as Readonly<{
    dependencies?: Readonly<Record<string, string>>;
    devDependencies?: Readonly<Record<string, string>>;
  }>;
  return manifest.dependencies?.["@bpmn-lean/platform-web"] === undefined
    && manifest.devDependencies?.["@bpmn-lean/platform-web"] === undefined;
}

function primaryNavigationViolations(appShell: string, specs: readonly string[]): readonly string[] {
  const labels = new Set(
    Array.from(appShell.matchAll(/label: "([^"]+)"/gu), (match) => match[1]),
  );
  return specs.flatMap((spec) => Array.from(
    spec.matchAll(
      /getByRole\("navigation", \{ name: "Primary navigation" \}\)\s*\.getByRole\("button", \{ name: "([^"]+)"/gu,
    ),
    (match) => match[1] ?? "",
  )).filter((label) => !labels.has(label));
}

function productUiPreflightViolations(documents: Readonly<{
  guide: string;
  processLedger: string;
  projectDesign: string;
  research: string;
  sources: string;
  testingSpec: string;
  uiDesign: string;
}>): readonly string[] {
  const violations: string[] = [];
  if (!/Product 2 UI\/UX source preflight[\s\S]*inspect CIB Seven first[\s\S]*before production code/iu.test(documents.guide)) {
    violations.push("contributor-preflight");
  }
  if (!/## Source-grounded Product 2 interaction design[\s\S]*before production code[\s\S]*pristine pinned source[\s\S]*current documentation[\s\S]*adopt[\s\S]*deliberately deviate[\s\S]*exclude[\s\S]*do not copy source code/iu.test(documents.projectDesign)) {
    violations.push("project-design-preflight");
  }
  if (!/## Source-grounded design preflight[\s\S]*before production code[\s\S]*current documentation[\s\S]*pinned source checkout[\s\S]*adopt[\s\S]*deliberately deviate[\s\S]*exclude[\s\S]*acceptance oracle[\s\S]*do not copy source code/iu.test(documents.uiDesign)) {
    violations.push("ui-design-preflight");
  }
  if (!/source-grounded UI\/UX preflight[\s\S]*\.\/scripts\/doctor\.sh research[\s\S]*before the first production edit/iu.test(documents.testingSpec)) {
    violations.push("testing-preflight");
  }
  if (!/Process Definition View[\s\S]*Process Instance View[\s\S]*pristine pinned checkout[\s\S]*SOURCES\.md#cib-seven/iu.test(documents.research)) {
    violations.push("research-evidence");
  }
  if (!/CIB Seven Tasklist and Cockpit[\s\S]*Process Definition View[\s\S]*Process Instance View/iu.test(documents.sources)) {
    violations.push("source-registry");
  }
  if (!/UI\/UX precedent was postponed until after implementation[\s\S]*\| 2 \| `executable guard` \|[\s\S]*ui-quality-boundary\.platform-test\.ts/iu.test(documents.processLedger)) {
    violations.push("process-finding");
  }
  return violations;
}
