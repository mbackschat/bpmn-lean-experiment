/**
 * The scope host's place in the nested scope-control analysis, per the
 * [scope host proposal](../../../docs/capsules/SCOPE-HOST-FLOW-LISTS-PROPOSAL.md#admission). Transcribed independently by
 * the scope host part of the Lean `NestedScopeBranchWork`.
 *
 * Both projections hand the analysis raw bodies in which a splitting None Start or Sub-Process is a Start or task vertex
 * with two or more successors: the checked graph by its flows, the Program by a host's entries and an exit's outputs.
 * This leaf places those splits and gives each a synthetic fork, so the structured-body analysis keeps its vertex
 * arity rule: every Start and task vertex has one successor, every fork one predecessor and two or more successors.
 */
import { RawBodyNodeKind } from "./merge-region-admission.js";
import type { RawBodyNode } from "./merge-region-admission.js";

type SplitBody = Readonly<{ scope: string; nodes: readonly RawBodyNode[]; children: ReadonlyMap<string, string> }>;

const splits = (vertex: RawBodyNode): boolean =>
  (vertex.kind === RawBodyNodeKind.Start || vertex.kind === RawBodyNodeKind.Task) && vertex.outputs.length >= 2;

/** The synthetic fork after a splitting vertex; `>` occurs in no XML ID or derived operation ID. */
const forkAfter = (vertex: string): string => `fork>${vertex}`;

/** Whether a vertex is ordered by reachability with every other vertex of its body, so no fork region holds it. */
function outsideForkRegions(nodes: readonly RawBodyNode[], vertex: string): boolean {
  const outputs = new Map(nodes.map(({ id, outputs }) => [id, outputs]));
  const reach = (from: string): ReadonlySet<string> => {
    const seen = new Set([from]);
    const pending = [from];
    for (let cursor = 0; cursor < pending.length; cursor++) {
      for (const target of outputs.get(pending[cursor]!) ?? []) {
        if (!seen.has(target)) { seen.add(target); pending.push(target); }
      }
    }
    return seen;
  };
  const after = reach(vertex);
  return nodes.every(({ id }) => after.has(id) || reach(id).has(vertex));
}

/**
 * SCPH-SINGLE-01: a splitting body Start's Sub-Process and a splitting Sub-Process lie outside every fork region of
 * their scope and of every ancestor scope, so no other internal operation is enabled with the host or exit. A root Start
 * always qualifies. Comparability reads exactly the fork regions because the concurrent account admits no Choice.
 */
export function splitScopesPlaced(bodies: ReadonlyMap<string, SplitBody>): boolean {
  const parent = new Map<string, Readonly<{ body: SplitBody; vertex: string }>>();
  for (const body of bodies.values()) {
    for (const [vertex, child] of body.children) parent.set(child, { body, vertex });
  }
  const placed = (scope: string): boolean => {
    let current = parent.get(scope);
    // Climbs at most one level per body, so a parent cycle is refused rather than followed.
    for (let fuel = bodies.size; current !== undefined; fuel--) {
      if (fuel === 0 || !outsideForkRegions(current.body.nodes, current.vertex)) return false;
      current = parent.get(current.body.scope);
    }
    return true;
  };
  return [...bodies.values()].every(body => body.nodes.every(vertex => {
    const child = body.children.get(vertex.id);
    const splittingChild = child !== undefined && (splits(vertex) ||
      (bodies.get(child)?.nodes.some(start => start.kind === RawBodyNodeKind.Start && splits(start)) ?? false));
    return !splittingChild || placed(child);
  }));
}

/** Every splitting Start and task vertex followed by its synthetic fork over the vertex's successors (SCPH-ADMIT-01). */
export function withSplitForks<B extends Readonly<{ nodes: readonly RawBodyNode[] }>>(body: B): B {
  return {
    ...body,
    nodes: body.nodes.flatMap(vertex => splits(vertex)
      ? [{ ...vertex, outputs: [forkAfter(vertex.id)] }, { id: forkAfter(vertex.id), kind: RawBodyNodeKind.Fork, outputs: vertex.outputs }]
      : [vertex]),
  };
}
