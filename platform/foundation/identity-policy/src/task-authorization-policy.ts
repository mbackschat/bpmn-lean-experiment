import type { DeepReadonly } from "@bpmn-lean/contract-types";

import type { ActorContext } from "./actor-context.js";

export type TaskAuthorizationFacts = DeepReadonly<{
  candidateGroupId: string | null;
  claimActorId: string | null;
}>;

export enum TaskAuthorizationDecision {
  Hidden = "hidden",
  VisibleClaimable = "visibleClaimable",
  VisibleClaimedByCurrentActor = "visibleClaimedByCurrentActor",
}

export enum AuditActorSelectionDecision {
  Permitted = "permitted",
  Forbidden = "forbidden",
}

/** Applies the selected exact-group, self-claim, and self-audit policy. */
export class TaskAuthorizationPolicy {
  decideTask(
    actor: ActorContext,
    facts: TaskAuthorizationFacts,
  ): TaskAuthorizationDecision {
    if (
      facts.candidateGroupId === null
      || !actor.groups.includes(facts.candidateGroupId)
    ) {
      return TaskAuthorizationDecision.Hidden;
    }
    if (facts.claimActorId === null) {
      return TaskAuthorizationDecision.VisibleClaimable;
    }
    return facts.claimActorId === actor.id
      ? TaskAuthorizationDecision.VisibleClaimedByCurrentActor
      : TaskAuthorizationDecision.Hidden;
  }

  decideAuditActorSelection(
    actor: ActorContext,
    requestedActorId: string | undefined,
  ): AuditActorSelectionDecision {
    return requestedActorId === undefined || requestedActorId === actor.id
      ? AuditActorSelectionDecision.Permitted
      : AuditActorSelectionDecision.Forbidden;
  }
}

export function isTaskVisible(decision: TaskAuthorizationDecision): boolean {
  switch (decision) {
    case TaskAuthorizationDecision.Hidden:
      return false;
    case TaskAuthorizationDecision.VisibleClaimable:
    case TaskAuthorizationDecision.VisibleClaimedByCurrentActor:
      return true;
  }
}

export function isTaskClaimable(decision: TaskAuthorizationDecision): boolean {
  switch (decision) {
    case TaskAuthorizationDecision.VisibleClaimable:
      return true;
    case TaskAuthorizationDecision.Hidden:
    case TaskAuthorizationDecision.VisibleClaimedByCurrentActor:
      return false;
  }
}
