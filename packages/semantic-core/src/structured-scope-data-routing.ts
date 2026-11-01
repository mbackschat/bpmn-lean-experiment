/**
 * CSSD-ROUTE-01: the nested scope-data profile's routing between its serial account and the concurrent account it
 * shares with the embedded completion profile. A Program or checked graph of the profile is concurrent exactly when
 * it splits a token; the serial analysis refuses every split, so no model it admits is ever routed elsewhere. Owner:
 * the [concurrent structured scope data specification](../../../docs/capsules/CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md).
 */
import { CallDataKind } from "./call-data-contract.js";
import { CheckedNodeKind, GatewayDirection } from "./checked-process-contract.js";
import type { CheckedNode, CheckedProcess } from "./checked-process-contract.js";
import {
  nestedScopeControlCheckedShape, nestedScopeControlCheckedStartNameRule, nestedScopeControlProgramShape,
  nestedScopeControlProgramStartNameRule,
} from "./nested-scope-control-admission.js";
import {
  nestedScopeCheckedShape, nestedScopeCheckedStartNames, nestedScopeProgramShape, nestedScopeProgramStartNames,
} from "./nested-scope-data-admission.js";
import type { NestedScopeStartNames } from "./nested-scope-data-admission.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";

/** The profile's own Call bound (CVM-ADMIT-01, Stage B), which its concurrent Programs keep. */
const callLimit = 2;

const splits = (operations: readonly SemanticOperation[]): boolean =>
  operations.some(({ kind }) => kind === SemanticOperationKind.Duplicate);

const forks = (nodes: readonly CheckedNode[]): boolean =>
  nodes.some(node => node.kind === CheckedNodeKind.ParallelGateway && node.direction === GatewayDirection.Diverging);

/** CSSD-ROUTE-01: a Program of the nested scope-data profile that splits a token. */
export function concurrentStructuredScopeDataProgram(program: SemanticProcessProgram): boolean {
  return program.identity.semanticProfile === SemanticProfileId.NestedEmbeddedScopeData && splits(program.operations);
}

/** The scope a Process root body runs in, which the profile keeps one serial path. */
function rootScope(scopes: readonly Readonly<{ id: string; parentScopeId: string | null; originElementId: string }>[],
  processId: string): string | undefined {
  return scopes.find(({ parentScopeId, originElementId }) => parentScopeId === null && originElementId === processId)?.id;
}

/** At most two Calls, all mapped and all naming the one called Process of a two-Process document. */
function calledProcessesAdmitted(calls: readonly Readonly<{ calledProcessId: string; data: Readonly<{ kind: CallDataKind }> }>[]): boolean {
  return calls.length <= callLimit && new Set(calls.map(({ calledProcessId }) => calledProcessId)).size <= 1 &&
    calls.every(({ data }) => data.kind === CallDataKind.VariableMappings);
}

/**
 * CSSD-ADMIT-01's profile restrictions on the shared concurrent class: a source overlay on every model, forks only in
 * Sub-Process bodies, no merge region, and the profile's Call bound.
 */
function programRestrictionsHold(program: SemanticProcessProgram): boolean {
  const root = rootScope(program.definitionScopes, program.processId);
  const scopeOf = new Map(program.operationScopes.map(({ operationId, scopeId }) => [operationId, scopeId]));
  return program.identity.sourceOverlay !== null && root !== undefined &&
    !program.operations.some(({ id, kind }) =>
      kind === SemanticOperationKind.MergeExclusive || (kind === SemanticOperationKind.Duplicate && scopeOf.get(id) === root)) &&
    calledProcessesAdmitted(program.operations.flatMap(operation =>
      operation.kind === SemanticOperationKind.InvokeProcess ? [operation] : []));
}

function checkedRestrictionsHold(source: CheckedProcess): boolean {
  const root = rootScope(source.definitionScopes, source.processId);
  const scopeOf = new Map(source.nodeScopes.map(({ nodeId, scopeId }) => [nodeId, scopeId]));
  return source.identity.sourceOverlay !== null && root !== undefined &&
    !source.nodes.some(node => node.kind === CheckedNodeKind.ExclusiveMerge ||
      (node.kind === CheckedNodeKind.ParallelGateway && node.direction === GatewayDirection.Diverging &&
        scopeOf.get(node.id) === root)) &&
    calledProcessesAdmitted(source.nodes.flatMap(node => node.kind === CheckedNodeKind.CallActivity ? [node] : []));
}

/** NSD-AVAILABLE-01 for a serial Program; CSD-AVAILABLE-01 and CMCALL-START-01 for a concurrent one; `null` refuses. */
export function structuredScopeDataProgramStartNames(program: SemanticProcessProgram): NestedScopeStartNames | null {
  if (!concurrentStructuredScopeDataProgram(program)) return nestedScopeProgramStartNames(program);
  return programRestrictionsHold(program) ? nestedScopeControlProgramStartNameRule(program) : null;
}

/** The checked-graph counterpart of `structuredScopeDataProgramStartNames`. */
export function structuredScopeDataCheckedStartNames(source: CheckedProcess): NestedScopeStartNames | null {
  if (!forks(source.nodes)) return nestedScopeCheckedStartNames(source);
  return checkedRestrictionsHold(source)
    ? nestedScopeControlCheckedStartNameRule({ ...source, flows: source.sequenceFlows }) : null;
}

/** CSSD-ADMIT-01 over the Program: its required Start names, or `null` when admission refuses it. */
export function structuredScopeDataProgramAnalysis(program: SemanticProcessProgram): readonly string[] | null {
  return structuredScopeDataProgramStartNames(program)?.required ?? null;
}

/** CSSD-ADMIT-01 over the checked graph, independent of the Program. */
export function structuredScopeDataCheckedAnalysis(source: CheckedProcess): readonly string[] | null {
  return structuredScopeDataCheckedStartNames(source)?.required ?? null;
}

/** The operation alphabet: the serial one for a serial Program, the shared concurrent one for a split. */
export function structuredScopeDataProgramShape(operations: readonly SemanticOperation[], scopeCount: number): boolean {
  return splits(operations) ? nestedScopeControlProgramShape(operations, scopeCount) : nestedScopeProgramShape(operations, scopeCount);
}

export function structuredScopeDataCheckedShape(nodes: readonly CheckedNode[], scopeCount: number): boolean {
  return forks(nodes) ? nestedScopeControlCheckedShape(nodes, scopeCount) : nestedScopeCheckedShape(nodes, scopeCount);
}
