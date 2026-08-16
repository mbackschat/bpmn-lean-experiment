import type { DeepReadonly } from "@bpmn-lean/contract-types";

import type { HumanTaskDefinitionV1 } from "./human-task-catalog.js";
import type {
  PublicFormField,
  PublicFormValue,
} from "./work-tasks.js";

export const structuredTaskFormSchemaVersion =
  "bpmn-lean-structured-task-form/v1" as const;

export type HumanTaskCatalogBindingIdentityV1 = DeepReadonly<{
  processId: string;
  version: number;
  sourceSha256: string;
  semanticProfile: string;
}>;

export type PublicStructuredFormFieldValueV1 = DeepReadonly<{
  key: string;
  currentValue: PublicFormValue;
  compatibility: "compatible" | "incompatible";
}>;

export type PublicStructuredTaskFormV1 = DeepReadonly<{
  schemaVersion: typeof structuredTaskFormSchemaVersion;
  catalogIdentity: HumanTaskCatalogBindingIdentityV1;
  taskDefinition: HumanTaskDefinitionV1;
  fields: PublicStructuredFormFieldValueV1[];
}>;

/** The legacy arm remains exactly `{fields:[...]}`. */
export type PublicTaskForm =
  | null
  | DeepReadonly<{ fields: [PublicFormField] }>
  | PublicStructuredTaskFormV1;

export const FormValidationIssueCode = {
  UnknownResolutionAction: "unknownResolutionAction",
  UnknownField: "unknownField",
  HiddenField: "hiddenField",
  RequiredFieldMissing: "requiredFieldMissing",
  RequiredFieldNull: "requiredFieldNull",
  CurrentValueIncompatible: "currentValueIncompatible",
  WrongValueKind: "wrongValueKind",
  ValueOutOfRange: "valueOutOfRange",
  InvalidCalendarDate: "invalidCalendarDate",
  InvalidOption: "invalidOption",
  DuplicateSelection: "duplicateSelection",
  ValueTooLarge: "valueTooLarge",
  ComputedPatchTooLarge: "computedPatchTooLarge",
} as const;

export type FormValidationIssueCode =
  typeof FormValidationIssueCode[keyof typeof FormValidationIssueCode];

export type FormValidationIssueTarget =
  | DeepReadonly<{ kind: "field"; key: string }>
  | DeepReadonly<{ kind: "resolutionAction" }>
  | DeepReadonly<{ kind: "form" }>;

export type FormValidationIssue = DeepReadonly<{
  code: FormValidationIssueCode;
  target: FormValidationIssueTarget;
}>;

export type WorkFormValidationErrorResponse = DeepReadonly<{
  error: {
    code: "formValidationFailed";
    message: string;
    issues: [FormValidationIssue, ...FormValidationIssue[]];
  };
}>;
