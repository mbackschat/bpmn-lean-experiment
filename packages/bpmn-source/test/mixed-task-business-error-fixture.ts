import { compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { sourceOverlay } from "./mixed-task-control-flow-fixture.ts";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

export const profile = "cibseven-2.2.0-mixed-task-business-error-draft";
export const source = new URL("./fixtures/mixed-task-invoice-business-error.bpmn", import.meta.url);

export function compile(xml: string) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "invoice-business-error",
    expectedSha256: undefined, semanticProfile: profile, limits: semanticProcessTestLimits,
    sourceOverlay: sourceOverlay(["invoiceValidator", "policyChecker"], profile) });
}
