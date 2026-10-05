import { createHash } from "node:crypto";
import { SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID } from "@bpmn-lean/semantic-core";

export const profile = SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID;
export const source = new URL("../../../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/sequential-mi-business-subprocess-probe.bpmn", import.meta.url);
export const prepareSource = (xml: string): string => xml.replace('camunda:delegateExpression=', 'camunda:asyncBefore="true" camunda:delegateExpression=');
export const overlayDocument = {
  kind: "bpmnSourceOverlay", id: "private-invoice-bindings", semanticProfile: profile, inertAttributes: [],
  effectBindings: [{ source: { implementation: null, delegateExpression: "${invoiceValidator}" },
    descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "invoiceValidator" } }],
} as const;
export function sourceOverlay() {
  const bytes = new TextEncoder().encode(JSON.stringify(overlayDocument));
  return { id: overlayDocument.id, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export function parallelBodySource(xml: string, branches: number, separateEnds: boolean): string {
  const nodes = ['<parallelGateway id="Review" />'];
  if (!separateEnds) nodes.push('<parallelGateway id="Joined" />');
  for (let index = 0; index < branches - (separateEnds ? 1 : 0); index++) {
    nodes.push(`<userTask id="Branch${index}" />`,
      `<sequenceFlow id="Fork${index}" sourceRef="Review" targetRef="Branch${index}" />`,
      `<sequenceFlow id="Done${index}" sourceRef="Branch${index}" targetRef="${separateEnds ? `End${index}` : "Joined"}" />`);
    if (separateEnds) nodes.push(`<endEvent id="End${index}" />`);
  }
  const result = xml.replace('<userTask id="Review" name="Review invoice" />', nodes.join("\n"));
  return separateEnds ? result : result.replace('id="Reviewed" sourceRef="Review"', 'id="Reviewed" sourceRef="Joined"');
}
