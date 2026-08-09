import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionRepository,
  NewDefinitionMetadata,
} from "./contracts.js";

const defaultBusyTimeoutMs = 5_000;

/** Durable process-local definition-version allocation backed by one SQLite database. */
export class SqliteDefinitionRepository implements DefinitionRepository {
  readonly #database: DatabaseSync;

  constructor(
    databaseFile: string,
    busyTimeoutMs: number = defaultBusyTimeoutMs,
  ) {
    requirePositiveSafeInteger(busyTimeoutMs, "busyTimeoutMs");
    this.#database = new DatabaseSync(databaseFile);
    this.#database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS definition_versions (
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
        PRIMARY KEY (process_id, version)
      ) STRICT
    `);
  }

  get isOpen(): boolean {
    return this.#database.isOpen;
  }

  /** Atomically allocates and inserts the next positive version within one process ID. */
  allocateNext(metadata: NewDefinitionMetadata): DefinitionMetadata {
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
          semantic_profile
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      );
      this.#database.exec("COMMIT");
      return {
        ...metadata,
        source: { ...metadata.source },
        version,
      };
    } catch (error: unknown) {
      if (this.#database.isTransaction) {
        this.#database.exec("ROLLBACK");
      }
      throw error;
    }
  }

  listLatest(): ReadonlyArray<DefinitionMetadata> {
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
        definition.semantic_profile
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

  listVersions(processId: string): ReadonlyArray<DefinitionMetadata> {
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
        semantic_profile
      FROM definition_versions
      WHERE process_id = ?
      ORDER BY version ASC
    `).all(processId).map(decodeMetadata);
  }

  get(reference: DefinitionReference): DefinitionMetadata | null {
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
        semantic_profile
      FROM definition_versions
      WHERE process_id = ? AND version = ?
    `).get(reference.processId, reference.version);
    return row === undefined ? null : decodeMetadata(row);
  }

  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }
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
