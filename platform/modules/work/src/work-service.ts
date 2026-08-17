import type {
  HumanTaskCatalogBindingIdentityV1,
  PublicWorkTask,
  PublicWorkTaskId,
  WorkTaskSnapshot,
} from "@bpmn-lean/platform-contracts";
import type {
  ActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

import type {
  BoundHumanTaskDefinitionV1,
  HumanTaskCatalogReader,
} from "./human-task-catalog-reader.js";
import {
  readBoundHumanTaskDefinition,
  readBoundHumanTaskDefinitionByIdentity,
} from "./human-task-catalog-reader.js";
import type {
  WorkClaimSnapshot,
  WorkProcessRegistration,
  WorkTaskReference,
} from "./work-contracts.js";
import {
  projectVisibleSystemWorkTask,
  sortPublicWorkTasks,
} from "./work-task-projection.js";

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
  structuredTask: BoundHumanTaskDefinitionV1 | null;
}>;

export type ActorVisibleSystemWorkTask = SystemWorkTask & Readonly<{
  publicTask: PublicWorkTask;
}>;

type WorkRepositoryPort = Readonly<{
  listProcessRegistrations(): Promise<ReadonlyArray<WorkProcessRegistration>>;
  recordObservation(
    processInstanceId: string,
    observation: "active" | "closed" | "indeterminate",
  ): Promise<void>;
  getClaim(task: WorkTaskReference): Promise<WorkClaimSnapshot>;
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
  catalogs: HumanTaskCatalogReader;
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
    const registrations = await this.#options.repository.listProcessRegistrations();
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
          await this.#options.repository.recordObservation(
            registration.instance.processInstanceId,
            "closed",
          );
          break;
        case "unknown":
        case "unavailable":
          await this.#options.repository.recordObservation(
            registration.instance.processInstanceId,
            "indeterminate",
          );
          throw new WorkSnapshotUnavailableError();
        case "open":
          await this.#options.repository.recordObservation(
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
              claim: await this.#options.repository.getClaim(reference),
              structuredTask: await readBoundHumanTaskDefinition(
                this.#options.catalogs,
                registration.instance,
                exactTask.id.elementId,
              ),
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
      const projected = projectVisibleSystemWorkTask(
        item,
        this.#options.actors,
        this.#options.authorization,
      );
      if (projected !== null) visible.push(projected.publicTask);
    }
    sortPublicWorkTasks(visible);
    return { tasks: visible };
  }

  async findVisibleTask(
    taskId: PublicWorkTaskId,
  ): Promise<ActorVisibleSystemWorkTask | null> {
    const matches = (await this.observeSystemTasks()).filter((item) =>
      sameTaskId(item.task.id, taskId)
    );
    if (matches.length > 1) throw new WorkSnapshotUnavailableError();
    return matches.length === 0
      ? null
      : projectVisibleSystemWorkTask(
          matches[0]!,
          this.#options.actors,
          this.#options.authorization,
        );
  }

  async readStructuredTask(
    identity: HumanTaskCatalogBindingIdentityV1,
    elementId: string,
  ): Promise<BoundHumanTaskDefinitionV1 | null> {
    return readBoundHumanTaskDefinitionByIdentity(
      this.#options.catalogs,
      identity,
      elementId,
    );
  }
}

function sameTaskId(left: PublicWorkTaskId, right: PublicWorkTaskId): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation;
}

function requirePositive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}
