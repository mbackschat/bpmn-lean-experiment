import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

import type { IncidentAuditOutboxItem } from "./incident-contracts.js";
import { requireIncidentAuditDeliveryLimit } from "./incident-contracts.js";
import { snapshotPostgresqlIncidentAuditRecoveryItem } from "./postgresql-incident-audit-recovery-storage.js";

export type PostgresqlIncidentAuditRecoverySource = Readonly<{
  listUndeliveredAuditEvents: (
    limit: number,
  ) => Promise<ReadonlyArray<IncidentAuditOutboxItem>>;
  applyAuditAcknowledgement: (
    session: PostgresqlSession,
    item: IncidentAuditOutboxItem,
  ) => Promise<void>;
}>;

export type PostgresqlIncidentAuditRecoverySink = Readonly<{
  applyAuditRecord: (
    session: PostgresqlSession,
    item: IncidentAuditOutboxItem,
  ) => Promise<number>;
}>;

export type PostgresqlIncidentAuditRecoveryResult = Readonly<{
  kind: "complete";
  apply: (session: PostgresqlSession) => Promise<void>;
}>;

/** Prepares one bounded incident audit prefix and leaves every write behind the lease fence. */
export class PostgresqlIncidentAuditRecoveryStep {
  readonly #source: PostgresqlIncidentAuditRecoverySource;
  readonly #sink: PostgresqlIncidentAuditRecoverySink;

  constructor(options: Readonly<{
    source: PostgresqlIncidentAuditRecoverySource;
    sink: PostgresqlIncidentAuditRecoverySink;
  }>) {
    this.#source = options.source;
    this.#sink = options.sink;
  }

  async prepare(
    itemKey: Uint8Array,
    limitValue: number,
  ): Promise<PostgresqlIncidentAuditRecoveryResult> {
    requireIncidentAuditRecoveryKey(itemKey);
    const limit = requireIncidentAuditDeliveryLimit(limitValue);
    if (limit === undefined) throw new TypeError("incident audit recovery limit is required");
    const prefix = (await this.#source.listUndeliveredAuditEvents(limit))
      .map(snapshotPostgresqlIncidentAuditRecoveryItem);
    return {
      kind: "complete",
      apply: async (session) => {
        for (const item of prefix) {
          const ordinal = await this.#sink.applyAuditRecord(session, item);
          if (ordinal !== item.ordinal) {
            throw new TypeError("incident audit sink returned a different source ordinal");
          }
          await this.#source.applyAuditAcknowledgement(session, item);
        }
      },
    };
  }
}

const incidentAuditRecoveryKey = Uint8Array.of(115, 116, 114, 101, 97, 109);

function requireIncidentAuditRecoveryKey(value: Uint8Array): void {
  if (
    !(value instanceof Uint8Array) ||
    value.byteLength !== incidentAuditRecoveryKey.byteLength ||
    !incidentAuditRecoveryKey.every((byte, index) => value[index] === byte)
  ) {
    throw new TypeError("incident audit recovery key must be exact UTF-8 stream");
  }
}
