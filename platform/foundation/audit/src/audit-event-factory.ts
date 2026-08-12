import type { WorkAuditEvent } from "@bpmn-lean/platform-contracts";

export type WorkAuditEventSeed = Omit<
  WorkAuditEvent,
  "eventId" | "recordedAt"
>;

type AuditEventFactoryOptions = Readonly<{
  generateId: () => string;
  now: () => Date;
}>;

/** Mints one immutable platform audit fact from the injected wall clock and identity source. */
export class AuditEventFactory {
  readonly #options: AuditEventFactoryOptions;

  constructor(options: AuditEventFactoryOptions) {
    this.#options = options;
  }

  create(input: WorkAuditEventSeed): WorkAuditEvent {
    return {
      eventId: this.#options.generateId(),
      recordedAt: this.#options.now().toISOString(),
      ...structuredClone(input),
    };
  }
}

