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
    node.directInput.sourcePropertyId,
    node.directInput.targetDataInputId,
    node.directOutput.associationId,
    node.directOutput.sourceDataOutputId,
    node.directOutput.targetPropertyId,
  ];
  return identities.every((identity) => identity.length > 0) &&
    new Set(identities).size === identities.length;
}
