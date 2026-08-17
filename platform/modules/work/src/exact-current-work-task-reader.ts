import type {
  HumanTaskCatalogBindingIdentityV1,
  PublicWorkTask,
  PublicWorkTaskId,
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
  readBoundHumanTaskDefinitionByIdentity,
} from "./human-task-catalog-reader.js";
import type {
  ActorVisibleSystemWorkTask,
  ExactCurrentActorVisibleWorkTask,
  SystemWorkTask,
  WorkTaskAccess,
  WorkTaskCandidateReader,
  WorkExactTaskDetailReader,
} from "./work-service.js";
import { WorkSnapshotUnavailableError } from "./work-service.js";
import { projectVisibleSystemWorkTask } from "./work-task-projection.js";

export type ExactCurrentWorkTaskGateway = Readonly<{
  readWorkDetail(request: Readonly<{
    locator: string;
    hostingProcessInstanceId: string;
    taskId: PublicWorkTaskId;
    inputVariableNames: readonly string[];
  }>): Promise<
    | Readonly<{
        status: "found";
        detail: Readonly<{
          task: PublicWorkTask["task"];
          inputVariables: readonly unknown[];
        }>;
      }>
    | Readonly<{ status: "notFound" | "closed" | "unknown" | "unavailable" }>
  >;
}>;

export type ExactCurrentWorkTaskReaderOptions = Readonly<{
  candidates: WorkTaskCandidateReader;
  gateway: ExactCurrentWorkTaskGateway;
  actors: ActorResolver;
  authorization: TaskAuthorizationPolicy;
  catalogs: HumanTaskCatalogReader;
}>;

/** Rechecks one projected occurrence against Product 1 before actor policy or mutation. */
export class ExactCurrentWorkTaskReader
  implements WorkTaskAccess, WorkExactTaskDetailReader {
  constructor(private readonly options: ExactCurrentWorkTaskReaderOptions) {}

  async findVisibleTask(
    taskId: PublicWorkTaskId,
  ): Promise<ActorVisibleSystemWorkTask | null> {
    const exact = await this.#read(taskId, false);
    return exact === null ? null : withoutInputVariables(exact);
  }

  async findVisibleTaskDetail(
    taskId: PublicWorkTaskId,
  ): Promise<ExactCurrentActorVisibleWorkTask | null> {
    return this.#read(taskId, true);
  }

  async readStructuredTask(
    identity: HumanTaskCatalogBindingIdentityV1,
    elementId: string,
  ): Promise<BoundHumanTaskDefinitionV1 | null> {
    return readBoundHumanTaskDefinitionByIdentity(
      this.options.catalogs,
      structuredClone(identity),
      elementId,
    );
  }

  async #read(
    taskId: PublicWorkTaskId,
    includeInputVariables: boolean,
  ): Promise<ExactCurrentActorVisibleWorkTask | null> {
    const candidate = await this.options.candidates.findTaskCandidate(
      structuredClone(taskId),
    );
    if (candidate === null) return null;
    const inputVariableNames = includeInputVariables
      ? inputVariableNamesFor(candidate)
      : [];
    const result = await this.options.gateway.readWorkDetail({
      locator: candidate.registration.locator,
      hostingProcessInstanceId: candidate.registration.instance.processInstanceId,
      taskId: structuredClone(candidate.task.id),
      inputVariableNames,
    });
    switch (result.status) {
      case "notFound":
      case "closed":
        return null;
      case "unknown":
      case "unavailable":
        throw new WorkSnapshotUnavailableError();
      case "found": {
        if (!sameTask(result.detail.task, candidate.task) ||
            (!includeInputVariables && result.detail.inputVariables.length !== 0)) {
          throw new WorkSnapshotUnavailableError();
        }
        const visible = projectVisibleSystemWorkTask(
          candidate,
          this.options.actors,
          this.options.authorization,
        );
        return visible === null
          ? null
          : {
              ...visible,
              inputVariables: structuredClone(result.detail.inputVariables),
            };
      }
    }
  }
}

function inputVariableNamesFor(candidate: SystemWorkTask): readonly string[] {
  if (candidate.structuredTask !== null) {
    return candidate.structuredTask.taskDefinition.form.fields
      .map(({ key }) => key)
      .toSorted(compareStrings);
  }
  const metadata = candidate.task.metadata;
  return metadata !== undefined && "form" in metadata
    ? [metadata.form.fields[0].key]
    : [];
}

function withoutInputVariables(
  exact: ExactCurrentActorVisibleWorkTask,
): ActorVisibleSystemWorkTask {
  const { inputVariables: _inputVariables, ...visible } = exact;
  return visible;
}

function sameTask(
  left: PublicWorkTask["task"],
  right: PublicWorkTask["task"],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareStrings(left: string, right: string): number {
  const leftScalars = [...left];
  const rightScalars = [...right];
  for (let index = 0; index < Math.min(leftScalars.length, rightScalars.length); index += 1) {
    const difference = Number(leftScalars[index]?.codePointAt(0)) -
      Number(rightScalars[index]?.codePointAt(0));
    if (difference !== 0) return difference;
  }
  return leftScalars.length - rightScalars.length;
}
