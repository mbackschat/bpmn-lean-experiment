import type {
  CommittedTransitionBatch,
  CurrentCommittedExecution,
  ExecutionPublicationExport,
  ExecutionPublicationIdentity,
  ExecutionPublicationPage,
  ExecutionPublicationRequest,
} from "@bpmn-lean/platform-contracts";

import type { OperateProcessRegistration } from "./incident-contracts.js";

type PublicControlTokenPosition = CurrentCommittedExecution["controlTokens"][number];
type PublicScopePosition = CurrentCommittedExecution["scopes"][number];

export enum ExecutionPublicationProjectionStatus {
  Healthy = "healthy",
  Gap = "gap",
  Unavailable = "unavailable",
}

export type ExecutionPublicationProjectionImage = Readonly<{
  identity: ExecutionPublicationIdentity;
  status: ExecutionPublicationProjectionStatus;
  headRevision: number;
  producerHeadRevision: number | null;
  lastLogicalTimeMs: number | null;
  controlTokens: readonly PublicControlTokenPosition[];
  scopes: readonly PublicScopePosition[];
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

export interface ExecutionPublicationGateway {
  observe(request: Readonly<{
    locator: string;
    definition: ExecutionPublicationIdentity["definition"];
    processId: string;
    processInstanceId: string;
    afterRevision: number;
    limit?: number;
  }>): Promise<unknown>;
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
