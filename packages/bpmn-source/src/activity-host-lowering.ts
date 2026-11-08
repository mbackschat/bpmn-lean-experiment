/**
 * ACTH-ADMIT-01, ACSP-ADMIT-01: a User, Service or Send Task with two or more incoming or two or more outgoing flows
 * lowers to one Activity host whose inputs and outputs are those flows' places, which the caller passes sorted
 * (ACTH-HOST-01, ACSP-HOST-01). A Task with one incoming and one outgoing flow keeps its legacy operation (ACSP-ONE-01),
 * so this leaf is reached only for a merging or splitting Task. Owners: the
 * [Activity host specification](../../../docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#lowering) and the
 * [split proposal](../../../docs/capsules/ACTIVITY-HOST-SPLIT-SPEC.md#lowering); the Lean twin is `ActivityHostLowering`.
 */
import { SemanticOperationKind } from "@bpmn-lean/semantic-core";
import type { ActivityWork, SemanticOperation } from "@bpmn-lean/semantic-core";

type HostBase = Pick<SemanticOperation, "id" | "origin">;

export function lowerActivityHost(base: HostBase, incoming: ReadonlyArray<string>, outgoing: ReadonlyArray<string>,
  work: ActivityWork): SemanticOperation {
  return { ...base, kind: SemanticOperationKind.Activity, inputs: [...incoming],
    outputs: outgoing.map((place) => ({ place })), work };
}
