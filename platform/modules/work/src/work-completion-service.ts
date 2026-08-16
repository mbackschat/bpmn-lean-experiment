import type {
  FormValidationIssue,
  PublicFormField,
  PublicWorkTaskId,
  WorkAuditAction,
  WorkAuditEvent,
  WorkCompletionRequest,
  WorkCompletionResult,
} from "@bpmn-lean/platform-contracts";
import type { ActorResolver } from "@bpmn-lean/platform-identity-policy";

import type {
  StoredWorkCompletionAction,
  WorkAuditEventFactory,
  WorkCompletionBinding,
  WorkCompletionOutcome,
  WorkCompletionOutcomeInput,
  WorkCompletionOutcomeResult,
  WorkCompletionReservationInput,
  WorkCompletionReservationResult,
  WorkCompletionSubmissionResult,
  WorkProcessRegistration,
  WorkSubmittedField,
  WorkTaskReference,
} from "./work-contracts.js";
import type { WorkAuditOutboxService } from "./work-audit-outbox-service.js";
import type { WorkService } from "./work-service.js";
import type {
  ActorVisibleWorkTaskDetail,
  WorkTaskDetailService,
} from "./work-task-detail-service.js";
import {
  computeStructuredFormCompletion,
  projectStructuredCurrentFieldValues,
} from "./structured-form-computation.js";

export type WorkCompletionServiceResult =
  | Readonly<{ kind: "result"; result: WorkCompletionResult }>
  | Readonly<{ kind: "conflict" | "notFound" | "formValueIncompatible" }>
  | Readonly<{
      kind: "formValidationFailed";
      issues: readonly [FormValidationIssue, ...FormValidationIssue[]];
    }>;

export type WorkCompletionRepository = Readonly<{
  listProcessRegistrations(): ReadonlyArray<WorkProcessRegistration>;
  getCompletionAction(actionId: string): StoredWorkCompletionAction | null;
  reserveCompletion(input: WorkCompletionReservationInput): WorkCompletionReservationResult;
  beginCompletionSubmission(
    actionId: string,
    binding: WorkCompletionBinding,
  ): WorkCompletionSubmissionResult;
  recordCompletionOutcome(input: WorkCompletionOutcomeInput): WorkCompletionOutcomeResult;
}>;

export type WorkCompletionGateway = Readonly<{
  completeWork(request: Readonly<{
    locator: string;
    hostingProcessInstanceId: string;
    stimulus: Readonly<{
      kind: "completeUserTaskInstance";
      commandId: string;
      taskId: PublicWorkTaskId;
      submittedValues: readonly Readonly<{
        name: string;
        value:
          | Readonly<{ kind: "null" }>
          | Readonly<{ kind: "string"; value: string }>
          | Readonly<{ kind: "boolean"; value: boolean }>
          | Readonly<{ kind: "integer"; value: number }>
          | Readonly<{ kind: "stringList"; value: readonly string[] }>;
      }>[];
    }>;
  }>): Promise<EngineCompletionResult>;
}>;

type EngineCompletionResult =
  | Readonly<{
      kind: "semantic";
      commandId: string;
      outcome: "committed" | "rolledBack" | "rejected" | "semanticFailure" | "unsupported";
    }>
  | Readonly<{
      kind: "processClosed";
      commandId: string;
      receipt: Readonly<{ processInstanceId: string }>;
    }>
  | Readonly<{
      kind: "processUnknown";
      commandId: string;
      processInstanceId: string;
    }>;

export type WorkCompletionServiceOptions = Readonly<{
  work: WorkService;
  details: WorkTaskDetailService;
  actors: ActorResolver;
  repository: WorkCompletionRepository;
  gateway: WorkCompletionGateway;
  outbox: WorkAuditOutboxService;
  auditEvents: WorkAuditEventFactory;
}>;

export class WorkCompletionIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkCompletionIntegrityError";
  }
}

/** Owns durable completion binding, validation, dispatch, and retained recovery. */
export class WorkCompletionService {
  readonly #activeSubmissions = new Set<string>();

  constructor(private readonly options: WorkCompletionServiceOptions) {}

  async completeTask(
    actionId: string,
    request: WorkCompletionRequest,
  ): Promise<WorkCompletionServiceResult> {
    const actorId = this.options.actors.resolveActor().id;
    const retained = this.options.repository.getCompletionAction(actionId);
    if (retained !== null) {
      this.options.outbox.reconcileAll();
      if (retained.binding.actorId !== actorId) return { kind: "notFound" };
      if (!this.#requestMatches(retained.binding, actionId, request)) {
        return { kind: "conflict" };
      }
      return this.#advanceCompletion(
        retained,
        this.#locatorFor(retained.binding.task.hostingProcessInstanceId),
      );
    }

    const visible = await this.options.details.findVisibleTaskDetail(
      structuredClone(request.taskId),
    );
    if (visible === null) return { kind: "notFound" };
    let binding: WorkCompletionBinding;
    if (isStructuredRequest(request)) {
      const form = visible.detail.form;
      if (form === null || !("schemaVersion" in form)) return { kind: "notFound" };
      const computation = computeStructuredFormCompletion(
        form.taskDefinition,
        form.fields,
        request,
      );
      if (computation.kind === "formValidationFailed") return computation;
      binding = {
        actionId,
        actorId,
        task: referenceForVisible(visible),
        claimGeneration: request.expectedClaimGeneration,
        structuredCompletion: {
          catalogIdentity: form.catalogIdentity,
          resolutionActionId: computation.resolutionActionId,
          submittedValues: computation.submittedValues,
        },
      };
    } else {
      const form = visible.detail.form;
      if (form === null || "schemaVersion" in form) return { kind: "notFound" };
      const field = form.fields[0];
      if (field.compatibility === "incompatible") {
        return { kind: "formValueIncompatible" };
      }
      const submittedField = projectSubmittedField(field, request.submittedValues[0]);
      if (submittedField === null) return { kind: "formValueIncompatible" };
      binding = {
        actionId,
        actorId,
        task: referenceForVisible(visible),
        claimGeneration: request.expectedClaimGeneration,
        submittedField,
      };
    }
    const claim = visible.claim.claim;
    if (claim === null) return { kind: "notFound" };
    if (claim.actorId !== actorId || claim.generation !== request.expectedClaimGeneration) {
      return { kind: "conflict" };
    }
    this.options.outbox.reconcileAll();
    const reservation = this.options.repository.reserveCompletion({
      binding,
      audit: this.#audit(binding.actorId, binding.task, {
        kind: "completion",
        actionId,
        outcome: "reserved",
      }),
    });
    switch (reservation.kind) {
      case "conflict":
      case "notFound":
        return { kind: "conflict" };
      case "reserved":
      case "retained":
        this.options.outbox.reconcileAll();
        return this.#advanceCompletion(reservation.action, visible.registration.locator);
    }
  }

  async #advanceCompletion(
    action: StoredWorkCompletionAction,
    locator: string,
  ): Promise<WorkCompletionServiceResult> {
    switch (action.state) {
      case "committed":
      case "rejected":
        return { kind: "result", result: requireCompletionResult(action) };
      case "submitting":
        return this.#activeSubmissions.has(action.binding.actionId)
          ? { kind: "result", result: indeterminateResult(action.binding) }
          : this.#submitCompletion(action.binding, locator);
      case "reserved":
      case "indeterminate":
        break;
    }
    const submission = this.options.repository.beginCompletionSubmission(
      action.binding.actionId,
      action.binding,
    );
    switch (submission.kind) {
      case "conflict":
        throw new WorkCompletionIntegrityError("completion action changed before submission");
      case "retained":
        return retainedSubmissionResult(submission.action);
      case "acquired":
        return this.#submitCompletion(submission.action.binding, locator);
    }
  }

  async #submitCompletion(
    binding: WorkCompletionBinding,
    locator: string,
  ): Promise<WorkCompletionServiceResult> {
    try {
      this.#activeSubmissions.add(binding.actionId);
      let outcome: WorkCompletionOutcome;
      try {
        const result = await this.options.gateway.completeWork({
          locator,
          hostingProcessInstanceId: binding.task.hostingProcessInstanceId,
          stimulus: {
            kind: "completeUserTaskInstance",
            commandId: binding.actionId,
            taskId: binding.task.taskId,
            submittedValues: submittedValuesFor(binding).map(({ key, value }) => ({
              name: key,
              value,
            })),
          },
        });
        outcome = classifyEngineResult(result, binding);
      } catch {
        outcome = { kind: "indeterminate" };
      }
      const recorded = this.options.repository.recordCompletionOutcome({
        binding,
        outcome,
        audit: this.#audit(binding.actorId, binding.task, {
          kind: "completion",
          actionId: binding.actionId,
          outcome: auditOutcomeFor(outcome),
        }),
      });
      this.options.outbox.reconcileAll();
      switch (recorded.kind) {
        case "conflict":
          throw new WorkCompletionIntegrityError("completion outcome conflicted with retained action");
        case "recorded":
        case "retained":
          return { kind: "result", result: requireCompletionResult(recorded.action) };
      }
    } finally {
      this.#activeSubmissions.delete(binding.actionId);
    }
  }

  #requestMatches(
    binding: WorkCompletionBinding,
    actionId: string,
    request: WorkCompletionRequest,
  ): boolean {
    if (
      binding.actionId !== actionId ||
      !sameTaskId(binding.task.taskId, request.taskId) ||
      binding.claimGeneration !== request.expectedClaimGeneration
    ) return false;
    if ("submittedField" in binding) {
      if (isStructuredRequest(request)) return false;
      const submitted = request.submittedValues[0];
      return binding.submittedField.key === submitted.key &&
        sameJson(binding.submittedField.value, submitted.value);
    }
    if (!isStructuredRequest(request) ||
        binding.structuredCompletion.resolutionActionId !== request.resolutionActionId) {
      return false;
    }
    const bound = this.options.work.readStructuredTask(
      binding.structuredCompletion.catalogIdentity,
      binding.task.taskId.elementId,
    );
    if (bound === null || !sameJson(
      bound.catalogIdentity,
      binding.structuredCompletion.catalogIdentity,
    )) return false;
    const fieldKeys = new Set(bound.taskDefinition.form.fields.map(({ key }) => key));
    const current = projectStructuredCurrentFieldValues(
      bound.taskDefinition,
      binding.structuredCompletion.submittedValues
        .filter(({ key }) => fieldKeys.has(key))
        .map(({ key, value }) => ({ name: key, value })),
    );
    if (current === null) return false;
    const computation = computeStructuredFormCompletion(bound.taskDefinition, current, request);
    return computation.kind === "accepted" && sameJson(
      computation.submittedValues,
      binding.structuredCompletion.submittedValues,
    );
  }

  #locatorFor(hostingProcessInstanceId: string): string {
    const matches = this.options.repository.listProcessRegistrations().filter(
      (registration) => registration.instance.processInstanceId === hostingProcessInstanceId,
    );
    if (matches.length !== 1) {
      throw new WorkCompletionIntegrityError("completion action has no exact hosting registration");
    }
    return matches[0]!.locator;
  }

  #audit(
    actorId: string,
    task: WorkTaskReference,
    action: WorkAuditAction,
  ): WorkAuditEvent {
    return this.options.auditEvents.create({
      actorId,
      hostingProcessInstanceId: task.hostingProcessInstanceId,
      taskId: structuredClone(task.taskId),
      action,
    });
  }
}

function referenceForVisible(
  visible: ActorVisibleWorkTaskDetail,
): WorkTaskReference {
  return {
    hostingProcessInstanceId: visible.registration.instance.processInstanceId,
    taskId: structuredClone(visible.task.id),
  };
}

function projectSubmittedField(
  field: PublicFormField,
  submitted: Extract<WorkCompletionRequest, { submittedValues: unknown }>["submittedValues"][0],
): WorkSubmittedField | null {
  if (submitted.key !== field.key) return null;
  switch (submitted.value.kind) {
    case "string":
      return field.type === "string"
        ? { key: field.key, declaredType: "string", value: submitted.value }
        : null;
    case "boolean":
      return field.type === "boolean"
        ? { key: field.key, declaredType: "boolean", value: submitted.value }
        : null;
  }
}

function submittedValuesFor(binding: WorkCompletionBinding) {
  return "submittedField" in binding
    ? [{ key: binding.submittedField.key, value: binding.submittedField.value }]
    : binding.structuredCompletion.submittedValues;
}

function retainedSubmissionResult(
  action: StoredWorkCompletionAction,
): WorkCompletionServiceResult {
  switch (action.state) {
    case "committed":
    case "rejected":
      return { kind: "result", result: requireCompletionResult(action) };
    case "reserved":
    case "submitting":
    case "indeterminate":
      return { kind: "result", result: indeterminateResult(action.binding) };
  }
}

function classifyEngineResult(
  result: EngineCompletionResult,
  binding: WorkCompletionBinding,
): WorkCompletionOutcome {
  if (result.commandId !== binding.actionId) return { kind: "indeterminate" };
  switch (result.kind) {
    case "semantic":
      switch (result.outcome) {
        case "committed":
          return { kind: "committed" };
        case "rolledBack":
        case "rejected":
        case "semanticFailure":
        case "unsupported":
          return { kind: "semanticRejected", outcome: result.outcome };
      }
    case "processClosed":
      return result.receipt.processInstanceId === binding.task.hostingProcessInstanceId
        ? { kind: "processClosed" }
        : { kind: "indeterminate" };
    case "processUnknown":
      return { kind: "indeterminate" };
  }
}

function auditOutcomeFor(
  outcome: WorkCompletionOutcome,
): "committed" | "rejected" | "indeterminate" {
  switch (outcome.kind) {
    case "committed":
      return "committed";
    case "semanticRejected":
    case "processClosed":
      return "rejected";
    case "indeterminate":
      return "indeterminate";
  }
}

function requireCompletionResult(action: StoredWorkCompletionAction): WorkCompletionResult {
  if (action.result === null) {
    throw new WorkCompletionIntegrityError("retained completion state has no result");
  }
  return structuredClone(action.result);
}

function indeterminateResult(binding: WorkCompletionBinding): WorkCompletionResult {
  return {
    state: "indeterminate",
    actionId: binding.actionId,
    taskId: structuredClone(binding.task.taskId),
  };
}

function sameTaskId(left: PublicWorkTaskId, right: PublicWorkTaskId): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId && left.activation === right.activation;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isStructuredRequest(
  request: WorkCompletionRequest,
): request is Extract<WorkCompletionRequest, { schemaVersion: unknown }> {
  return "schemaVersion" in request;
}
