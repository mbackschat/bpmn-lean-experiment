import type {
  ProjectionRead,
  PublicWorkTask,
  WorkTaskSnapshot,
} from "@bpmn-lean/platform-contracts";
import type {
  ActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

import type { PostgresqlWorkSnapshotReader } from "./postgresql-work-snapshot-reader.js";
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
}
