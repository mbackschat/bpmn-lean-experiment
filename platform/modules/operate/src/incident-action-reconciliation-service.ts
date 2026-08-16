import type { IncidentActionAuditOutboxService } from "./incident-audit-outbox-service.js";
import type { IncidentActionRepository } from "./incident-contracts.js";
import type { IncidentMutationService } from "./incident-mutation-service.js";

/** Replays pending audit first, then exact content-bound uncertain actions after restart. */
export class IncidentActionReconciliationService {
  constructor(
    private readonly repository: IncidentActionRepository,
    private readonly mutations: IncidentMutationService,
    private readonly outbox: IncidentActionAuditOutboxService,
  ) {}

  async reconcileAll(): Promise<void> {
    await this.outbox.reconcileAll();
    for (const action of await this.repository.listReconciliableActions()) {
      await this.mutations.reconcileRetained(action);
    }
    await this.outbox.reconcileAll();
  }
}
