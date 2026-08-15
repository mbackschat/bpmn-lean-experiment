import type { ActorContext } from "./actor-context.js";

export enum OperationsAuthorizationSurface {
  IncidentList = "incidentList",
  IncidentDetail = "incidentDetail",
  IncidentAction = "incidentAction",
  IncidentAudit = "incidentAudit",
  ExecutionHistory = "executionHistory",
  ExecutionDiagram = "executionDiagram",
  ExecutionExport = "executionExport",
  FlowNodeMetrics = "flowNodeMetrics",
  OperatorAudit = "operatorAudit",
}

export enum OperationsAuthorizationDecision {
  Permitted = "permitted",
  Forbidden = "forbidden",
}

export class InvalidOperationsAuthorizationConfigurationError extends Error {}

/** Applies one exact configured-group rule uniformly to every Operations surface. */
export class OperationsAuthorizationPolicy {
  readonly #operationsGroupId: string;

  constructor(operationsGroupId: string) {
    if (
      typeof operationsGroupId !== "string" ||
      operationsGroupId.length === 0 ||
      !operationsGroupId.isWellFormed()
    ) {
      throw new InvalidOperationsAuthorizationConfigurationError(
        "operations group ID must be nonempty well-formed Unicode",
      );
    }
    this.#operationsGroupId = operationsGroupId;
  }

  decide(
    actor: ActorContext,
    surface: OperationsAuthorizationSurface,
  ): OperationsAuthorizationDecision {
    switch (surface) {
      case OperationsAuthorizationSurface.IncidentList:
      case OperationsAuthorizationSurface.IncidentDetail:
      case OperationsAuthorizationSurface.IncidentAction:
      case OperationsAuthorizationSurface.IncidentAudit:
      case OperationsAuthorizationSurface.ExecutionHistory:
      case OperationsAuthorizationSurface.ExecutionDiagram:
      case OperationsAuthorizationSurface.ExecutionExport:
      case OperationsAuthorizationSurface.FlowNodeMetrics:
      case OperationsAuthorizationSurface.OperatorAudit:
        return actor.groups.includes(this.#operationsGroupId)
          ? OperationsAuthorizationDecision.Permitted
          : OperationsAuthorizationDecision.Forbidden;
    }
  }
}
