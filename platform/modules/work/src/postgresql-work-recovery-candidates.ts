import type {
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import { PostgresqlWorkSnapshotGeneration } from "./postgresql-work-snapshot-generation.js";

const maximumCandidateLimit = 1_000;

export enum WorkPostgresqlRecoveryFamily {
  WorkAudit = "work.audit",
  WorkSnapshot = "work.snapshot",
}

/** Read-only, bounded candidate discovery over a caller-owned PostgreSQL runtime. */
export class PostgresqlWorkRecoveryCandidateSource {
  constructor(private readonly runtime: PostgresqlRuntime) {}

  async listCandidateKeys(
    family: WorkPostgresqlRecoveryFamily,
    limitValue: number,
    snapshotMaxAgeMs?: number,
  ): Promise<ReadonlyArray<Uint8Array>> {
    const limit = requirePositiveSafeInteger(limitValue);
    switch (family) {
      case WorkPostgresqlRecoveryFamily.WorkAudit:
        return await this.#querySingleton(`
          SELECT decode('73747265616d', 'hex') AS candidate_key
          WHERE EXISTS (
            SELECT 1
            FROM bpmn_platform.work_audit_outbox
            WHERE delivered = false
          )
        `);
      case WorkPostgresqlRecoveryFamily.WorkSnapshot:
        if (snapshotMaxAgeMs === undefined) {
          throw new TypeError("Work snapshot maximum age is required");
        }
        return await new PostgresqlWorkSnapshotGeneration(this.runtime)
          .listCandidateKeys(limit, snapshotMaxAgeMs);
      default:
        throw new TypeError(`unknown Work PostgreSQL recovery family: ${String(family)}`);
    }
  }

  async #querySingleton(text: string): Promise<ReadonlyArray<Uint8Array>> {
    const result = await this.runtime.query<CandidateRow>({ text });
    return result.rows.map(decodeCandidateKey);
  }
}

type CandidateRow = PostgresqlRow & Readonly<{ candidate_key: unknown }>;

function decodeCandidateKey(row: CandidateRow): Uint8Array {
  if (!(row.candidate_key instanceof Uint8Array) || row.candidate_key.byteLength === 0) {
    throw new TypeError("Work PostgreSQL recovery candidate key must be nonempty bytea");
  }
  return Uint8Array.from(row.candidate_key);
}

function requirePositiveSafeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximumCandidateLimit) {
    throw new TypeError(
      `Work PostgreSQL recovery candidate limit must be a positive safe integer at most ${maximumCandidateLimit}`,
    );
  }
  return value;
}
