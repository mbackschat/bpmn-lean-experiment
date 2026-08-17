import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkSharedPlatformServerReadiness,
} from "@bpmn-lean/platform-server";

test("proves only PostgreSQL 18, epoch 9, and engine connectivity", async () => {
  const statements: string[] = [];
  let engineChecks = 0;
  await checkSharedPlatformServerReadiness({
    runtime: {
      query: async ({ text }) => {
        statements.push(text);
        return {
          rows: [{ server_major: 18, epoch_rows: 1, schema_epoch: 9 }],
          rowCount: 1,
        };
      },
    },
    engineRuntime: {
      ensureConnected: async () => {
        engineChecks += 1;
      },
    },
  });

  assert.equal(statements.length, 1);
  assert.doesNotMatch(statements[0]!, /count\([^)]*(?:process|lease|generation|outbox)/iu);
  assert.doesNotMatch(statements[0]!, /recovery_leases|work_processes|operate_process_instances/iu);
  assert.equal(engineChecks, 1);
});

test("refuses the wrong PostgreSQL major or schema epoch before engine readiness", async () => {
  for (const row of [
    { server_major: 17, epoch_rows: 1, schema_epoch: 9 },
    { server_major: 18, epoch_rows: 2, schema_epoch: 9 },
    { server_major: 18, epoch_rows: 1, schema_epoch: 8 },
  ]) {
    let engineChecks = 0;
    await assert.rejects(checkSharedPlatformServerReadiness({
      runtime: {
        query: async () => ({ rows: [row], rowCount: 1 }),
      },
      engineRuntime: {
        ensureConnected: async () => {
          engineChecks += 1;
        },
      },
    }), /readiness contract/u);
    assert.equal(engineChecks, 0);
  }
});
