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

type Region = {
  readonly branches: readonly string[];
  nextBranch: number;
  terminal: string | null | undefined;
};

/** Checks SMIS-ADMIT-01 topology only; profile data, operation and burst admission remain separate. */
export function isStructuredParallelBody(nodes: readonly ParallelBodyNode[]): boolean {
  const byId = new Map<string, ParallelBodyNode>();
  const incoming = new Map<string, number>();
  for (const node of nodes) {
    if (node.id.length === 0 || byId.has(node.id)) return false;
    byId.set(node.id, node);
    incoming.set(node.id, 0);
  }
  for (const node of nodes) {
    for (const target of node.outputs) {
      const count = incoming.get(target);
      if (count === undefined) return false;
      incoming.set(target, count + 1);
    }
  }
  let start: ParallelBodyNode | undefined;
  for (const node of nodes) {
    if (!validArity(node.kind, incoming.get(node.id)!, node.outputs.length)) return false;
    if (node.kind === ParallelBodyNodeKind.Start) {
      if (start !== undefined) return false;
      start = node;
    }
  }
  if (start === undefined) return false;

  const consumed = new Set<string>();
  const regions: Region[] = [];
  let current = start;
  for (;;) {
    if (consumed.has(current.id)) return false;
    let terminal: string | null;
    switch (current.kind) {
      case ParallelBodyNodeKind.Start:
      case ParallelBodyNodeKind.Task:
        consumed.add(current.id);
        current = byId.get(current.outputs[0]!)!;
        continue;
      case ParallelBodyNodeKind.Fork:
        consumed.add(current.id);
        regions.push({ branches: current.outputs, nextBranch: 1, terminal: undefined });
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
      if (region === undefined) return terminal === null && consumed.size === nodes.length;
      if (region.terminal === undefined) region.terminal = terminal;
      else if (region.terminal !== terminal) return false;
      if (region.nextBranch < region.branches.length) {
        current = byId.get(region.branches[region.nextBranch++]!)!;
        break;
      }
      regions.pop();
      if (terminal !== null) {
        // SMIS-ADMIT-01 forbids bypasses and partial joins; parallel edges retain multiplicity.
        if (incoming.get(terminal) !== region.branches.length || consumed.has(terminal)) return false;
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
