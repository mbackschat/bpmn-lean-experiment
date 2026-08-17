import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createPlatformServer,
  PlatformStorageMode,
} from "@bpmn-lean/platform-server";

test("selects shared composition without creating a local data directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-shared-composition-"));
  const dataDirectory = join(root, "must-not-exist");
  const calls: string[] = [];
  const runtime = fakeRuntime();
  try {
    const selected = await createPlatformServer(config({
      storageMode: PlatformStorageMode.Shared,
      postgresqlRuntimeUrl: "postgresql://runtime.example/platform",
      projectionMaxAgeMs: 5_000,
      dataDirectory,
    }), {
      createLocalServer: async () => {
        calls.push("local");
        throw new Error("local composition must not run");
      },
      createSharedServer: async () => {
        calls.push("shared");
        return runtime;
      },
    });

    assert.equal(selected, runtime);
    assert.deepEqual(calls, ["shared"]);
    await assert.rejects(stat(dataDirectory), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps local composition as the explicit default branch", async () => {
  const calls: string[] = [];
  const runtime = fakeRuntime();
  const selected = await createPlatformServer(config({
    storageMode: PlatformStorageMode.Local,
    postgresqlRuntimeUrl: null,
    projectionMaxAgeMs: null,
  }), {
    createLocalServer: async () => {
      calls.push("local");
      return runtime;
    },
    createSharedServer: async () => {
      calls.push("shared");
      throw new Error("shared composition must not run");
    },
  });

  assert.equal(selected, runtime);
  assert.deepEqual(calls, ["local"]);
});

function config(overrides: Readonly<Record<string, unknown>>) {
  return {
    storageMode: PlatformStorageMode.Local,
    postgresqlRuntimeUrl: null,
    projectionMaxAgeMs: null,
    host: "127.0.0.1",
    port: 3_000,
    publicOrigin: "http://127.0.0.1:3000",
    dataDirectory: ".data/platform",
    maxSourceBytes: 1_024,
    parserDeadlineMs: 1_000,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "bpmn-semantic",
    temporalConnectTimeoutMs: 5_000,
    fakeActorId: "demo-user",
    fakeActorGroups: ["reviewers", "operators"],
    operationsGroupId: "operators",
    maxWorkProcesses: 100,
    maxWorkTasks: 1_000,
    ...overrides,
  } as const;
}

function fakeRuntime() {
  return {
    listen: async () => "http://127.0.0.1:3000",
    close: async () => undefined,
  };
}
