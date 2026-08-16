import type { DeepReadonly } from "@bpmn-lean/contract-types";

import type {
  PublicFormValue,
  PublicWorkTaskId,
} from "./work-tasks.js";

export const structuredWorkCompletionRequestSchemaVersion =
  "bpmn-lean-structured-work-completion/v1" as const;

export const StructuredWorkCompletionRequestBodyByteLimit = 32_768;

/** The exact untagged M3 completion request arm. */
export type LegacyWorkCompletionRequest = DeepReadonly<{
  taskId: PublicWorkTaskId;
  expectedClaimGeneration: number;
  submittedValues: [{
    key: string;
    value: Extract<PublicFormValue, { kind: "string" | "boolean" }>;
  }];
}>;

/** Product 2-only raw form submission. Product 1 receives only its computed patch. */
export type StructuredWorkCompletionRequestV1 = DeepReadonly<{
  schemaVersion: typeof structuredWorkCompletionRequestSchemaVersion;
  taskId: PublicWorkTaskId;
  expectedClaimGeneration: number;
  resolutionActionId: string;
  fields: Record<string, unknown>;
}>;
