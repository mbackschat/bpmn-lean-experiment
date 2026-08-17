import type { HumanTaskCatalogV1 } from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionRepository,
  HumanTaskCatalogRepository,
  NewDefinitionMetadata,
} from "./contracts.js";
import {
  decodeBoundHumanTaskCatalog,
  decodeDefinitionMetadata,
  encodePostgresqlText,
  encodeBoundHumanTaskCatalog,
  metadataSqlValues,
  requirePositiveSafeInteger,
  snapshotNewDefinitionMetadata,
} from "./postgresql-definition-values.js";

/** Process-local, gap-free definition-version allocation in shared PostgreSQL. */
export class PostgresqlDefinitionRepository implements
  DefinitionRepository,
  HumanTaskCatalogRepository
{
  readonly #runtime: PostgresqlRuntime;

  constructor(runtime: PostgresqlRuntime) {
    this.#runtime = runtime;
  }

  async allocateNext(
    metadata: NewDefinitionMetadata,
    humanTaskCatalog: HumanTaskCatalogV1 | null = null,
  ): Promise<DefinitionMetadata> {
    const exact = snapshotNewDefinitionMetadata(metadata);
    const catalogJson = encodeBoundHumanTaskCatalog(exact, humanTaskCatalog);
    return await this.#runtime.transaction(async (session) => {
      const version = await allocateVersion(session, exact.processId);
      const inserted = await session.query({
        text: `
          INSERT INTO bpmn_platform.definition_versions (
            process_id, version, source_kind, source_id, source_sha256,
            source_byte_length, source_declared_encoding, source_decoded_as,
            semantic_profile, start_capabilities_json, human_task_catalog_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `,
        values: [
          encodePostgresqlText(exact.processId),
          version,
          ...metadataSqlValues(exact),
          catalogJson,
        ],
      });
      const row = inserted.rows[0];
      if (row === undefined) {
        throw new TypeError("PostgreSQL definition insert returned no row");
      }
      return decodeDefinitionMetadata(row);
    });
  }

  async listLatest(): Promise<ReadonlyArray<DefinitionMetadata>> {
    const result = await this.#runtime.query({
      text: `
        SELECT * FROM (
          SELECT definition.*, row_number() OVER (
            PARTITION BY process_id ORDER BY version DESC
          ) AS process_version_rank
          FROM bpmn_platform.definition_versions AS definition
        ) AS ranked
        WHERE process_version_rank = 1
        ORDER BY process_id ASC
      `,
    });
    return result.rows.map(decodeDefinitionMetadata);
  }

  async listVersions(
    processId: string,
  ): Promise<ReadonlyArray<DefinitionMetadata>> {
    const result = await this.#runtime.query({
      text: `
        SELECT * FROM bpmn_platform.definition_versions
        WHERE process_id = $1
        ORDER BY version ASC
      `,
      values: [encodePostgresqlText(processId)],
    });
    return result.rows.map(decodeDefinitionMetadata);
  }

  async get(reference: DefinitionReference): Promise<DefinitionMetadata | null> {
    const result = await this.#runtime.query({
      text: `
        SELECT * FROM bpmn_platform.definition_versions
        WHERE process_id = $1 AND version = $2
      `,
      values: [encodePostgresqlText(reference.processId), reference.version],
    });
    const row = result.rows[0];
    return row === undefined ? null : decodeDefinitionMetadata(row);
  }

  async getHumanTaskCatalog(
    reference: DefinitionReference,
  ): Promise<HumanTaskCatalogV1 | null> {
    const result = await this.#runtime.query({
      text: `
        SELECT human_task_catalog_json, semantic_profile, source_sha256
        FROM bpmn_platform.definition_versions
        WHERE process_id = $1 AND version = $2
      `,
      values: [encodePostgresqlText(reference.processId), reference.version],
    });
    const row = result.rows[0];
    return row === undefined
      ? null
      : decodeBoundHumanTaskCatalog(row, reference);
  }
}

async function allocateVersion(
  session: PostgresqlSession,
  processId: string,
): Promise<number> {
  const result = await session.query({
    text: `
      INSERT INTO bpmn_platform.definition_version_heads AS head (process_id, next_version)
      VALUES ($1, 2)
      ON CONFLICT (process_id) DO UPDATE
      SET next_version = head.next_version + 1
      RETURNING next_version - 1 AS version
    `,
    values: [encodePostgresqlText(processId)],
  });
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypeError("PostgreSQL definition allocation returned no version");
  }
  return requirePositiveSafeInteger(row, "version");
}
