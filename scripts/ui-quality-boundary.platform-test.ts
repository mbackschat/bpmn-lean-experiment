/**
 * Keeps visual browser evidence in the Product 2 fixed-fixture lane instead of adding Chromium,
 * screenshots, or Temporal startup to Product 1's semantic feedback loop.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("keeps Product 2 UI quality outside every Product 1 feedback loop", async () => {
  const [verify, workflow, rootManifest, showcaseManifest, playwrightConfig] =
    await Promise.all([
      read("scripts/verify.sh"),
      read(".github/workflows/ui-quality.yml"),
      read("package.json"),
      read("showcase/platform-ui-quality/package.json"),
      read("showcase/platform-ui-quality/playwright.config.ts"),
    ]);

  assert.doesNotMatch(verify, /ui-quality|playwright|chromium/iu);
  assert.match(workflow, /test:ui-quality/u);
  assert.doesNotMatch(
    workflow,
    /BpmnSemantics|packages\/semantic-core|packages\/bpmn-source|runners\/cibseven|scripts\/verify\.sh|temporal/iu,
  );
  assert.match(workflow, /platform\/apps\/web\/\*\*/u);
  assert.match(workflow, /platform\/ui-kit\/\*\*/u);
  assert.match(workflow, /showcase\/platform-ui-quality\/\*\*/u);

  const root = JSON.parse(rootManifest) as Readonly<{
    scripts?: Readonly<Record<string, string>>;
  }>;
  assert.equal(
    root.scripts?.["test:ui-quality"],
    "pnpm build:platform-web && pnpm --filter @bpmn-lean/showcase-platform-ui-quality test:e2e",
  );

  const showcase = JSON.parse(showcaseManifest) as Readonly<{
    dependencies?: Readonly<Record<string, string>>;
    devDependencies?: Readonly<Record<string, string>>;
  }>;
  assert.deepEqual(showcase.dependencies, undefined);
  assert.deepEqual(showcase.devDependencies, { "@playwright/test": "1.62.1" });
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

  const featureOwners = [
    "definition-start-panel",
    "definition-schedule-panel",
    "message-start-publication-panel",
    "process-instance-search-panel",
  ] as const;
  for (const owner of featureOwners) {
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
});

async function read(relativePath: string): Promise<string> {
  return await readFile(path.join(projectRoot, relativePath), "utf8");
}
