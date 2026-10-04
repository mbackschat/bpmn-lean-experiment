import { createHash } from "node:crypto";
import { compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

export const profile = "cibseven-2.2.0-serial-business-tasks-draft";
export const protocol = "urn:bpmn-lean:effect-protocol:activity-v1";
export const source = new URL(
  "../../../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/business-effect-data.bpmn",
  import.meta.url,
);

export function sourceOverlay(handler = "invoiceValidator") {
  const id = "invoice-handlers";
  const bytes = new TextEncoder().encode(JSON.stringify({
    kind: "bpmnSourceOverlay", id, semanticProfile: profile,
    effectBindings: [{
      source: { implementation: protocol, delegateExpression: `\${${handler}}` },
      descriptor: { protocol, operation: handler },
    }],
    inertAttributes: [],
  }));
  return { id, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function compile(xml: string, handler = "invoiceValidator") {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "reviewed-invoice",
    expectedSha256: undefined, semanticProfile: profile,
    sourceOverlay: sourceOverlay(handler),
    limits: semanticProcessTestLimits,
  });
}
