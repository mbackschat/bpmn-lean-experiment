import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createRecoveryWorker,
} from "../dist/composition.js";
import { readRecoveryWorkerConfig } from "../dist/config.js";
import { recoveryWorkerFamilies } from "../dist/family-loops.js";

const config = readRecoveryWorkerConfig({
  PLATFORM_POSTGRESQL_RUNTIME_URL: "postgresql://runtime@127.0.0.1/platform",
  PLATFORM_RECOVERY_WORKER_ID: "worker-a",
  PLATFORM_PROJECTION_MAX_AGE_MS: "3000",
});

test("creates one PostgreSQL owner and one engine owner before bounded readiness", async () => {
  const events: string[] = [];
  const postgresql = { close: async () => { events.push("close:postgresql"); } };
  const engine = { close: async () => { events.push("close:engine"); } };
  const runtime = await createRecoveryWorker(config, {
    createPostgresqlRuntime: () => { events.push("create:postgresql"); return postgresql as never; },
    createEngineRuntime: () => { events.push("create:engine"); return engine as never; },
    checkReadiness: async () => { events.push("readiness"); },
    createLoops: () => {
      events.push("loops");
      return recoveryWorkerFamilies.map((family) => ({
        family,
        runUntilAborted: async () => undefined,
      }));
    },
    report: async () => undefined,
  });
  assert.deepEqual(events, ["create:postgresql", "create:engine", "readiness", "loops"]);
  await runtime.close();
  assert.deepEqual(events.slice(-2), ["close:engine", "close:postgresql"]);
});

test("readiness failure attempts both owner closes", async () => {
  const events: string[] = [];
  await assert.rejects(
    createRecoveryWorker(config, {
      createPostgresqlRuntime: () => ({
        close: async () => { events.push("close:postgresql"); },
      }) as never,
      createEngineRuntime: () => ({
        close: async () => { events.push("close:engine"); },
      }) as never,
      checkReadiness: async () => { throw new Error("not ready"); },
      createLoops: () => { throw new Error("loops must not be created"); },
    }),
    /not ready/u,
  );
  assert.deepEqual(events, ["close:engine", "close:postgresql"]);
});

test("composition contains no migration, population scan, or unbounded reconciliation hook", async () => {
  const source = await readFile(
    new URL("../src/composition.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /migrat|listNonclosed|reconcileAll/u);
});
