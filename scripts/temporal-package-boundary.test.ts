import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { assessTemporalPackageBoundary } from "./temporal-package-boundary.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const fixtureSdkVersion = "9.9.9-fixture";

test("keeps the Temporal host's execution environments and Product 2 inside their boundaries", async () => {
  assert.deepEqual(await assessTemporalPackageBoundary(repositoryRoot), []);
});

test("reports an absent host package and absent environment entries", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "temporal-package-boundary-"));
  assert.deepEqual(await assessTemporalPackageBoundary(root), [
    "packages/temporal-host/package.json: required package manifest is missing",
    "packages/temporal-host/src/client.ts: client entry or module is missing",
    "packages/temporal-host/src/host.ts: host entry or module is missing",
    "packages/temporal-host/src/worker.ts: worker entry or module is missing",
    "packages/temporal-host/src/workflows.ts: workflow entry or module is missing",
  ]);
});

test("accepts the minimal valid host", async () => {
  assert.deepEqual(await assessTemporalPackageBoundary(await createValidHostFixture()), []);
});

test("rejects unreviewed SDK and workspace dependencies of the host", async () => {
  const root = await createValidHostFixture();
  await writeManifest(path.join(root, "packages/temporal-host/package.json"), {
    name: "@bpmn-lean/temporal-host",
    dependencies: {
      "@bpmn-lean/kernel": "^0.1.0",
      "@bpmn-lean/platform-server": "workspace:*",
      "@temporalio/client": fixtureSdkVersion,
      "@temporalio/interceptors-opentelemetry": fixtureSdkVersion,
    },
  });

  assert.deepEqual(await assessTemporalPackageBoundary(root), [
    "packages/temporal-host/package.json: @bpmn-lean/kernel must be an exact workspace dependency",
    "packages/temporal-host/package.json: forbidden Temporal SDK dependency @temporalio/interceptors-opentelemetry",
    "packages/temporal-host/package.json: forbidden workspace dependency @bpmn-lean/platform-server",
    "packages/temporal-host/package.json: package must remain private before release packaging exists",
  ]);
});

test("follows relative imports to a Workflow-reachable Node built-in or non-Workflow SDK", async () => {
  const root = await createValidHostFixture();
  await writeSource(root, "src/workflows.ts", 'import { run } from "./workflow-host.js";\n');
  await writeSource(root, "src/workflow-host.ts", [
    'import { proxyActivities } from "@temporalio/workflow";',
    'import { createHash } from "node:crypto";',
    'import { Context } from "@temporalio/activity";',
  ].join("\n"));

  assert.deepEqual(await assessTemporalPackageBoundary(root), [
    "packages/temporal-host/src/workflow-host.ts: workflow-reachable Node built-in node:crypto",
    "packages/temporal-host/src/workflow-host.ts: workflow-reachable Temporal SDK @temporalio/activity",
  ]);
});

test("rejects test-server reachability from the production client and the engine host", async () => {
  const root = await createValidHostFixture();
  await writeSource(root, "src/client.ts", 'import { Client } from "@temporalio/client";\nimport "./shared.js";\n');
  await writeSource(root, "src/host.ts", 'import "./shared.js";\n');
  await writeSource(root, "src/shared.ts", 'import { TestWorkflowEnvironment } from "@temporalio/testing";\n');

  assert.deepEqual(await assessTemporalPackageBoundary(root), [
    "packages/temporal-host/src/shared.ts: client-reachable Temporal SDK @temporalio/testing",
    "packages/temporal-host/src/shared.ts: host-reachable Temporal SDK @temporalio/testing",
  ]);
});

test("keeps Product 2 off the Temporal SDK and the host package", async () => {
  const root = await createValidHostFixture();
  await writeManifest(path.join(root, "platform/foundation/engine-gateway/package.json"), {
    name: "@example/engine-gateway",
    private: true,
    dependencies: { "@bpmn-lean/engine-api": "workspace:*", "@bpmn-lean/temporal-host": "workspace:*" },
    devDependencies: { "@temporalio/testing": fixtureSdkVersion },
  });
  await mkdir(path.join(root, "platform/apps/server/src"), { recursive: true });
  await writeFile(path.join(root, "platform/apps/server/src/direct.ts"), [
    'import { Client } from "@temporalio/client";',
    'import { createProcessHost } from "@bpmn-lean/temporal-host/host";',
    'import type { EngineHost } from "@bpmn-lean/engine-api";',
  ].join("\n"));

  assert.deepEqual(await assessTemporalPackageBoundary(root), [
    "platform/apps/server/src/direct.ts: forbidden Product 2 Temporal import @bpmn-lean/temporal-host/host",
    "platform/apps/server/src/direct.ts: forbidden Product 2 Temporal import @temporalio/client",
    "platform/foundation/engine-gateway/package.json: forbidden Product 2 Temporal dependency @bpmn-lean/temporal-host",
    "platform/foundation/engine-gateway/package.json: forbidden Product 2 Temporal dependency @temporalio/testing",
  ]);
});

async function createValidHostFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "temporal-package-boundary-"));
  await writeManifest(path.join(root, "packages/temporal-host/package.json"), {
    name: "@bpmn-lean/temporal-host",
    private: true,
    dependencies: {
      "@bpmn-lean/kernel": "workspace:*",
      "@temporalio/client": fixtureSdkVersion,
      "@temporalio/testing": fixtureSdkVersion,
      "@temporalio/worker": fixtureSdkVersion,
      "@temporalio/workflow": fixtureSdkVersion,
    },
  });
  await writeSource(root, "src/workflows.ts", 'import { defineQuery } from "@temporalio/workflow";\n');
  await writeSource(root, "src/client.ts", 'import { Client } from "@temporalio/client";\n');
  await writeSource(root, "src/host.ts", 'import { createClient } from "./client.js";\n');
  await writeSource(root, "src/worker.ts", 'import { Worker } from "@temporalio/worker";\nimport { fileURLToPath } from "node:url";\n');
  return root;
}

async function writeSource(root: string, relativePath: string, source: string): Promise<void> {
  const filePath = path.join(root, "packages/temporal-host", relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, source);
}

async function writeManifest(filePath: string, manifest: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
}
