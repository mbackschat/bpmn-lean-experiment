import assert from "node:assert/strict";
import test from "node:test";

import {
  readRecoveryWorkerConfig,
  snapshotRecoveryWorkerConfig,
} from "../dist/config.js";

const required = {
  PLATFORM_POSTGRESQL_RUNTIME_URL: "postgresql://runtime:secret@127.0.0.1/platform",
  PLATFORM_RECOVERY_WORKER_ID: "worker-a",
  PLATFORM_PROJECTION_MAX_AGE_MS: "3000",
};

test("requires the runtime credential, worker identity, and projection age without migration fallback", () => {
  assert.throws(
    () => readRecoveryWorkerConfig({
      PLATFORM_POSTGRESQL_MIGRATION_URL: required.PLATFORM_POSTGRESQL_RUNTIME_URL,
      PLATFORM_RECOVERY_WORKER_ID: required.PLATFORM_RECOVERY_WORKER_ID,
      PLATFORM_PROJECTION_MAX_AGE_MS: required.PLATFORM_PROJECTION_MAX_AGE_MS,
    }),
    /PLATFORM_POSTGRESQL_RUNTIME_URL/u,
  );
  assert.throws(
    () => readRecoveryWorkerConfig({ ...required, PLATFORM_RECOVERY_WORKER_ID: "" }),
    /PLATFORM_RECOVERY_WORKER_ID/u,
  );
  assert.throws(
    () => readRecoveryWorkerConfig({ ...required, PLATFORM_RECOVERY_WORKER_ID: "   " }),
    /workerId/u,
  );
  assert.throws(
    () => readRecoveryWorkerConfig({ ...required, PLATFORM_POSTGRESQL_RUNTIME_URL: "not a url" }),
    (error: unknown) => error instanceof Error &&
      !error.message.includes("runtime:secret"),
  );
});

test("uses bounded local defaults and snapshots the caller environment", () => {
  const environment = { ...required };
  const config = readRecoveryWorkerConfig(environment);
  environment.PLATFORM_RECOVERY_WORKER_ID = "changed";
  assert.equal(config.workerId, "worker-a");
  assert.equal(config.maxSourceBytes, 1_048_576);
  assert.equal(config.parserDeadlineMs, 1_000);
  assert.equal(config.temporalAddress, "127.0.0.1:7233");
  assert.equal(config.postgresqlMaxConnections, 16);
  assert.equal(config.candidateLimit, 1_000);
  assert.equal(config.batchSize, 100);
  assert.equal(config.leaseDurationMs, 30_000);
  assert.equal(config.itemDeadlineMs, 10_000);
  assert.equal(config.retryDelayMs, 1_000);
  assert.equal(config.concurrencyPerFamily, 1);
  assert.equal(config.pollingDelayMs, 250);
  assert.equal(config.auditBatchSize, 100);
  assert.equal(config.maxWorkTasksPerProcess, 1_000);
  assert.equal(config.maxIncidentsPerProcess, 1_000);
});

test("rejects unsafe bounds and inconsistent batch and lease relationships", () => {
  for (const [name, value] of [
    ["PLATFORM_RECOVERY_CANDIDATE_LIMIT", "0"],
    ["PLATFORM_RECOVERY_BATCH_SIZE", "1.5"],
    ["PLATFORM_RECOVERY_LEASE_DURATION_MS", "9007199254740992"],
  ] as const) {
    assert.throws(() => readRecoveryWorkerConfig({ ...required, [name]: value }), /positive/u);
  }
  assert.throws(
    () => readRecoveryWorkerConfig({
      ...required,
      PLATFORM_RECOVERY_CANDIDATE_LIMIT: "10",
      PLATFORM_RECOVERY_BATCH_SIZE: "11",
    }),
    /candidateLimit.*batchSize/u,
  );
  assert.throws(
    () => readRecoveryWorkerConfig({
      ...required,
      PLATFORM_RECOVERY_LEASE_DURATION_MS: "10000",
      PLATFORM_RECOVERY_ITEM_DEADLINE_MS: "10000",
    }),
    /itemDeadlineMs.*leaseDurationMs/u,
  );
});

test("validates programmatic configuration without retaining credential-bearing objects", () => {
  const config = readRecoveryWorkerConfig(required);
  const snapshot = snapshotRecoveryWorkerConfig(config);
  assert.notEqual(snapshot, config);
  assert.equal(snapshot.postgresqlRuntimeUrl, config.postgresqlRuntimeUrl);
  assert.throws(
    () => snapshotRecoveryWorkerConfig({ ...config, candidateLimit: 10, batchSize: 11 }),
    /candidateLimit.*batchSize/u,
  );
});
