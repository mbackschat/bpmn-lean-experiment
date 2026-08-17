import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PlatformStorageMode,
  readPlatformServerConfig,
} from "@bpmn-lean/platform-server";

test("provides bounded local-MVP defaults", () => {
  assert.deepEqual(readPlatformServerConfig({}), {
    storageMode: PlatformStorageMode.Local,
    postgresqlRuntimeUrl: null,
    projectionMaxAgeMs: null,
    webAssetDirectory: null,
    host: "127.0.0.1",
    port: 3000,
    publicOrigin: "http://127.0.0.1:3000",
    dataDirectory: ".data/platform",
    maxSourceBytes: 1024 * 1024,
    parserDeadlineMs: 1000,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "bpmn-semantic",
    temporalConnectTimeoutMs: 5000,
    fakeActorId: "demo-user",
    fakeActorGroups: ["reviewers", "operators"],
    operationsGroupId: "operators",
    maxWorkProcesses: 100,
    maxWorkTasks: 1000,
  });
});

test("snapshots explicit environment configuration", () => {
  const environment: NodeJS.ProcessEnv = {
    PLATFORM_HOST: "localhost",
    PLATFORM_PORT: "004321",
    PLATFORM_PUBLIC_ORIGIN: "https://process.example",
    PLATFORM_DATA_DIRECTORY: "/tmp/platform-data",
    PLATFORM_WEB_ASSET_DIRECTORY: "/tmp/platform-web",
    PLATFORM_MAX_SOURCE_BYTES: "2097152",
    PLATFORM_PARSER_DEADLINE_MS: "2500",
    PLATFORM_TEMPORAL_ADDRESS: "temporal.internal:7233",
    PLATFORM_TEMPORAL_NAMESPACE: "processes",
    PLATFORM_TEMPORAL_TASK_QUEUE: "platform-processes",
    PLATFORM_TEMPORAL_CONNECT_TIMEOUT_MS: "4000",
    PLATFORM_FAKE_ACTOR_ID: "reviewer-1",
    PLATFORM_FAKE_ACTOR_GROUPS_JSON: '["reviewers","managers"]',
    PLATFORM_OPERATIONS_GROUP_ID: "process-operators",
    PLATFORM_MAX_WORK_PROCESSES: "40",
    PLATFORM_MAX_WORK_TASKS: "250",
  };
  const config = readPlatformServerConfig(environment);
  environment.PLATFORM_HOST = "attacker.invalid";
  assert.deepEqual(config, {
    storageMode: PlatformStorageMode.Local,
    postgresqlRuntimeUrl: null,
    projectionMaxAgeMs: null,
    webAssetDirectory: "/tmp/platform-web",
    host: "localhost",
    port: 4321,
    publicOrigin: "https://process.example",
    dataDirectory: "/tmp/platform-data",
    maxSourceBytes: 2097152,
    parserDeadlineMs: 2500,
    temporalAddress: "temporal.internal:7233",
    temporalNamespace: "processes",
    temporalTaskQueue: "platform-processes",
    temporalConnectTimeoutMs: 4000,
    fakeActorId: "reviewer-1",
    fakeActorGroups: ["reviewers", "managers"],
    operationsGroupId: "process-operators",
    maxWorkProcesses: 40,
    maxWorkTasks: 250,
  });
});

test("requires an explicit runtime credential and freshness age in shared mode", () => {
  assert.deepEqual(readPlatformServerConfig({
    PLATFORM_STORAGE_MODE: "shared",
    PLATFORM_POSTGRESQL_RUNTIME_URL: "postgresql://runtime@localhost/platform",
    PLATFORM_PROJECTION_MAX_AGE_MS: "2500",
  }), {
    storageMode: PlatformStorageMode.Shared,
    postgresqlRuntimeUrl: "postgresql://runtime@localhost/platform",
    projectionMaxAgeMs: 2500,
    webAssetDirectory: null,
    host: "127.0.0.1",
    port: 3000,
    publicOrigin: "http://127.0.0.1:3000",
    dataDirectory: ".data/platform",
    maxSourceBytes: 1024 * 1024,
    parserDeadlineMs: 1000,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "bpmn-semantic",
    temporalConnectTimeoutMs: 5000,
    fakeActorId: "demo-user",
    fakeActorGroups: ["reviewers", "operators"],
    operationsGroupId: "operators",
    maxWorkProcesses: 100,
    maxWorkTasks: 1000,
  });

  for (const environment of [
    { PLATFORM_STORAGE_MODE: "shared" },
    {
      PLATFORM_STORAGE_MODE: "shared",
      PLATFORM_POSTGRESQL_MIGRATION_URL: "postgresql://migration@localhost/platform",
      PLATFORM_PROJECTION_MAX_AGE_MS: "2500",
    },
    {
      PLATFORM_STORAGE_MODE: "shared",
      PLATFORM_POSTGRESQL_RUNTIME_URL: "postgresql://runtime@localhost/platform",
    },
  ]) {
    assert.throws(
      () => readPlatformServerConfig(environment),
      /PLATFORM_POSTGRESQL_RUNTIME_URL|PLATFORM_PROJECTION_MAX_AGE_MS/u,
    );
  }
});

test("rejects empty strings and malformed, unsafe, or out-of-range integers", () => {
  for (const name of [
    "PLATFORM_HOST",
    "PLATFORM_PUBLIC_ORIGIN",
    "PLATFORM_DATA_DIRECTORY",
    "PLATFORM_WEB_ASSET_DIRECTORY",
    "PLATFORM_TEMPORAL_ADDRESS",
    "PLATFORM_TEMPORAL_NAMESPACE",
    "PLATFORM_TEMPORAL_TASK_QUEUE",
    "PLATFORM_FAKE_ACTOR_ID",
    "PLATFORM_OPERATIONS_GROUP_ID",
    "PLATFORM_POSTGRESQL_RUNTIME_URL",
  ]) {
    assert.throws(
      () => readPlatformServerConfig({ [name]: "" }),
      new RegExp(name, "u"),
    );
  }

  assert.throws(
    () => readPlatformServerConfig({ PLATFORM_OPERATIONS_GROUP_ID: "\uD800" }),
    /PLATFORM_OPERATIONS_GROUP_ID/u,
  );

  for (const name of [
    "PLATFORM_PORT",
    "PLATFORM_MAX_SOURCE_BYTES",
    "PLATFORM_PARSER_DEADLINE_MS",
    "PLATFORM_TEMPORAL_CONNECT_TIMEOUT_MS",
    "PLATFORM_MAX_WORK_PROCESSES",
    "PLATFORM_MAX_WORK_TASKS",
    "PLATFORM_PROJECTION_MAX_AGE_MS",
  ]) {
    for (const value of ["0", "-1", "1.5", "1e3", "abc", "9007199254740992"]) {
      assert.throws(
        () => readPlatformServerConfig({ [name]: value }),
        new RegExp(name, "u"),
      );
    }
  }
  assert.throws(
    () => readPlatformServerConfig({ PLATFORM_STORAGE_MODE: "postgresql" }),
    /PLATFORM_STORAGE_MODE/u,
  );
  assert.throws(
    () => readPlatformServerConfig({ PLATFORM_PORT: "65536" }),
    /PLATFORM_PORT/u,
  );

  for (const value of [
    "not-json",
    "{}",
    "[]",
    '["reviewers",""]',
    '["reviewers","reviewers"]',
    '["reviewers",1]',
    '["reviewers"] trailing',
  ]) {
    assert.throws(
      () => readPlatformServerConfig({ PLATFORM_FAKE_ACTOR_GROUPS_JSON: value }),
      /PLATFORM_FAKE_ACTOR_GROUPS_JSON/u,
    );
  }
});
