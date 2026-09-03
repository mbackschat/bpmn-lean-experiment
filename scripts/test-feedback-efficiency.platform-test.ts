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
  assert.equal(requiresProduct1Verification([".github/workflows/platform-postgresql-quality.yml"]), false);
  assert.equal(requiresProduct1Verification(["tsconfig.platform-postgresql-harness.json"]), false);
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
  const [guide, testingSpec, verifyWorkflow, uiWorkflow, platformWorkflow, postgresqlWorkflow, showcaseWorkflow, rootSource, postgresqlRunner, webSource, uiKitSource, playwrightConfig, verifyScript, pipelineScript] = await Promise.all([
    read("CLAUDE.md"),
    read("docs/TESTING-SPEC.md"),
    read(".github/workflows/verify.yml"),
    read(".github/workflows/ui-quality.yml"),
    read(".github/workflows/platform-quality.yml"),
    read(".github/workflows/platform-postgresql-quality.yml"),
    read(".github/workflows/showcase-quality.yml"),
    read("package.json"),
    read("platform/foundation/postgresql-runtime/test/run-platform-postgresql-suites.ts"),
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
  assert.match(postgresqlWorkflow, /test:pre-push:platform-postgresql/u);
  assert.match(showcaseWorkflow, /test:pre-push:showcase/u);
  assert.match(uiWorkflow, /test:pre-push:ui/u);
  assert.match(verifyWorkflow, /node scripts\/ci-change-selection\.ts/u);
  assert.equal(matches(verifyWorkflow, /if: needs\.changes\.outputs\.product1 == 'true'/gu), 4);
  assert.match(verifyWorkflow, /^  verify_lean:$/mu);
  assert.match(verifyWorkflow, /^  verify_lean_checks:$/mu);
  assert.match(verifyWorkflow, /^  verify_runtime:$/mu);
  assert.match(verifyWorkflow, /^  verify_pipeline:$/mu);
  assert.match(verifyWorkflow, /verify_lean_checks:[\s\S]*?needs:\n      - changes\n      - verify_lean/u);
  assert.match(verifyWorkflow, /verify_pipeline:[\s\S]*?needs:\n      - changes\n      - verify_lean_checks\n      - verify_runtime/u);
  assert.match(verifyWorkflow, /key: verify-lean-library-\$\{\{ runner\.os \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u);
  assert.match(verifyWorkflow, /key: verify-lean-checks-\$\{\{ runner\.os \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u);
  assert.match(verifyWorkflow, /key: verify-runtime-\$\{\{ runner\.os \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u);
  assert.match(verifyWorkflow, /run: \.\/scripts\/verify\.sh lean-library/u);
  assert.match(verifyWorkflow, /run: \.\/scripts\/verify\.sh lean-checks/u);
  assert.match(verifyWorkflow, /run: \.\/scripts\/verify\.sh runtime/u);
  assert.match(verifyWorkflow, /run: \.\/scripts\/verify\.sh pipeline/u);
  assert.match(verifyWorkflow, /name: verify-complete/u);
  assert.match(verifyWorkflow, /test "\$\{\{ needs\.changes\.outputs\.product1 \}\}" = "false" \|\| \{\n            test "\$\{\{ needs\.verify_lean\.result \}\}" = "success"\n            test "\$\{\{ needs\.verify_lean_checks\.result \}\}" = "success"\n            test "\$\{\{ needs\.verify_runtime\.result \}\}" = "success"\n            test "\$\{\{ needs\.verify_pipeline\.result \}\}" = "success"\n          \}/u);
  assert.doesNotMatch(uiWorkflow, /test:platform-operations-checkpoint/u);
  assert.doesNotMatch(platformWorkflow, /playwright|chromium|test:ui-quality/iu);
  assert.doesNotMatch(platformWorkflow, /postgres(?:ql)?:18\.4|BPMN_TEST_POSTGRES_URL/iu);
  assert.match(postgresqlWorkflow, /postgres:18\.4/u);
  assert.match(postgresqlWorkflow, /BPMN_TEST_POSTGRES_URL/u);
  assert.doesNotMatch(showcaseWorkflow, /playwright|chromium|test:ui-quality/iu);
  assert.match(showcaseWorkflow, /showcase\/m1-definition-deployment\/\*\*/u);
  assert.match(showcaseWorkflow, /showcase\/m2-definition-scheduling\/\*\*/u);
  assert.match(showcaseWorkflow, /showcase\/m2-message-start-ingress\/\*\*/u);
  assert.match(showcaseWorkflow, /showcase\/m2-process-instance-search\/\*\*/u);
  assert.match(showcaseWorkflow, /showcase\/m3-human-work\/\*\*/u);
  assert.match(showcaseWorkflow, /showcase\/m4-incident-operations\/\*\*/u);
  assert.match(showcaseWorkflow, /showcase\/mue-preview-alpha\/\*\*/u);
  for (const workflow of [platformWorkflow, postgresqlWorkflow, showcaseWorkflow, uiWorkflow]) {
    assert.match(workflow, /^\s*- "package\.json"$/mu);
    assert.match(workflow, /^\s*- "pnpm-lock\.yaml"$/mu);
    assert.match(workflow, /^\s*- "pnpm-workspace\.yaml"$/mu);
  }

  const root = scripts(rootSource);
  const web = scripts(webSource);
  const uiKit = scripts(uiKitSource);
  assert.equal(root["test:infrastructure:runtime"], "node --test --test-concurrency=2 scripts/*.test.ts");
  assert.equal(root["test:temporal:built"], "pnpm test:temporal:built:components && pnpm test:temporal:built:concurrent && pnpm test:temporal:built:hosted && pnpm test:temporal:built:hosted-serial");
  // Server-free component contracts run first so a break fails before any Temporal server starts,
  // and each lane globs the convention deciding its membership rather than naming files by hand.
  assert.equal(root["test:temporal:built:components"], "node --test --test-concurrency=4 packages/temporal-adapter/protocol/test/*.test.ts packages/temporal-adapter/workflow/test/*.test.ts packages/temporal-adapter/worker/test/*.test.ts");
  // Preserve file-level concurrency while excluding the Node 24 parallel-scavenger race exposed by
  // Temporal's direct Workflow VM contexts during garbage collection.
  assert.equal(root["test:temporal:built:concurrent"], "node --no-parallel-scavenge --test --test-concurrency=4 packages/temporal-adapter/testkit/test/*.test.ts");
  assert.equal(root["test:temporal:built:hosted"], "node --no-parallel-scavenge --test packages/temporal-adapter/testkit/test/*.temporal-test.ts");
  assert.equal(root["test:temporal:built:hosted-serial"], "node --no-parallel-scavenge --test --test-concurrency=1 packages/temporal-adapter/testkit/test/*.temporal-serial-test.ts");
  for (const lane of ["test:temporal:built:components", "test:temporal:built:concurrent", "test:temporal:built:hosted", "test:temporal:built:hosted-serial"]) {
    assert.doesNotMatch(root[lane] ?? "", /(?:^|\s)(?:pnpm\s+)?(?:run\s+)?build(?::|\s)/u, `${lane} must reuse prepared artifacts`);
  }
  assert.equal(root["test:pre-push:platform"], "pnpm check:clean-head && pnpm test:platform-operations-checkpoint");
  assert.equal(root["test:pre-push:platform-postgresql"], "pnpm check:clean-head && pnpm test:platform-postgresql");
  assert.equal(root["build:platform-postgresql"], "pnpm --filter @bpmn-lean/platform-server... --filter @bpmn-lean/platform-recovery-worker... --filter @bpmn-lean/platform-postgresql-migrate... --if-present run build");
  assert.equal(root["check:platform-postgresql-harness-types"], "tsc -p tsconfig.platform-postgresql-harness.json");
  assert.equal(root["test:platform-postgresql"], "pnpm build:platform-postgresql && pnpm check:platform-postgresql-harness-types && pnpm test:platform-postgresql:built");
  assert.equal(root["test:platform-postgresql:local"], "./scripts/with-postgresql-18.sh ./scripts/pnpm.sh test:platform-postgresql");
  assert.equal(matches(root["test:platform-postgresql"] ?? "", /\bbuild:/gu), 1);
  assert.doesNotMatch(root["test:platform-postgresql:built"] ?? "", /(?:^|\s)(?:pnpm\s+)?(?:run\s+)?build(?::|\s)/u);
  assert.equal(root["test:platform-postgresql:built"], "pnpm --filter @bpmn-lean/platform-postgresql-runtime exec node test/run-platform-postgresql-suites.ts");
  assert.equal(matches(postgresqlRunner, /packageName: "@bpmn-lean\//gu), 10);
  assert.equal(matches(postgresqlRunner, /"test:postgresql:built"/gu), 1);
  assert.match(postgresqlRunner, /platformPostgresqlSuiteTimeoutMs = 60_000/u);
  assert.equal(root["test:pre-push:showcase"], "pnpm check:clean-head && pnpm test:feedback-policy && pnpm test:showcase:types");
  assert.equal(root["test:pre-push:ui"], "pnpm check:clean-head && pnpm test:feedback-policy && pnpm build:platform-web && pnpm test:platform-web:built && pnpm test:ui-quality:built");
  assert.equal(root["test:platform-web"], "pnpm build:platform-web && pnpm test:platform-web:built");
  assert.equal(root["test:platform-web:built"], "pnpm --filter @bpmn-lean/platform-ui-kit test:built && pnpm --filter @bpmn-lean/platform-web test:built");
  assert.equal(root["test:ui-quality:built"], "env PLAYWRIGHT_PREBUILT_WEB=true pnpm --filter @bpmn-lean/showcase-platform-ui-quality test:e2e:functional");
  assert.equal(root["test:platform-operations-checkpoint"], "pnpm build:platform-checkpoint && pnpm test:platform-operations-checkpoint:built");
  assert.equal(root["build:showcase-types"], "pnpm --filter @bpmn-lean/platform-server... --filter @bpmn-lean/temporal-testkit... --if-present run build");
  assert.equal(root["build:showcase-runtime"], "pnpm --filter @bpmn-lean/platform-server... --filter @bpmn-lean/temporal-testkit... --filter @bpmn-lean/platform-ui-kit... --if-present run build");
  assert.equal(root["build:showcase-mue-preview-alpha"], "pnpm build:release-product2");
  assert.equal(root["build:release-product2"], "pnpm --filter @bpmn-lean/platform-server... --filter @bpmn-lean/temporal-testkit... --filter @bpmn-lean/platform-web... --if-present run build");
  assert.doesNotMatch(root["build:showcase-types"] ?? "", /platform-web/u);
  assert.doesNotMatch(root["build:showcase-runtime"] ?? "", /platform-web/u);
  assert.equal(root["test:showcase:types"], "pnpm build:showcase-types && pnpm --filter './showcase/**' --if-present run type-test");
  for (const name of [
    "test:showcase:m1",
    "test:showcase:m2",
    "test:showcase:m2-message-start-ingress",
    "test:showcase:m2-process-instance-search",
    "test:showcase:m3-human-work",
    "test:showcase:m4-incident-operations",
    "test:showcase:mue-preview-alpha",
  ]) {
    assert.match(root[name] ?? "", /^pnpm build:release-product2 && pnpm test:showcase:[^ ]+:built$/u);
    assert.equal(matches(root[name] ?? "", /\bbuild:/gu), 1, `${name} must prepare the union Product 2 graph once`);
  }
  assert.equal(root["test:release:product2"], "pnpm build:release-product2 && pnpm test:showcase:m1:built && pnpm test:showcase:m2:built && pnpm test:showcase:m3-human-work:built && pnpm test:showcase:m4-incident-operations:built && pnpm test:showcase:mue-preview-alpha:built && pnpm test:ui-quality:built");
  assert.equal(matches(root["test:release:product2"] ?? "", /\bbuild:/gu), 1);
  const prebuiltShowcaseCommands = new Map([
    ["test:showcase:m1:built", 1],
    ["test:showcase:m2:built", 3],
    ["test:showcase:m2-message-start-ingress:built", 1],
    ["test:showcase:m2-process-instance-search:built", 1],
    ["test:showcase:m3-human-work:built", 1],
    ["test:showcase:m4-incident-operations:built", 1],
    ["test:showcase:mue-preview-alpha:built", 1],
  ]);
  for (const [name, expectedPrebuiltUses] of prebuiltShowcaseCommands) {
    assert.equal(matches(root[name] ?? "", /PLAYWRIGHT_PREBUILT_WEB=true/gu), expectedPrebuiltUses, `${name} must reuse the prepared production web build`);
  }
  for (const name of [
    "test:platform-foundation:built",
    "test:platform-m1:built",
    "test:platform-process-search-checkpoint:built",
    "test:platform-work-checkpoint:built",
    "test:platform-operations-checkpoint:built",
    "test:showcase:m2:built",
    "test:showcase:m3-human-work:built",
    "test:showcase:m4-incident-operations:built",
    "test:showcase:mue-preview-alpha:built",
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
  for (const stage of ["verify_common", "verify_lean_library", "verify_lean_checks", "verify_runtime", "verify_pipeline"]) {
    assert.notEqual(shellFunction(verifyScript, stage), null, `${stage} must own one verification stage`);
  }
  assert.match(verifyScript, /all\)\n\s+verify_common\n\s+verify_lean_library\n\s+verify_lean_checks\n\s+verify_runtime\n\s+verify_pipeline/u);
  assert.match(verifyScript, /lean-library\) verify_lean_library ;;/u);
  assert.match(verifyScript, /lean-checks\) verify_lean_checks ;;/u);
  assert.match(verifyScript, /runtime\) verify_common; verify_runtime ;;/u);
  assert.match(verifyScript, /pipeline\) verify_pipeline ;;/u);
  assert.match(pipelineScript, /build:verification-typescript/u);
  assert.match(
    pipelineScript,
    /BpmnSemantics\.EnginePopulationScenarioJsonMain/u,
  );
  assert.match(
    pipelineScript,
    /message-key-correlation-population-lean-core\.integration-test\.ts/u,
  );
  assert.match(
    pipelineScript,
    /message-key-correlation-refinement\.temporal-serial-test\.ts/u,
  );
  assert.match(pipelineScript, /--no-parallel-scavenge/u);
  assert.doesNotMatch(pipelineScript, /runProjectCommand\("tsc"/u);
});

test("serves every real-host showcase from the production web build", async () => {
  const configPaths = [
    "showcase/m1-definition-deployment/playwright.config.ts",
    "showcase/m2-definition-scheduling/playwright.config.ts",
    "showcase/m2-message-start-ingress/playwright.config.ts",
    "showcase/m2-process-instance-search/playwright.config.ts",
    "showcase/m3-human-work/playwright.config.ts",
    "showcase/m4-incident-operations/playwright.config.ts",
    "showcase/mue-preview-alpha/playwright.config.ts",
  ];
  const configs = await Promise.all(configPaths.map(async (configPath) => [configPath, await read(configPath)] as const));
  const nonProductionConfigs = configs.flatMap(([configPath, source]) => {
    const buildsUnlessPrebuilt = /PLAYWRIGHT_PREBUILT_WEB/u.test(source) && /build:platform-web/u.test(source);
    const previewsProductionOutput = /exec vite preview/u.test(source);
    const startsDevelopmentServer = /exec vite --host/u.test(source);
    return buildsUnlessPrebuilt && previewsProductionOutput && !startsDevelopmentServer ? [] : [configPath];
  });

  assert.deepEqual(nonProductionConfigs, []);
});

test("keeps MUE Preview Alpha acceptance owners aligned with the executable release graph", async () => {
  const [rootSource, architecture, webSourceMap, uiQualityGuide, contributorGuide, uiResearch] = await Promise.all([
    read("package.json"),
    read("docs/ARCHITECTURE.md"),
    read("platform/apps/web/SOURCE-MAP.md"),
    read("showcase/platform-ui-quality/README.md"),
    read("docs/CONTRIBUTOR-SETUP-GUIDE.md"),
    read("docs/research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md"),
  ]);
  const root = scripts(rootSource);

  assert.equal(
    root["test:release:mue-preview-alpha"],
    "pnpm build:release-product2 && pnpm test:showcase:mue-preview-alpha:built && pnpm test:ui-quality:built",
  );
  assert.match(architecture, /registered real-host showcase and preview acceptance packages/u);
  assert.match(architecture, /test:release:mue-preview-alpha/u);
  assert.doesNotMatch(architecture, /currently extending through `showcase\/m4-incident-operations\/`/u);
  assert.doesNotMatch(architecture, /M1, M2, M3, and M4 acceptance floors/u);
  assert.match(webSourceMap, /mue-preview-alpha-start\.ts/u);
  assert.match(uiQualityGuide, /test:release:mue-preview-alpha/u);
  assert.match(contributorGuide, /test:showcase:mue-preview-alpha/u);
  assert.match(contributorGuide, /test:release:mue-preview-alpha/u);
  assert.match(uiResearch, /without waiting on intermediate browser polling/u);
});

function scripts(source: string): Readonly<Record<string, string>> {
  return (JSON.parse(source) as Readonly<{ scripts?: Readonly<Record<string, string>> }>).scripts ?? {};
}

function linesContaining(source: string, value: string): number {
  return source.split("\n").filter((line) => line.includes(value)).length;
}

function matches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

function shellFunction(source: string, name: string): string | null {
  return new RegExp(`^${name}\\(\\) \\{\\n([\\s\\S]*?)^\\}`, "mu").exec(source)?.[1] ?? null;
}

async function read(relativePath: string): Promise<string> {
  return await readFile(path.join(projectRoot, relativePath), "utf8");
}
