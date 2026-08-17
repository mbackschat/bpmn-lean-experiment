import type { IncidentActionAuditOutboxService } from "./incident-audit-outbox-service.js";
import type { IncidentActionRepository } from "./incident-contracts.js";
import type { IncidentMutationService } from "./incident-mutation-service.js";
import type { IncidentActionRecoveryResult } from "./incident-mutation-service.js";

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

  /** Prepares one exact action step whose mutation remains behind the lease fence. */
  async reconcileAction(actionId: string): Promise<IncidentActionRecoveryResult> {
    return this.mutations.prepareRecoveryCandidate(actionId);
  }
}
