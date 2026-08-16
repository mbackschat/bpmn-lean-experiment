import type {
  FormValidationIssue,
  LegacyWorkCompletionRequest,
  PublicFormValue,
  PublicTaskDetail,
  StructuredWorkCompletionRequestV1,
  WorkCompletionRequest,
  WorkCompletionResult,
} from "@bpmn-lean/platform-contracts";
import { structuredWorkCompletionRequestSchemaVersion } from "@bpmn-lean/platform-contracts";

export const WorkCompletionViewKind = {
  Idle: "idle",
  Submitting: "submitting",
  TransportFailed: "transportFailed",
  Indeterminate: "indeterminate",
  NotAccepted: "notAccepted",
  ValidationFailed: "validationFailed",
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
      kind: typeof WorkCompletionViewKind.ValidationFailed;
      issues: readonly FormValidationIssue[];
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

export type StructuredCompletionSubmission = Pick<
  StructuredWorkCompletionRequestV1,
  "resolutionActionId" | "fields"
>;

export type WorkCompletionSubmission =
  | Extract<PublicFormValue, { kind: "string" | "boolean" }>
  | StructuredCompletionSubmission;

/** Mints and freezes one exact completion operation before its first submission. */
export function createRetainedCompletionOperation(
  detail: PublicTaskDetail,
  submission: WorkCompletionSubmission,
  createActionId: () => string,
): RetainedCompletionOperation {
  const claim = detail.workTask.claim;
  if (claim === null) {
    throw new Error("The current actor must claim the task before completion.");
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
  const request = createCompletionRequest(detail, submission, taskId, claim.generation);
  return Object.freeze({ actionId, request });
}

function createCompletionRequest(
  detail: PublicTaskDetail,
  submission: WorkCompletionSubmission,
  taskId: StructuredWorkCompletionRequestV1["taskId"],
  expectedClaimGeneration: number,
): WorkCompletionRequest {
  const form = detail.form;
  if (isStructuredSubmission(submission)) {
    if (form === null || !("schemaVersion" in form)) {
      throw new Error("A structured completion requires a structured task form.");
    }
    return Object.freeze({
      schemaVersion: structuredWorkCompletionRequestSchemaVersion,
      taskId,
      expectedClaimGeneration,
      resolutionActionId: submission.resolutionActionId,
      fields: Object.freeze(structuredClone(submission.fields)),
    });
  }
  if (form === null || "schemaVersion" in form) {
    throw new Error("A legacy completion requires the legacy task form.");
  }
  const field = form.fields[0];
  if (field.type !== submission.kind) {
    throw new Error("The completion value does not match the published field type.");
  }
  const submittedValue = Object.freeze({ kind: submission.kind, value: submission.value });
  const submittedValues = Object.freeze([Object.freeze({
    key: field.key,
    value: submittedValue,
  })]) as LegacyWorkCompletionRequest["submittedValues"];
  return Object.freeze({ taskId, expectedClaimGeneration, submittedValues });
}

function isStructuredSubmission(
  submission: WorkCompletionSubmission,
): submission is StructuredCompletionSubmission {
  return "resolutionActionId" in submission;
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
