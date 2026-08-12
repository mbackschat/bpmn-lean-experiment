import type {
  PublicFormField,
  PublicFormValue,
  PublicTaskDetail,
  PublicWorkTask,
  WorkApiErrorResponse,
  WorkAuditPage,
  WorkAuditRequest,
  WorkClaimRequest,
  WorkCompletionRequest,
  WorkCompletionResult,
  WorkReleaseRequest,
  WorkTaskSnapshot,
} from "../src/work-tasks.js";

declare const task: PublicWorkTask;
declare const snapshot: WorkTaskSnapshot;
declare const detail: PublicTaskDetail;
declare const formValue: PublicFormValue;
declare const formField: PublicFormField;
declare const claimRequest: WorkClaimRequest;
declare const releaseRequest: WorkReleaseRequest;
declare const completionRequest: WorkCompletionRequest;
declare const completionResult: WorkCompletionResult;
declare const auditRequest: WorkAuditRequest;
declare const auditPage: WorkAuditPage;
declare const apiError: WorkApiErrorResponse;

// @ts-expect-error task occurrence identities are immutable
task.task.id.activation = 2;
// @ts-expect-error hosting definition identities are deeply immutable
task.hostingInstance.definition.source.sha256 = "0".repeat(64);
// @ts-expect-error metadata candidate tuples are immutable
task.task.metadata?.assignment.candidates.push({ kind: "group", id: "next" });
// @ts-expect-error snapshots are immutable
snapshot.tasks.push(task);
// @ts-expect-error claim requests are immutable
claimRequest.expectedGeneration = 2;
// @ts-expect-error release requests are immutable
releaseRequest.generation = 2;
// @ts-expect-error completion submissions are immutable tuples
completionRequest.submittedValues[0].key = "changed";
// @ts-expect-error audit filters are immutable
auditRequest.limit = 100;
// @ts-expect-error audit pages and nested actions are immutable
auditPage.events[0].action.actionId = "changed";
// @ts-expect-error Work errors are immutable
apiError.error.code = "internalFailure";

if (detail.form !== null) {
  // @ts-expect-error form fields are immutable tuples
  detail.form.fields[0] = formField;
}

switch (formValue.kind) {
  case "absent":
  case "null":
    break;
  case "string": {
    const stringValue: string = formValue.value;
    void stringValue;
    break;
  }
  case "boolean": {
    const booleanValue: boolean = formValue.value;
    void booleanValue;
    break;
  }
}

switch (completionResult.state) {
  case "committed":
  case "indeterminate":
    break;
  case "rejected":
    switch (completionResult.engineResult.kind) {
      case "semantic":
        void completionResult.engineResult.outcome;
        break;
      case "processClosed":
        break;
    }
    break;
}
