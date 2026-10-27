import { RawBodyNodeKind } from "./merge-region-admission.js";
import type { RawBodyNode } from "./merge-region-admission.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { ScopeLocalData, VariableMapping } from "./semantic-value-contract.js";
import { compareCanonicalStrings } from "./wire.js";

/**
 * CSD-AVAILABLE-01 of the concurrent scope data proposal, an independent transcription of the Lean availability walk.
 *
 * A name declared by an input of the reader's scope chain is always available, because every local of this profile is
 * an input. Any other name resolves to the Process, so the analysis tracks only Process-landing definite writes: a
 * Service or Sub-Process output whose target no enclosing scope declares. The set at each raw body vertex is the union
 * of its inputs after a Parallel join, the intersection after an Exclusive merge, and the union of every End at a
 * body's completion, which waits for every branch. Forward flow alone keeps a write in one fork branch away from its
 * siblings. A read that is neither declared nor definitely written becomes a required Start binding.
 */

/** The names one task vertex reads before it runs and writes when it completes. */
export type ScopeDataAccess = Readonly<{ reads: readonly string[]; writes: readonly string[] }>;

/** One definition scope's raw body: vertices before merge-region contraction, and each Sub-Process vertex's child. */
export type AvailabilityBody = Readonly<{ nodes: readonly RawBodyNode[]; children: ReadonlyMap<string, string> }>;

type Names = ReadonlySet<string>;

const union = (sets: readonly Names[]): Names => new Set(sets.flatMap(set => [...set]));
const intersection = ([first, ...rest]: readonly Names[]): Names =>
  new Set([...first ?? []].filter(name => rest.every(set => set.has(name))));

/** The enclosing names an input mapping reads; literals read nothing. */
export function enclosingReads(mappings: readonly VariableMapping[]): string[] {
  return mappings.flatMap(({ expression }) =>
    expression.kind === MappingExpressionKind.EnclosingVariable ? [expression.name] : []);
}

/**
 * The required Start names of the tree below `root`, sorted canonically; `null` when a body is missing, has no
 * single path into a vertex the walk needs, or is cyclic. `accesses` holds the mapped Service Tasks; a Sub-Process
 * vertex's access is its child scope's record.
 */
export function concurrentScopeRequiredStartNames(root: string, bodies: ReadonlyMap<string, AvailabilityBody>,
  records: readonly ScopeLocalData[], accesses: ReadonlyMap<string, ScopeDataAccess>): readonly string[] | null {
  const required = new Set<string>();
  const recordOf = new Map(records.map(record => [record.scopeId, record]));
  const childAccess = (child: string): ScopeDataAccess => {
    const record = recordOf.get(child);
    return record === undefined ? { reads: [], writes: [] }
      : { reads: enclosingReads(record.localInputs), writes: record.localOutputs.map(({ target }) => target) };
  };
  // Depth is bounded by the number of scopes, so a child cycle is refused rather than recursed.
  const completion = (scope: string, entry: Names, enclosing: Names, depth: number): Names | null => {
    const body = bodies.get(scope);
    if (body === undefined || depth > bodies.size) return null;
    const declared = new Set([...enclosing, ...(recordOf.get(scope)?.localInputs ?? []).map(({ target }) => target)]);
    const exits = new Map<string, Names | null>();
    const visiting = new Set<string>();
    const exit = (node: RawBodyNode): Names | null => {
      const known = exits.get(node.id);
      if (known !== undefined) return known;
      if (visiting.has(node.id)) return null;
      visiting.add(node.id);
      const result = leave(node);
      visiting.delete(node.id);
      exits.set(node.id, result);
      return result;
    };
    const enter = (node: RawBodyNode): Names | null => {
      if (node.kind === RawBodyNodeKind.Start) return entry;
      const inputs = body.nodes.filter(({ outputs }) => outputs.includes(node.id)).map(exit);
      if (inputs.length === 0 || inputs.some(input => input === null)) return null;
      return node.kind === RawBodyNodeKind.Merge ? intersection(inputs as Names[]) : union(inputs as Names[]);
    };
    const leave = (node: RawBodyNode): Names | null => {
      const before = enter(node);
      if (before === null || node.kind !== RawBodyNodeKind.Task) return before;
      const child = body.children.get(node.id);
      const access = child === undefined ? accesses.get(node.id) ?? { reads: [], writes: [] } : childAccess(child);
      for (const name of access.reads) if (!declared.has(name) && !before.has(name)) required.add(name);
      const done = child === undefined ? before : completion(child, before, declared, depth + 1);
      return done === null ? null : union([done, new Set(access.writes.filter(name => !declared.has(name)))]);
    };
    const ends = body.nodes.filter(({ kind }) => kind === RawBodyNodeKind.End).map(exit);
    return ends.length === 0 || ends.some(end => end === null) ? null : union(ends as Names[]);
  };
  return completion(root, new Set(), new Set(), 0) === null ? null : [...required].sort(compareCanonicalStrings);
}
