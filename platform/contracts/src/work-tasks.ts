import type { DeepReadonly } from "@bpmn-lean/contract-types";

import { PublicApiErrorCode } from "./definitions.js";
import type {
  PublicApiErrorCode as LegacyPublicApiErrorCode,
  PublicApiErrorResponse,
} from "./definitions.js";
import type { PublicProcessInstanceIdentity } from "./process-instances.js";

/** Exact semantic identity of one engine-published User Task occurrence. */
export type PublicWorkTaskId = DeepReadonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;

export type PublicWorkTaskMetadata = DeepReadonly<{
  assignment: {
    candidates: [{ kind: "group"; id: string }];
  };
  form: {
    fields: [{ key: string; type: "string" | "boolean" }];
  };
}>;

/** One current actor-visible task with its distinct semantic and hosting identities. */
export type PublicWorkTask = DeepReadonly<{
  task: {
    id: PublicWorkTaskId;
    name: string | null;
    state: "active";
    metadata?: PublicWorkTaskMetadata;
  };
  hostingInstance: PublicProcessInstanceIdentity;
  claimGeneration: number;
  claim: null | { actorId: string; generation: number };
  claimableByCurrentActor: boolean;
}>;

export type WorkTaskSnapshot = DeepReadonly<{
  tasks: PublicWorkTask[];
}>;

export type PublicFormValue =
  | DeepReadonly<{ kind: "absent" }>
  | DeepReadonly<{ kind: "null" }>
  | DeepReadonly<{ kind: "string"; value: string }>
  | DeepReadonly<{ kind: "boolean"; value: boolean }>;

export type PublicFormField =
  | DeepReadonly<{
      key: string;
      type: "string";
      currentValue: Extract<PublicFormValue, { kind: "absent" | "null" | "string" }>;
      compatibility: "compatible";
    }>
  | DeepReadonly<{
      key: string;
      type: "boolean";
      currentValue: Extract<PublicFormValue, { kind: "absent" | "null" | "boolean" }>;
      compatibility: "compatible";
    }>
  | DeepReadonly<{
      key: string;
      type: "string";
      currentValue: Extract<PublicFormValue, { kind: "boolean" }>;
      compatibility: "incompatible";
    }>
  | DeepReadonly<{
      key: string;
      type: "boolean";
      currentValue: Extract<PublicFormValue, { kind: "string" }>;
      compatibility: "incompatible";
    }>;

export type PublicTaskDetail = DeepReadonly<{
  workTask: PublicWorkTask;
  form: null | { fields: [PublicFormField] };
}>;

export type WorkClaimRequest = DeepReadonly<{
  actionId: string;
  expectedGeneration: number;
}>;

export type WorkClaimResult = DeepReadonly<{
  taskId: PublicWorkTaskId;
  claim: { actorId: string; generation: number };
}>;

export type WorkReleaseRequest = DeepReadonly<{
  actionId: string;
  generation: number;
}>;

export type WorkReleaseResult = DeepReadonly<{
  taskId: PublicWorkTaskId;
  claimGeneration: number;
  released: true;
}>;

export type WorkCompletionRequest = DeepReadonly<{
  taskId: PublicWorkTaskId;
  expectedClaimGeneration: number;
  submittedValues: [{
    key: string;
    value: Extract<PublicFormValue, { kind: "string" | "boolean" }>;
  }];
}>;

export type WorkCompletionResult =
  | DeepReadonly<{
      state: "committed";
      actionId: string;
      taskId: PublicWorkTaskId;
    }>
  | DeepReadonly<{
      state: "rejected";
      actionId: string;
      taskId: PublicWorkTaskId;
      engineResult:
        | {
            kind: "semantic";
            outcome: "rolledBack" | "rejected" | "semanticFailure" | "unsupported";
          }
        | { kind: "processClosed" };
    }>
  | DeepReadonly<{
      state: "indeterminate";
      actionId: string;
      taskId: PublicWorkTaskId;
    }>;

export type WorkAuditAction =
  | DeepReadonly<{
      kind: "claim";
      actionId: string;
      outcome: "claimed" | "idempotent" | "conflict";
    }>
  | DeepReadonly<{
      kind: "release";
      actionId: string;
      outcome: "released" | "idempotent" | "conflict";
    }>
  | DeepReadonly<{
      kind: "completion";
      actionId: string;
      outcome: "reserved" | "committed" | "rejected" | "indeterminate";
    }>;

export type WorkAuditEvent = DeepReadonly<{
  eventId: string;
  actorId: string;
  recordedAt: string;
  hostingProcessInstanceId: string;
  taskId: PublicWorkTaskId;
  action: WorkAuditAction;
}>;

/** One ascending insertion-order page. A cursor resumes exclusively after its last event. */
export type WorkAuditPage = DeepReadonly<{
  events: WorkAuditEvent[];
  nextCursor: string | null;
}>;

export type WorkAuditRequest = DeepReadonly<{
  actorId?: string;
  taskProcessInstanceId?: string;
  hostingProcessInstanceId?: string;
  actionKind?: "claim" | "release" | "completion";
  cursor?: string;
  limit?: number;
}>;

export type WorkApiErrorCode =
  | LegacyPublicApiErrorCode
  | typeof PublicApiErrorCode.Forbidden
  | typeof PublicApiErrorCode.FormValueIncompatible
  | typeof PublicApiErrorCode.WorkSnapshotUnavailable;

/** Exact route-owned error set accepted by Work clients. */
export const WorkApiErrorCodes = [
  PublicApiErrorCode.InvalidRequest,
  PublicApiErrorCode.MethodNotAllowed,
  PublicApiErrorCode.UnsupportedMediaType,
  PublicApiErrorCode.PayloadTooLarge,
  PublicApiErrorCode.NotFound,
  PublicApiErrorCode.InternalFailure,
  PublicApiErrorCode.Conflict,
  PublicApiErrorCode.Forbidden,
  PublicApiErrorCode.FormValueIncompatible,
  PublicApiErrorCode.WorkSnapshotUnavailable,
] as const satisfies readonly WorkApiErrorCode[];

export type WorkApiErrorResponse = PublicApiErrorResponse<WorkApiErrorCode>;
