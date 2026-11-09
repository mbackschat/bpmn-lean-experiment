import type {
  CommittedTransitionBatch,
  CurrentCommittedExecution,
  ExecutionPublicationExport,
  ExecutionPublicationPage,
  ExecutionPublicationRequest,
  PublicationDefinitionIdentity,
  PublicationIdentity,
} from "@bpmn-lean/platform-contracts";

import type { OperateProcessRegistration } from "./incident-contracts.js";

export enum ExecutionPublicationProjectionStatus {
  Healthy = "healthy",
  Gap = "gap",
  Unavailable = "unavailable",
}

export type ExecutionPublicationProjectionImage = Readonly<{
  identity: PublicationIdentity;
  status: ExecutionPublicationProjectionStatus;
  headRevision: number;
  producerHeadRevision: number | null;
  batches: readonly CommittedTransitionBatch[];
  current: CurrentCommittedExecution | null;
}>;

export interface ExecutionPublicationRepository {
  get(processInstanceId: string): Promise<ExecutionPublicationProjectionImage | null>;
  applyPage(
    registration: OperateProcessRegistration,
    page: ExecutionPublicationPage,
  ): Promise<ExecutionPublicationProjectionImage>;
  replaceFromPages(
    registration: OperateProcessRegistration,
    pages: readonly ExecutionPublicationPage[],
  ): Promise<ExecutionPublicationProjectionImage>;
  mark(
    registration: OperateProcessRegistration,
    status:
      | ExecutionPublicationProjectionStatus.Gap
      | ExecutionPublicationProjectionStatus.Unavailable,
  ): Promise<void>;
  page(
    processInstanceId: string,
    request: ExecutionPublicationRequest,
  ): Promise<ExecutionPublicationPage | null>;
  export(processInstanceId: string): Promise<ExecutionPublicationExport | null>;
}

/** The engine's publication read for one process instance, as the gateway's `processExecution` port offers it. */
export type PublicationObservationRequest = Readonly<{
  locator: string;
  definition: PublicationDefinitionIdentity;
  processInstanceId: string;
  afterRevision: number;
  limit?: number;
}>;

export interface ExecutionPublicationGateway {
  observe(request: PublicationObservationRequest): Promise<unknown>;
}

export class ExecutionPublicationIntegrityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ExecutionPublicationIntegrityError";
  }
}

export class ExecutionPublicationStoredValueError extends Error {
  constructor(cause: unknown) {
    super("stored execution publication is invalid or inconsistent", { cause });
    this.name = "ExecutionPublicationStoredValueError";
  }
}
