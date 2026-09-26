import type { PublicStructuredTaskFormV1 } from "@bpmn-lean/platform-contracts";

export function structuredFormStateKey(form: PublicStructuredTaskFormV1): string {
  return JSON.stringify([
    form.catalogIdentity.processId,
    form.catalogIdentity.version,
    form.catalogIdentity.sourceSha256,
    form.catalogIdentity.semanticProfile,
    form.taskDefinition.elementId,
  ]);
}
