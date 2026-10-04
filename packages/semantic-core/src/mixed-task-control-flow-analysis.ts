import { compareCanonicalStrings } from "./wire.js";

export enum MixedTaskControlKind {
  Start = "start",
  Task = "task",
  Choice = "choice",
  Merge = "merge",
  End = "end",
}

export interface MixedTaskControlVertex {
  readonly id: string;
  readonly kind: MixedTaskControlKind;
  readonly outputs: readonly string[];
  readonly reads: readonly string[];
  readonly writes: readonly string[];
}

export function analyzeMixedTaskControlFlow(
  vertices: readonly MixedTaskControlVertex[],
): Readonly<{ requiredInputs: readonly string[]; maximumBurst: number }> | undefined {
  const indexById = new Map<string, number>();
  for (const [index, vertex] of vertices.entries()) {
    if (vertex.id.length === 0 || indexById.has(vertex.id)) return undefined;
    indexById.set(vertex.id, index);
  }
  const outputs: number[][] = vertices.map(() => []);
  const inputs: number[][] = vertices.map(() => []);
  const tasks: number[] = [];
  let start: number | undefined;
  let end: number | undefined;
  for (const [index, vertex] of vertices.entries()) {
    for (const output of vertex.outputs) {
      const target = indexById.get(output);
      if (target === undefined) return undefined;
      outputs[index]!.push(target);
      inputs[target]!.push(index);
    }
    if (vertex.kind !== MixedTaskControlKind.Task && (vertex.reads.length > 0 || vertex.writes.length > 0)) {
      return undefined;
    }
    switch (vertex.kind) {
      case MixedTaskControlKind.Start:
        if (start !== undefined) return undefined;
        start = index;
        break;
      case MixedTaskControlKind.End:
        if (end !== undefined) return undefined;
        end = index;
        break;
      case MixedTaskControlKind.Task:
        tasks.push(index);
        break;
      case MixedTaskControlKind.Choice:
      case MixedTaskControlKind.Merge:
        break;
      default:
        return undefined;
    }
  }
  if (start === undefined || end === undefined || tasks.length === 0) return undefined;
  if (!vertices.every((vertex, index) => validArity(vertex.kind, inputs[index]!.length, outputs[index]!.length))) {
    return undefined;
  }
  if (reachable(start, outputs).size !== vertices.length || reachable(end, inputs).size !== vertices.length) {
    return undefined;
  }
  const cutOutputs = vertices.map((vertex, index) => vertex.kind === MixedTaskControlKind.Task ? [] : outputs[index]!);
  const order = topologicalOrder(cutOutputs);
  if (order === undefined) return undefined;
  const ranks = new Array<number>(vertices.length).fill(0);
  for (const index of order.reverse()) {
    switch (vertices[index]!.kind) {
      case MixedTaskControlKind.Task:
        ranks[index] = 1;
        break;
      case MixedTaskControlKind.End:
        ranks[index] = 2;
        break;
      default:
        ranks[index] = 1 + cutOutputs[index]!.reduce((maximum, target) => Math.max(maximum, ranks[target]!), 0);
    }
  }
  let maximumBurst = ranks[start]!;
  for (const task of tasks) maximumBurst = Math.max(maximumBurst, ranks[outputs[task]![0]!]!);

  const readersByName = new Map<string, number[]>();
  const writersByName = new Map<string, Set<number>>();
  for (const task of tasks) {
    for (const name of vertices[task]!.reads) {
      const readers = readersByName.get(name) ?? [];
      readers.push(task);
      readersByName.set(name, readers);
    }
    for (const name of vertices[task]!.writes) {
      const writers = writersByName.get(name) ?? new Set<number>();
      writers.add(task);
      writersByName.set(name, writers);
    }
  }
  const requiredInputs: string[] = [];
  for (const [name, readers] of readersByName) {
    // MTCF-DATA-01 cuts after writers: entering a task reads before its own completion writes.
    const beforeGuaranteedWrite = reachable(start, outputs, writersByName.get(name));
    if (readers.some((reader) => beforeGuaranteedWrite.has(reader))) requiredInputs.push(name);
  }
  requiredInputs.sort(compareCanonicalStrings);
  return { requiredInputs, maximumBurst };
}

function validArity(kind: MixedTaskControlKind, incoming: number, outgoing: number): boolean {
  switch (kind) {
    case MixedTaskControlKind.Start: return incoming === 0 && outgoing === 1;
    case MixedTaskControlKind.Task: return incoming === 1 && outgoing === 1;
    case MixedTaskControlKind.Choice: return incoming === 1 && outgoing >= 2;
    case MixedTaskControlKind.Merge: return incoming >= 2 && outgoing === 1;
    case MixedTaskControlKind.End: return incoming === 1 && outgoing === 0;
  }
}

function reachable(start: number, outputs: readonly (readonly number[])[],
  barriers: ReadonlySet<number> = new Set()): ReadonlySet<number> {
  const seen = new Set<number>([start]);
  const pending = [start];
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const index = pending[cursor]!;
    if (barriers.has(index)) continue;
    for (const target of outputs[index]!) {
      if (!seen.has(target)) {
        seen.add(target);
        pending.push(target);
      }
    }
  }
  return seen;
}

function topologicalOrder(outputs: readonly (readonly number[])[]): number[] | undefined {
  const incoming = new Array<number>(outputs.length).fill(0);
  for (const targets of outputs) {
    for (const target of targets) incoming[target] = incoming[target]! + 1;
  }
  const order = incoming.flatMap((count, index) => count === 0 ? [index] : []);
  for (let cursor = 0; cursor < order.length; cursor++) {
    for (const target of outputs[order[cursor]!]!) {
      incoming[target] = incoming[target]! - 1;
      if (incoming[target] === 0) order.push(target);
    }
  }
  return order.length === outputs.length ? order : undefined;
}
