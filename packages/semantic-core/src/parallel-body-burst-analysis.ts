import { isStructuredParallelBody, ParallelBodyNodeKind as Kind } from "./structured-parallel-body-analysis.js";
import type { ParallelBodyNode } from "./structured-parallel-body-analysis.js";

export type ParallelBodyBursts = Readonly<{
  entryBurst: number;
  maximumResumptionBurst: number;
  maximumTerminalBurst: number;
}>;

/** SMIS-ADMIT-01 counts body operations; lowering elides the child Start, and MI boundary operations are separate. */
export function analyzeParallelBodyBursts(nodes: readonly ParallelBodyNode[]): ParallelBodyBursts | undefined {
  if (!isStructuredParallelBody(nodes)) return undefined;
  const byId = new Map(nodes.map((node, index) => [node.id, index]));
  const outputs = nodes.map(node => node.outputs.map(id => byId.get(id)!));
  const inputs: number[][] = nodes.map(() => []);
  outputs.forEach((targets, source) => targets.forEach(target => inputs[target]!.push(source)));
  const tasks = nodes.flatMap((node, index) => node.kind === Kind.Task ? [index] : []);
  if (tasks.length === 0) return undefined;

  function close(ready: number[], arrived: number[]): { steps: number; waits: number } {
    let steps = 0;
    let waits = 0;
    for (let cursor = 0; cursor < ready.length; cursor++) {
      const index = ready[cursor]!;
      switch (nodes[index]!.kind) {
        case Kind.Task:
          steps++;
          waits++;
          continue;
        case Kind.Start:
          break;
        case Kind.Fork:
        case Kind.Join:
        case Kind.End:
          steps++;
          break;
      }
      for (const target of outputs[index]!) {
        arrived[target] = arrived[target]! + 1;
        if (arrived[target] === inputs[target]!.length) ready.push(target);
      }
    }
    return { steps, waits };
  }

  const start = nodes.findIndex(node => node.kind === Kind.Start);
  const entryBurst = close([start], nodes.map(() => 0)).steps;
  let maximumResumptionBurst = 0;
  let maximumTerminalBurst = 0;
  for (const task of tasks) {
    const descendants = new Set<number>([task]);
    const pending = [task];
    for (let cursor = 0; cursor < pending.length; cursor++) {
      for (const target of outputs[pending[cursor]!]!) {
        if (!descendants.has(target)) { descendants.add(target); pending.push(target); }
      }
    }
    // Structured regions let sibling work finish first. Causally downstream inputs cannot pre-exist this completion.
    const arrived = nodes.map((node, index) => node.kind === Kind.Join && descendants.has(index)
      ? inputs[index]!.filter(source => !descendants.has(source)).length : 0);
    const ready: number[] = [];
    for (const target of outputs[task]!) {
      arrived[target] = arrived[target]! + 1;
      if (arrived[target] === inputs[target]!.length) ready.push(target);
    }
    const burst = close(ready, arrived);
    maximumResumptionBurst = Math.max(maximumResumptionBurst, burst.steps);
    if (burst.waits === 0) maximumTerminalBurst = Math.max(maximumTerminalBurst, burst.steps);
  }
  return { entryBurst, maximumResumptionBurst, maximumTerminalBurst };
}
