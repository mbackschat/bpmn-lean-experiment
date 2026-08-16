import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import {
  decodeCanonicalHumanTaskCatalogV1,
  serializeHumanTaskCatalogV1,
} from "@bpmn-lean/platform-contracts";
import type { HumanTaskCatalogV1 } from "@bpmn-lean/platform-contracts";

import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionRepository,
  HumanTaskCatalogRepository,
  NewDefinitionMetadata,
} from "./contracts.js";
import {
  decodeDefinitionStartCapabilities,
  encodeDefinitionStartCapabilities,
} from "./definition-capabilities.js";
import {
  DefinitionSchemaResetRequiredError,
  requireDefinitionDatabaseSchemaEpoch,
} from "./database-schema-epoch.js";

const defaultBusyTimeoutMs = 5_000;

/** Durable process-local definition-version allocation backed by one SQLite database. */
export class SqliteDefinitionRepository implements
  DefinitionRepository,
  HumanTaskCatalogRepository
{
  readonly #database: DatabaseSync;

  constructor(
    databaseFile: string,
    busyTimeoutMs: number = defaultBusyTimeoutMs,
  ) {
    requirePositiveSafeInteger(busyTimeoutMs, "busyTimeoutMs");
    this.#database = new DatabaseSync(databaseFile);
    this.#database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    try {
      requireDefinitionDatabaseSchemaEpoch(this.#database);
      initializeSchema(this.#database);
    } catch (error: unknown) {
      this.#database.close();
      throw error;
    }
  }

  get isOpen(): boolean {
    return this.#database.isOpen;
  }

  /** Atomically allocates and inserts the next positive version within one process ID. */
  async allocateNext(
    metadata: NewDefinitionMetadata,
    humanTaskCatalog: HumanTaskCatalogV1 | null = null,
  ): Promise<DefinitionMetadata> {
    const humanTaskCatalogJson = humanTaskCatalog === null
      ? null
      : encodeBoundCatalog(metadata, humanTaskCatalog);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.#database.prepare(`
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM definition_versions
        WHERE process_id = ?
      `).get(metadata.processId);
      const version = requirePositiveSafeIntegerField(row, "next_version");
      this.#database.prepare(`
        INSERT INTO definition_versions (
          process_id,
          version,
          source_kind,
          source_id,
          source_sha256,
          source_byte_length,
          source_declared_encoding,
          source_decoded_as,
          semantic_profile,
          start_capabilities_json,
          human_task_catalog_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        metadata.processId,
        version,
        metadata.source.kind,
        metadata.source.id,
        metadata.source.sha256,
        metadata.source.byteLength,
        metadata.source.declaredEncoding,
        metadata.source.decodedAs,
        metadata.semanticProfile,
        encodeDefinitionStartCapabilities(metadata.startCapabilities),
        humanTaskCatalogJson,
      );
      this.#database.exec("COMMIT");
      return {
        ...metadata,
        source: { ...metadata.source },
        startCapabilities: decodeDefinitionStartCapabilities(
          encodeDefinitionStartCapabilities(metadata.startCapabilities),
        ),
        version,
      };
    } catch (error: unknown) {
      if (this.#database.isTransaction) {
        this.#database.exec("ROLLBACK");
      }
      throw error;
    }
  }

  async listLatest(): Promise<ReadonlyArray<DefinitionMetadata>> {
    return this.#database.prepare(`
      SELECT
        definition.process_id,
        definition.version,
        definition.source_kind,
        definition.source_id,
        definition.source_sha256,
        definition.source_byte_length,
        definition.source_declared_encoding,
        definition.source_decoded_as,
        definition.semantic_profile,
        definition.start_capabilities_json
      FROM definition_versions AS definition
      INNER JOIN (
        SELECT process_id, MAX(version) AS version
        FROM definition_versions
        GROUP BY process_id
      ) AS current
        ON current.process_id = definition.process_id
        AND current.version = definition.version
      ORDER BY definition.process_id ASC
    `).all().map(decodeMetadata);
  }

  async listVersions(
    processId: string,
  ): Promise<ReadonlyArray<DefinitionMetadata>> {
    return this.#database.prepare(`
      SELECT
        process_id,
        version,
        source_kind,
        source_id,
        source_sha256,
        source_byte_length,
        source_declared_encoding,
        source_decoded_as,
        semantic_profile,
        start_capabilities_json
      FROM definition_versions
      WHERE process_id = ?
      ORDER BY version ASC
    `).all(processId).map(decodeMetadata);
  }

  async get(reference: DefinitionReference): Promise<DefinitionMetadata | null> {
    const row = this.#database.prepare(`
      SELECT
        process_id,
        version,
        source_kind,
        source_id,
        source_sha256,
        source_byte_length,
        source_declared_encoding,
        source_decoded_as,
        semantic_profile,
        start_capabilities_json
      FROM definition_versions
      WHERE process_id = ? AND version = ?
    `).get(reference.processId, reference.version);
    return row === undefined ? null : decodeMetadata(row);
  }

  async getHumanTaskCatalog(
    reference: DefinitionReference,
  ): Promise<HumanTaskCatalogV1 | null> {
    const row = this.#database.prepare(`
      SELECT human_task_catalog_json, semantic_profile, source_sha256
      FROM definition_versions
      WHERE process_id = ? AND version = ?
    `).get(reference.processId, reference.version);
    if (row === undefined) return null;
    const value = row.human_task_catalog_json;
    if (value === null) return null;
    if (typeof value !== "string") {
      throw new TypeError("SQLite definition row has invalid human_task_catalog_json");
    }
    const catalog = decodeCanonicalHumanTaskCatalogV1(
      new TextEncoder().encode(value),
    );
    if (
      catalog.processId !== reference.processId ||
      catalog.semanticProfile !== row.semantic_profile ||
      catalog.sourceSha256 !== row.source_sha256
    ) {
      throw new TypeError("SQLite Human Task catalog definition identity drifted");
    }
    return catalog;
  }

  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }
}

function initializeSchema(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const existing = database.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name = 'definition_versions'
    `).get();
    if (existing !== undefined) {
      requireCurrentSchema(database);
      database.exec("COMMIT");
      return;
    }
    database.exec(`
      CREATE TABLE definition_versions (
        process_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        source_kind TEXT NOT NULL CHECK (source_kind = 'bpmnSource'),
        source_id TEXT NOT NULL,
        source_sha256 TEXT NOT NULL CHECK (
          length(source_sha256) = 64
          AND source_sha256 NOT GLOB '*[^0-9a-f]*'
        ),
        source_byte_length INTEGER NOT NULL CHECK (source_byte_length >= 0),
        source_declared_encoding TEXT,
        source_decoded_as TEXT CHECK (
          source_decoded_as IS NULL OR source_decoded_as = 'UTF-8'
        ),
        semantic_profile TEXT NOT NULL,
        start_capabilities_json TEXT NOT NULL CHECK (
          length(start_capabilities_json) > 0
        ),
        human_task_catalog_json TEXT,
        PRIMARY KEY (process_id, version)
      ) STRICT
    `);
    database.exec("COMMIT");
  } catch (error: unknown) {
    if (database.isTransaction) {
      database.exec("ROLLBACK");
    }
    throw error;
  }
}

function requireCurrentSchema(database: DatabaseSync): void {
  const columns = database.prepare(`
    SELECT name, type, "notnull", pk
    FROM pragma_table_info('definition_versions')
    ORDER BY cid
  `).all();
  const expected = [
    ["process_id", "TEXT", 1, 1],
    ["version", "INTEGER", 1, 2],
    ["source_kind", "TEXT", 1, 0],
    ["source_id", "TEXT", 1, 0],
    ["source_sha256", "TEXT", 1, 0],
    ["source_byte_length", "INTEGER", 1, 0],
    ["source_declared_encoding", "TEXT", 0, 0],
    ["source_decoded_as", "TEXT", 0, 0],
    ["semantic_profile", "TEXT", 1, 0],
    ["start_capabilities_json", "TEXT", 1, 0],
    ["human_task_catalog_json", "TEXT", 0, 0],
  ] as const;
  if (
    columns.length !== expected.length ||
    columns.some((column, index) => {
      const wanted = expected[index];
      return wanted === undefined ||
        column.name !== wanted[0] ||
        column.type !== wanted[1] ||
        column.notnull !== wanted[2] ||
        column.pk !== wanted[3];
    })
  ) {
    throw new DefinitionSchemaResetRequiredError();
  }
}

function encodeBoundCatalog(
  metadata: NewDefinitionMetadata,
  catalog: HumanTaskCatalogV1,
): string {
  if (
    catalog.processId !== metadata.processId ||
    catalog.semanticProfile !== metadata.semanticProfile ||
    catalog.sourceSha256 !== metadata.source.sha256
  ) {
    throw new TypeError("Human Task catalog identity does not match its definition");
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(
    serializeHumanTaskCatalogV1(catalog),
  );
}

function decodeMetadata(
  row: Record<string, SQLOutputValue>,
): DefinitionMetadata {
  const sourceKind = requireStringField(row, "source_kind");
  if (sourceKind !== "bpmnSource") {
    throw new TypeError("SQLite definition row has invalid source_kind");
  }
  const decodedAs = requireNullableStringField(row, "source_decoded_as");
  if (decodedAs !== null && decodedAs !== "UTF-8") {
    throw new TypeError("SQLite definition row has invalid source_decoded_as");
  }
  return {
    processId: requireStringField(row, "process_id"),
    version: requirePositiveSafeIntegerField(row, "version"),
    source: {
      kind: sourceKind,
      id: requireStringField(row, "source_id"),
      sha256: requireStringField(row, "source_sha256"),
      byteLength: requireNonnegativeSafeIntegerField(row, "source_byte_length"),
      declaredEncoding: requireNullableStringField(
        row,
        "source_declared_encoding",
      ),
      decodedAs,
    },
    semanticProfile: requireStringField(row, "semantic_profile"),
    startCapabilities: decodeDefinitionStartCapabilities(
      requireStringField(row, "start_capabilities_json"),
    ),
  };
}

function requireStringField(
  row: Record<string, SQLOutputValue> | undefined,
  field: string,
): string {
  const value = row?.[field];
  if (typeof value !== "string") {
    throw new TypeError(`SQLite definition row has invalid ${field}`);
  }
  return value;
}

function requirePositiveSafeIntegerField(
  row: Record<string, SQLOutputValue> | undefined,
  field: string,
): number {
  const value = row?.[field];
  if (typeof value !== "number") {
    throw new TypeError(`SQLite definition row has invalid ${field}`);
  }
  requirePositiveSafeInteger(value, field);
  return value;
}

function requireNonnegativeSafeIntegerField(
  row: Record<string, SQLOutputValue> | undefined,
  field: string,
): number {
  const value = row?.[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`SQLite definition row has invalid ${field}`);
  }
  return value;
}

function requireNullableStringField(
  row: Record<string, SQLOutputValue> | undefined,
  field: string,
): string | null {
  const value = row?.[field];
  if (value !== null && typeof value !== "string") {
    throw new TypeError(`SQLite definition row has invalid ${field}`);
  }
  return value;
}

function requirePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}
