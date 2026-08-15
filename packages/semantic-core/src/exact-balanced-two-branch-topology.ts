type ControlEdge = Readonly<{
  source: string;
  target: string;
}>;

type ExactBalancedTwoBranchTopology = Readonly<{
  entryIds: ReadonlyArray<string>;
  splitIds: ReadonlyArray<string>;
  branchIds: ReadonlyArray<string>;
  joinIds: ReadonlyArray<string>;
  endIds: ReadonlyArray<string>;
  edges: ReadonlyArray<ControlEdge>;
}>;

/** Decides the exact entry, balanced two-branch split/join, and end control shape. */
export function hasExactBalancedTwoBranchControlTopology(
  topology: ExactBalancedTwoBranchTopology,
): boolean {
  const entry = topology.entryIds[0];
  const split = topology.splitIds[0];
  const firstBranch = topology.branchIds[0];
  const secondBranch = topology.branchIds[1];
  const join = topology.joinIds[0];
  const end = topology.endIds[0];
  const roleIds = [entry, split, firstBranch, secondBranch, join, end];
  if (
    topology.entryIds.length !== 1 ||
    topology.splitIds.length !== 1 ||
    topology.branchIds.length !== 2 ||
    topology.joinIds.length !== 1 ||
    topology.endIds.length !== 1 ||
    roleIds.some((id) => id === undefined) ||
    new Set(roleIds).size !== 6
  ) {
    return false;
  }
  const expectedEdges = [
    { source: entry, target: split },
    { source: split, target: firstBranch },
    { source: split, target: secondBranch },
    { source: firstBranch, target: join },
    { source: secondBranch, target: join },
    { source: join, target: end },
  ];
  return topology.edges.length === expectedEdges.length &&
    expectedEdges.every(({ source, target }) =>
      topology.edges.filter(
        (edge) => edge.source === source && edge.target === target,
      ).length === 1
    );
}
