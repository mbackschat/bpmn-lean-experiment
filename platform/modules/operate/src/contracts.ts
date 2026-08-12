import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

/** Private keyset row kept inside the Operate module. */
export type StoredProcessInstance = Readonly<{
  ordinal: number;
  instance: PublicProcessInstanceIdentity;
}>;

/** Exact filters plus one private insertion boundary for repository access. */
export type ProcessInstanceRepositoryQuery = Readonly<{
  processInstanceId?: string;
  processId?: string;
  version?: number;
  sourceSha256?: string;
  beforeOrdinal?: number;
  limit: number;
}>;

/** Append-only persistence port for confirmed public Process-instance facts. */
export interface ProcessInstanceRepository {
  /** Returns the original positive ordinal when the exact identity already exists. */
  record(instance: PublicProcessInstanceIdentity): number;
  /** Returns at most `limit` decoded rows newest-first below the optional ordinal. */
  search(
    query: ProcessInstanceRepositoryQuery,
  ): ReadonlyArray<StoredProcessInstance>;
}

/** Same semantic Process-instance identity was presented with different public bytes. */
export class ProcessInstanceIdentityIntegrityError extends Error {
  constructor(processInstanceId: string) {
    super(
      `Process instance ${processInstanceId} already has a different exact public identity`,
    );
    this.name = "ProcessInstanceIdentityIntegrityError";
  }
}

/** Durable index bytes or redundant filter columns do not decode to one exact fact. */
export class ProcessInstanceStoredValueError extends Error {
  constructor(cause?: unknown) {
    super("stored Process-instance identity is invalid or inconsistent", { cause });
    this.name = "ProcessInstanceStoredValueError";
  }
}
