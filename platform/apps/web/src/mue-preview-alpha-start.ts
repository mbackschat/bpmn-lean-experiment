import { VariableValueKind } from "@bpmn-lean/platform-contracts";
import type {
  DefinitionVersionStartCommand,
  DeployedDefinitionVersion,
} from "@bpmn-lean/platform-contracts";

const alphaProcessId = "Process_SequentialMultiInstanceReview";
const alphaSemanticProfile = "bpmn-2.0.2";
const alphaSourceSha256 = "982f77f7fcca2d01bd2357c11057c5fdb6aaf3b383ac351a93aa32ab1bbca3ff";

/** The definition facts that single out the registered Alpha model. */
export type MuePreviewAlphaIdentity = Readonly<{
  processId: string;
  semanticProfile: string;
  source: Readonly<{ sha256: string }>;
}>;

export type MuePreviewAlphaStart = Readonly<{
  label: string;
  command: DefinitionVersionStartCommand;
}>;

/** Supplies preview data only to the exact registered Alpha model and profile. */
export function resolveMuePreviewAlphaStart(
  definition: DeployedDefinitionVersion,
): MuePreviewAlphaStart | null {
  if (!isMuePreviewAlphaDefinition(definition)) return null;
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

/**
 * The one predicate every Alpha-only surface uses: the exact registered model under its profile. The profile alone does
 * not decide, because the standards profile admits every portable model.
 */
export function isMuePreviewAlphaDefinition(definition: MuePreviewAlphaIdentity): boolean {
  return definition.processId === alphaProcessId &&
    definition.semanticProfile === alphaSemanticProfile &&
    definition.source.sha256 === alphaSourceSha256;
}
