import type {
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  LeaseMutationResult,
  PostgresqlRecoveryLeaseStore,
} from "@bpmn-lean/platform-recovery-runtime";
import type {
  RecoveryLeaseStore,
} from "@bpmn-lean/platform-recovery-runtime";

export const RECOVERY_WORKER_SCHEMA_EPOCH = 11;
const readinessFamily = "recovery-worker.readiness";

type ReadinessRow = PostgresqlRow & Readonly<{
  server_major: unknown;
  epoch_rows: unknown;
  schema_epoch: unknown;
}>;

export type RecoveryWorkerReadinessOptions = Readonly<{
  runtime: PostgresqlRuntime;
  engineRuntime: Readonly<{ ensureConnected(): Promise<void> }>;
  workerId: Uint8Array;
  leaseDurationMs: number;
  createLeaseToken: () => string;
  createReadinessItemKey: () => Uint8Array;
  leaseStore?: RecoveryLeaseStore;
}>;

/** Proves only bounded infrastructure health. It never discovers or counts domain work. */
export async function checkRecoveryWorkerReadiness(
  options: RecoveryWorkerReadinessOptions,
): Promise<void> {
  const result = await options.runtime.query<ReadinessRow>({
    text: `
      SELECT
        current_setting('server_version_num')::integer / 10000 AS server_major,
        count(*)::integer AS epoch_rows,
        min(epoch)::integer AS schema_epoch
      FROM bpmn_platform_meta.schema_epoch
    `,
  });
  const row = exactlyOne(result.rows);
  if (
    decodeInteger(row.server_major) !== 18 ||
    decodeInteger(row.epoch_rows) !== 1 ||
    decodeInteger(row.schema_epoch) !== RECOVERY_WORKER_SCHEMA_EPOCH
  ) {
    throw new Error("recovery-worker PostgreSQL readiness contract is not satisfied");
  }

  const store = options.leaseStore ?? new PostgresqlRecoveryLeaseStore(options.runtime);
  const itemKey = snapshotNonemptyBytes(options.createReadinessItemKey());
  const leases = await store.claimCandidates({
    family: readinessFamily,
    candidateKeys: [itemKey],
    batchSize: 1,
    leaseDurationMs: options.leaseDurationMs,
    workerId: snapshotNonemptyBytes(options.workerId),
    createLeaseToken: options.createLeaseToken,
  });
  if (leases.length !== 1) {
    throw new Error("recovery-worker readiness lease was not claimed");
  }
  const completed = await store.complete(leases[0]!, async () => undefined);
  if (completed !== LeaseMutationResult.Applied) {
    throw new Error("recovery-worker readiness lease was lost");
  }
  await options.engineRuntime.ensureConnected();
}

function exactlyOne(rows: readonly ReadinessRow[]): ReadinessRow {
  if (rows.length !== 1) {
    throw new Error("recovery-worker PostgreSQL readiness returned the wrong row count");
  }
  return rows[0]!;
}

function decodeInteger(value: unknown): number {
  const decoded = typeof value === "string" ? Number(value) : value;
  return Number.isSafeInteger(decoded) ? decoded as number : -1;
}

function snapshotNonemptyBytes(value: Uint8Array): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new TypeError("recovery-worker readiness identity must be nonempty bytes");
  }
  return Uint8Array.from(value);
}
