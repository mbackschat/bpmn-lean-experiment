import { VariableValueKind } from "@bpmn-lean/platform-contracts";
import type {
  DefinitionVersionStartCommand,
  DeployedDefinitionVersion,
} from "@bpmn-lean/platform-contracts";

const alphaProcessId = "Process_SequentialMultiInstanceReview";
export const muePreviewAlphaSemanticProfile =
  "bpmn-2.0.2-sequential-multi-instance-user-task-draft";
const alphaSourceSha256 = "982f77f7fcca2d01bd2357c11057c5fdb6aaf3b383ac351a93aa32ab1bbca3ff";

export type MuePreviewAlphaStart = Readonly<{
  label: string;
  command: DefinitionVersionStartCommand;
}>;

/** Supplies preview data only to the exact registered Alpha model and profile. */
export function resolveMuePreviewAlphaStart(
  definition: DeployedDefinitionVersion,
): MuePreviewAlphaStart | null {
  if (
    definition.processId !== alphaProcessId ||
    !isMuePreviewAlphaProfile(definition.semanticProfile) ||
    definition.source.sha256 !== alphaSourceSha256
  ) {
    return null;
  }
  return {
    label: "MUE Preview Alpha input: contract, invoice, receipt",
    command: {
      initialVariables: [{
        name: "DataObjectReference_InputItems",
        value: {
          kind: VariableValueKind.StringList,
          value: ["contract", "invoice", "receipt"],
        },
      }],
    },
  };
}

export function isMuePreviewAlphaProfile(semanticProfile: string): boolean {
  return semanticProfile === muePreviewAlphaSemanticProfile;
}
