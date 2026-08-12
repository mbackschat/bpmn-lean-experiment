import type {
  PublicFormField,
  PublicWorkTaskId,
  WorkAuditAction,
  WorkAuditEvent,
  WorkClaimRequest,
  WorkClaimResult,
  WorkCompletionRequest,
  WorkCompletionResult,
  WorkReleaseRequest,
  WorkReleaseResult,
} from "@bpmn-lean/platform-contracts";
import type { ActorResolver } from "@bpmn-lean/platform-identity-policy";

import type {
  StoredWorkClaimReleaseAction,
  StoredWorkCompletionAction,
  WorkClaimTransitionInput,
  WorkClaimTransitionResult,
  WorkCompletionBinding,
  WorkCompletionOutcome,
  WorkCompletionOutcomeInput,
  WorkCompletionOutcomeResult,
  WorkCompletionReservationInput,
  WorkCompletionReservationResult,
  WorkCompletionSubmissionResult,
  WorkProcessRegistration,
  WorkReleaseTransitionInput,
  WorkReleaseTransitionResult,
  WorkSubmittedField,
  WorkTaskReference,
} from "./work-contracts.js";
import type { WorkAuditOutboxService } from "./work-audit-outbox-service.js";
import type {
  ActorVisibleSystemWorkTask,
  WorkService,
} from "./work-service.js";
import type { WorkTaskDetailService } from "./work-task-detail-service.js";

export type WorkClaimServiceResult =
  | Readonly<{ kind: "claimed" | "idempotent"; result: WorkClaimResult }>
  | Readonly<{ kind: "conflict" | "notFound" }>;

export type WorkReleaseServiceResult =
  | Readonly<{ kind: "released" | "idempotent"; result: WorkReleaseResult }>
  | Readonly<{ kind: "conflict" | "notFound" }>;

export type WorkCompletionServiceResult =
  | Readonly<{ kind: "result"; result: WorkCompletionResult }>
  | Readonly<{
      kind: "conflict" | "notFound" | "formValueIncompatible";
    }>;

export type WorkAuditEventSeed = Omit<WorkAuditEvent, "eventId" | "recordedAt">;

export interface WorkAuditEventFactory {
  create(input: WorkAuditEventSeed): WorkAuditEvent;
}

type WorkMutationRepository = Readonly<{
  listProcessRegistrations(): ReadonlyArray<WorkProcessRegistration>;
  getClaimReleaseAction(actionId: string): StoredWorkClaimReleaseAction | null;
  claimTask(input: WorkClaimTransitionInput): WorkClaimTransitionResult;
  releaseTask(input: WorkReleaseTransitionInput): WorkReleaseTransitionResult;
  getCompletionAction(actionId: string): StoredWorkCompletionAction | null;
  reserveCompletion(input: WorkCompletionReservationInput): WorkCompletionReservationResult;
  beginCompletionSubmission(
    actionId: string,
    binding: WorkCompletionBinding,
  ): WorkCompletionSubmissionResult;
  recordCompletionOutcome(
    input: WorkCompletionOutcomeInput,
  ): WorkCompletionOutcomeResult;
}>;

type WorkCompletionGateway = Readonly<{
  completeWork(request: Readonly<{
    locator: string;
    hostingProcessInstanceId: string;
    stimulus: Readonly<{
      kind: "completeUserTaskInstance";
      commandId: string;
      taskId: PublicWorkTaskId;
      submittedValues: readonly [Readonly<{
        name: string;
        value:
          | Readonly<{ kind: "string"; value: string }>
          | Readonly<{ kind: "boolean"; value: boolean }>;
      }>];
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

type WorkMutationServiceOptions = Readonly<{
  work: WorkService;
  details: WorkTaskDetailService;
  actors: ActorResolver;
  repository: WorkMutationRepository;
  gateway: WorkCompletionGateway;
  outbox: WorkAuditOutboxService;
  auditEvents: WorkAuditEventFactory;
}>;

export class WorkMutationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkMutationIntegrityError";
  }
}

/** Coordinates actor policy, durable action binding, audit delivery, and host completion. */
export class WorkMutationService {
  readonly #options: WorkMutationServiceOptions;
  readonly #activeSubmissions = new Set<string>();

  constructor(options: WorkMutationServiceOptions) {
    this.#options = options;
  }

  async claimTask(
    taskId: PublicWorkTaskId,
    request: WorkClaimRequest,
  ): Promise<WorkClaimServiceResult> {
    this.#options.outbox.reconcileAll();
    const actorId = this.#options.actors.resolveActor().id;
    const retained = this.#options.repository.getClaimReleaseAction(request.actionId);
    if (retained !== null) {
      if (retained.binding.actorId !== actorId) return { kind: "notFound" };
      const task = taskReferenceForRetained(retained, taskId);
      return this.#claim(actorId, task, request);
    }
    const visible = await this.#options.work.findVisibleTask(structuredClone(taskId));
    if (visible === null) return { kind: "notFound" };
    return this.#claim(actorId, referenceForVisible(visible), request);
  }

  async releaseTask(
    taskId: PublicWorkTaskId,
    request: WorkReleaseRequest,
  ): Promise<WorkReleaseServiceResult> {
    this.#options.outbox.reconcileAll();
    const actorId = this.#options.actors.resolveActor().id;
    const retained = this.#options.repository.getClaimReleaseAction(request.actionId);
    if (retained !== null) {
      if (retained.binding.actorId !== actorId) return { kind: "notFound" };
      const task = taskReferenceForRetained(retained, taskId);
      return this.#release(actorId, task, request);
    }
    const visible = await this.#options.work.findVisibleTask(structuredClone(taskId));
    if (visible === null || visible.claim.claim === null) return { kind: "notFound" };
    return this.#release(actorId, referenceForVisible(visible), request);
  }

  async completeTask(
    actionId: string,
    request: WorkCompletionRequest,
  ): Promise<WorkCompletionServiceResult> {
    this.#options.outbox.reconcileAll();
    const actorId = this.#options.actors.resolveActor().id;
    const retained = this.#options.repository.getCompletionAction(actionId);
    if (retained !== null) {
      if (retained.binding.actorId !== actorId) return { kind: "notFound" };
      if (!completionRequestMatches(retained.binding, actionId, request)) {
        return { kind: "conflict" };
      }
      return this.#advanceCompletion(
        retained,
        this.#locatorFor(retained.binding.task.hostingProcessInstanceId),
      );
    }

    const visible = await this.#options.details.findVisibleTaskDetail(
      structuredClone(request.taskId),
    );
    if (visible === null) return { kind: "notFound" };
    const field = visible.detail.form?.fields[0];
    if (field === undefined) return { kind: "notFound" };
    if (field.compatibility === "incompatible") {
      return { kind: "formValueIncompatible" };
    }
    const submitted = request.submittedValues[0];
    const submittedField = projectSubmittedField(field, submitted);
    if (submittedField === null) {
      return { kind: "formValueIncompatible" };
    }
    const claim = visible.claim.claim;
    if (claim === null) return { kind: "notFound" };
    if (
      claim.actorId !== actorId ||
      claim.generation !== request.expectedClaimGeneration
    ) {
      return { kind: "conflict" };
    }
    const binding: WorkCompletionBinding = {
      actionId,
      actorId,
      task: referenceForVisible(visible),
      claimGeneration: request.expectedClaimGeneration,
      submittedField,
    };
    const reservation = this.#options.repository.reserveCompletion({
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
        this.#options.outbox.reconcileAll();
        return this.#advanceCompletion(
          reservation.action,
          visible.registration.locator,
        );
    }
  }

  #claim(
    actorId: string,
    task: WorkTaskReference,
    request: WorkClaimRequest,
  ): WorkClaimServiceResult {
    const result = this.#options.repository.claimTask({
      actionId: request.actionId,
      actorId,
      task,
      expectedGeneration: request.expectedGeneration,
      audit: {
        claimed: this.#audit(actorId, task, {
          kind: "claim",
          actionId: request.actionId,
          outcome: "claimed",
        }),
        idempotent: this.#audit(actorId, task, {
          kind: "claim",
          actionId: request.actionId,
          outcome: "idempotent",
        }),
        conflict: this.#audit(actorId, task, {
          kind: "claim",
          actionId: request.actionId,
          outcome: "conflict",
        }),
      },
    });
    this.#options.outbox.reconcileAll();
    switch (result.kind) {
      case "claimed":
      case "idempotent":
        return result;
      case "conflict":
        return { kind: "conflict" };
    }
  }

  #release(
    actorId: string,
    task: WorkTaskReference,
    request: WorkReleaseRequest,
  ): WorkReleaseServiceResult {
    const result = this.#options.repository.releaseTask({
      actionId: request.actionId,
      actorId,
      task,
      generation: request.generation,
      audit: {
        released: this.#audit(actorId, task, {
          kind: "release",
          actionId: request.actionId,
          outcome: "released",
        }),
        idempotent: this.#audit(actorId, task, {
          kind: "release",
          actionId: request.actionId,
          outcome: "idempotent",
        }),
        conflict: this.#audit(actorId, task, {
          kind: "release",
          actionId: request.actionId,
          outcome: "conflict",
        }),
      },
    });
    this.#options.outbox.reconcileAll();
    switch (result.kind) {
      case "released":
      case "idempotent":
        return result;
      case "conflict":
        return { kind: "conflict" };
      case "notFound":
        return { kind: "notFound" };
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
    const submission = this.#options.repository.beginCompletionSubmission(
      action.binding.actionId,
      action.binding,
    );
    switch (submission.kind) {
      case "conflict":
        throw new WorkMutationIntegrityError("completion action changed before submission");
      case "retained":
        return this.#retainedSubmissionResult(submission.action);
      case "acquired":
        return this.#submitCompletion(submission.action.binding, locator);
    }
  }

  #retainedSubmissionResult(
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

  async #submitCompletion(
    binding: WorkCompletionBinding,
    locator: string,
  ): Promise<WorkCompletionServiceResult> {
    try {
      this.#activeSubmissions.add(binding.actionId);
      let outcome: WorkCompletionOutcome;
      try {
        const result = await this.#options.gateway.completeWork({
          locator,
          hostingProcessInstanceId: binding.task.hostingProcessInstanceId,
          stimulus: {
            kind: "completeUserTaskInstance",
            commandId: binding.actionId,
            taskId: binding.task.taskId,
            submittedValues: [{
              name: binding.submittedField.key,
              value: binding.submittedField.value,
            }],
          },
        });
        outcome = classifyEngineResult(result, binding);
      } catch {
        outcome = { kind: "indeterminate" };
      }
      const recorded = this.#options.repository.recordCompletionOutcome({
        binding,
        outcome,
        audit: this.#audit(binding.actorId, binding.task, {
          kind: "completion",
          actionId: binding.actionId,
          outcome: auditOutcomeFor(outcome),
        }),
      });
      this.#options.outbox.reconcileAll();
      switch (recorded.kind) {
        case "conflict":
          throw new WorkMutationIntegrityError("completion outcome conflicted with retained action");
        case "recorded":
        case "retained":
          return {
            kind: "result",
            result: requireCompletionResult(recorded.action),
          };
      }
    } finally {
      this.#activeSubmissions.delete(binding.actionId);
    }
  }

  #locatorFor(hostingProcessInstanceId: string): string {
    const matches = this.#options.repository.listProcessRegistrations().filter(
      (registration) =>
        registration.instance.processInstanceId === hostingProcessInstanceId,
    );
    if (matches.length !== 1) {
      throw new WorkMutationIntegrityError("completion action has no exact hosting registration");
    }
    return matches[0]!.locator;
  }

  #audit(
    actorId: string,
    task: WorkTaskReference,
    action: WorkAuditAction,
  ): WorkAuditEvent {
    return this.#options.auditEvents.create({
      actorId,
      hostingProcessInstanceId: task.hostingProcessInstanceId,
      taskId: structuredClone(task.taskId),
      action,
    });
  }
}

function referenceForVisible(
  visible: ActorVisibleSystemWorkTask,
): WorkTaskReference {
  return {
    hostingProcessInstanceId: visible.registration.instance.processInstanceId,
    taskId: structuredClone(visible.task.id),
  };
}

function projectSubmittedField(
  field: PublicFormField,
  submitted: WorkCompletionRequest["submittedValues"][0],
): WorkSubmittedField | null {
  if (submitted.key !== field.key) return null;
  switch (submitted.value.kind) {
    case "string":
      return field.type === "string"
        ? {
            key: field.key,
            declaredType: "string",
            value: submitted.value,
          }
        : null;
    case "boolean":
      return field.type === "boolean"
        ? {
            key: field.key,
            declaredType: "boolean",
            value: submitted.value,
          }
        : null;
  }
}

function taskReferenceForRetained(
  retained: StoredWorkClaimReleaseAction,
  taskId: PublicWorkTaskId,
): WorkTaskReference {
  return {
    hostingProcessInstanceId: retained.binding.task.hostingProcessInstanceId,
    taskId: structuredClone(taskId),
  };
}

function completionRequestMatches(
  binding: WorkCompletionBinding,
  actionId: string,
  request: WorkCompletionRequest,
): boolean {
  const submitted = request.submittedValues[0];
  return binding.actionId === actionId &&
    sameTaskId(binding.task.taskId, request.taskId) &&
    binding.claimGeneration === request.expectedClaimGeneration &&
    binding.submittedField.key === submitted.key &&
    sameJson(binding.submittedField.value, submitted.value);
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

function requireCompletionResult(
  action: StoredWorkCompletionAction,
): WorkCompletionResult {
  if (action.result === null) {
    throw new WorkMutationIntegrityError("retained completion state has no result");
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
    left.elementId === right.elementId &&
    left.activation === right.activation;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
