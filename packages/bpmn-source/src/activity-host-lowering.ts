/**
 * ACTH-ADMIT-01: a User, Service or Send Task with two or more incoming flows lowers to one Activity host whose inputs
 * are those flows' places, which the caller passes sorted (ACTH-HOST-01), and whose one output is its outgoing flow. A Task with one
 * incoming flow keeps its legacy operation (ACTH-ONE-01), so this leaf is reached only for a merging Task. Owner: the
 * [Activity host specification](../../../docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#lowering); the Lean twin is
 * `ActivityHostLowering`.
 */
import { SemanticOperationKind } from "@bpmn-lean/semantic-core";
import type { ActivityWork, SemanticOperation } from "@bpmn-lean/semantic-core";

type HostBase = Pick<SemanticOperation, "id" | "origin">;

export function lowerActivityHost(base: HostBase, incoming: ReadonlyArray<string>, output: string,
  work: ActivityWork): SemanticOperation {
  return { ...base, kind: SemanticOperationKind.Activity, inputs: [...incoming], outputs: [{ place: output }], work };
}
