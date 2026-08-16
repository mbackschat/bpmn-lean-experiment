import type {
  DeployedDefinitionVersion,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import type {
  ConfirmedProcessOperationsPublication,
  OperateProcessObservation,
  OperateProcessRegistration,
} from "./incident-contracts.js";

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
  /** Returns the original positive ordinal when the exact publication already exists. */
  recordConfirmed(publication: ConfirmedProcessOperationsPublication): Promise<number>;
  /** Returns at most `limit` decoded rows newest-first below the optional ordinal. */
  search(
    query: ProcessInstanceRepositoryQuery,
  ): Promise<ReadonlyArray<StoredProcessInstance>>;
  getRegistration(processInstanceId: string): Promise<OperateProcessRegistration | null>;
  listNonclosed(limit: number): Promise<ReadonlyArray<OperateProcessRegistration>>;
  /** Takes one ordinal-ordered, at-most-101 exact-version population cut. */
  listExactDefinitionVersion(
    definition: DeployedDefinitionVersion,
  ): Promise<ReadonlyArray<OperateProcessRegistration>>;
  recordObservation(
    processInstanceId: string,
    observation: OperateProcessObservation,
  ): Promise<void>;
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
