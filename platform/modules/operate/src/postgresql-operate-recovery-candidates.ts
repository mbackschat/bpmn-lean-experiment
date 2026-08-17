import type {
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

import { PostgresqlIncidentSnapshotGeneration } from "./postgresql-incident-snapshot-generation.js";

const maximumCandidateLimit = 1_000;

export enum OperatePostgresqlRecoveryFamily {
  IncidentAction = "operate.incident-action",
  IncidentAudit = "operate.incident-audit",
  CommittedExecution = "operate.committed-execution",
  FlowNodeOccurrence = "operate.flow-node-occurrence",
  IncidentSnapshot = "operate.incident-snapshot",
}

/** Bounded candidate discovery over a caller-owned PostgreSQL runtime. */
export class PostgresqlOperateRecoveryCandidateSource {
  constructor(private readonly runtime: PostgresqlRuntime) {}

  async listCandidateKeys(
    family: OperatePostgresqlRecoveryFamily,
    limitValue: number,
    incidentSnapshotMaxAgeMs?: number,
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
            SELECT process.process_instance_id AS candidate_key
            FROM bpmn_platform.operate_process_instances AS process
            LEFT JOIN bpmn_platform.operate_execution_publications AS execution
              ON execution.process_instance_id = process.process_instance_id
            WHERE process.observation <> 'closed'
               OR execution.process_instance_id IS NULL
               OR execution.status <> 'healthy'
               OR execution.current_json IS NULL
               OR execution.head_revision <> execution.producer_head_revision
               OR execution.current_process_status NOT IN ('completed', 'cancelled')
            ORDER BY process.process_instance_id ASC
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
            LEFT JOIN bpmn_platform.operate_flow_node_occurrence_publications AS occurrence
              ON occurrence.process_instance_id = process.process_instance_id
            WHERE process.observation <> 'closed'
               OR (
                 execution.current_json IS NOT NULL
                 AND execution.head_revision = execution.producer_head_revision
                 AND execution.current_process_status IN ('completed', 'cancelled')
                 AND (
                   occurrence.process_instance_id IS NULL
                   OR occurrence.status <> 'healthy'
                   OR occurrence.head_revision <> execution.head_revision
                   OR occurrence.producer_head_revision <> execution.head_revision
                   OR occurrence.current_open_json <> '[]'
                 )
               )
            ORDER BY process.process_instance_id ASC
            LIMIT $1
          `,
          limit,
        );
      case OperatePostgresqlRecoveryFamily.IncidentSnapshot:
        if (incidentSnapshotMaxAgeMs === undefined) {
          throw new TypeError("incident snapshot maximum age is required");
        }
        return await new PostgresqlIncidentSnapshotGeneration(this.runtime)
          .listCandidateKeys(limit, incidentSnapshotMaxAgeMs);
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

/** Strictly decodes one byte-preserving candidate key before any database or gateway call. */
export function decodeOperateRecoveryCandidateKey(value: Uint8Array): string {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new TypeError("Operate PostgreSQL recovery candidate key must be nonempty bytea");
  }
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new TypeError("Operate PostgreSQL recovery candidate key must be exact UTF-8");
  }
  const encoded = new TextEncoder().encode(decoded);
  if (
    encoded.byteLength !== value.byteLength ||
    !encoded.every((byte, index) => byte === value[index])
  ) {
    throw new TypeError("Operate PostgreSQL recovery candidate key must be exact UTF-8");
  }
  return decoded;
}

function requirePositiveSafeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximumCandidateLimit) {
    throw new TypeError(
      `Operate PostgreSQL recovery candidate limit must be a positive safe integer at most ${maximumCandidateLimit}`,
    );
  }
  return value;
}
