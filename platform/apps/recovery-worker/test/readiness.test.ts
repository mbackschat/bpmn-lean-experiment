import assert from "node:assert/strict";
import test from "node:test";

import { LeaseMutationResult } from "@bpmn-lean/platform-recovery-runtime";

import {
  checkRecoveryWorkerReadiness,
  RECOVERY_WORKER_SCHEMA_EPOCH,
} from "../dist/readiness.js";

test("proves version and exact epoch in one query, a disposable lease, and engine connectivity", async () => {
  const events: string[] = [];
  const runtime = {
    query: async ({ text }: { text: string }) => {
      events.push("query");
      assert.match(text, /server_version_num/u);
      assert.match(text, /schema_epoch/u);
      return {
        rows: [{ server_major: 18, epoch_rows: 1, schema_epoch: RECOVERY_WORKER_SCHEMA_EPOCH }],
        rowCount: 1,
      };
    },
  };
  const leaseStore = {
    claimCandidates: async (input: { candidateKeys: readonly Uint8Array[] }) => {
      events.push("claim");
      assert.equal(input.candidateKeys.length, 1);
      return [{
        family: "recovery-worker.readiness",
        itemKey: input.candidateKeys[0]!,
        leaseToken: "00000000-0000-4000-8000-000000000001",
        workerId: new TextEncoder().encode("worker"),
        leaseExpiresAtEpochMs: Date.now() + 30_000,
        attempt: 1,
      }];
    },
    complete: async (_lease: unknown, apply: (session: unknown) => Promise<void>) => {
      events.push("complete");
      await apply({});
      return LeaseMutationResult.Applied;
    },
  };
  await checkRecoveryWorkerReadiness({
    runtime: runtime as never,
    engineRuntime: { ensureConnected: async () => { events.push("engine"); } },
    leaseStore: leaseStore as never,
    workerId: new TextEncoder().encode("worker"),
    leaseDurationMs: 30_000,
    createLeaseToken: () => "00000000-0000-4000-8000-000000000001",
    createReadinessItemKey: () => new TextEncoder().encode("unique"),
  });
  assert.deepEqual(events, ["query", "claim", "complete", "engine"]);
});

test("fails readiness for the wrong major, row cardinality, epoch, or lease result", async () => {
  for (const row of [
    { server_major: 17, epoch_rows: 1, schema_epoch: RECOVERY_WORKER_SCHEMA_EPOCH },
    { server_major: 18, epoch_rows: 2, schema_epoch: RECOVERY_WORKER_SCHEMA_EPOCH },
    { server_major: 18, epoch_rows: 1, schema_epoch: RECOVERY_WORKER_SCHEMA_EPOCH - 1 },
  ]) {
    await assert.rejects(
      checkRecoveryWorkerReadiness(readinessFixture(row).options),
      /readiness/u,
    );
  }
  const fixture = readinessFixture({
    server_major: 18,
    epoch_rows: 1,
    schema_epoch: RECOVERY_WORKER_SCHEMA_EPOCH,
  }, LeaseMutationResult.LeaseLost);
  await assert.rejects(checkRecoveryWorkerReadiness(fixture.options), /readiness lease/u);
  assert.equal(fixture.engineCalls(), 0);
});

function readinessFixture(
  row: Record<string, number>,
  mutation = LeaseMutationResult.Applied,
) {
  let calls = 0;
  return {
    engineCalls: () => calls,
    options: {
      runtime: { query: async () => ({ rows: [row], rowCount: 1 }) } as never,
      engineRuntime: { ensureConnected: async () => { calls += 1; } },
      leaseStore: {
        claimCandidates: async (input: { candidateKeys: readonly Uint8Array[] }) => [{
          family: "recovery-worker.readiness",
          itemKey: input.candidateKeys[0]!,
          leaseToken: "00000000-0000-4000-8000-000000000001",
          workerId: new TextEncoder().encode("worker"),
          leaseExpiresAtEpochMs: Date.now() + 30_000,
          attempt: 1,
        }],
        complete: async () => mutation,
      } as never,
      workerId: new TextEncoder().encode("worker"),
      leaseDurationMs: 30_000,
      createLeaseToken: () => "00000000-0000-4000-8000-000000000001",
      createReadinessItemKey: () => new TextEncoder().encode("unique"),
    },
  };
}
