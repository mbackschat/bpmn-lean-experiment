import type {
  WorkAuditPage,
  WorkAuditRequest,
} from "@bpmn-lean/platform-contracts";
import {
  AuditActorSelectionDecision,
} from "@bpmn-lean/platform-identity-policy";
import type {
  ActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

type AuthorizedAuditRequest = WorkAuditRequest & Readonly<{
  actorId: string;
  limit: number;
}>;

type WorkAuditServiceOptions = Readonly<{
  actors: ActorResolver;
  authorization: Pick<TaskAuthorizationPolicy, "decideAuditActorSelection">;
  outbox: Readonly<{ reconcileAll(): void }>;
  audit: Readonly<{ search(request: AuthorizedAuditRequest): WorkAuditPage }>;
}>;

export class WorkAuditForbiddenError extends Error {
  constructor() {
    super("the requested Work audit actor is forbidden");
    this.name = "WorkAuditForbiddenError";
  }
}

/** Reconciles pending writes and applies the M3 self-only audit policy. */
export class WorkAuditService {
  constructor(private readonly options: WorkAuditServiceOptions) {}

  search(request: WorkAuditRequest & Readonly<{ limit: number }>): WorkAuditPage {
    this.options.outbox.reconcileAll();
    const actor = this.options.actors.resolveActor();
    switch (
      this.options.authorization.decideAuditActorSelection(actor, request.actorId)
    ) {
      case AuditActorSelectionDecision.Forbidden:
        throw new WorkAuditForbiddenError();
      case AuditActorSelectionDecision.Permitted:
        return this.options.audit.search({
          ...request,
          actorId: actor.id,
        });
    }
  }
}
