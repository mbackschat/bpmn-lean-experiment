import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import {
  decodePublicApiErrorResponse,
} from "./definition-decoders.js";
import { PublicApiErrorCode } from "./definitions.js";
import { FormValidationIssueCode } from "./work-form-contracts.js";
import {
  structuredWorkCompletionRequestSchemaVersion,
} from "./work-completion-contracts.js";
import { decodePublicFormValue } from "./work-task-form-decoders.js";
import {
  decodePublicWorkTaskId,
  requireMetadataIdentity,
  requireWireString,
} from "./work-task-snapshot-decoders.js";
import type {
  StructuredWorkCompletionRequestV1,
} from "./work-completion-contracts.js";
import type {
  WorkCompletionRequest,
  WorkCompletionResult,
  WorkApiErrorResponse,
} from "./work-tasks.js";

const ordinaryWorkErrorCodes = [
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
] as const;

const formValidationIssueCodes = new Set<string>(
  Object.values(FormValidationIssueCode),
);

/** Decodes the closed legacy/structured completion union without widening the M3 arm. */
export function decodeWorkCompletionRequest(value: unknown): WorkCompletionRequest {
  requireObject(value, "Work completion request");
  if (Object.hasOwn(value, "schemaVersion")) {
    return decodeStructuredWorkCompletionRequest(value);
  }
  requireExactKeys(value, "Work completion request", [
    "expectedClaimGeneration",
    "submittedValues",
    "taskId",
  ]);
  const submittedValues = readOwn(value, "submittedValues");
  if (!Array.isArray(submittedValues) || submittedValues.length !== 1) {
    throw new TypeError("Work completion request.submittedValues must contain exactly one value");
  }
  const submitted = submittedValues[0];
  requireObject(submitted, "Work completion request.submittedValues[0]");
  requireExactKeys(submitted, "Work completion request.submittedValues[0]", ["key", "value"]);
  const decodedValue = decodePublicFormValue(
    readOwn(submitted, "value"),
    "Work completion request.submittedValues[0].value",
  );
  if (decodedValue.kind !== "string" && decodedValue.kind !== "boolean") {
    throw new TypeError("Work completion request value must be a string or Boolean submission");
  }
  return {
    taskId: decodePublicWorkTaskId(readOwn(value, "taskId"), "Work completion request.taskId"),
    expectedClaimGeneration: requirePositiveSafeInteger(
      readOwn(value, "expectedClaimGeneration"),
      "Work completion request.expectedClaimGeneration",
    ),
    submittedValues: [{
      key: requireMetadataIdentity(
        readOwn(submitted, "key"),
        "Work completion request.submittedValues[0].key",
      ),
      value: decodedValue,
    }],
  };
}

export function decodeWorkCompletionResult(value: unknown): WorkCompletionResult {
  requireObject(value, "Work completion result");
  const state = readOwn(value, "state");
  switch (state) {
    case "committed":
    case "indeterminate":
      requireExactKeys(value, "Work completion result", ["actionId", "state", "taskId"]);
      return {
        state,
        actionId: requireNonemptyString(readOwn(value, "actionId"), "Work completion result.actionId"),
        taskId: decodePublicWorkTaskId(readOwn(value, "taskId"), "Work completion result.taskId"),
      };
    case "rejected":
      requireExactKeys(value, "Work completion result", [
        "actionId",
        "engineResult",
        "state",
        "taskId",
      ]);
      return {
        state,
        actionId: requireNonemptyString(readOwn(value, "actionId"), "Work completion result.actionId"),
        taskId: decodePublicWorkTaskId(readOwn(value, "taskId"), "Work completion result.taskId"),
        engineResult: decodeRejectedEngineResult(readOwn(value, "engineResult")),
      };
    default:
      throw new TypeError("Work completion result.state is not a public completion state");
  }
}

/** Decodes the Work-specific validation envelope without widening generic errors. */
export function decodeWorkApiErrorResponse(value: unknown): WorkApiErrorResponse {
  requireObject(value, "Work API error response");
  requireExactKeys(value, "Work API error response", ["error"]);
  const error = readOwn(value, "error");
  requireObject(error, "Work API error");
  if (readOwn(error, "code") !== PublicApiErrorCode.FormValidationFailed) {
    return decodePublicApiErrorResponse(value, ordinaryWorkErrorCodes);
  }
  requireExactKeys(error, "Work form validation error", ["code", "issues", "message"]);
  const issuesValue = readOwn(error, "issues");
  if (!Array.isArray(issuesValue) || issuesValue.length === 0) {
    throw new TypeError("Work form validation error.issues must be nonempty");
  }
  const issues = issuesValue.map((issueValue, index) => {
    const label = `Work form validation error.issues[${index}]`;
    requireObject(issueValue, label);
    requireExactKeys(issueValue, label, ["code", "target"]);
    const code = decodeFormValidationIssueCode(readOwn(issueValue, "code"), label);
    const target = decodeValidationTarget(readOwn(issueValue, "target"), `${label}.target`);
    requireIssueTarget(code, target, label);
    return {
      code,
      target,
    };
  });
  const [first, ...rest] = issues;
  if (first === undefined) throw new TypeError("Work form validation issues are unreachable empty");
  return {
    error: {
      code: PublicApiErrorCode.FormValidationFailed,
      message: requireNonemptyString(readOwn(error, "message"), "Work form validation error.message"),
      issues: [first, ...rest],
    },
  };
}

function decodeFormValidationIssueCode(
  value: unknown,
  label: string,
): typeof FormValidationIssueCode[keyof typeof FormValidationIssueCode] {
  if (typeof value !== "string" || !formValidationIssueCodes.has(value)) {
    throw new TypeError(`${label}.code is unsupported`);
  }
  switch (value) {
    case FormValidationIssueCode.UnknownResolutionAction:
    case FormValidationIssueCode.UnknownField:
    case FormValidationIssueCode.HiddenField:
    case FormValidationIssueCode.RequiredFieldMissing:
    case FormValidationIssueCode.RequiredFieldNull:
    case FormValidationIssueCode.CurrentValueIncompatible:
    case FormValidationIssueCode.WrongValueKind:
    case FormValidationIssueCode.ValueOutOfRange:
    case FormValidationIssueCode.InvalidCalendarDate:
    case FormValidationIssueCode.InvalidOption:
    case FormValidationIssueCode.DuplicateSelection:
    case FormValidationIssueCode.ValueTooLarge:
    case FormValidationIssueCode.ComputedPatchTooLarge:
      return value;
  }
  throw new TypeError(`${label}.code is unsupported`);
}

function decodeStructuredWorkCompletionRequest(
  value: object,
): StructuredWorkCompletionRequestV1 {
  requireExactKeys(value, "Structured Work completion request", [
    "expectedClaimGeneration",
    "fields",
    "resolutionActionId",
    "schemaVersion",
    "taskId",
  ]);
  if (readOwn(value, "schemaVersion") !== structuredWorkCompletionRequestSchemaVersion) {
    throw new TypeError("Structured Work completion request.schemaVersion is unsupported");
  }
  const fields = readOwn(value, "fields");
  requireObject(fields, "Structured Work completion request.fields");
  const detachedFields: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(fields)) {
    if (typeof key !== "string") {
      throw new TypeError("Structured Work completion request.fields keys must be strings");
    }
    requireWireString(key, "Structured Work completion request field key", false);
    detachedFields[key] = Reflect.get(fields, key);
  }
  return {
    schemaVersion: structuredWorkCompletionRequestSchemaVersion,
    taskId: decodePublicWorkTaskId(
      readOwn(value, "taskId"),
      "Structured Work completion request.taskId",
    ),
    expectedClaimGeneration: requirePositiveSafeInteger(
      readOwn(value, "expectedClaimGeneration"),
      "Structured Work completion request.expectedClaimGeneration",
    ),
    resolutionActionId: requireWireString(
      readOwn(value, "resolutionActionId"),
      "Structured Work completion request.resolutionActionId",
      false,
    ),
    fields: detachedFields,
  };
}

function decodeRejectedEngineResult(
  value: unknown,
): Extract<WorkCompletionResult, { state: "rejected" }>["engineResult"] {
  requireObject(value, "Work completion result.engineResult");
  const kind = readOwn(value, "kind");
  switch (kind) {
    case "processClosed":
      requireExactKeys(value, "Work completion result.engineResult", ["kind"]);
      return { kind };
    case "semantic": {
      requireExactKeys(value, "Work completion result.engineResult", ["kind", "outcome"]);
      const outcome = readOwn(value, "outcome");
      switch (outcome) {
        case "rolledBack":
        case "rejected":
        case "semanticFailure":
        case "unsupported":
          return { kind, outcome };
        default:
          throw new TypeError("Work completion result.engineResult.outcome is not public");
      }
    }
    default:
      throw new TypeError("Work completion result.engineResult.kind is not public");
  }
}

function decodeValidationTarget(value: unknown, label: string) {
  requireObject(value, label);
  const kind = readOwn(value, "kind");
  switch (kind) {
    case "field":
      requireExactKeys(value, label, ["key", "kind"]);
      return {
        kind,
        key: requireWireString(readOwn(value, "key"), `${label}.key`, false),
      } as const;
    case "resolutionAction":
    case "form":
      requireExactKeys(value, label, ["kind"]);
      return { kind };
    default:
      throw new TypeError(`${label}.kind is unsupported`);
  }
}

function requireIssueTarget(
  code: typeof FormValidationIssueCode[keyof typeof FormValidationIssueCode],
  target: ReturnType<typeof decodeValidationTarget>,
  label: string,
): void {
  switch (code) {
    case FormValidationIssueCode.UnknownResolutionAction:
      if (target.kind === "resolutionAction") return;
      break;
    case FormValidationIssueCode.ComputedPatchTooLarge:
      if (target.kind === "form") return;
      break;
    case FormValidationIssueCode.UnknownField:
    case FormValidationIssueCode.HiddenField:
    case FormValidationIssueCode.RequiredFieldMissing:
    case FormValidationIssueCode.RequiredFieldNull:
    case FormValidationIssueCode.CurrentValueIncompatible:
    case FormValidationIssueCode.WrongValueKind:
    case FormValidationIssueCode.ValueOutOfRange:
    case FormValidationIssueCode.InvalidCalendarDate:
    case FormValidationIssueCode.InvalidOption:
    case FormValidationIssueCode.DuplicateSelection:
    case FormValidationIssueCode.ValueTooLarge:
      if (target.kind === "field") return;
      break;
  }
  throw new TypeError(`${label}.target does not match its issue code`);
}
