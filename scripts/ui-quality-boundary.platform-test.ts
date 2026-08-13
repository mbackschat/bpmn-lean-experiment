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

async function read(relativePath: string): Promise<string> {
  return await readFile(path.join(projectRoot, relativePath), "utf8");
}
