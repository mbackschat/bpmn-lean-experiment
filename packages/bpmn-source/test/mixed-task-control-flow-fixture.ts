import { compareCanonicalStrings } from "@bpmn-lean/semantic-core";
import { createHash } from "node:crypto";
import { compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

export const profile = "cibseven-2.2.0-mixed-task-control-flow-draft";
export const protocol = "urn:bpmn-lean:effect-protocol:activity-v1";
export const source = new URL(
  "./fixtures/mixed-task-invoice-rework.bpmn",
  import.meta.url,
);

export function invoiceWithBurst(xml: string, length: 8 | 9,
  continuation: Readonly<{ id: string; source: string; target: string }> = { id: "Check", source: "Review", target: "Validate" }): string {
  const depths = length === 8 ? [2, 1, 1] : [2, 2, 1];
  const nodes: string[] = [];
  const flows: string[] = [];
  for (const [group, depth] of depths.entries()) {
    const merge = `Burst${group}Merge`;
    nodes.push(`<exclusiveGateway id="${merge}" gatewayDirection="Converging"/>`);
    for (let index = 0; index < depth; index += 1) {
      const choice = `Burst${group}Choice${index}`;
      nodes.push(`<exclusiveGateway id="${choice}" gatewayDirection="Diverging" default="${choice}Default"/>`);
      flows.push(`<sequenceFlow id="${choice}True" sourceRef="${choice}" targetRef="${index + 1 < depth ? `Burst${group}Choice${index + 1}` : merge}"><conditionExpression xsi:type="bpmn:tFormalExpression">true</conditionExpression></sequenceFlow>`);
      flows.push(`<sequenceFlow id="${choice}Default" sourceRef="${choice}" targetRef="${merge}"/>`);
    }
    flows.push(`<sequenceFlow id="${merge}Continue" sourceRef="${merge}" targetRef="${group + 1 < depths.length ? `Burst${group + 1}Choice0` : continuation.target}"/>`);
  }
  return xml.replace(`<sequenceFlow id="${continuation.id}" sourceRef="${continuation.source}" targetRef="${continuation.target}"/>`,
    `${nodes.join("")}<sequenceFlow id="${continuation.id}" sourceRef="${continuation.source}" targetRef="Burst0Choice0"/>${flows.join("")}`);
}

export function sourceOverlay(handlers: readonly string[] = ["invoiceValidator"], semanticProfile: string = profile) {
  const id = "invoice-handlers";
  const bytes = new TextEncoder().encode(JSON.stringify({
    kind: "bpmnSourceOverlay", id, semanticProfile,
    effectBindings: handlers.toSorted(compareCanonicalStrings).map(handler => ({
      source: { implementation: protocol, delegateExpression: `\${${handler}}` },
      descriptor: { protocol, operation: handler },
    })),
    inertAttributes: [],
  }));
  return { id, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function compile(xml: string, handlers: readonly string[] = ["invoiceValidator"]) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "reviewed-invoice",
    expectedSha256: undefined, semanticProfile: profile,
    sourceOverlay: sourceOverlay(handlers),
    limits: semanticProcessTestLimits,
  });
}
