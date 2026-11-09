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

test("requires two-sided mutation evidence inside production-backed user journeys", async () => {
  const [
    fixedFixtureJourney,
    productionJourney,
    workInbox,
    completionOperation,
  ] = await Promise.all([
    read("showcase/platform-ui-quality/e2e/ui-quality.spec.ts"),
    read("showcase/m3-human-work/e2e/human-work.spec.ts"),
    read("platform/apps/web/src/work-inbox-panel.tsx"),
    read("platform/apps/web/src/work-completion-operation.ts"),
  ]);

  assert.match(fixedFixtureJourney, /test\("unclaimed tasks cannot enter the completion flow"/u);
  assert.match(fixedFixtureJourney, /test\("known completion conflicts are not presented as unknown delivery"/u);
  assert.match(workInbox, /cell: \(row\) => <span>\{row\.task\.name \?\? row\.task\.id\.elementId\}<\/span>/u);
  assert.match(fixedFixtureJourney, /test\("unclaimed tasks cannot enter the completion flow"[\s\S]*name: "Edit task: Validate corporate ownership evidence"[\s\S]*toHaveCount\(0\)/u);
  assert.match(workInbox, /error instanceof WorkApiError && error\.status >= 400 && error\.status < 500/u);
  assert.match(completionOperation, /if \(claim === null\)[\s\S]*must claim the task before completion/u);
  assert.deepEqual(workAuditIsolationViolations(productionJourney), []);
  assert.deepEqual(workAuditIsolationViolations(
    productionJourney.replace(
      /readWorkAudit\(apiOrigin,\s*\{\s*hostingProcessInstanceId:\s*started\.processInstanceId,\s*\}\)/u,
      "readWorkAudit(apiOrigin)",
    ),
  ), ["unfiltered-work-audit"]);

  const journeyStart = productionJourney.indexOf("const taskName =");
  assert.notEqual(journeyStart, -1, "the production journey must identify its exact task");
  const orderedJourney = productionJourney.slice(journeyStart);
  let cursor = 0;
  for (const step of [
    "toHaveCount(0)",
    'name: "Claim"',
    "Claimed by demo-user",
    'name: "Complete task"',
    "No current tasks.",
    "readWorkAudit(apiOrigin, {",
    "hostingProcessInstanceId: started.processInstanceId",
  ]) {
    const next = orderedJourney.indexOf(step, cursor);
    assert.notEqual(next, -1, `production user journey is missing ordered step: ${step}`);
    cursor = next + step.length;
  }
});

function workAuditIsolationViolations(source: string): ReadonlyArray<string> {
  return /readWorkAudit\(apiOrigin,\s*\{\s*hostingProcessInstanceId:\s*started\.processInstanceId,\s*\}\)/u
      .test(source)
    ? []
    : ["unfiltered-work-audit"];
}

test("keeps Product 2 UI quality outside every Product 1 feedback loop", async () => {
  const [
    verify,
    hostedVerify,
    workflow,
    showcaseManifest,
    playwrightConfig,
  ] =
    await Promise.all([
      read("scripts/verify.sh"),
      read(".github/workflows/verify.yml"),
      read(".github/workflows/ui-quality.yml"),
      read("showcase/platform-ui-quality/package.json"),
      read("showcase/platform-ui-quality/playwright.config.ts"),
    ]);

  assert.doesNotMatch(verify, /ui-quality|playwright|chromium/iu);
  assert.doesNotMatch(verify, /test:release:m\d+/u);
  assert.match(workflow, /test:ui-quality/u);
  assert.doesNotMatch(workflow, /test:platform-operations-checkpoint/u);
  assert.doesNotMatch(
    workflow,
    /BpmnSemantics|packages\/semantic-core|packages\/bpmn-source|runners\/cibseven|scripts\/verify\.sh|temporal/iu,
  );
  assert.match(workflow, /platform\/apps\/web\/\*\*/u);
  assert.match(workflow, /platform\/ui-kit\/\*\*/u);
  assert.doesNotMatch(workflow, /tsconfig\.platform-harness\.json/u);
  assert.doesNotMatch(workflow, /showcase\/m[1-4]-/u);
  assert.match(workflow, /showcase\/platform-ui-quality\/\*\*/u);
  assert.match(workflow, /^\s*- "package\.json"$/mu);
  assert.match(workflow, /^\s*- "pnpm-lock\.yaml"$/mu);
  assert.match(workflow, /^\s*- "pnpm-workspace\.yaml"$/mu);
  assert.match(
    workflow,
    /image:\s*mcr\.microsoft\.com\/playwright@sha256:c091b21d9fae78c76e85cd4356431e9b018402f172a214fc7d7a5e9a7e29d8ac/u,
  );
  assert.doesNotMatch(workflow, /playwright install/u);
  assert.match(workflow, /regenerate_baselines/u);
  assert.match(workflow, /release_acceptance/u);
  assert.match(workflow, /test:release:product2/u);
  assert.match(workflow, /product-2-ui-quality-baseline-candidates/u);
  assert.doesNotMatch(hostedVerify, /playwright install|Install Chromium/iu);
  assert.doesNotMatch(hostedVerify, /test:showcase:m[123]/u);
  assert.doesNotMatch(hostedVerify, /test:platform-m1|test:platform-web/u);
  assert.match(workflow, /test:pre-push:ui/u);

  const showcase = JSON.parse(showcaseManifest) as Readonly<{
    dependencies?: Readonly<Record<string, string>>;
    devDependencies?: Readonly<Record<string, string>>;
    scripts?: Readonly<Record<string, string>>;
  }>;
  assert.deepEqual(showcase.dependencies, undefined);
  assert.deepEqual(showcase.devDependencies, { "@playwright/test": "1.62.1" });
  assert.equal(
    showcase.scripts?.["test:e2e:visual"],
    "pnpm run type-test && playwright test --grep \"Process execution Diagram visual @visual\" --project=chromium-1600",
  );
  assert.equal(
    showcase.scripts?.["test:e2e:update-snapshots"],
    "pnpm run type-test && playwright test --grep \"Process execution Diagram visual @visual\" --project=chromium-1600 --update-snapshots",
  );
  assert.doesNotMatch(playwrightConfig, /Temporal|platform-server|showcase:m3-human-work/iu);
  assert.match(playwrightConfig, /vite preview/u);
  assert.match(playwrightConfig, /chromiumProject\("chromium-1600", 1600\)/u);
  assert.match(playwrightConfig, /chromiumProject\("chromium-1280", 1280, \/@responsive\/u\)/u);
  assert.doesNotMatch(playwrightConfig, /chromium-(?:768|1024)|chromiumProject\([^\n]+(?:768|1024)\)/u);

  const browserTests = await Promise.all([
    read("showcase/platform-ui-quality/e2e/ui-quality.spec.ts"),
    read("showcase/platform-ui-quality/e2e/operations-ui-quality.spec.ts"),
    read("showcase/platform-ui-quality/e2e/execution-publication-ui-quality.spec.ts"),
    read("showcase/platform-ui-quality/e2e/flow-node-metrics-ui-quality.spec.ts"),
  ]);
  assert.ok(
    browserTests.every((source) => source.includes("@responsive")),
    "every Product 2 browser surface must own a two-width responsive discriminator",
  );
  assert.equal(
    browserTests.flatMap((source) => source.match(/toHaveScreenshot\(/gu) ?? []).length,
    1,
    "one manually invoked desktop screenshot is the complete visual-regression scope",
  );
  assert.doesNotMatch(browserTests[0] ?? "", /toHaveScreenshot|chromium-768|768px/iu);
  assert.doesNotMatch(browserTests[1] ?? "", /toHaveScreenshot|chromium-768|768px/iu);
  assert.match(browserTests[2] ?? "", /Process execution Diagram visual @visual/u);
  assert.match(browserTests[2] ?? "", /process\.platform !== "linux"/u);
  assert.match(browserTests[2] ?? "", /toHaveScreenshot/u);
  assert.doesNotMatch(browserTests[3] ?? "", /toHaveScreenshot|process\.platform|chromium-(?:768|1024)/u);

  const snapshots = (await readdir(
    path.join(projectRoot, "showcase/platform-ui-quality/e2e/snapshots"),
    { recursive: true },
  )).filter((entry) => entry.endsWith(".png")).sort();
  assert.deepEqual(snapshots, [
    "execution-publication-ui-quality.spec.ts/chromium-1600/process-execution-diagram.png",
  ]);
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
    "flow-node-metrics-panel",
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
    globalsRemoved = globalsRemoved.replaceAll(
      ":global(.bpmn-platform-metric-badge)",
      ".bpmn-platform-metric-badge",
    );
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
  if (/run build:platform-web\b|--filter @bpmn-lean\/platform-web run build\b/u.test(playwrightConfig)) {
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
