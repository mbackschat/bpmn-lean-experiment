import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const composePath = new URL("../compose.yaml", import.meta.url);
const dockerfilePath = new URL("../Dockerfile", import.meta.url);
const dockerignorePath = new URL("../.dockerignore", import.meta.url);
const workflowPath = new URL(
  "../.github/workflows/evaluation-distribution.yml",
  import.meta.url,
);
const publishedComposePath = new URL(
  "../deploy/evaluation/published-images.compose.yaml",
  import.meta.url,
);
const publishedLauncherPath = new URL(
  "../deploy/evaluation/demo",
  import.meta.url,
);
const postgresqlRolesPath = new URL(
  "../deploy/evaluation/postgresql/001_roles.sql",
  import.meta.url,
);
const bakePath = new URL("../deploy/evaluation/docker-bake.hcl", import.meta.url);
const bundleBuilderPath = new URL(
  "../deploy/evaluation/prepare-published-bundle.sh",
  import.meta.url,
);
const diagnosticsPath = new URL(
  "../deploy/evaluation/collect-diagnostics.sh",
  import.meta.url,
);
const stabilityPath = new URL(
  "../deploy/evaluation/verify-runtime-stability.sh",
  import.meta.url,
);

test("evaluation distribution has the closed healthy topology", async () => {
  const compose = await readFile(composePath, "utf8");

  for (const service of [
    "postgresql",
    "temporal",
    "platform-migrate",
    "bpmn-worker",
    "platform-api",
    "platform-recovery-worker",
    "guided-demo-seed",
  ]) {
    assert.match(compose, new RegExp(`^  ${service}:$`, "mu"));
  }
  assert.match(
    serviceBlock(compose, "platform-api"),
    /platform-migrate:\n\s+condition: service_completed_successfully/u,
  );
  assert.match(
    serviceBlock(compose, "platform-recovery-worker"),
    /platform-migrate:\n\s+condition: service_completed_successfully/u,
  );
  assert.doesNotMatch(
    compose,
    /platform-migrate:\n\s+condition: service_started/u,
  );
  assert.match(compose, /^volumes:\n  postgresql-data:\n  temporal-data:$/mu);
  assert.match(
    serviceBlock(compose, "postgresql"),
    /postgresql-data:\/var\/lib\/postgresql/u,
  );
  assert.match(
    serviceBlock(compose, "temporal"),
    /temporal-data:\/var\/lib\/temporal/u,
  );
  assert.match(
    serviceBlock(compose, "temporal"),
    /chown temporal:temporal \/var\/lib\/temporal.*exec su temporal/su,
  );
  assert.match(
    serviceBlock(compose, "platform-api"),
    /"\$\{BPMN_EVALUATION_PORT:-3000\}:3000"/u,
  );
  assert.match(
    serviceBlock(compose, "platform-api"),
    /PLATFORM_PUBLIC_ORIGIN: \$\{BPMN_EVALUATION_ORIGIN:-http:\/\/localhost:3000\}/u,
  );
  assert.match(
    serviceBlock(compose, "platform-api"),
    /PLATFORM_PROJECTION_MAX_AGE_MS: \$\{BPMN_EVALUATION_PROJECTION_MAX_AGE_MS:-30000\}/u,
  );
  assert.match(
    serviceBlock(compose, "platform-recovery-worker"),
    /PLATFORM_PROJECTION_REFRESH_AFTER_MS: \$\{BPMN_EVALUATION_PROJECTION_REFRESH_AFTER_MS:-5000\}/u,
  );
  assert.doesNotMatch(
    serviceBlock(compose, "platform-recovery-worker"),
    /PLATFORM_PROJECTION_MAX_AGE_MS/u,
  );
  assert.doesNotMatch(serviceBlock(compose, "temporal"), /^\s+ports:/mu);
  assert.match(serviceBlock(compose, "guided-demo-seed"), /profiles: \["demo"\]/u);
  assert.match(serviceBlock(compose, "guided-demo-seed"), /GUIDED_DEMO_PLATFORM_ORIGIN: http:\/\/platform-api:3000/u);
});

test("runtime images contain only deployed production closures", async () => {
  const [dockerfile, dockerignore] = await Promise.all([
    readFile(dockerfilePath, "utf8"),
    readFile(dockerignorePath, "utf8"),
  ]);

  for (const target of [
    "platform-api",
    "platform-recovery-worker",
    "platform-migrate",
    "bpmn-worker",
  ]) {
    const stage = runtimeStage(dockerfile, target);
    assert.match(stage, /COPY --from=packager/u);
    assert.doesNotMatch(stage, /^COPY\s+\.\s/u);
    assert.doesNotMatch(stage, /(?:testkit|showcase|BpmnSemantics|runners\/cibseven|docs\/research)/u);
  }
  const seedStage = runtimeStage(dockerfile, "guided-demo-seed");
  assert.match(seedStage, /COPY --from=packager/u);
  assert.match(seedStage, /\/app\/scenarios/u);
  assert.doesNotMatch(seedStage, /^COPY\s+\.\s/u);
  assert.match(dockerfile, /--config\.inject-workspace-packages=true/u);
  assert.match(
    dockerfile,
    /^# syntax=docker\/dockerfile:1\.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e$/mu,
  );
  assert.match(dockerfile, /pnpm install --frozen-lockfile --prefer-offline/u);
  assert.doesNotMatch(dockerfile, /deploy .*--legacy/u);
  for (const ignored of [
    "BpmnSemantics",
    ".pnpm-store",
    ".uv-cache",
    "runners",
    "showcase",
    "docs/research",
    "**/test",
    "**/node_modules",
    "**/dist",
  ]) {
    assert.match(dockerignore, new RegExp(`^${escapeRegex(ignored)}$`, "mu"));
  }
});

test("project images carry fail-closed demo source provenance", async () => {
  const [compose, dockerfile] = await Promise.all([
    readFile(composePath, "utf8"),
    readFile(dockerfilePath, "utf8"),
  ]);

  assert.match(
    compose,
    /org\.opencontainers\.image\.revision: \$\{BPMN_EVALUATION_SOURCE_REVISION:-unbound\}/u,
  );
  assert.match(
    compose,
    /io\.bpmn-lean\.evaluation\.source-tree-sha256: \$\{BPMN_EVALUATION_SOURCE_TREE_SHA256:-unbound\}/u,
  );
  for (const service of [
    "platform-migrate",
    "bpmn-worker",
    "platform-api",
    "platform-recovery-worker",
    "guided-demo-seed",
  ]) {
    assert.match(serviceBlock(compose, service), /<<: \*project-build/u);
  }
  assert.match(
    dockerfile,
    /org\.opencontainers\.image\.source="https:\/\/github\.com\/mbackschat\/bpmn-lean-experiment"/u,
  );
  assert.match(
    dockerfile,
    /org\.opencontainers\.image\.revision="\$\{BPMN_EVALUATION_SOURCE_REVISION\}"/u,
  );
  assert.match(
    dockerfile,
    /io\.bpmn-lean\.evaluation\.source-tree-sha256="\$\{BPMN_EVALUATION_SOURCE_TREE_SHA256\}"/u,
  );
});

test("published demo bundle replaces every project build with one exact image", async () => {
  const compose = await readFile(publishedComposePath, "utf8");
  const imageVariables = new Map([
    ["platform-migrate", "BPMN_EVALUATION_PLATFORM_MIGRATE_IMAGE"],
    ["bpmn-worker", "BPMN_EVALUATION_BPMN_WORKER_IMAGE"],
    ["platform-api", "BPMN_EVALUATION_PLATFORM_API_IMAGE"],
    ["platform-recovery-worker", "BPMN_EVALUATION_PLATFORM_RECOVERY_WORKER_IMAGE"],
    ["guided-demo-seed", "BPMN_EVALUATION_GUIDED_DEMO_SEED_IMAGE"],
  ]);

  for (const [service, variable] of imageVariables) {
    const block = serviceBlock(compose, service);
    assert.match(
      block,
      new RegExp(
        `${escapeRegex(`image: \${${variable}:?`)}[^}]+${escapeRegex("}")}`,
        "u",
      ),
    );
    assert.match(block, /build: !reset null/u);
  }
  assert.doesNotMatch(compose, /:local/u);
});

test("published demo launcher needs Docker but can never build", async () => {
  const launcher = await readFile(publishedLauncherPath, "utf8");

  assert.match(launcher, /^#!\/bin\/sh$/mu);
  assert.match(launcher, /docker compose/u);
  assert.match(launcher, /--no-build/u);
  assert.match(launcher, /--pull never/u);
  assert.match(launcher, /prepare\)/u);
  assert.match(launcher, /reset\)/u);
  assert.match(launcher, /start\)/u);
  assert.match(launcher, /status\)/u);
  assert.match(launcher, /stop\)/u);
  assert.match(launcher, /@sha256:\[0-9a-f\]\{64\}/u);
  assert.doesNotMatch(launcher, /^\. "\$environment_file"$/mu);
  assert.doesNotMatch(launcher, /(?:pnpm|npm|node|git|docker (?:compose )?build)/u);
});

test("evaluation workflow is manual or tagged and never routine", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /^  workflow_dispatch:$/mu);
  assert.match(workflow, /^  push:\n    tags:\n      - "v\*"$/mu);
  assert.doesNotMatch(workflow, /^  pull_request:/mu);
  assert.doesNotMatch(workflow, /^    branches:/mu);
  assert.match(workflow, /runs-on: ubuntu-latest/u);
  assert.doesNotMatch(workflow, /macos-/u);
  assert.match(workflow, /^      refresh_walkthrough_screenshots:$/mu);
  assert.match(
    workflow,
    /run: \.\/scripts\/pnpm\.sh run walkthrough:screenshots:refresh/u,
  );
  assert.match(
    workflow,
    /path: docs\/assets\/bpm-platform-browser-walkthrough\//u,
  );
  assert.match(
    workflow,
    /uses: docker\/setup-qemu-action@c7c53464625b32c7a7e944ae62b3e17d2b600130 # v3/u,
  );
  assert.match(
    workflow,
    /uses: docker\/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f # v3/u,
  );
  assert.match(workflow, /containerimage\.digest/u);
  assert.doesNotMatch(workflow, /imagetools inspect[^\n]+--raw[^\n]+sha256sum/u);
  assert.match(workflow, /guided-demo-seed/u);
  assert.match(
    workflow,
    /\.artifacts\/guided-live-demo\/deploy\/evaluation\/demo prepare/u,
  );
  assert.match(
    workflow,
    /--filter @bpmn-lean\/showcase-guided-live-demo exec playwright install --with-deps chromium/u,
  );
  assert.match(
    workflow,
    /BPMN_EVALUATION_ORIGIN: http:\/\/127\.0\.0\.1:3000/u,
  );
  const publishedPrepare = workflow.indexOf(
    ".artifacts/guided-live-demo/deploy/evaluation/demo prepare",
  );
  const guidedJourney = workflow.indexOf(
    "--filter @bpmn-lean/showcase-guided-live-demo run test:e2e:built",
  );
  const presenterReset = workflow.indexOf(
    ".artifacts/guided-live-demo/deploy/evaluation/demo reset",
  );
  assert.ok(publishedPrepare >= 0);
  assert.ok(guidedJourney > publishedPrepare);
  assert.ok(presenterReset > guidedJourney);
  assert.match(workflow, /name: guided-live-demo-acceptance-/u);
});

test("published candidate creation and acceptance are independently recoverable", async () => {
  const [workflow, bake, bundleBuilder, diagnostics, stability] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(bakePath, "utf8"),
    readFile(bundleBuilderPath, "utf8"),
    readFile(diagnosticsPath, "utf8"),
    readFile(stabilityPath, "utf8"),
  ]);

  assert.match(workflow, /^  published-candidate:$/mu);
  assert.match(workflow, /^  accept-published-candidate:$/mu);
  assert.match(workflow, /needs: published-candidate/u);
  assert.match(workflow, /^      published_revision:$/mu);
  assert.match(workflow, /docker buildx bake/u);
  assert.doesNotMatch(workflow, /docker buildx build/u);
  assert.match(
    workflow,
    /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8\.0\.1/u,
  );
  assert.match(workflow, /retention-days: 30/u);
  assert.match(workflow, /name: Collect acceptance diagnostics\n\s+if: always\(\)/u);
  assert.match(workflow, /name: Upload acceptance diagnostics\n\s+if: always\(\)/u);
  assert.match(
    workflow,
    /BPMN_PLAYWRIGHT_OUTPUT_DIR: \$\{\{ github\.workspace \}\}\/\.artifacts\/acceptance\/playwright\/journey-1\/test-results/u,
  );
  assert.match(
    workflow,
    /BPMN_PLAYWRIGHT_OUTPUT_DIR: \$\{\{ github\.workspace \}\}\/\.artifacts\/acceptance\/playwright\/journey-2\/test-results/u,
  );
  assert.match(workflow, /verify-runtime-stability\.sh/u);
  assert.match(workflow, /printf 'artifact=guided-live-demo-candidate-%s-%s/u);

  for (const target of [
    "platform-api",
    "platform-recovery-worker",
    "platform-migrate",
    "bpmn-worker",
    "guided-demo-seed",
  ]) {
    assert.match(bake, new RegExp(`target "${target}"`, "u"));
  }
  assert.match(bake, /platforms = \["linux\/amd64", "linux\/arm64"\]/u);
  assert.match(bake, /type=provenance,mode=max/u);
  assert.match(bake, /type=sbom/u);
  assert.match(bundleBuilder, /imagetools inspect/u);
  assert.doesNotMatch(bundleBuilder, /imagetools inspect[^\n]+--(?:format|raw)/u);
  assert.match(bundleBuilder, /\$1 == "Digest:"/u);
  assert.match(bundleBuilder, /published-images\.env/u);
  assert.match(bundleBuilder, /actual_revision=\$\(git -C "\$source_root" rev-parse HEAD\)/u);
  assert.match(bundleBuilder, /status --porcelain --untracked-files=all/u);
  assert.match(diagnostics, /logs --no-color --timestamps/u);
  assert.match(diagnostics, /RestartCount/u);
  assert.match(stability, /platform-recovery-worker/u);
  assert.match(stability, /RestartCount/u);
});

test("migration and runtime database credentials stay separate", async () => {
  const roles = await readFile(postgresqlRolesPath, "utf8");

  assert.match(roles, /GRANT CREATE ON DATABASE bpmn_platform TO bpmn_migration;/u);
  assert.doesNotMatch(roles, /GRANT CREATE ON DATABASE bpmn_platform TO [^;]*bpmn_runtime/u);
  assert.match(
    roles,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bpmn_runtime;/u,
  );
});

function serviceBlock(compose: string, service: string): string {
  const match = new RegExp(
    `^  ${escapeRegex(service)}:\n(?<body>(?: {4}.*(?:\\n|$))*)`,
    "mu",
  ).exec(compose);
  assert.ok(match?.groups?.body, `missing Compose service ${service}`);
  return match.groups.body;
}

function runtimeStage(dockerfile: string, target: string): string {
  const marker = `FROM runtime-base AS ${target}`;
  const start = dockerfile.indexOf(marker);
  assert.notEqual(start, -1, `missing Docker runtime target ${target}`);
  const next = dockerfile.indexOf("\nFROM ", start + marker.length);
  return dockerfile.slice(start, next === -1 ? undefined : next);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
