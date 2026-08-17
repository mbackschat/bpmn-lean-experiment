import type {
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

const maximumCandidateLimit = 1_000;

export enum OperatePostgresqlRecoveryFamily {
  IncidentAction = "operate.incident-action",
  IncidentAudit = "operate.incident-audit",
  CommittedExecution = "operate.committed-execution",
  FlowNodeOccurrence = "operate.flow-node-occurrence",
  IncidentSnapshot = "operate.incident-snapshot",
}

/** Read-only, bounded candidate discovery over a caller-owned PostgreSQL runtime. */
export class PostgresqlOperateRecoveryCandidateSource {
  constructor(private readonly runtime: PostgresqlRuntime) {}

  async listCandidateKeys(
    family: OperatePostgresqlRecoveryFamily,
    limitValue: number,
  ): Promise<ReadonlyArray<Uint8Array>> {
    const limit = requirePositiveSafeInteger(limitValue);
    switch (family) {
      case OperatePostgresqlRecoveryFamily.IncidentAction:
        return await this.#queryPopulation(
          `
            SELECT action_id AS candidate_key
            FROM bpmn_platform.operate_incident_actions
            WHERE state IN ('reserved', 'submitting', 'indeterminate')
            ORDER BY action_id ASC
            LIMIT $1
          `,
          limit,
        );
      case OperatePostgresqlRecoveryFamily.IncidentAudit:
        return await this.#querySingleton(`
          SELECT decode('73747265616d', 'hex') AS candidate_key
          WHERE EXISTS (
            SELECT 1
            FROM bpmn_platform.operate_incident_action_audit_outbox
            WHERE delivered = false
          )
        `);
      case OperatePostgresqlRecoveryFamily.CommittedExecution:
        return await this.#queryPopulation(
          `
            SELECT process_instance_id AS candidate_key
            FROM bpmn_platform.operate_process_instances
            WHERE observation <> 'closed'
            ORDER BY process_instance_id ASC
            LIMIT $1
          `,
          limit,
        );
      case OperatePostgresqlRecoveryFamily.FlowNodeOccurrence:
        return await this.#queryPopulation(
          `
            SELECT process.process_instance_id AS candidate_key
            FROM bpmn_platform.operate_process_instances AS process
            INNER JOIN bpmn_platform.operate_execution_publications AS execution
              ON execution.process_instance_id = process.process_instance_id
             AND execution.status = 'healthy'
            WHERE process.observation <> 'closed'
            ORDER BY process.process_instance_id ASC
            LIMIT $1
          `,
          limit,
        );
      case OperatePostgresqlRecoveryFamily.IncidentSnapshot:
        return await this.#queryPopulation(
          `
            SELECT process_instance_id AS candidate_key
            FROM bpmn_platform.operate_process_instances
            WHERE observation <> 'closed'
            ORDER BY process_instance_id ASC
            LIMIT $1
          `,
          limit,
        );
      default:
        throw new TypeError(`unknown Operate PostgreSQL recovery family: ${String(family)}`);
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
    throw new TypeError("Operate PostgreSQL recovery candidate key must be nonempty bytea");
  }
  return Uint8Array.from(row.candidate_key);
}

function requirePositiveSafeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximumCandidateLimit) {
    throw new TypeError(
      `Operate PostgreSQL recovery candidate limit must be a positive safe integer at most ${maximumCandidateLimit}`,
    );
  }
  return value;
}
