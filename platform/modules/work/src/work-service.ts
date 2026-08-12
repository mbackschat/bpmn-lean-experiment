import type {
  PublicWorkTask,
  PublicWorkTaskId,
  WorkTaskSnapshot,
} from "@bpmn-lean/platform-contracts";
import type {
  ActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";
import {
  isTaskClaimable,
  isTaskVisible,
} from "@bpmn-lean/platform-identity-policy";

import type {
  WorkClaimSnapshot,
  WorkProcessRegistration,
  WorkTaskReference,
} from "./work-contracts.js";

export class WorkSnapshotUnavailableError extends Error {
  constructor() {
    super("complete Work snapshot is unavailable");
    this.name = "WorkSnapshotUnavailableError";
  }
}

export type SystemWorkTask = Readonly<{
  registration: WorkProcessRegistration;
  task: PublicWorkTask["task"];
  claim: WorkClaimSnapshot;
}>;

export type ActorVisibleSystemWorkTask = SystemWorkTask & Readonly<{
  publicTask: PublicWorkTask;
}>;

type WorkRepositoryPort = Readonly<{
  listProcessRegistrations(): ReadonlyArray<WorkProcessRegistration>;
  recordObservation(processInstanceId: string, observation: "active" | "closed" | "indeterminate"): void;
  getClaim(task: WorkTaskReference): WorkClaimSnapshot;
}>;

type WorkObservationGatewayPort = Readonly<{
  observeOpenWork(request: Readonly<{
    locator: string;
    hostingProcessInstanceId: string;
  }>): Promise<
    | Readonly<{ status: "open"; openUserTasks: readonly PublicWorkTask["task"][] }>
    | Readonly<{ status: "closed" | "unknown" | "unavailable" }>
  >;
}>;

type WorkServiceOptions = Readonly<{
  repository: WorkRepositoryPort;
  gateway: WorkObservationGatewayPort;
  actors: ActorResolver;
  authorization: TaskAuthorizationPolicy;
  limits: Readonly<{ maxProcesses: number; maxTasks: number }>;
}>;

/** Freshly aggregates engine-owned task facts before applying actor policy. */
export class WorkService {
  readonly #options: WorkServiceOptions;

  constructor(options: WorkServiceOptions) {
    requirePositive(options.limits.maxProcesses, "maxProcesses");
    requirePositive(options.limits.maxTasks, "maxTasks");
    this.#options = options;
  }

  async observeSystemTasks(): Promise<ReadonlyArray<SystemWorkTask>> {
    const registrations = this.#options.repository.listProcessRegistrations();
    if (registrations.length > this.#options.limits.maxProcesses) {
      throw new WorkSnapshotUnavailableError();
    }
    const tasks: SystemWorkTask[] = [];
    for (const registration of registrations) {
      if (registration.observation === "closed") continue;
      const observation = await this.#options.gateway.observeOpenWork({
        locator: registration.locator,
        hostingProcessInstanceId: registration.instance.processInstanceId,
      });
      switch (observation.status) {
        case "closed":
          this.#options.repository.recordObservation(
            registration.instance.processInstanceId,
            "closed",
          );
          break;
        case "unknown":
        case "unavailable":
          this.#options.repository.recordObservation(
            registration.instance.processInstanceId,
            "indeterminate",
          );
          throw new WorkSnapshotUnavailableError();
        case "open":
          this.#options.repository.recordObservation(
            registration.instance.processInstanceId,
            "active",
          );
          for (const task of observation.openUserTasks) {
            if (tasks.length >= this.#options.limits.maxTasks) {
              throw new WorkSnapshotUnavailableError();
            }
            const exactTask = structuredClone(task);
            const reference = {
              hostingProcessInstanceId: registration.instance.processInstanceId,
              taskId: exactTask.id,
            };
            tasks.push({
              registration: structuredClone(registration),
              task: exactTask,
              claim: this.#options.repository.getClaim(reference),
            });
          }
          break;
      }
    }
    return tasks;
  }

  async listTasks(): Promise<WorkTaskSnapshot> {
    const visible: PublicWorkTask[] = [];
    for (const item of await this.observeSystemTasks()) {
      const projected = this.#projectVisible(item);
      if (projected !== null) visible.push(projected.publicTask);
    }
    visible.sort(compareWorkTasks);
    return { tasks: visible };
  }

  async findVisibleTask(
    taskId: PublicWorkTaskId,
  ): Promise<ActorVisibleSystemWorkTask | null> {
    const matches = (await this.observeSystemTasks()).filter((item) =>
      sameTaskId(item.task.id, taskId)
    );
    if (matches.length > 1) throw new WorkSnapshotUnavailableError();
    return matches.length === 0 ? null : this.#projectVisible(matches[0]!);
  }

  #projectVisible(item: SystemWorkTask): ActorVisibleSystemWorkTask | null {
    const actor = this.#options.actors.resolveActor();
    const decision = this.#options.authorization.decideTask(actor, {
      candidateGroupId: item.task.metadata?.assignment.candidates[0].id ?? null,
      claimActorId: item.claim.claim?.actorId ?? null,
    });
    if (!isTaskVisible(decision)) return null;
    return {
      ...item,
      publicTask: {
        task: item.task,
        hostingInstance: item.registration.instance,
        claimGeneration: item.claim.claimGeneration,
        claim: item.claim.claim,
        claimableByCurrentActor: isTaskClaimable(decision),
      },
    };
  }
}

function sameTaskId(left: PublicWorkTaskId, right: PublicWorkTaskId): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation;
}

function compareWorkTasks(left: PublicWorkTask, right: PublicWorkTask): number {
  return compareStrings(left.hostingInstance.processInstanceId, right.hostingInstance.processInstanceId) ||
    compareStrings(left.task.id.processInstanceId, right.task.id.processInstanceId) ||
    compareStrings(left.task.id.elementId, right.task.id.elementId) ||
    left.task.id.activation - right.task.id.activation;
}

function compareStrings(left: string, right: string): number {
  const leftScalars = [...left];
  const rightScalars = [...right];
  const length = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < length; index += 1) {
    const difference = Number(leftScalars[index]?.codePointAt(0)) -
      Number(rightScalars[index]?.codePointAt(0));
    if (difference !== 0) return difference;
  }
  return leftScalars.length - rightScalars.length;
}

function requirePositive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}
