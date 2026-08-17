import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";
import type { PostgresqlRow } from "@bpmn-lean/platform-postgresql-runtime";

import type {
  DefinitionMessageStartCapability,
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
import {
  decodeNonemptyDefinitionMetadata,
  encodePostgresqlText,
  hasPostgresqlCode,
  metadataSqlValues,
  requireNonemptyByteText,
  requireNonemptyString,
  requireSha256,
  snapshotDefinitionMetadata,
} from "./postgresql-definition-values.js";

/** Shared durable Message Start publication identity and lifecycle storage. */
export class PostgresqlMessageStartPublicationRepository
  implements MessageStartPublicationRepository {
  readonly #runtime: PostgresqlRuntime;

  constructor(runtime: PostgresqlRuntime) {
    this.#runtime = runtime;
  }

  async reserve(
    record: NewMessageStartPublicationRecord,
  ): Promise<MessageStartPublicationReservation> {
    const exact = snapshotRecord(record);
    try {
      const result = await this.#runtime.query({
        text: `
          INSERT INTO bpmn_platform.message_start_publications (
            publication_id, process_id, version, source_kind, source_id,
            source_sha256, source_byte_length, source_declared_encoding,
            source_decoded_as, semantic_profile, start_capabilities_json,
            message_start_event_id, message_interface_id,
            message_interface_operation_id, message_id, process_instance_id,
            command_id, workflow_id, intent_protocol, intent_sha256, state
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18, $19, $20, 'reserved'
          )
          ON CONFLICT (publication_id) DO NOTHING
          RETURNING *
        `,
        values: [
          encodePostgresqlText(exact.publicationId),
          encodePostgresqlText(exact.definition.processId),
          exact.definition.version,
          ...metadataSqlValues(exact.definition),
          encodePostgresqlText(exact.messageStart.startEventId),
          encodePostgresqlText(exact.messageStart.channel.interfaceId),
          encodePostgresqlText(exact.messageStart.channel.interfaceOperationId),
          encodePostgresqlText(exact.messageStart.channel.messageId),
          encodePostgresqlText(exact.identity.processInstanceId),
          encodePostgresqlText(exact.identity.commandId),
          encodePostgresqlText(exact.identity.workflowId),
          encodePostgresqlText(exact.intent.protocol),
          exact.intent.intentSha256,
        ],
      });
      const inserted = result.rows[0];
      if (inserted !== undefined) {
        return { inserted: true, record: decodeRecord(inserted) };
      }
      const existing = await this.get(exact.publicationId);
      if (existing === null) {
        throw new MessageStartPublicationIntegrityError(
          "publication conflict winner disappeared",
        );
      }
      return { inserted: false, record: existing };
    } catch (error: unknown) {
      if (hasPostgresqlCode(error, "23505")) {
        throw new MessageStartPublicationIntegrityError(
          "publication private identity collides with another durable publication",
        );
      }
      throw error;
    }
  }

  async get(publicationId: string): Promise<MessageStartPublicationRecord | null> {
    const result = await this.#runtime.query({
      text: `
        SELECT * FROM bpmn_platform.message_start_publications
        WHERE publication_id = $1
      `,
      values: [encodePostgresqlText(publicationId)],
    });
    const row = result.rows[0];
    return row === undefined ? null : decodeRecord(row);
  }

  async listForReconciliation(): Promise<ReadonlyArray<MessageStartPublicationRecord>> {
    const result = await this.#runtime.query({
      text: `
        SELECT * FROM bpmn_platform.message_start_publications
        WHERE state IN ('reserved', 'starting', 'indeterminate', 'accepted')
        ORDER BY publication_id ASC
      `,
    });
    return result.rows.map(decodeRecord);
  }

  async compareAndSet(
    publicationId: string,
    expected: MessageStartPublicationState,
    next: MessageStartPublicationState,
  ): Promise<MessageStartPublicationRecord | null> {
    requireLegalTransition(expected, next);
    const result = await this.#runtime.query({
      text: `
        UPDATE bpmn_platform.message_start_publications
        SET state = $1
        WHERE publication_id = $2 AND state = $3
        RETURNING *
      `,
      values: [next, encodePostgresqlText(publicationId), expected],
    });
    const row = result.rows[0];
    return row === undefined ? null : decodeRecord(row);
  }
}

function snapshotRecord(
  record: NewMessageStartPublicationRecord,
): NewMessageStartPublicationRecord {
  requireInputString(record.publicationId, "publicationId");
  const definition = snapshotDefinitionMetadata(record.definition);
  const messageStart = snapshotMessageStart(record.messageStart);
  requireInputString(record.identity.processInstanceId, "processInstanceId");
  requireInputString(record.identity.commandId, "commandId");
  requireInputString(record.identity.workflowId, "workflowId");
  requireInputString(record.intent.protocol, "intent.protocol");
  if (!/^[0-9a-f]{64}$/u.test(record.intent.intentSha256)) {
    throw new TypeError("intent.intentSha256 must be a lowercase SHA-256 digest");
  }
  return {
    publicationId: record.publicationId,
    definition,
    messageStart,
    identity: { ...record.identity },
    intent: { ...record.intent },
  };
}

function snapshotMessageStart(
  value: DefinitionMessageStartCapability,
): DefinitionMessageStartCapability {
  requireInputString(value.startEventId, "messageStart.startEventId");
  if (value.channel.kind !== "operationMessage") {
    throw new TypeError("messageStart channel must be operationMessage");
  }
  requireInputString(value.channel.interfaceId, "messageStart.channel.interfaceId");
  requireInputString(
    value.channel.interfaceOperationId,
    "messageStart.channel.interfaceOperationId",
  );
  requireInputString(value.channel.messageId, "messageStart.channel.messageId");
  return { startEventId: value.startEventId, channel: { ...value.channel } };
}

export function decodePostgresqlMessageStartPublicationRecord(
  row: PostgresqlRow,
): MessageStartPublicationRecord {
  return {
    publicationId: requireNonemptyByteText(row, "publication_id"),
    definition: decodeNonemptyDefinitionMetadata(row),
    messageStart: {
      startEventId: requireNonemptyByteText(row, "message_start_event_id"),
      channel: {
        kind: "operationMessage",
        interfaceId: requireNonemptyByteText(row, "message_interface_id"),
        interfaceOperationId: requireNonemptyByteText(
          row,
          "message_interface_operation_id",
        ),
        messageId: requireNonemptyByteText(row, "message_id"),
      },
    },
    identity: {
      processInstanceId: requireNonemptyByteText(row, "process_instance_id"),
      commandId: requireNonemptyByteText(row, "command_id"),
      workflowId: requireNonemptyByteText(row, "workflow_id"),
    },
    intent: {
      protocol: requireNonemptyByteText(row, "intent_protocol"),
      intentSha256: requireSha256(row, "intent_sha256"),
    },
    state: decodeState(requireNonemptyString(row, "state")),
  };
}

const decodeRecord = decodePostgresqlMessageStartPublicationRecord;

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
  if (Object.values(MessageStartPublicationState).includes(
    value as MessageStartPublicationState,
  )) return value as MessageStartPublicationState;
  throw new TypeError("PostgreSQL publication row has invalid state");
}

function requireInputString(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Message Start publication state: ${String(value)}`);
}
