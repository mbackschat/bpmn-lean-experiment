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
    this.outbox.reconcileAll();
    for (const action of this.repository.listReconciliableActions()) {
      await this.mutations.reconcileRetained(action);
    }
    this.outbox.reconcileAll();
  }
}
