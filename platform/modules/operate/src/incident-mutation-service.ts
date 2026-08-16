import type {
  AuthorizedIncidentActor,
  IncidentActionBinding,
  IncidentActionRepository,
  IncidentActionRequest,
  IncidentActionResult,
  IncidentAuditEvent,
  IncidentAuditEventFactory,
  IncidentMutationResult,
  IncidentOperationStimulus,
  IncidentOperationsGateway,
  StoredIncidentAction,
} from "./incident-contracts.js";
import { OperateIncidentIntegrityError } from "./incident-contracts.js";
import type { IncidentAggregationService } from "./incident-aggregation-service.js";
import type { IncidentActionAuditOutboxService } from "./incident-audit-outbox-service.js";
import {
  requireNonemptyString,
  sameJson,
  snapshotIncidentActionRequest,
} from "./incident-values.js";

export type IncidentMutationServiceOptions = Readonly<{
  aggregation: IncidentAggregationService;
  repository: IncidentActionRepository;
  gateway: Pick<IncidentOperationsGateway, "submitIncidentOperation">;
  outbox: IncidentActionAuditOutboxService;
  auditEvents: IncidentAuditEventFactory;
}>;

/** Coordinates durable exact binding, reserved-audit delivery, and Product 1 submission. */
export class IncidentMutationService {
  readonly #options: IncidentMutationServiceOptions;
  readonly #active = new Map<string, Promise<IncidentMutationResult>>();

  constructor(options: IncidentMutationServiceOptions) {
    this.#options = options;
  }

  async submitAuthorized(
    actor: AuthorizedIncidentActor,
    actionIdValue: string,
    interactionValue: IncidentActionRequest,
  ): Promise<IncidentMutationResult> {
    const actorId = requireNonemptyString(actor.actorId, "actorId");
    const actionId = requireNonemptyString(actionIdValue, "actionId");
    const interaction = snapshotIncidentActionRequest(interactionValue);
    await this.#options.outbox.reconcileAll();
    const retained = await this.#options.repository.get(actionId);
    if (retained !== null) {
      if (retained.binding.actorId !== actorId) return { kind: "forbidden" };
      if (!sameJson(retained.binding.interaction, interaction)) {
        return { kind: "conflict" };
      }
      return this.#advance(retained);
    }

    const snapshot = await this.#options.aggregation.currentSnapshot();
    const matches = snapshot.incidents.flatMap((current) =>
      current.availableInteractions
        .filter((candidate) => sameJson(candidate, interaction))
        .map(() => current)
    );
    if (matches.length === 0) return { kind: "conflict" };
    if (matches.length !== 1) {
      throw new OperateIncidentIntegrityError("published incident interaction is not unique");
    }
    const current = matches[0]!;
    const registration = await this.#options.aggregation.registration(
      current.hostingInstance.processInstanceId,
    );
    if (registration === null || !sameJson(registration.instance, current.hostingInstance)) {
      throw new OperateIncidentIntegrityError("current incident has no exact registration");
    }
    const binding: IncidentActionBinding = {
      actionId,
      actorId,
      hostingInstance: structuredClone(current.hostingInstance),
      locator: registration.locator,
      incident: structuredClone(current.incident),
      interaction,
    };
    const reservation = await this.#options.repository.reserve(
      binding,
      this.#audit(binding, "reserved"),
    );
    switch (reservation.kind) {
      case "forbidden":
      case "conflict":
        return { kind: reservation.kind };
      case "reserved":
      case "retained":
        await this.#options.outbox.reconcileAll();
        return this.#advance(reservation.action);
    }
  }

  /** Replays only already-bound submitting or indeterminate work after restart. */
  async reconcileRetained(
    action: StoredIncidentAction,
  ): Promise<IncidentMutationResult> {
    await this.#options.outbox.reconcileAll();
    const retained = await this.#options.repository.get(action.binding.actionId);
    if (retained === null || !sameJson(retained, action)) {
      throw new OperateIncidentIntegrityError("incident action changed before reconciliation");
    }
    return this.#advance(retained);
  }

  async #advance(action: StoredIncidentAction): Promise<IncidentMutationResult> {
    switch (action.state) {
      case "committed":
      case "rejected":
        return { kind: "result", result: requireResult(action) };
      case "submitting":
        return this.#submitOnce(action.binding);
      case "reserved":
      case "indeterminate":
        break;
    }
    const submission = await this.#options.repository.beginSubmission(
      action.binding.actionId,
      action.binding,
    );
    switch (submission.kind) {
      case "conflict":
        throw new OperateIncidentIntegrityError("incident action changed before submission");
      case "acquired":
        return this.#submitOnce(submission.action.binding);
      case "retained":
        switch (submission.action.state) {
          case "committed":
          case "rejected":
            return { kind: "result", result: requireResult(submission.action) };
          case "submitting":
            return this.#submitOnce(submission.action.binding);
          case "reserved":
          case "indeterminate":
            throw new OperateIncidentIntegrityError("incident action retained an impossible submission state");
        }
    }
  }

  #submitOnce(binding: IncidentActionBinding): Promise<IncidentMutationResult> {
    const active = this.#active.get(binding.actionId);
    if (active !== undefined) return active;
    const submitted = this.#submitOwned(binding);
    const tracked = submitted.finally(() => {
      if (this.#active.get(binding.actionId) === tracked) {
        this.#active.delete(binding.actionId);
      }
    });
    this.#active.set(binding.actionId, tracked);
    return tracked;
  }

  async #submitOwned(binding: IncidentActionBinding): Promise<IncidentMutationResult> {
    let result: IncidentActionResult;
    try {
      result = classifyEngineResult(
        await this.#options.gateway.submitIncidentOperation({
          locator: binding.locator,
          hostingProcessInstanceId: binding.hostingInstance.processInstanceId,
          stimulus: stimulusFor(binding),
        }),
        binding,
      );
    } catch {
      result = indeterminateResult(binding);
    }
    const recorded = await this.#options.repository.recordOutcome(
      binding,
      result,
      this.#audit(binding, result.state),
    );
    await this.#options.outbox.reconcileAll();
    switch (recorded.kind) {
      case "conflict":
        throw new OperateIncidentIntegrityError("incident action outcome conflicted");
      case "recorded":
      case "retained":
        return { kind: "result", result: requireResult(recorded.action) };
    }
  }

  #audit(
    binding: IncidentActionBinding,
    outcome: IncidentAuditEvent["outcome"],
  ): IncidentAuditEvent {
    return this.#options.auditEvents.create({
      actorId: binding.actorId,
      hostingProcessInstanceId: binding.hostingInstance.processInstanceId,
      incidentId: structuredClone(binding.incident.id),
      actionId: binding.actionId,
      actionKind: binding.interaction.kind,
      outcome,
    });
  }
}

function stimulusFor(binding: IncidentActionBinding): IncidentOperationStimulus {
  switch (binding.interaction.kind) {
    case "retryIncident":
      return {
        kind: "retryIncident",
        commandId: binding.actionId,
        incidentId: structuredClone(binding.interaction.incidentId),
      };
    case "cancelIncidentProcess":
      return {
        kind: "cancelIncidentProcess",
        commandId: binding.actionId,
        processInstanceId: binding.interaction.processInstanceId,
        incidentId: structuredClone(binding.interaction.incidentId),
      };
  }
}

function classifyEngineResult(
  value: unknown,
  binding: IncidentActionBinding,
): IncidentActionResult {
  if (!isRecord(value) || value.commandId !== binding.actionId || typeof value.kind !== "string") {
    return indeterminateResult(binding);
  }
  switch (value.kind) {
    case "semantic":
      if (!hasOnlyKeys(value, ["kind", "commandId", "outcome"])) {
        return indeterminateResult(binding);
      }
      switch (value.outcome) {
        case "committed":
          return {
            state: "committed",
            actionId: binding.actionId,
            interaction: structuredClone(binding.interaction),
          };
        case "rolledBack":
        case "rejected":
        case "semanticFailure":
        case "unsupported":
          return {
            state: "rejected",
            actionId: binding.actionId,
            interaction: structuredClone(binding.interaction),
            engineResult: { kind: "semantic", outcome: value.outcome },
          };
        default:
          return indeterminateResult(binding);
      }
    case "processClosed": {
      if (!hasOnlyKeys(value, ["kind", "commandId", "receipt"]) ||
          !isRecord(value.receipt) ||
          value.receipt.processInstanceId !== binding.hostingInstance.processInstanceId ||
          !isRecord(value.receipt.finalState)) {
        return indeterminateResult(binding);
      }
      const status = value.receipt.finalState.status;
      return status === "completed" || status === "cancelled"
        ? {
            state: "rejected",
            actionId: binding.actionId,
            interaction: structuredClone(binding.interaction),
            engineResult: { kind: "processClosed", status },
          }
        : indeterminateResult(binding);
    }
    case "processUnknown":
      return hasOnlyKeys(value, ["kind", "commandId", "processInstanceId"]) &&
          value.processInstanceId === binding.hostingInstance.processInstanceId
        ? indeterminateResult(binding)
        : indeterminateResult(binding);
    default:
      return indeterminateResult(binding);
  }
}

function indeterminateResult(binding: IncidentActionBinding): IncidentActionResult {
  return {
    state: "indeterminate",
    actionId: binding.actionId,
    interaction: structuredClone(binding.interaction),
  };
}

function requireResult(action: StoredIncidentAction): IncidentActionResult {
  if (action.result === null) {
    throw new OperateIncidentIntegrityError("terminal incident action has no result");
  }
  return structuredClone(action.result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).toSorted();
  const expected = [...keys].toSorted();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
