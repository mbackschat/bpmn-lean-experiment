import type {
  PublicFormValue,
  PublicTaskDetail,
  WorkCompletionRequest,
  WorkCompletionResult,
} from "@bpmn-lean/platform-contracts";

export const WorkCompletionViewKind = {
  Idle: "idle",
  Submitting: "submitting",
  TransportFailed: "transportFailed",
  Indeterminate: "indeterminate",
  NotAccepted: "notAccepted",
  Rejected: "rejected",
} as const;

export type WorkCompletionView =
  | Readonly<{ kind: typeof WorkCompletionViewKind.Idle }>
  | Readonly<{ kind: typeof WorkCompletionViewKind.Submitting }>
  | Readonly<{ kind: typeof WorkCompletionViewKind.TransportFailed }>
  | Readonly<{ kind: typeof WorkCompletionViewKind.Indeterminate }>
  | Readonly<{
      kind: typeof WorkCompletionViewKind.NotAccepted;
      message: string;
    }>
  | Readonly<{
      kind: typeof WorkCompletionViewKind.Rejected;
      result: Extract<WorkCompletionResult, { state: "rejected" }>;
    }>;

export type RetainedCompletionOperation = Readonly<{
  actionId: string;
  request: WorkCompletionRequest;
}>;

export type WorkCompletionResolution = Readonly<{
  operation: RetainedCompletionOperation | null;
  closeDetail: boolean;
  view: WorkCompletionView;
}>;

type CompletionApi = Readonly<{
  complete: (
    actionId: string,
    request: WorkCompletionRequest,
  ) => Promise<WorkCompletionResult>;
}>;

/** Mints and freezes one exact completion operation before its first submission. */
export function createRetainedCompletionOperation(
  detail: PublicTaskDetail,
  value: Extract<PublicFormValue, { kind: "string" | "boolean" }>,
  createActionId: () => string,
): RetainedCompletionOperation {
  const claim = detail.workTask.claim;
  if (claim === null) {
    throw new Error("The current actor must claim the task before completion.");
  }
  const field = detail.form?.fields[0];
  if (field === undefined) throw new Error("The task has no completable field.");
  if (field.type !== value.kind) {
    throw new Error("The completion value does not match the published field type.");
  }
  const actionId = createActionId();
  if (typeof actionId !== "string" || actionId.length === 0) {
    throw new Error("Completion action identity must not be empty.");
  }
  const taskId = Object.freeze({
    processInstanceId: detail.workTask.task.id.processInstanceId,
    elementId: detail.workTask.task.id.elementId,
    activation: detail.workTask.task.id.activation,
  });
  const submittedValue = value.kind === "string"
    ? Object.freeze({ kind: value.kind, value: value.value })
    : Object.freeze({ kind: value.kind, value: value.value });
  const submittedValues = Object.freeze([Object.freeze({
    key: field.key,
    value: submittedValue,
  })]) as WorkCompletionRequest["submittedValues"];
  const request = Object.freeze({
    taskId,
    expectedClaimGeneration: claim.generation,
    submittedValues,
  });
  return Object.freeze({ actionId, request });
}

/** Reuses the already-minted identity and immutable request for every retry. */
export function submitRetainedCompletionOperation(
  api: CompletionApi,
  operation: RetainedCompletionOperation,
): Promise<WorkCompletionResult> {
  return api.complete(operation.actionId, operation.request);
}

/** Resolves only terminal results; indeterminate keeps the exact operation retryable. */
export function resolveCompletionResult(
  operation: RetainedCompletionOperation,
  result: WorkCompletionResult,
): WorkCompletionResolution {
  switch (result.state) {
    case "committed":
      return {
        operation: null,
        closeDetail: true,
        view: { kind: WorkCompletionViewKind.Idle },
      };
    case "rejected":
      return {
        operation: null,
        closeDetail: false,
        view: { kind: WorkCompletionViewKind.Rejected, result },
      };
    case "indeterminate":
      return {
        operation,
        closeDetail: false,
        view: { kind: WorkCompletionViewKind.Indeterminate },
      };
  }
}
