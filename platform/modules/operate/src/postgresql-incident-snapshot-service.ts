import type {
  ProjectionRead,
  PublicIncidentSnapshot,
} from "@bpmn-lean/platform-contracts";

import type {
  PostgresqlIncidentSnapshotReader,
} from "./postgresql-incident-snapshot-reader.js";

/** Exposes one complete PostgreSQL-backed incident projection read. */
export class PostgresqlIncidentSnapshotService {
  constructor(
    private readonly reader: Pick<PostgresqlIncidentSnapshotReader, "read">,
  ) {}

  async currentSnapshot(): Promise<ProjectionRead<PublicIncidentSnapshot>> {
    const read = await this.reader.read();
    return {
      value: structuredClone(read.value),
      freshness: read.freshness === null ? null : { ...read.freshness },
    };
  }
}
