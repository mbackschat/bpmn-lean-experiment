import { ParallelBodyNodeKind as Kind } from "./structured-parallel-body-analysis.js";
import type { ParallelBodyNode } from "./structured-parallel-body-analysis.js";

/** Where one fork output's closure scan stops: at a task it arms, at a join it cannot pass, or at an End. */
enum BranchStop {
  Work = "work",
  Join = "join",
  End = "end",
}

type BranchScan = Readonly<{ stop: BranchStop; join: string | null; passes: boolean }>;

/**
 * BPMN 13.4.1: every path from a fork output reaches a task vertex before a join or End can consume it. PTPB-WORK-01
 * relaxes this only for a branch whose closure scan meets a pass vertex: such a branch may reach its fork's paired join
 * without waiting, but never an End, so an End is never co-enabled with a sibling branch's entry (the singleton premise
 * of the [pass-through branch specification](../../../docs/capsules/PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#representation-and-runtime-ownership)).
 * The scan passes a nested fork's join only when every branch of that fork reaches it wait-free.
 */
export function branchesStartWithWork(nodes: readonly ParallelBodyNode[]): boolean {
  return branchCut(nodes, false);
}

/**
 * TFK-ADMIT-01 also admits a terminal-fork branch whose closure scan stops at its End without arming a task, so its End
 * may share a closure with sibling work; a branch that reaches its paired join keeps PTPB-WORK-01. Admission applies
 * this cut only where TFK-DATA-01 rules out a declared entry, the one co-enabled member with no commutation law beside an
 * End (the [terminal forks specification](../../../docs/capsules/TERMINAL-FORKS-PROPOSAL.md#representation-and-runtime-ownership)).
 */
export function branchesReachWorkOrEnd(nodes: readonly ParallelBodyNode[]): boolean {
  return branchCut(nodes, true);
}

function branchCut(nodes: readonly ParallelBodyNode[], waitFreeEnds: boolean): boolean {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const reachesWork = (id: string): boolean => {
    const node = byId.get(id);
    switch (node?.kind) {
      case Kind.Task: return true;
      case Kind.Fork: return node.outputs.every(reachesWork);
      default: return false;
    }
  };
  const scan = (id: string): BranchScan => {
    const node = byId.get(id);
    switch (node?.kind) {
      case Kind.Task: return { stop: BranchStop.Work, join: null, passes: false };
      case Kind.Pass: return { ...scan(node.outputs[0]!), passes: true };
      case Kind.Join: return { stop: BranchStop.Join, join: node.id, passes: false };
      case Kind.Fork: {
        const branches = node.outputs.map(scan);
        const passes = branches.some(branch => branch.passes);
        if (branches.some(({ stop }) => stop === BranchStop.End)) return { stop: BranchStop.End, join: null, passes };
        const join = branches[0]!.join;
        if (join === null || !branches.every(branch => branch.stop === BranchStop.Join && branch.join === join)) {
          return { stop: BranchStop.Work, join: null, passes };
        }
        const after = scan(byId.get(join)!.outputs[0]!);
        return { ...after, passes: passes || after.passes };
      }
      default: return { stop: BranchStop.End, join: null, passes: false };
    }
  };
  const admitted = (id: string): boolean => {
    if (reachesWork(id)) return true;
    const branch = scan(id);
    return branch.stop === BranchStop.End ? waitFreeEnds : branch.passes;
  };
  return nodes.every(node => node.kind !== Kind.Fork || node.outputs.every(admitted));
}
