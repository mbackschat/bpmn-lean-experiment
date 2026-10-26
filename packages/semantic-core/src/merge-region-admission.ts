import { ParallelBodyNodeKind as Kind } from "./structured-parallel-body-analysis.js";
import type { ParallelBodyNode } from "./structured-parallel-body-analysis.js";

/**
 * CEA-ADMIT-01 merge-region recognition for the embedded completion profile, an independent transcription of the Lean
 * merge-region scan. The structured-body analysis has no merge vertex (a task has one input and every multi-input
 * vertex is a join), so a region is recognized here and contracted to one task vertex before that analysis runs.
 */

/**
 * A body vertex before contraction, the transcription of Lean's `RawKind`. `Merge`, a converging identity-only
 * Exclusive merge, never reaches the structured-body analysis.
 */
export enum RawBodyNodeKind {
  Start = "start",
  Task = "task",
  Fork = "fork",
  Join = "join",
  End = "end",
  Merge = "merge",
}

export type RawBodyNode = Readonly<{ id: string; kind: RawBodyNodeKind; outputs: readonly string[] }>;

/** The structured-body kind of a vertex left after contraction; a merge outside a region has none. */
function contractedKind(kind: RawBodyNodeKind): Kind | null {
  switch (kind) {
    case RawBodyNodeKind.Start: return Kind.Start;
    case RawBodyNodeKind.Task: return Kind.Task;
    case RawBodyNodeKind.Fork: return Kind.Fork;
    case RawBodyNodeKind.Join: return Kind.Join;
    case RawBodyNodeKind.End: return Kind.End;
    case RawBodyNodeKind.Merge: return null;
  }
}

/**
 * A recognized region `fork → branches → merge → target → after → End`, contracted to the task vertex `vertex` (the
 * fork's id) followed by `end`. Every task id is a User Task; the target's own body is checked by the caller.
 */
export type MergeRegion = Readonly<{
  vertex: string;
  end: string;
  branches: readonly (readonly string[])[];
  target: string;
  targetScope: string;
  after: readonly string[];
}>;

export type ContractedBody = Readonly<{ nodes: readonly ParallelBodyNode[]; regions: readonly MergeRegion[] }>;

/**
 * Contracts every merge region of one body; `null` refuses a merge outside the region shape. `children` maps each
 * Sub-Process vertex to its child scope; only the merge target may be a Sub-Process inside a region.
 */
export function contractMergeRegions(nodes: readonly RawBodyNode[], children: ReadonlyMap<string, string>): ContractedBody | null {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const predecessors = (id: string): readonly RawBodyNode[] => nodes.filter(({ outputs }) => outputs.includes(id));
  // Not a type predicate: a false result must not narrow the walk's cursor to `undefined`.
  const userTask = (node: RawBodyNode | undefined): boolean =>
    node?.kind === RawBodyNodeKind.Task && !children.has(node.id) && node.outputs.length === 1 && predecessors(node.id).length === 1;
  const regions: MergeRegion[] = [];
  const removed = new Set<string>();
  for (const merge of nodes.filter(({ kind }) => kind === RawBodyNodeKind.Merge)) {
    const inputs = predecessors(merge.id);
    if (merge.outputs.length !== 1 || inputs.length < 2) return null;
    // Each branch is walked back from the merge through single-input User Tasks to the fork.
    const branches: string[][] = [];
    let fork: RawBodyNode | undefined;
    for (const last of inputs) {
      const branch: string[] = [];
      let current: RawBodyNode | undefined = last;
      while (current !== undefined && userTask(current)) {
        branch.unshift(current.id);
        current = predecessors(current.id)[0];
      }
      if (branch.length === 0 || current?.kind !== RawBodyNodeKind.Fork || (fork !== undefined && fork.id !== current.id)) return null;
      fork = current;
      branches.push(branch);
    }
    if (fork === undefined || fork.outputs.length !== branches.length ||
        !branches.every(branch => fork!.outputs.includes(branch[0]!))) return null;
    const target = byId.get(merge.outputs[0]!);
    const targetScope = target === undefined ? undefined : children.get(target.id);
    if (target?.kind !== RawBodyNodeKind.Task || targetScope === undefined || target.outputs.length !== 1 ||
        predecessors(target.id).length !== 1) return null;
    const after: string[] = [];
    let current = byId.get(target.outputs[0]!);
    while (current !== undefined && userTask(current)) {
      after.push(current.id);
      current = byId.get(current.outputs[0]!);
    }
    if (current?.kind !== RawBodyNodeKind.End || predecessors(current.id).length !== 1) return null;
    regions.push({ vertex: fork.id, end: current.id, branches, target: target.id, targetScope, after });
    for (const id of [merge.id, target.id, ...branches.flat(), ...after]) removed.add(id);
  }
  const contracted: ParallelBodyNode[] = [];
  for (const node of nodes) {
    if (removed.has(node.id)) continue;
    const region = regions.find(({ vertex }) => vertex === node.id);
    if (region !== undefined) {
      contracted.push({ id: node.id, kind: Kind.Task, outputs: [region.end] });
      continue;
    }
    const kind = contractedKind(node.kind);
    if (kind === null) return null;
    contracted.push({ id: node.id, kind, outputs: node.outputs });
  }
  return { nodes: contracted, regions };
}

/** Counted tasks that run once per fork output: the target body's and those after the target that `counted` selects. */
export function multiplicityWeightedExtra(region: MergeRegion, targetTasks: number, counted: (task: string) => boolean): number {
  return (region.branches.length - 1) * (targetTasks + region.after.filter(counted).length);
}
