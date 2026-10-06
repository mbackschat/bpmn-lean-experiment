export enum ParallelBodyNodeKind {
  Start = "start",
  Task = "task",
  Fork = "fork",
  Join = "join",
  End = "end",
}

export type ParallelBodyNode = Readonly<{
  id: string;
  kind: ParallelBodyNodeKind;
  outputs: readonly string[];
}>;

export type ParallelBodyFrontierCapacity = Readonly<{ waits: number; effects: number }>;

const maximum = (left: ParallelBodyFrontierCapacity, right: ParallelBodyFrontierCapacity): ParallelBodyFrontierCapacity =>
  ({ waits: Math.max(left.waits, right.waits), effects: Math.max(left.effects, right.effects) });

type Region = {
  readonly prefix: ParallelBodyFrontierCapacity;
  sum: ParallelBodyFrontierCapacity;
  readonly branches: readonly string[];
  nextBranch: number;
  terminal: string | null | undefined;
};

/** Checks SMIS-ADMIT-01 topology only; profile data, operation and burst admission remain separate. */
export function isStructuredParallelBody(nodes: readonly ParallelBodyNode[]): boolean {
  return structuredParallelBodyFrontierCapacity(nodes, new Set()) !== undefined;
}

/** PMIS-ADMIT-01 composes serial maxima and independent branch sums, including separate Ends. */
export function structuredParallelBodyFrontierCapacity(nodes: readonly ParallelBodyNode[], effectTaskIds: ReadonlySet<string>): ParallelBodyFrontierCapacity | undefined {
  const byId = new Map<string, ParallelBodyNode>();
  const incoming = new Map<string, number>();
  for (const node of nodes) {
    if (node.id.length === 0 || byId.has(node.id)) return undefined;
    byId.set(node.id, node);
    incoming.set(node.id, 0);
  }
  for (const node of nodes) {
    for (const target of node.outputs) {
      const count = incoming.get(target);
      if (count === undefined) return undefined;
      incoming.set(target, count + 1);
    }
  }
  let start: ParallelBodyNode | undefined;
  for (const node of nodes) {
    if (!validArity(node.kind, incoming.get(node.id)!, node.outputs.length)) return undefined;
    if (node.kind === ParallelBodyNodeKind.Start) {
      if (start !== undefined) return undefined;
      start = node;
    }
  }
  if (start === undefined) return undefined;

  const consumed = new Set<string>();
  const regions: Region[] = [];
  let width: ParallelBodyFrontierCapacity = { waits: 0, effects: 0 };
  let current = start;
  for (;;) {
    if (consumed.has(current.id)) return undefined;
    let terminal: string | null;
    switch (current.kind) {
      case ParallelBodyNodeKind.Start:
      case ParallelBodyNodeKind.Task:
        if (current.kind === ParallelBodyNodeKind.Task)
          width = maximum(width, { waits: 1, effects: effectTaskIds.has(current.id) ? 1 : 0 });
        consumed.add(current.id);
        current = byId.get(current.outputs[0]!)!;
        continue;
      case ParallelBodyNodeKind.Fork:
        consumed.add(current.id);
        regions.push({ branches: current.outputs, nextBranch: 1, terminal: undefined, prefix: width, sum: { waits: 0, effects: 0 } });
        width = { waits: 0, effects: 0 };
        current = byId.get(current.outputs[0]!)!;
        continue;
      case ParallelBodyNodeKind.Join:
        terminal = current.id;
        break;
      case ParallelBodyNodeKind.End:
        consumed.add(current.id);
        // BPMN 13.3.4: separate Ends meet only at the analysis sink, never a runtime join.
        terminal = null;
        break;
    }

    for (;;) {
      const region = regions.at(-1);
      if (region === undefined) return terminal === null && consumed.size === nodes.length ? width : undefined;
      region.sum = { waits: region.sum.waits + width.waits, effects: region.sum.effects + width.effects };
      if (region.terminal === undefined) region.terminal = terminal;
      else if (region.terminal !== terminal) return undefined;
      if (region.nextBranch < region.branches.length) {
        width = { waits: 0, effects: 0 };
        current = byId.get(region.branches[region.nextBranch++]!)!;
        break;
      }
      regions.pop();
      width = maximum(region.prefix, region.sum);
      if (terminal !== null) {
        // SMIS-ADMIT-01 forbids bypasses and partial joins; parallel edges retain multiplicity.
        if (incoming.get(terminal) !== region.branches.length || consumed.has(terminal)) return undefined;
        consumed.add(terminal);
        current = byId.get(byId.get(terminal)!.outputs[0]!)!;
        break;
      }
    }
  }
}

function validArity(kind: ParallelBodyNodeKind, incoming: number, outgoing: number): boolean {
  switch (kind) {
    case ParallelBodyNodeKind.Start: return incoming === 0 && outgoing === 1;
    case ParallelBodyNodeKind.Task: return incoming === 1 && outgoing === 1;
    case ParallelBodyNodeKind.Fork: return incoming === 1 && outgoing >= 2;
    case ParallelBodyNodeKind.Join: return incoming >= 2 && outgoing === 1;
    case ParallelBodyNodeKind.End: return incoming === 1 && outgoing === 0;
    default: return false;
  }
}
