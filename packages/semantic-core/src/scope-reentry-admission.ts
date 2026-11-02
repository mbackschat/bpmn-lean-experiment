/**
 * SRE-ADMIT-01, SRE-AVAILABLE-01 and SRE-BURST-01: the nested scope-data profile's account of a Process root body that
 * is a graph of tasks, Sub-Processes, Calls, two-condition Choices and Merges, possibly cyclic. Each Sub-Process body
 * and called Process keeps the serial account's walk; this module adds only the root graph. Owner: the
 * [scope re-entry proposal](../../../docs/capsules/SCOPE-REENTRY-PROPOSAL.md).
 */
import {
  ScopeDataVertexKind, nestedScopeCheckedModel, nestedScopeProgramModel, optionalCallNames, requiredReads,
  scopeDataStructureAdmitted, scopeDataVertexWalk,
} from "./nested-scope-data-admission.js";
import type { NestedScopeStartNames, ScopeDataAccess, ScopeDataModel, ScopeDataVertex } from "./nested-scope-data-admission.js";
import { CheckedNodeKind } from "./checked-process-contract.js";
import type { CheckedProcess } from "./checked-process-contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import { semanticProcessClosureLimit } from "./semantic-process-limits.js";
import { compareCanonicalStrings } from "./wire.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";

/** The admitted Start names and the longest automatic burst, which never exceeds the closure limit. */
export type ScopeReentryAnalysis = NestedScopeStartNames & Readonly<{ burst: number }>;

type Entry = Readonly<{ cost: number; stops: boolean }>;

/** SRE-ROUTE-01: a model whose root body holds a Choice or a Merge belongs to the re-entry account. */
function scopeReentryModel(model: ScopeDataModel): boolean {
  return model.vertices.some(({ kind, scope }) => scope === model.root &&
    (kind === ScopeDataVertexKind.Choice || kind === ScopeDataVertexKind.Merge));
}

/** SRE-ROUTE-01 over a Program of the nested scope-data profile, whatever else its analysis decides. */
export function scopeReentryProgram(program: SemanticProcessProgram): boolean {
  return program.identity.semanticProfile === SemanticProfileId.NestedEmbeddedScopeData && program.operations.some(({ id, kind }) =>
    (kind === SemanticOperationKind.Choose || kind === SemanticOperationKind.MergeExclusive) &&
    program.operationScopes.some(({ operationId, scopeId }) => operationId === id &&
      program.definitionScopes.some(scope => scope.id === scopeId && scope.parentScopeId === null &&
        scope.originElementId === program.processId)));
}

/** SRE-ROUTE-01 over the checked graph, independent of the Program. */
export function scopeReentryChecked(source: CheckedProcess): boolean {
  const root = source.definitionScopes.find(({ parentScopeId, originElementId }) =>
    parentScopeId === null && originElementId === source.processId)?.id;
  return source.nodes.some(({ id, kind }) =>
    (kind === CheckedNodeKind.ExclusiveGateway || kind === CheckedNodeKind.ExclusiveMerge) &&
    source.nodeScopes.some(({ nodeId, scopeId }) => nodeId === id && scopeId === root));
}

/** SRE-ADMIT-01 over the checked graph; `null` refuses it or routes it elsewhere. */
export function scopeReentryCheckedAnalysis(source: CheckedProcess): ScopeReentryAnalysis | null {
  const model = nestedScopeCheckedModel(source);
  return model === null || !scopeReentryModel(model) ? null : analyzeRootGraph(model);
}

/** SRE-ADMIT-01 over the Program, independent of the checked graph. */
export function scopeReentryProgramAnalysis(program: SemanticProcessProgram): ScopeReentryAnalysis | null {
  const model = nestedScopeProgramModel(program);
  return model === null || !scopeReentryModel(model) ? null : analyzeRootGraph(model);
}

function analyzeRootGraph(model: ScopeDataModel): ScopeReentryAnalysis | null {
  const { vertices, root, entry } = model;
  if (!scopeDataStructureAdmitted(model)) return null;
  const byId = new Map(vertices.map(vertex => [vertex.id, vertex]));
  const rootVertices = vertices.filter(({ scope }) => scope === root);
  // SRE-ADMIT-01: one None Start, the entry, and one None End at the root.
  if (byId.size !== vertices.length || byId.get(entry)?.scope !== root ||
      rootVertices.filter(({ kind }) => kind === ScopeDataVertexKind.Finish).length !== 1 ||
      !rootVertices.every(vertex => rootArityValid(vertex) && vertex.outputs.every(id => byId.get(id)?.scope === root))) {
    return null;
  }
  const accesses = new Map<string, readonly ScopeDataAccess[]>();
  const visited: string[] = [];
  const called = new Set<string>();
  for (const vertex of rootVertices) {
    const walked = scopeDataVertexWalk(model, vertex);
    if (walked === null) return null;
    accesses.set(vertex.id, walked.accesses);
    visited.push(vertex.id, ...walked.visited);
    walked.called.forEach(id => called.add(id));
  }
  if (new Set(visited).size !== visited.length || visited.some(id => called.has(id)) ||
      visited.length + called.size !== vertices.length) return null;
  const burst = maximumBurst(model, byId);
  if (burst === null || burst > semanticProcessClosureLimit) return null;
  const hasCall = vertices.some(({ kind }) => kind === ScopeDataVertexKind.Call);
  return {
    required: barrierNames(rootVertices, entry, accesses, requiredReads),
    optional: hasCall ? barrierNames(rootVertices, entry, accesses, optionalCallNames) : null,
    burst,
  };
}

function rootArityValid(vertex: ScopeDataVertex): boolean {
  switch (vertex.kind) {
    case ScopeDataVertexKind.Finish: return vertex.outputs.length === 0;
    case ScopeDataVertexKind.Choice: return vertex.outputs.length === 3;
    default: return vertex.outputs.length === 1;
  }
}

/** The Process-level names one root vertex definitely writes: writes no frame of its own declares. */
function definiteProcessWrites(accesses: readonly ScopeDataAccess[]): ReadonlySet<string> {
  return new Set(accesses.flatMap(({ kind, name, frames }) =>
    (kind === "write" || kind === "callOutput") && !frames.some(frame => frame.includes(name)) ? [name] : []));
}

/**
 * SRE-AVAILABLE-01's barrier rule (MTCF-DATA-01): a name a vertex needs from outside is a Start name when that vertex
 * stays reachable from Start after removing the outgoing edges of every vertex that definitely writes the name, so a
 * write reached only through a back-edge never satisfies a first entry.
 */
function barrierNames(rootVertices: readonly ScopeDataVertex[], entry: string,
  accesses: ReadonlyMap<string, readonly ScopeDataAccess[]>,
  needs: (accesses: readonly ScopeDataAccess[]) => readonly string[]): readonly string[] {
  const writes = new Map(rootVertices.map(({ id }) => [id, definiteProcessWrites(accesses.get(id) ?? [])]));
  const names = new Set<string>();
  for (const vertex of rootVertices) {
    for (const name of needs(accesses.get(vertex.id) ?? [])) {
      if (reachableAvoiding(rootVertices, entry, vertex.id, id => writes.get(id)?.has(name) ?? false)) names.add(name);
    }
  }
  return [...names].sort(compareCanonicalStrings);
}

function reachableAvoiding(rootVertices: readonly ScopeDataVertex[], from: string, to: string,
  barrier: (id: string) => boolean): boolean {
  const outputs = new Map(rootVertices.map(({ id, outputs }) => [id, outputs]));
  const seen = new Set<string>([from]);
  const pending = [from];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === to) return true;
    if (barrier(current)) continue;
    for (const next of outputs.get(current) ?? []) {
      if (!seen.has(next)) { seen.add(next); pending.push(next); }
    }
  }
  return false;
}

/**
 * SRE-BURST-01: the longest automatic step sequence from Start or from any resumption, counting each operation the
 * scheduler fires. Arming a wait costs one and stops; a None End costs two, its own step and its scope's completion
 * or the called Process's return; a body's or called Process's Start is no Program operation and costs nothing.
 * `null` means an automatic cycle, which the graph policy's cut already refuses.
 */
function maximumBurst(model: ScopeDataModel, byId: ReadonlyMap<string, ScopeDataVertex>): number | null {
  const { vertices, root, entry } = model;
  const path = (scope: string, first: string): readonly ScopeDataVertex[] => {
    const result: ScopeDataVertex[] = [];
    for (let id: string | undefined = first; id !== undefined && result.length <= vertices.length;) {
      const vertex = byId.get(id);
      if (vertex === undefined || vertex.scope !== scope) break;
      result.push(vertex);
      id = vertex.outputs[0];
    }
    return result;
  };
  const along = (steps: readonly ScopeDataVertex[]): Entry => {
    let cost = 0;
    for (const vertex of steps) {
      const step = enter(vertex);
      cost += step.cost;
      if (step.stops) return { cost, stops: true };
    }
    return { cost, stops: false };
  };
  const enter = (vertex: ScopeDataVertex): Entry => {
    switch (vertex.kind) {
      case ScopeDataVertexKind.Human:
      case ScopeDataVertexKind.Service: return { cost: 1, stops: true };
      case ScopeDataVertexKind.Start: return { cost: vertex.scope === root ? 1 : 0, stops: false };
      case ScopeDataVertexKind.Finish: return { cost: 2, stops: vertex.scope === root };
      case ScopeDataVertexKind.Choice:
      case ScopeDataVertexKind.Merge: return { cost: 1, stops: false };
      case ScopeDataVertexKind.SubProcess: {
        const inner = along(path(vertex.child!.scope, vertex.child!.entry));
        return { cost: 1 + inner.cost, stops: inner.stops };
      }
      case ScopeDataVertexKind.Call: {
        const inner = along(path(vertex.call!.scope, vertex.call!.entry));
        return { cost: 1 + inner.cost, stops: inner.stops };
      }
    }
  };
  const longest = new Map<string, number | null>();
  const onStack = new Set<string>();
  const fromRoot = (id: string): number | null => {
    if (longest.has(id)) return longest.get(id)!;
    const vertex = byId.get(id);
    if (vertex === undefined || onStack.has(id)) return null;
    onStack.add(id);
    const step = enter(vertex);
    let result: number | null = step.cost;
    if (!step.stops) {
      const rests = vertex.outputs.map(fromRoot);
      result = rests.some(rest => rest === null) ? null : step.cost + Math.max(...(rests as number[]));
    }
    onStack.delete(id);
    longest.set(id, result);
    return result;
  };
  // The steps after `vertex` completes in its scope: the rest of a serial body, then the parent's continuation.
  const after = (vertex: ScopeDataVertex): number | null => {
    if (vertex.scope === root) {
      const rests = vertex.outputs.map(fromRoot);
      return rests.some(rest => rest === null) ? null : Math.max(...(rests as number[]));
    }
    const rest = along(path(vertex.scope, vertex.outputs[0]!));
    if (rest.stops) return rest.cost;
    const owners = vertices.filter(owner => owner.child?.scope === vertex.scope || owner.call?.scope === vertex.scope);
    const continued = owners.map(after);
    return owners.length === 0 || continued.some(cost => cost === null) ? null
      : rest.cost + Math.max(...(continued as number[]));
  };
  const bursts = [fromRoot(entry), ...vertices.filter(({ kind }) =>
    kind === ScopeDataVertexKind.Human || kind === ScopeDataVertexKind.Service).map(after)];
  return bursts.some(burst => burst === null) ? null : Math.max(...(bursts as number[]));
}
