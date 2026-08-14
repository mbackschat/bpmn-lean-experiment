import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { requiresProduct1Verification } from "./ci-change-selection.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("skips the heavy Product 1 matrix only for Product 2-only paths", () => {
  assert.equal(requiresProduct1Verification(["platform/apps/web/src/app.tsx"]), false);
  assert.equal(requiresProduct1Verification(["showcase/m3-human-work/e2e/human-work.spec.ts"]), false);
  assert.equal(requiresProduct1Verification(["scripts/ui-quality-boundary.platform-test.ts"]), false);
  assert.equal(requiresProduct1Verification(["packages/semantic-core/src/index.ts"]), true);
  assert.equal(requiresProduct1Verification(["docs/TESTING-SPEC.md"]), true);
  assert.equal(requiresProduct1Verification(["package.json"]), true);
  assert.equal(requiresProduct1Verification([]), true);
  assert.equal(requiresProduct1Verification([
    "platform/apps/web/src/app.tsx",
    "packages/semantic-core/src/index.ts",
  ]), true);
});

test("builds feedback graphs once and keeps independent lanes parallel", async () => {
  const [guide, testingSpec, verifyWorkflow, uiWorkflow, platformWorkflow, showcaseWorkflow, rootSource, webSource, uiKitSource, playwrightConfig, verifyScript, pipelineScript] = await Promise.all([
    read("CLAUDE.md"),
    read("docs/TESTING-SPEC.md"),
    read(".github/workflows/verify.yml"),
    read(".github/workflows/ui-quality.yml"),
    read(".github/workflows/platform-quality.yml"),
    read(".github/workflows/showcase-quality.yml"),
    read("package.json"),
    read("platform/apps/web/package.json"),
    read("platform/ui-kit/package.json"),
    read("showcase/platform-ui-quality/playwright.config.ts"),
    read("scripts/verify.sh"),
    read("scripts/test-pipeline.ts"),
  ]);

  assert.match(guide, /feedback efficiency and development speed as non-negotiable engineering constraints/u);
  assert.match(guide, /builds a dependency graph once and reuses its artifacts/u);
  assert.match(testingSpec, /Feedback latency is a maintained engineering invariant/u);
  assert.match(testingSpec, /builds each dependency graph at most once/u);
  assert.match(testingSpec, /GitHub runs those jobs in parallel/u);

  assert.match(platformWorkflow, /test:pre-push:platform/u);
  assert.match(showcaseWorkflow, /test:pre-push:showcase/u);
  assert.match(uiWorkflow, /test:pre-push:ui/u);
  assert.match(verifyWorkflow, /node scripts\/ci-change-selection\.ts/u);
  assert.match(verifyWorkflow, /if: needs\.changes\.outputs\.product1 == 'true'/u);
  assert.match(verifyWorkflow, /name: verify-complete/u);
  assert.match(verifyWorkflow, /test "\$\{\{ needs\.changes\.outputs\.product1 \}\}" = "false" \|\| test "\$\{\{ needs\.verify\.result \}\}" = "success"/u);
  assert.doesNotMatch(uiWorkflow, /test:platform-operations-checkpoint/u);
  assert.doesNotMatch(platformWorkflow, /playwright|chromium|test:ui-quality/iu);
  assert.doesNotMatch(showcaseWorkflow, /playwright|chromium|test:ui-quality/iu);
  assert.match(showcaseWorkflow, /showcase\/m1-definition-deployment\/\*\*/u);
  assert.match(showcaseWorkflow, /showcase\/m2-definition-scheduling\/\*\*/u);
  assert.match(showcaseWorkflow, /showcase\/m2-message-start-ingress\/\*\*/u);
  assert.match(showcaseWorkflow, /showcase\/m2-process-instance-search\/\*\*/u);
  assert.match(showcaseWorkflow, /showcase\/m3-human-work\/\*\*/u);
  assert.match(showcaseWorkflow, /showcase\/m4-incident-operations\/\*\*/u);
  for (const workflow of [platformWorkflow, showcaseWorkflow, uiWorkflow]) {
    assert.match(workflow, /^\s*- "package\.json"$/mu);
    assert.match(workflow, /^\s*- "pnpm-lock\.yaml"$/mu);
    assert.match(workflow, /^\s*- "pnpm-workspace\.yaml"$/mu);
  }

  const root = scripts(rootSource);
  const web = scripts(webSource);
  const uiKit = scripts(uiKitSource);
  assert.equal(root["test:infrastructure:runtime"], "node --test --test-concurrency=2 scripts/*.test.ts");
  assert.equal(root["test:temporal:built"], "node --test --test-concurrency=4 packages/temporal-adapter/testkit/test/*.test.ts");
  assert.equal(root["test:pre-push:platform"], "pnpm check:clean-head && pnpm test:platform-operations-checkpoint");
  assert.equal(root["test:pre-push:showcase"], "pnpm check:clean-head && pnpm test:feedback-policy && pnpm test:showcase:types");
  assert.equal(root["test:pre-push:ui"], "pnpm check:clean-head && pnpm test:feedback-policy && pnpm build:platform-web && pnpm test:platform-web:built && pnpm test:ui-quality:built");
  assert.equal(root["test:platform-web"], "pnpm build:platform-web && pnpm test:platform-web:built");
  assert.equal(root["test:platform-web:built"], "pnpm --filter @bpmn-lean/platform-ui-kit test:built && pnpm --filter @bpmn-lean/platform-web test:built");
  assert.equal(root["test:ui-quality:built"], "env PLAYWRIGHT_PREBUILT_WEB=true pnpm --filter @bpmn-lean/showcase-platform-ui-quality test:e2e:functional");
  assert.equal(root["test:platform-operations-checkpoint"], "pnpm build:platform-checkpoint && pnpm test:platform-operations-checkpoint:built");
  assert.equal(root["build:showcase-types"], "pnpm --filter @bpmn-lean/platform-server... --filter @bpmn-lean/temporal-testkit... --if-present run build");
  assert.equal(root["build:showcase-runtime"], "pnpm --filter @bpmn-lean/platform-server... --filter @bpmn-lean/temporal-testkit... --filter @bpmn-lean/platform-ui-kit... --if-present run build");
  assert.equal(root["build:release-product2"], "pnpm --filter @bpmn-lean/platform-server... --filter @bpmn-lean/temporal-testkit... --filter @bpmn-lean/platform-web... --if-present run build");
  assert.doesNotMatch(root["build:showcase-types"] ?? "", /platform-web/u);
  assert.doesNotMatch(root["build:showcase-runtime"] ?? "", /platform-web/u);
  assert.equal(root["test:showcase:types"], "pnpm build:showcase-types && pnpm --filter './showcase/**' --if-present run type-test");
  assert.equal(root["test:showcase:m2"], "pnpm build:showcase-m2 && pnpm test:showcase:m2:built");
  assert.equal(root["test:release:product2"], "pnpm build:release-product2 && pnpm test:showcase:m1:built && pnpm test:showcase:m2:built && pnpm test:showcase:m3-human-work:built && pnpm test:showcase:m4-incident-operations:built && pnpm test:ui-quality:built");
  for (const name of [
    "test:platform-foundation:built",
    "test:platform-m1:built",
    "test:platform-process-search-checkpoint:built",
    "test:platform-work-checkpoint:built",
    "test:platform-operations-checkpoint:built",
    "test:showcase:m2:built",
    "test:showcase:m3-human-work:built",
    "test:showcase:m4-incident-operations:built",
    "test:ui-quality:built",
  ]) {
    assert.doesNotMatch(root[name] ?? "", /(?:^|\s)(?:pnpm\s+)?(?:run\s+)?build(?::|\s)/u, `${name} must reuse prepared artifacts`);
  }
  assert.equal(web.prebuild, undefined);
  assert.equal(web["test:built"], "pnpm run type-test && node --test --test-concurrency=1 test/*.test.ts");
  assert.equal(uiKit["test:built"], "pnpm type-test && node --test --test-concurrency=1 test/*.test.ts");
  assert.doesNotMatch(root["test:platform-web:built"] ?? "", /build/u);
  assert.doesNotMatch(root["test:ui-quality:built"] ?? "", /build/u);
  assert.match(playwrightConfig, /PLAYWRIGHT_PREBUILT_WEB/u);
  assert.equal(linesContaining(verifyScript, "test:infrastructure"), 1);
  assert.equal(linesContaining(verifyScript, "build:verification-typescript"), 1);
  for (const command of ["test:semantic-core:built", "test:bpmn-source:built", "test:differential:built", "test:temporal:built"]) {
    assert.equal(linesContaining(verifyScript, command), 1);
  }
  assert.doesNotMatch(verifyScript, /test:contracts|check:source-hygiene|test:infrastructure:runtime/u);
  assert.doesNotMatch(verifyScript, /lake\.sh build checkCheckedSourceRelationExperiment/u);
  assert.match(pipelineScript, /build:verification-typescript/u);
  assert.doesNotMatch(pipelineScript, /runProjectCommand\("tsc"/u);
});

function scripts(source: string): Readonly<Record<string, string>> {
  return (JSON.parse(source) as Readonly<{ scripts?: Readonly<Record<string, string>> }>).scripts ?? {};
}

function linesContaining(source: string, value: string): number {
  return source.split("\n").filter((line) => line.includes(value)).length;
}

async function read(relativePath: string): Promise<string> {
  return await readFile(path.join(projectRoot, relativePath), "utf8");
}
