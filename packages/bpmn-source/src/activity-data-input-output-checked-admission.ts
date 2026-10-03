import { CheckedNodeKind } from "@bpmn-lean/semantic-core";
import type { CheckedNode } from "@bpmn-lean/semantic-core";

type DataInputOutputUserTask = Extract<
  CheckedNode,
  { kind: CheckedNodeKind.DataInputOutputUserTask }
>;

/** Requires every source-role identity consumed by composed Activity-data lowering to stay distinguishable. */
export function hasValidDataInputOutputUserTaskIdentities(
  node: DataInputOutputUserTask,
): boolean {
  const identities = [
    node.id,
    node.directInput.associationId,
    node.directInput.source.kind === "property" ? node.directInput.source.propertyId : node.directInput.source.dataInputId,
    node.directInput.targetDataInputId,
    node.directOutput.associationId,
    node.directOutput.sourceDataOutputId,
    node.directOutput.target.kind === "property" ? node.directOutput.target.propertyId : node.directOutput.target.dataOutputId,
  ];
  return identities.every((identity) => identity.length > 0) &&
    new Set(identities).size === identities.length;
}
