import type {
  PublicWorkTaskId,
  WorkAuditAction,
  WorkAuditEvent,
  WorkClaimRequest,
  WorkClaimResult,
  WorkCompletionRequest,
  WorkReleaseRequest,
  WorkReleaseResult,
} from "@bpmn-lean/platform-contracts";
import type { ActorResolver } from "@bpmn-lean/platform-identity-policy";

import type {
  StoredWorkClaimReleaseAction,
  WorkAuditEventFactory,
  WorkClaimTransitionInput,
  WorkClaimTransitionResult,
  WorkReleaseTransitionInput,
  WorkReleaseTransitionResult,
  WorkTaskReference,
} from "./work-contracts.js";
import type { WorkAuditOutboxService } from "./work-audit-outbox-service.js";
import {
  WorkCompletionService,
} from "./work-completion-service.js";
import type {
  WorkCompletionServiceOptions,
  WorkCompletionServiceResult,
} from "./work-completion-service.js";
import type {
  ActorVisibleSystemWorkTask,
  WorkService,
} from "./work-service.js";

export type WorkClaimServiceResult =
  | Readonly<{ kind: "claimed" | "idempotent"; result: WorkClaimResult }>
  | Readonly<{ kind: "conflict" | "notFound" }>;

export type WorkReleaseServiceResult =
  | Readonly<{ kind: "released" | "idempotent"; result: WorkReleaseResult }>
  | Readonly<{ kind: "conflict" | "notFound" }>;

export type { WorkCompletionServiceResult } from "./work-completion-service.js";
export type {
  WorkAuditEventFactory,
  WorkAuditEventSeed,
} from "./work-contracts.js";

type WorkMutationRepository = Readonly<{
  getClaimReleaseAction(actionId: string): StoredWorkClaimReleaseAction | null;
  claimTask(input: WorkClaimTransitionInput): WorkClaimTransitionResult;
  releaseTask(input: WorkReleaseTransitionInput): WorkReleaseTransitionResult;
}> & WorkCompletionServiceOptions["repository"];

type WorkMutationServiceOptions = Omit<
  WorkCompletionServiceOptions,
  "actors" | "repository" | "work"
> & Readonly<{
  work: WorkService;
  actors: ActorResolver;
  repository: WorkMutationRepository;
}>;

export class WorkMutationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkMutationIntegrityError";
  }
}

/** Coordinates claim/release policy and delegates completion to its cohesive owner. */
export class WorkMutationService {
  readonly #completion: WorkCompletionService;

  constructor(private readonly options: WorkMutationServiceOptions) {
    this.#completion = new WorkCompletionService(options);
  }

  async claimTask(
    taskId: PublicWorkTaskId,
    request: WorkClaimRequest,
  ): Promise<WorkClaimServiceResult> {
    this.options.outbox.reconcileAll();
    const actorId = this.options.actors.resolveActor().id;
    const retained = this.options.repository.getClaimReleaseAction(request.actionId);
    if (retained !== null) {
      if (retained.binding.actorId !== actorId) return { kind: "notFound" };
      return this.#claim(actorId, taskReferenceForRetained(retained, taskId), request);
    }
    const visible = await this.options.work.findVisibleTask(structuredClone(taskId));
    if (visible === null) return { kind: "notFound" };
    return this.#claim(actorId, referenceForVisible(visible), request);
  }

  async releaseTask(
    taskId: PublicWorkTaskId,
    request: WorkReleaseRequest,
  ): Promise<WorkReleaseServiceResult> {
    this.options.outbox.reconcileAll();
    const actorId = this.options.actors.resolveActor().id;
    const retained = this.options.repository.getClaimReleaseAction(request.actionId);
    if (retained !== null) {
      if (retained.binding.actorId !== actorId) return { kind: "notFound" };
      return this.#release(actorId, taskReferenceForRetained(retained, taskId), request);
    }
    const visible = await this.options.work.findVisibleTask(structuredClone(taskId));
    if (visible === null || visible.claim.claim === null) return { kind: "notFound" };
    return this.#release(actorId, referenceForVisible(visible), request);
  }

  completeTask(
    actionId: string,
    request: WorkCompletionRequest,
  ): Promise<WorkCompletionServiceResult> {
    return this.#completion.completeTask(actionId, request);
  }

  #claim(
    actorId: string,
    task: WorkTaskReference,
    request: WorkClaimRequest,
  ): WorkClaimServiceResult {
    const result = this.options.repository.claimTask({
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
    this.options.outbox.reconcileAll();
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
    const result = this.options.repository.releaseTask({
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
    this.options.outbox.reconcileAll();
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

function referenceForVisible(visible: ActorVisibleSystemWorkTask): WorkTaskReference {
  return {
    hostingProcessInstanceId: visible.registration.instance.processInstanceId,
    taskId: structuredClone(visible.task.id),
  };
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
