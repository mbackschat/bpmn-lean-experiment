/**
 * SCPH-ONE-01: a None Start or embedded Sub-Process lowers to a scope host or exit exactly when it has the several-flow
 * form; every one-flow node keeps its legacy lowering, so this leaf is reached only for a splitting root Start, a
 * Sub-Process whose body Start splits, and a splitting Sub-Process's completion. The caller passes each place list
 * sorted, as flow lists are (SCPH-HOST-01). Owner: the
 * [scope host proposal](../../../docs/capsules/SCOPE-HOST-FLOW-LISTS-PROPOSAL.md#lowering); the Lean twin is
 * `ScopeHostLowering`.
 */
import { ScopeWorkKind, SemanticOperationKind } from "@bpmn-lean/semantic-core";
import type { SemanticOperation } from "@bpmn-lean/semantic-core";

type HostBase = Pick<SemanticOperation, "id" | "origin">;

const places = (list: ReadonlyArray<string>) => list.map((place) => ({ place }));

/** A splitting root None Start: the Process initiation over every outgoing flow. */
export function lowerProcessHost(base: HostBase, outgoing: ReadonlyArray<string>): SemanticOperation {
  return { ...base, kind: SemanticOperationKind.Scope, inputs: [], entries: places(outgoing), work: { kind: ScopeWorkKind.Process } };
}

/** A Sub-Process whose body None Start splits: the scope entry over every outgoing flow of that Start. */
export function lowerSubProcessHost(base: HostBase, input: string, childEntries: ReadonlyArray<string>,
  childScopeId: string): SemanticOperation {
  return {
    ...base, kind: SemanticOperationKind.Scope, inputs: [input], entries: places(childEntries),
    work: { kind: ScopeWorkKind.SubProcess, childScopeId },
  };
}

/** A splitting Sub-Process's completion onto every outgoing flow. */
export function lowerScopeExit(base: HostBase, scopeId: string, outgoing: ReadonlyArray<string>): SemanticOperation {
  return { ...base, kind: SemanticOperationKind.ScopeExit, scopeId, outputs: places(outgoing) };
}
