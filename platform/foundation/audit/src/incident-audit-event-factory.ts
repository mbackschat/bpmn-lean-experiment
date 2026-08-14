import type { IncidentAuditEvent } from "@bpmn-lean/platform-contracts";

export type IncidentAuditEventSeed = Omit<
  IncidentAuditEvent,
  "eventId" | "recordedAt"
>;

type IncidentAuditEventFactoryOptions = Readonly<{
  generateId: () => string;
  now: () => Date;
}>;

/** Mints an immutable incident-action audit fact independently of Work audit. */
export class IncidentAuditEventFactory {
  readonly #options: IncidentAuditEventFactoryOptions;

  constructor(options: IncidentAuditEventFactoryOptions) {
    this.#options = options;
  }

  create(input: IncidentAuditEventSeed): IncidentAuditEvent {
    return {
      eventId: this.#options.generateId(),
      recordedAt: this.#options.now().toISOString(),
      ...structuredClone(input),
    };
  }
}
