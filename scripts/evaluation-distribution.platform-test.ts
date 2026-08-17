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
const postgresqlRolesPath = new URL(
  "../deploy/evaluation/postgresql/001_roles.sql",
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
  assert.match(dockerfile, /--config\.inject-workspace-packages=true/u);
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
