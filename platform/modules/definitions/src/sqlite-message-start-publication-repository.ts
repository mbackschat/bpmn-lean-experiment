import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import { requireDefinitionDatabaseSchemaEpoch } from "./database-schema-epoch.js";
import {
  decodeDefinitionStartCapabilities,
  encodeDefinitionStartCapabilities,
} from "./definition-capabilities.js";
import type {
  DefinitionMessageStartCapability,
  DefinitionMetadata,
} from "./contracts.js";
import {
  MessageStartPublicationIntegrityError,
  MessageStartPublicationState,
} from "./message-start-publication-contracts.js";
import type {
  MessageStartPublicationRecord,
  MessageStartPublicationRepository,
  MessageStartPublicationReservation,
  NewMessageStartPublicationRecord,
} from "./message-start-publication-contracts.js";

const defaultBusyTimeoutMs = 5_000;

/** Durable immutable Message Start publications and closed lifecycle transitions. */
export class SqliteMessageStartPublicationRepository
implements MessageStartPublicationRepository {
  readonly #database: DatabaseSync;

  constructor(databaseFile: string, busyTimeoutMs: number = defaultBusyTimeoutMs) {
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

  reserve(
    record: NewMessageStartPublicationRecord,
  ): MessageStartPublicationReservation {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.#get(record.publicationId);
      if (existing !== null) {
        this.#database.exec("COMMIT");
        return { inserted: false, record: existing };
      }
      this.#insert(record);
      const inserted = this.#require(record.publicationId);
      this.#database.exec("COMMIT");
      return { inserted: true, record: inserted };
    } catch (error: unknown) {
      if (this.#database.isTransaction) {
        this.#database.exec("ROLLBACK");
      }
      if (isSqliteConstraint(error)) {
        throw new MessageStartPublicationIntegrityError(
          "publication private identity collides with another durable publication",
        );
      }
      throw error;
    }
  }

  get(publicationId: string): MessageStartPublicationRecord | null {
    return this.#get(publicationId);
  }

  listForReconciliation(): ReadonlyArray<MessageStartPublicationRecord> {
    return this.#database.prepare(`
      ${selectColumns}
      WHERE state IN ('reserved', 'starting', 'indeterminate')
      ORDER BY publication_id COLLATE BINARY ASC
    `).all().map(decodeRecord);
  }

  compareAndSet(
    publicationId: string,
    expected: MessageStartPublicationState,
    next: MessageStartPublicationState,
  ): MessageStartPublicationRecord | null {
    requireLegalTransition(expected, next);
    const result = this.#database.prepare(`
      UPDATE message_start_publications
      SET state = ?
      WHERE publication_id = ? AND state = ?
    `).run(next, publicationId, expected);
    return result.changes === 1 ? this.#require(publicationId) : null;
  }

  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }

  #get(publicationId: string): MessageStartPublicationRecord | null {
    const row = this.#database.prepare(`
      ${selectColumns}
      WHERE publication_id = ?
    `).get(publicationId);
    return row === undefined ? null : decodeRecord(row);
  }

  #require(publicationId: string): MessageStartPublicationRecord {
    const record = this.#get(publicationId);
    if (record === null) {
      throw new MessageStartPublicationIntegrityError(
        "publication row disappeared inside its database transaction",
      );
    }
    return record;
  }

  #insert(record: NewMessageStartPublicationRecord): void {
    this.#database.prepare(`
      INSERT INTO message_start_publications (
        publication_id, process_id, version, source_kind, source_id,
        source_sha256, source_byte_length, source_declared_encoding,
        source_decoded_as, semantic_profile, start_capabilities_json,
        message_start_event_id, message_interface_id,
        message_interface_operation_id, message_id, process_instance_id,
        command_id, workflow_id, intent_protocol, intent_sha256, state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved')
    `).run(
      record.publicationId,
      record.definition.processId,
      record.definition.version,
      record.definition.source.kind,
      record.definition.source.id,
      record.definition.source.sha256,
      record.definition.source.byteLength,
      record.definition.source.declaredEncoding,
      record.definition.source.decodedAs,
      record.definition.semanticProfile,
      encodeDefinitionStartCapabilities(record.definition.startCapabilities),
      record.messageStart.startEventId,
      record.messageStart.channel.interfaceId,
      record.messageStart.channel.interfaceOperationId,
      record.messageStart.channel.messageId,
      record.identity.processInstanceId,
      record.identity.commandId,
      record.identity.workflowId,
      record.intent.protocol,
      record.intent.intentSha256,
    );
  }
}

const selectColumns = `SELECT
  publication_id, process_id, version, source_kind, source_id, source_sha256,
  source_byte_length, source_declared_encoding, source_decoded_as,
  semantic_profile, start_capabilities_json, message_start_event_id,
  message_interface_id, message_interface_operation_id, message_id,
  process_instance_id, command_id, workflow_id, intent_protocol, intent_sha256,
  state
FROM message_start_publications`;

function initializeSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS message_start_publications (
      publication_id TEXT NOT NULL PRIMARY KEY,
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
      message_start_event_id TEXT NOT NULL,
      message_interface_id TEXT NOT NULL,
      message_interface_operation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      process_instance_id TEXT NOT NULL UNIQUE,
      command_id TEXT NOT NULL UNIQUE,
      workflow_id TEXT NOT NULL UNIQUE,
      intent_protocol TEXT NOT NULL,
      intent_sha256 TEXT NOT NULL CHECK (
        length(intent_sha256) = 64
        AND intent_sha256 NOT GLOB '*[^0-9a-f]*'
      ),
      state TEXT NOT NULL CHECK (state IN (
        'reserved', 'starting', 'accepted', 'indeterminate', 'integrityFailure'
      ))
    ) STRICT
  `);
}

function decodeRecord(
  row: Record<string, SQLOutputValue>,
): MessageStartPublicationRecord {
  const sourceKind = requireString(row, "source_kind");
  const decodedAs = requireNullableString(row, "source_decoded_as");
  if (sourceKind !== "bpmnSource" || (decodedAs !== null && decodedAs !== "UTF-8")) {
    throw new TypeError("SQLite publication row has invalid source identity");
  }
  return {
    publicationId: requireNonemptyString(row, "publication_id"),
    definition: decodeDefinition(row, sourceKind, decodedAs),
    messageStart: decodeMessageStart(row),
    identity: {
      processInstanceId: requireNonemptyString(row, "process_instance_id"),
      commandId: requireNonemptyString(row, "command_id"),
      workflowId: requireNonemptyString(row, "workflow_id"),
    },
    intent: {
      protocol: requireNonemptyString(row, "intent_protocol"),
      intentSha256: requireSha256(row, "intent_sha256"),
    },
    state: decodeState(requireString(row, "state")),
  };
}

function decodeDefinition(
  row: Record<string, SQLOutputValue>,
  sourceKind: "bpmnSource",
  decodedAs: "UTF-8" | null,
): DefinitionMetadata {
  return {
    processId: requireNonemptyString(row, "process_id"),
    version: requirePositiveSafeInteger(row, "version"),
    source: {
      kind: sourceKind,
      id: requireNonemptyString(row, "source_id"),
      sha256: requireSha256(row, "source_sha256"),
      byteLength: requireNonnegativeSafeInteger(row, "source_byte_length"),
      declaredEncoding: requireNullableString(row, "source_declared_encoding"),
      decodedAs,
    },
    semanticProfile: requireNonemptyString(row, "semantic_profile"),
    startCapabilities: decodeDefinitionStartCapabilities(
      requireString(row, "start_capabilities_json"),
    ),
  };
}

function decodeMessageStart(
  row: Record<string, SQLOutputValue>,
): DefinitionMessageStartCapability {
  return {
    startEventId: requireNonemptyString(row, "message_start_event_id"),
    channel: {
      kind: "operationMessage",
      interfaceId: requireNonemptyString(row, "message_interface_id"),
      interfaceOperationId: requireNonemptyString(
        row,
        "message_interface_operation_id",
      ),
      messageId: requireNonemptyString(row, "message_id"),
    },
  };
}

function requireLegalTransition(
  current: MessageStartPublicationState,
  next: MessageStartPublicationState,
): void {
  const legal = next === MessageStartPublicationState.IntegrityFailure
    ? current !== MessageStartPublicationState.IntegrityFailure
    : legalNextStates(current).includes(next);
  if (!legal) {
    throw new MessageStartPublicationIntegrityError(
      `illegal Message Start publication transition ${current} -> ${next}`,
    );
  }
}

function legalNextStates(
  state: MessageStartPublicationState,
): readonly MessageStartPublicationState[] {
  switch (state) {
    case MessageStartPublicationState.Reserved:
      return [MessageStartPublicationState.Starting];
    case MessageStartPublicationState.Starting:
      return [
        MessageStartPublicationState.Accepted,
        MessageStartPublicationState.Indeterminate,
      ];
    case MessageStartPublicationState.Indeterminate:
      return [MessageStartPublicationState.Accepted];
    case MessageStartPublicationState.Accepted:
    case MessageStartPublicationState.IntegrityFailure:
      return [];
    default:
      return assertNever(state);
  }
}

function decodeState(value: string): MessageStartPublicationState {
  if (Object.values(MessageStartPublicationState).some((state) => state === value)) {
    return value as MessageStartPublicationState;
  }
  throw new TypeError("SQLite publication row has invalid state");
}

function requireString(row: Record<string, SQLOutputValue>, field: string): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new TypeError(`SQLite publication row has invalid ${field}`);
  }
  return value;
}

function requireNonemptyString(
  row: Record<string, SQLOutputValue>,
  field: string,
): string {
  const value = requireString(row, field);
  if (value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`SQLite publication row has invalid ${field}`);
  }
  return value;
}

function requireNullableString(
  row: Record<string, SQLOutputValue>,
  field: string,
): string | null {
  const value = row[field];
  if (value !== null && typeof value !== "string") {
    throw new TypeError(`SQLite publication row has invalid ${field}`);
  }
  return value;
}

function requirePositiveSafeInteger(
  rowOrValue: Record<string, SQLOutputValue> | number,
  field: string,
): number {
  const value = typeof rowOrValue === "number" ? rowOrValue : rowOrValue[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`SQLite publication row has invalid ${field}`);
  }
  return value;
}

function requireNonnegativeSafeInteger(
  row: Record<string, SQLOutputValue>,
  field: string,
): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`SQLite publication row has invalid ${field}`);
  }
  return value;
}

function requireSha256(
  row: Record<string, SQLOutputValue>,
  field: string,
): string {
  const value = requireString(row, field);
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`SQLite publication row has invalid ${field}`);
  }
  return value;
}

function isSqliteConstraint(error: unknown): boolean {
  return error instanceof Error &&
    (
      ("code" in error && typeof error.code === "string" &&
        error.code.startsWith("SQLITE_CONSTRAINT")) ||
      error.message.startsWith("UNIQUE constraint failed:")
    );
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Message Start publication state: ${String(value)}`);
}
