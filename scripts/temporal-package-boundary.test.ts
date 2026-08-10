import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { assessTemporalPackageBoundary } from "./temporal-package-boundary.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("keeps Temporal execution environments in separate package closures", async () => {
  assert.deepEqual(await assessTemporalPackageBoundary(repositoryRoot), []);
});

test("rejects the broad umbrella package and absent subsystem packages", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "temporal-package-boundary-"));
  const subsystem = path.join(root, "packages", "temporal-adapter");
  await mkdir(subsystem, { recursive: true });
  await writeManifest(path.join(subsystem, "package.json"), {
    name: "@bpmn-lean/temporal-adapter",
    private: true,
  });

  const findings = await assessTemporalPackageBoundary(root);
  assert(findings.some((finding) => finding.includes("production umbrella")));
  assert.equal(
    findings.filter((finding) => finding.includes("required package manifest is missing")).length,
    6,
  );
});

test("rejects test-server reachability from the production client", async () => {
  const root = await createValidBoundaryFixture();
  const clientManifest = path.join(
    root,
    "packages",
    "temporal-adapter",
    "client",
    "package.json",
  );
  await writeManifest(clientManifest, {
    name: "@bpmn-lean/temporal-client",
    private: true,
    dependencies: {
      "@bpmn-lean/temporal-protocol": "workspace:*",
      "@temporalio/client": "1.21.0",
      "@temporalio/testing": "1.21.0",
    },
  });

  assert.deepEqual(await assessTemporalPackageBoundary(root), [
    "packages/temporal-adapter/client/package.json: forbidden Temporal SDK dependency @temporalio/testing",
  ]);
});

test("permits only the concrete client through the Product 2 engine gateway", async () => {
  const root = await createValidBoundaryFixture();
  await writeManifest(
    path.join(root, "platform", "foundation", "engine-gateway", "package.json"),
    {
      name: "@example/engine-gateway",
      private: true,
      dependencies: {
        "@bpmn-lean/temporal-client": "workspace:*",
        "@bpmn-lean/temporal-worker": "workspace:*",
        "@temporalio/client": "1.21.0",
      },
    },
  );
  await writeManifest(
    path.join(root, "platform", "apps", "server", "package.json"),
    {
      name: "@example/server",
      private: true,
      dependencies: {
        "@bpmn-lean/temporal-client": "workspace:*",
      },
    },
  );
  await mkdir(path.join(root, "platform", "apps", "server", "src"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "platform", "apps", "server", "src", "direct.ts"),
    'import { WorkflowClient } from "@temporalio/client";\n',
  );
  await mkdir(
    path.join(root, "platform", "foundation", "engine-gateway", "src"),
    { recursive: true },
  );
  await writeFile(
    path.join(root, "platform", "foundation", "engine-gateway", "src", "worker.ts"),
    'import { Worker } from "@bpmn-lean/temporal-worker";\n',
  );

  assert.deepEqual(await assessTemporalPackageBoundary(root), [
    "platform/apps/server/package.json: Product 2 Temporal dependency @bpmn-lean/temporal-client is allowed only in platform/foundation/engine-gateway/package.json",
    "platform/apps/server/src/direct.ts: forbidden Product 2 Temporal SDK import @temporalio/client",
    "platform/foundation/engine-gateway/package.json: forbidden Product 2 Temporal SDK dependency @temporalio/client",
    "platform/foundation/engine-gateway/package.json: forbidden Product 2 Temporal dependency @bpmn-lean/temporal-worker",
    "platform/foundation/engine-gateway/src/worker.ts: forbidden Product 2 Temporal import @bpmn-lean/temporal-worker",
  ]);
});

test("rejects Node built-ins from Workflow-reachable protocol code", async () => {
  const root = await createValidBoundaryFixture();
  const protocolSource = path.join(
    root,
    "packages",
    "temporal-adapter",
    "protocol",
    "src",
  );
  const workflowSource = path.join(
    root,
    "packages",
    "temporal-adapter",
    "workflow",
    "src",
  );
  await mkdir(protocolSource, { recursive: true });
  await mkdir(workflowSource, { recursive: true });
  await writeFile(
    path.join(protocolSource, "command-identity.ts"),
    'import { createHash } from "node:crypto";\n',
  );
  await writeFile(
    path.join(workflowSource, "workflow.ts"),
    'import { readFile } from "node:fs/promises";\n',
  );

  assert.deepEqual(await assessTemporalPackageBoundary(root), [
    "packages/temporal-adapter/protocol/src/command-identity.ts: Workflow-reachable Node built-in node:crypto",
    "packages/temporal-adapter/workflow/src/workflow.ts: Workflow-reachable Node built-in node:fs/promises",
  ]);
});

async function createValidBoundaryFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "temporal-package-boundary-"));
  const manifests = {
    protocol: {
      name: "@bpmn-lean/temporal-protocol",
      private: true,
      dependencies: {},
    },
    client: {
      name: "@bpmn-lean/temporal-client",
      private: true,
      dependencies: {
        "@bpmn-lean/temporal-protocol": "workspace:*",
        "@temporalio/client": "1.21.0",
      },
    },
    workflow: {
      name: "@bpmn-lean/temporal-workflow",
      private: true,
      dependencies: {
        "@bpmn-lean/temporal-protocol": "workspace:*",
        "@temporalio/workflow": "1.21.0",
      },
    },
    worker: {
      name: "@bpmn-lean/temporal-worker",
      private: true,
      dependencies: {
        "@bpmn-lean/temporal-protocol": "workspace:*",
        "@bpmn-lean/temporal-client": "workspace:*",
        "@bpmn-lean/temporal-workflow": "workspace:*",
        "@temporalio/worker": "1.21.0",
      },
    },
    runner: {
      name: "@bpmn-lean/temporal-runner",
      private: true,
      dependencies: {
        "@bpmn-lean/temporal-protocol": "workspace:*",
        "@bpmn-lean/temporal-client": "workspace:*",
        "@bpmn-lean/temporal-worker": "workspace:*",
      },
    },
    testkit: {
      name: "@bpmn-lean/temporal-testkit",
      private: true,
      dependencies: {
        "@bpmn-lean/temporal-protocol": "workspace:*",
        "@bpmn-lean/temporal-client": "workspace:*",
        "@bpmn-lean/temporal-workflow": "workspace:*",
        "@bpmn-lean/temporal-worker": "workspace:*",
        "@bpmn-lean/temporal-runner": "workspace:*",
        "@temporalio/testing": "1.21.0",
      },
    },
  } as const;
  for (const [role, manifest] of Object.entries(manifests)) {
    await writeManifest(
      path.join(root, "packages", "temporal-adapter", role, "package.json"),
      manifest,
    );
  }
  return root;
}

async function writeManifest(
  filePath: string,
  manifest: unknown,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
}
