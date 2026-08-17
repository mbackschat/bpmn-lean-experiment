import type {
  IncidentMutationAggregation,
} from "./incident-mutation-service.js";
import type {
  IncidentSnapshot,
  OperateProcessRegistration,
} from "./incident-contracts.js";
import type {
  PostgresqlIncidentSnapshotReader,
} from "./postgresql-incident-snapshot-reader.js";
import type {
  PostgresqlProcessInstanceRepository,
} from "./postgresql-process-instance-repository.js";

export type PostgresqlIncidentMutationAggregationOptions = Readonly<{
  reader: Pick<PostgresqlIncidentSnapshotReader, "read">;
  repository: Pick<PostgresqlProcessInstanceRepository, "getRegistration">;
}>;

/** Supplies projected current incidents and one exact registration to mutation preparation. */
export class PostgresqlIncidentMutationAggregation
  implements IncidentMutationAggregation
{
  constructor(
    private readonly options: PostgresqlIncidentMutationAggregationOptions,
  ) {}

  async currentSnapshot(): Promise<IncidentSnapshot> {
    const read = await this.options.reader.read();
    return structuredClone(read.value);
  }

  async registration(
    processInstanceId: string,
  ): Promise<OperateProcessRegistration | null> {
    const registration = await this.options.repository.getRegistration(
      processInstanceId,
    );
    return registration === null ? null : structuredClone(registration);
  }
}
