import type {
  ProjectionRead,
  PublicWorkTask,
  PublicWorkTaskId,
  WorkTaskSnapshot,
} from "@bpmn-lean/platform-contracts";
import type {
  ActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

import type { PostgresqlWorkSnapshotReader } from "./postgresql-work-snapshot-reader.js";
import type { SystemWorkTask } from "./work-service.js";
import { WorkSnapshotUnavailableError } from "./work-service.js";
import {
  projectVisibleSystemWorkTask,
  sortPublicWorkTasks,
} from "./work-task-projection.js";

export type PostgresqlWorkSnapshotServiceOptions = Readonly<{
  reader: Pick<PostgresqlWorkSnapshotReader, "read">;
  actors: ActorResolver;
  authorization: TaskAuthorizationPolicy;
}>;

/** Applies existing actor visibility and claimability to one complete shared image. */
export class PostgresqlWorkSnapshotService {
  readonly #options: PostgresqlWorkSnapshotServiceOptions;

  constructor(options: PostgresqlWorkSnapshotServiceOptions) {
    this.#options = options;
  }

  async listTasks(): Promise<ProjectionRead<WorkTaskSnapshot>> {
    const read = await this.#options.reader.read();
    const visible: PublicWorkTask[] = [];
    for (const item of read.value) {
      const projected = projectVisibleSystemWorkTask(
        item,
        this.#options.actors,
        this.#options.authorization,
      );
      if (projected !== null) visible.push(projected.publicTask);
    }
    sortPublicWorkTasks(visible);
    return {
      value: { tasks: visible },
      freshness: read.freshness === null ? null : { ...read.freshness },
    };
  }

  async findTaskCandidate(
    taskId: PublicWorkTaskId,
  ): Promise<SystemWorkTask | null> {
    const matches = (await this.#options.reader.read()).value.filter(({ task }) =>
      sameTaskId(task.id, taskId)
    );
    if (matches.length > 1) throw new WorkSnapshotUnavailableError();
    return matches.length === 0 ? null : structuredClone(matches[0]!);
  }
}

function sameTaskId(left: PublicWorkTaskId, right: PublicWorkTaskId): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation;
}
