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
  ScopeDataVertexKind, nestedScopeCallLimit, nestedScopeCheckedModel, nestedScopeCheckedShape, nestedScopeCheckedStartNames,
  nestedScopeProgramModel, nestedScopeProgramShape, nestedScopeProgramStartNames,
} from "./nested-scope-data-admission.js";
import type { NestedScopeStartNames, ScopeDataModel } from "./nested-scope-data-admission.js";
import {
  scopeDataMaximumBurst, scopeReentryChecked, scopeReentryCheckedAnalysis, scopeReentryProgram, scopeReentryProgramAnalysis,
} from "./scope-reentry-admission.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { semanticProcessClosureLimit } from "./semantic-process-limits.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";

const splits = (operations: readonly SemanticOperation[]): boolean =>
  operations.some(({ kind }) => kind === SemanticOperationKind.Duplicate);

const forks = (nodes: readonly CheckedNode[]): boolean =>
  nodes.some(node => node.kind === CheckedNodeKind.ParallelGateway && node.direction === GatewayDirection.Diverging);

/** CSSD-ROUTE-01: a Program of the nested scope-data profile that splits a token. */
export function concurrentStructuredScopeDataProgram(program: SemanticProcessProgram): boolean {
  return program.identity.semanticProfile === SemanticProfileId.NestedEmbeddedScopeData && splits(program.operations);
}

/** The scope a Process root body runs in, whose Calls the profile refuses once it forks (RPF-ADMIT-01). */
function rootScope(scopes: readonly Readonly<{ id: string; parentScopeId: string | null; originElementId: string }>[],
  processId: string): string | undefined {
  return scopes.find(({ parentScopeId, originElementId }) => parentScopeId === null && originElementId === processId)?.id;
}

/** At most two Calls, all mapped and all naming the one called Process of a two-Process document. */
function calledProcessesAdmitted(calls: readonly Readonly<{ calledProcessId: string; data: Readonly<{ kind: CallDataKind }> }>[]): boolean {
  return calls.length <= nestedScopeCallLimit && new Set(calls.map(({ calledProcessId }) => calledProcessId)).size <= 1 &&
    calls.every(({ data }) => data.kind === CallDataKind.VariableMappings);
}

/**
 * CSSD-ADMIT-01's profile restrictions on the shared concurrent class, as RPF-ADMIT-01 widened them: a source overlay on
 * every model, no merge region, no Call in a forking root body, and the profile's Call bound. A root Call beside a root
 * fork could be enabled together with sibling work, which the profile's structured values were never admitted for.
 */
function programRestrictionsHold(program: SemanticProcessProgram): boolean {
  const root = rootScope(program.definitionScopes, program.processId);
  const scopeOf = new Map(program.operationScopes.map(({ operationId, scopeId }) => [operationId, scopeId]));
  const inRoot = (kind: SemanticOperationKind): boolean =>
    program.operations.some(operation => operation.kind === kind && scopeOf.get(operation.id) === root);
  return program.identity.sourceOverlay !== null && root !== undefined &&
    // PTPB-ADMIT-01: a one-input merge is a lowered pass-through Task, not a merge region.
    !program.operations.some(operation => operation.kind === SemanticOperationKind.MergeExclusive && operation.inputs.length >= 2) &&
    !(inRoot(SemanticOperationKind.Duplicate) && inRoot(SemanticOperationKind.InvokeProcess)) &&
    calledProcessesAdmitted(program.operations.flatMap(operation =>
      operation.kind === SemanticOperationKind.InvokeProcess ? [operation] : []));
}

function checkedRestrictionsHold(source: CheckedProcess): boolean {
  const root = rootScope(source.definitionScopes, source.processId);
  const scopeOf = new Map(source.nodeScopes.map(({ nodeId, scopeId }) => [nodeId, scopeId]));
  const rootNodes = source.nodes.filter(({ id }) => scopeOf.get(id) === root);
  return source.identity.sourceOverlay !== null && root !== undefined &&
    !source.nodes.some(({ kind }) => kind === CheckedNodeKind.ExclusiveMerge) &&
    !(forks(rootNodes) && rootNodes.some(({ kind }) => kind === CheckedNodeKind.CallActivity)) &&
    calledProcessesAdmitted(source.nodes.flatMap(node => node.kind === CheckedNodeKind.CallActivity ? [node] : []));
}

/**
 * PTT-BURST-01: a serial model holding a pass-through Task is admitted only within the closure limit. Serial models
 * without one keep their admission unchanged, so the serial route's recorded lack of a burst rule is not narrowed.
 */
function serialBurstAdmitted(model: ScopeDataModel | null): boolean {
  if (model === null || !model.vertices.some(({ kind }) => kind === ScopeDataVertexKind.PassThrough)) return true;
  const burst = scopeDataMaximumBurst(model);
  return burst !== null && burst <= semanticProcessClosureLimit;
}

/** NSD-AVAILABLE-01 for a serial Program; CSD-AVAILABLE-01 and CMCALL-START-01 for a concurrent one; `null` refuses. */
export function structuredScopeDataProgramStartNames(program: SemanticProcessProgram): NestedScopeStartNames | null {
  // SRE-ROUTE-01: a root Choice or Merge selects the re-entry account; a model that also splits is refused.
  if (scopeReentryProgram(program)) {
    return concurrentStructuredScopeDataProgram(program) ? null : scopeReentryProgramAnalysis(program);
  }
  if (!concurrentStructuredScopeDataProgram(program)) {
    return serialBurstAdmitted(nestedScopeProgramModel(program)) ? nestedScopeProgramStartNames(program) : null;
  }
  return programRestrictionsHold(program) ? nestedScopeControlProgramStartNameRule(program) : null;
}

/** The checked-graph counterpart of `structuredScopeDataProgramStartNames`. */
export function structuredScopeDataCheckedStartNames(source: CheckedProcess): NestedScopeStartNames | null {
  if (scopeReentryChecked(source)) return forks(source.nodes) ? null : scopeReentryCheckedAnalysis(source);
  if (!forks(source.nodes)) {
    return serialBurstAdmitted(nestedScopeCheckedModel(source)) ? nestedScopeCheckedStartNames(source) : null;
  }
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
  // PTPB-ADMIT-01 and NIT-ADMIT-01: this profile alone admits a pass-through Task or None Throw in the shared
  // concurrent alphabet.
  return forks(nodes)
    ? nestedScopeControlCheckedShape(nodes.filter(({ kind }) => kind !== CheckedNodeKind.NonOperationalTask &&
      kind !== CheckedNodeKind.NoneIntermediateThrowEvent), scopeCount)
    : nestedScopeCheckedShape(nodes, scopeCount);
}
