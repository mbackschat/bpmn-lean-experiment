import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

import type { WorkAuditOutboxItem } from "./work-contracts.js";
import { requireWorkAuditDeliveryLimit } from "./work-audit-delivery-values.js";
import { snapshotPostgresqlWorkAuditRecoveryItem } from "./postgresql-work-audit-recovery-storage.js";

export type PostgresqlWorkAuditRecoverySource = Readonly<{
  listUndeliveredAuditEvents: (
    limit: number,
  ) => Promise<ReadonlyArray<WorkAuditOutboxItem>>;
  applyAuditAcknowledgement: (
    session: PostgresqlSession,
    item: WorkAuditOutboxItem,
  ) => Promise<void>;
}>;

export type PostgresqlWorkAuditRecoverySink = Readonly<{
  applyAuditRecord: (
    session: PostgresqlSession,
    item: WorkAuditOutboxItem,
  ) => Promise<number>;
}>;

export type PostgresqlWorkAuditRecoveryResult = Readonly<{
  kind: "complete";
  apply: (session: PostgresqlSession) => Promise<void>;
}>;

/** Prepares one bounded Work audit prefix and leaves every write behind the lease fence. */
export class PostgresqlWorkAuditRecoveryStep {
  readonly #source: PostgresqlWorkAuditRecoverySource;
  readonly #sink: PostgresqlWorkAuditRecoverySink;

  constructor(options: Readonly<{
    source: PostgresqlWorkAuditRecoverySource;
    sink: PostgresqlWorkAuditRecoverySink;
  }>) {
    this.#source = options.source;
    this.#sink = options.sink;
  }

  async prepare(
    itemKey: Uint8Array,
    limitValue: number,
  ): Promise<PostgresqlWorkAuditRecoveryResult> {
    requireWorkAuditRecoveryKey(itemKey);
    const limit = requireWorkAuditDeliveryLimit(limitValue);
    if (limit === undefined) throw new TypeError("Work audit recovery limit is required");
    const prefix = (await this.#source.listUndeliveredAuditEvents(limit))
      .map(snapshotPostgresqlWorkAuditRecoveryItem);
    return {
      kind: "complete",
      apply: async (session) => {
        for (const item of prefix) {
          const ordinal = await this.#sink.applyAuditRecord(session, item);
          if (ordinal !== item.ordinal) {
            throw new TypeError("Work audit sink returned a different source ordinal");
          }
          await this.#source.applyAuditAcknowledgement(session, item);
        }
      },
    };
  }
}

const workAuditRecoveryKey = Uint8Array.of(115, 116, 114, 101, 97, 109);

function requireWorkAuditRecoveryKey(value: Uint8Array): void {
  if (
    !(value instanceof Uint8Array) ||
    value.byteLength !== workAuditRecoveryKey.byteLength ||
    !workAuditRecoveryKey.every((byte, index) => value[index] === byte)
  ) {
    throw new TypeError("Work audit recovery key must be exact UTF-8 stream");
  }
}
