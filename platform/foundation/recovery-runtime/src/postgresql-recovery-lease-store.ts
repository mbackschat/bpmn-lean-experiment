import type {
  PostgresqlRow,
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  LeaseMutationResult,
  RecoveryLeaseIntegrityError,
} from "./recovery-contracts.js";
import type {
  ClaimCandidatesInput,
  FailLeaseInput,
  RecoveryLease,
  RecoveryLeaseStore,
  RetryLeaseInput,
} from "./recovery-contracts.js";
import {
  snapshotClaimCandidates,
  snapshotFailure,
  snapshotLease,
  snapshotRetry,
  validateLeaseToken,
} from "./recovery-values.js";

type SelectedRow = PostgresqlRow & Readonly<{
  item_key: Uint8Array;
}>;

type ClaimedRow = PostgresqlRow & Readonly<{
  lease_expires_at_epoch_ms: string | number;
  attempt_count: string | number;
}>;

type LockedLeaseRow = PostgresqlRow & Readonly<{
  state: string;
  lease_token: string | null;
}>;

/** PostgreSQL lease adapter over a caller-owned runtime. */
export class PostgresqlRecoveryLeaseStore implements RecoveryLeaseStore {
  readonly #runtime: PostgresqlRuntime;

  constructor(runtime: PostgresqlRuntime) {
    this.#runtime = runtime;
  }

  /** Claims a stable supplied-order batch in one committed `READ COMMITTED` transaction. */
  async claimCandidates(
    input: ClaimCandidatesInput,
  ): Promise<readonly RecoveryLease[]> {
    const snapshot = snapshotClaimCandidates(input);
    if (snapshot.candidateKeys.length === 0) {
      return [];
    }
    return await this.#runtime.transaction(async (session) => {
      const candidateBuffers = snapshot.candidateKeys.map((key) => Buffer.from(key));
      await session.query({
        text: `
          INSERT INTO bpmn_platform.recovery_leases (
            family, item_key, state, next_attempt_at, attempt_count
          )
          SELECT $1, candidate.item_key, 'ready', clock_timestamp(), 0
          FROM unnest($2::bytea[]) AS candidate(item_key)
          ON CONFLICT (family, item_key) DO NOTHING
        `,
        values: [snapshot.family, candidateBuffers],
      });
      const selected = await session.query<SelectedRow>({
        text: `
          /* recovery:select-candidates */
          WITH candidates AS (
            SELECT candidate.item_key, candidate.supplied_order
            FROM unnest($2::bytea[]) WITH ORDINALITY
              AS candidate(item_key, supplied_order)
          )
          SELECT lease.item_key
          FROM candidates
          JOIN bpmn_platform.recovery_leases AS lease
            ON lease.family = $1 AND lease.item_key = candidates.item_key
          WHERE
            (lease.state = 'ready' AND lease.next_attempt_at <= clock_timestamp())
            OR (lease.state = 'leased' AND lease.lease_expires_at <= clock_timestamp())
          ORDER BY candidates.supplied_order
          LIMIT $3
          FOR UPDATE OF lease SKIP LOCKED
        `,
        values: [snapshot.family, candidateBuffers, snapshot.batchSize],
      });
      const usedTokens = new Set<string>();
      const leases: RecoveryLease[] = [];
      for (const row of selected.rows) {
        const itemKey = decodeBytes(row.item_key, "item_key");
        const leaseToken = snapshot.createLeaseToken();
        validateLeaseToken(leaseToken);
        if (usedTokens.has(leaseToken)) {
          throw new RecoveryLeaseIntegrityError(
            "lease token factory returned a duplicate token in one claim batch",
          );
        }
        usedTokens.add(leaseToken);
        const claimed = await session.query<ClaimedRow>({
          text: `
            UPDATE bpmn_platform.recovery_leases
            SET
              state = 'leased',
              lease_token = $3::uuid,
              worker_id = $4,
              lease_expires_at = clock_timestamp() + ($5 * interval '1 millisecond'),
              next_attempt_at = NULL,
              attempt_count = attempt_count + 1,
              failure_code = NULL,
              failure_evidence = NULL
            WHERE family = $1 AND item_key = $2
            RETURNING
              floor(extract(epoch FROM lease_expires_at) * 1000)::bigint
                AS lease_expires_at_epoch_ms,
              attempt_count
          `,
          values: [
            snapshot.family,
            Buffer.from(itemKey),
            leaseToken,
            Buffer.from(snapshot.workerId),
            snapshot.leaseDurationMs,
          ],
        });
        const result = exactlyOne(claimed.rows, "claim update");
        leases.push({
          family: snapshot.family,
          itemKey: Uint8Array.from(itemKey),
          leaseToken,
          workerId: Uint8Array.from(snapshot.workerId),
          leaseExpiresAtEpochMs: decodeSafeInteger(
            result.lease_expires_at_epoch_ms,
            "lease_expires_at_epoch_ms",
          ),
          attempt: decodePositiveSafeInteger(result.attempt_count, "attempt_count"),
        });
      }
      return leases;
    });
  }

  /** Applies database-only domain work and removes the current lease atomically. */
  async complete(
    lease: RecoveryLease,
    apply: (session: PostgresqlSession) => Promise<void>,
  ): Promise<LeaseMutationResult> {
    const snapshot = snapshotLease(lease);
    if (typeof apply !== "function") {
      throw new TypeError("recovery completion apply must be a function");
    }
    return await this.#runtime.transaction(async (session) => {
      if (!(await ownsLease(session, snapshot))) {
        return LeaseMutationResult.LeaseLost;
      }
      await apply(session);
      const deleted = await session.query({
        text: `
          DELETE FROM bpmn_platform.recovery_leases
          WHERE family = $1 AND item_key = $2 AND state = 'leased'
            AND lease_token = $3::uuid
        `,
        values: [snapshot.family, Buffer.from(snapshot.itemKey), snapshot.leaseToken],
      });
      if (deleted.rowCount !== 1) {
        throw new RecoveryLeaseIntegrityError(
          "current recovery lease disappeared during completion",
        );
      }
      return LeaseMutationResult.Applied;
    });
  }

  /** Makes the current lease eligible after a database-clock delay. */
  async retry(
    lease: RecoveryLease,
    input: RetryLeaseInput,
  ): Promise<LeaseMutationResult> {
    const snapshot = snapshotLease(lease);
    const retry = snapshotRetry(input);
    return await this.#runtime.transaction(async (session) => {
      if (!(await ownsLease(session, snapshot))) {
        return LeaseMutationResult.LeaseLost;
      }
      const updated = await session.query({
        text: `
          UPDATE bpmn_platform.recovery_leases
          SET
            state = 'ready',
            lease_token = NULL,
            worker_id = NULL,
            lease_expires_at = NULL,
            next_attempt_at = clock_timestamp() + ($4 * interval '1 millisecond'),
            failure_code = NULL,
            failure_evidence = NULL
          WHERE family = $1 AND item_key = $2 AND lease_token = $3::uuid
        `,
        values: [
          snapshot.family,
          Buffer.from(snapshot.itemKey),
          snapshot.leaseToken,
          retry.retryDelayMs,
        ],
      });
      requireOneMutation(updated.rowCount, "retry");
      return LeaseMutationResult.Applied;
    });
  }

  /** Retains the current item as permanently failed with bounded exact evidence. */
  async fail(
    lease: RecoveryLease,
    input: FailLeaseInput,
  ): Promise<LeaseMutationResult> {
    const snapshot = snapshotLease(lease);
    const failure = snapshotFailure(input);
    return await this.#runtime.transaction(async (session) => {
      if (!(await ownsLease(session, snapshot))) {
        return LeaseMutationResult.LeaseLost;
      }
      const updated = await session.query({
        text: `
          UPDATE bpmn_platform.recovery_leases
          SET
            state = 'failed',
            lease_token = NULL,
            worker_id = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            failure_code = $4,
            failure_evidence = $5
          WHERE family = $1 AND item_key = $2 AND lease_token = $3::uuid
        `,
        values: [
          snapshot.family,
          Buffer.from(snapshot.itemKey),
          snapshot.leaseToken,
          failure.failureCode,
          Buffer.from(failure.failureEvidence),
        ],
      });
      requireOneMutation(updated.rowCount, "fail");
      return LeaseMutationResult.Applied;
    });
  }
}

async function ownsLease(
  session: PostgresqlSession,
  lease: RecoveryLease,
): Promise<boolean> {
  const result = await session.query<LockedLeaseRow>({
    text: `
      SELECT state, lease_token
      FROM bpmn_platform.recovery_leases
      WHERE family = $1 AND item_key = $2
      FOR UPDATE
    `,
    values: [lease.family, Buffer.from(lease.itemKey)],
  });
  if (result.rows.length === 0) {
    return false;
  }
  const row = exactlyOne(result.rows, "lease ownership read");
  return row.state === "leased" && row.lease_token === lease.leaseToken;
}

function exactlyOne<Row>(rows: readonly Row[], operation: string): Row {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new RecoveryLeaseIntegrityError(`${operation} did not return exactly one row`);
  }
  return row;
}

function requireOneMutation(rowCount: number | null, operation: string): void {
  if (rowCount !== 1) {
    throw new RecoveryLeaseIntegrityError(
      `${operation} did not mutate exactly one current recovery lease`,
    );
  }
}

function decodeBytes(value: unknown, field: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new RecoveryLeaseIntegrityError(`stored ${field} is not nonempty bytea`);
  }
  return Uint8Array.from(value);
}

function decodeSafeInteger(value: unknown, field: string): number {
  const decoded =
    typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)
      ? Number(value)
      : value;
  if (typeof decoded !== "number" || !Number.isSafeInteger(decoded) || decoded < 0) {
    throw new RecoveryLeaseIntegrityError(`stored ${field} is not a safe integer`);
  }
  return decoded;
}

function decodePositiveSafeInteger(value: unknown, field: string): number {
  const decoded = decodeSafeInteger(value, field);
  if (decoded < 1) {
    throw new RecoveryLeaseIntegrityError(`stored ${field} is not positive`);
  }
  return decoded;
}
