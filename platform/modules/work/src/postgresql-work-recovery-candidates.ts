import type {
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

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
        return await this.#queryPopulation(
          `
            SELECT process_instance_id AS candidate_key
            FROM bpmn_platform.work_processes
            WHERE observation <> 'closed'
            ORDER BY process_instance_id ASC
            LIMIT $1
          `,
          limit,
        );
      default:
        throw new TypeError(`unknown Work PostgreSQL recovery family: ${String(family)}`);
    }
  }

  async #queryPopulation(
    text: string,
    limit: number,
  ): Promise<ReadonlyArray<Uint8Array>> {
    const result = await this.runtime.query<CandidateRow>({
      text,
      values: [limit],
    });
    return result.rows.map(decodeCandidateKey);
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
