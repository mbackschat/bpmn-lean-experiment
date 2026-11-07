/**
 * The Program projection of the nested scope-control analysis (NSC-ADMIT-01): each definition scope's operations as the
 * raw structured body that `nested-scope-control-admission.ts` contracts and composes, the checked projection's twin.
 * The Lean twin is the Program half of `NestedScopeControlAdmission`.
 */
import { activityHostSettledProjection, settledOperation } from "./activity-host-work.js";
import { sameCallDataInterface } from "./call-data-admission.js";
import { CallDataKind } from "./call-data-contract.js";
import type { ScopeDataAccess } from "./concurrent-scope-data-availability.js";
import { RawBodyNodeKind } from "./merge-region-admission.js";
import type { RawBodyNode } from "./merge-region-admission.js";
import { accessOf, admittedServiceTask, callAccess, callDataAdmitted } from "./nested-scope-control-vertex-data.js";
import type { ModelData } from "./nested-scope-control-vertex-data.js";
import { ScopeWorkKind, SemanticOperationKind } from "./semantic-process-contract.js";
import type { ReturnProcessOperation, SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";

export type RawBody = Readonly<{
  scope: string;
  nodes: readonly RawBodyNode[];
  /** The child scope of every Sub-Process vertex of this body, merge targets included. */
  children: ReadonlyMap<string, string>;
  /** The called Process root scope of every Call vertex of this body. */
  calls: ReadonlyMap<string, string>;
  /** The Call vertices of `calls` that carry variable mappings. */
  mapped: ReadonlySet<string>;
  /** User and Service Task vertices; Service Tasks are also listed in `serviceTasks`. */
  tasks: readonly string[];
  serviceTasks: readonly string[];
  /** The reads and writes of each mapped Service Task and mapped Call vertex; empty in a data-free model. */
  accesses: ReadonlyMap<string, ScopeDataAccess>;
}>;

export function group<T>(values: readonly T[], scopeOf: (value: T) => string | undefined): Map<string, T[]> | null {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const scope = scopeOf(value);
    if (scope === undefined) return null;
    grouped.set(scope, [...grouped.get(scope) ?? [], value]);
  }
  return grouped;
}

function inputsOf(operation: SemanticOperation): readonly string[] {
  switch (operation.kind) {
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.InvokeProcess:
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitEffect:
    case SemanticOperationKind.Duplicate:
    case SemanticOperationKind.ReachNoneEnd:
      return [operation.input];
    case SemanticOperationKind.SelectMany:
      return [operation.input];
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.SynchronizeSelected:
    case SemanticOperationKind.MergeExclusive:
    case SemanticOperationKind.Activity:
    case SemanticOperationKind.Scope:
      return operation.inputs;
    // An exit fires on its scope's completion and consumes no place (SCPH-HOST-01).
    case SemanticOperationKind.ScopeExit:
    default:
      return [];
  }
}

/** The lowered child Start is elided; this synthetic vertex stands for the child's entry place. */
const childStart = (scope: string): string => `start:${scope}`;

export function programBodies(program: SemanticProcessProgram, data: ModelData | null, structured: boolean): Map<string, RawBody> | null {
  const scopeOf = new Map(program.operationScopes.map(({ operationId, scopeId }) => [operationId, scopeId]));
  const completions = program.operations.filter(({ kind }) =>
    kind === SemanticOperationKind.CompleteScope || kind === SemanticOperationKind.ScopeExit);
  const returns = program.operations.filter((operation): operation is ReturnProcessOperation =>
    operation.kind === SemanticOperationKind.ReturnProcess);
  const operations = program.operations.filter(({ kind }) => kind !== SemanticOperationKind.CompleteScope &&
    kind !== SemanticOperationKind.ScopeExit && kind !== SemanticOperationKind.ReturnProcess);
  // A called root completes by its returns, one per Call naming it, so it has no `completeScope`.
  const calledRoots = new Set(returns.map(({ calledRootScopeId }) => calledRootScopeId));
  if (scopeOf.size !== program.operations.length ||
      completions.length !== program.definitionScopes.length - calledRoots.size ||
      !returns.every(({ id, calledRootScopeId }) => scopeOf.get(id) === calledRootScopeId)) return null;
  const consumer = (scope: string, place: string): string | undefined => {
    const matching = operations.filter(operation => inputsOf(operation).includes(place));
    return matching.length === 1 && scopeOf.get(matching[0]!.id) === scope ? matching[0]!.id : undefined;
  };
  // SCPH-EXIT-01: a child completes onto one parent output, or onto every output of its exit.
  const parentOutputs = (child: string): readonly string[] | undefined => {
    const matching = completions.filter(operation => (operation.kind === SemanticOperationKind.CompleteScope ||
      operation.kind === SemanticOperationKind.ScopeExit) && operation.scopeId === child);
    const [completion] = matching;
    if (matching.length !== 1 || completion === undefined || scopeOf.get(completion.id) !== child) return undefined;
    return completion.kind === SemanticOperationKind.ScopeExit ? completion.outputs.map(({ place }) => place)
      : completion.kind === SemanticOperationKind.CompleteScope && completion.parentOutput !== null ? [completion.parentOutput]
        : undefined;
  };
  // SCPH-START-01: a child is entered onto its legacy entry place, or onto every entry of its host.
  const childEntries = (operation: SemanticOperation | undefined): readonly string[] | undefined =>
    operation?.kind === SemanticOperationKind.EnterScope ? [operation.childEntry]
      : operation?.kind === SemanticOperationKind.Scope && operation.work.kind === ScopeWorkKind.SubProcess
        ? operation.entries.map(({ place }) => place) : undefined;
  const grouped = group(operations, operation => scopeOf.get(operation.id));
  if (grouped === null) return null;
  const bodies = new Map<string, RawBody>();
  for (const [scope, members] of grouped) {
    const vertices: RawBodyNode[] = [];
    const children = new Map<string, string>();
    const calls = new Map<string, string>();
    const mapped = new Set<string>();
    const accesses = new Map<string, ScopeDataAccess>();
    const follow = (places: readonly string[]): string[] | null => {
      const targets = places.map(place => consumer(scope, place));
      return targets.every(target => target !== undefined) ? targets as string[] : null;
    };
    for (const operation of members) {
      let kind: RawBodyNodeKind;
      let outputs: string[] | null;
      switch (operation.kind) {
        case SemanticOperationKind.Initiate: kind = RawBodyNodeKind.Start; outputs = follow([operation.output]); break;
        case SemanticOperationKind.AwaitUserTask:
          kind = RawBodyNodeKind.Task; outputs = operation.task.metadata === undefined ? follow([operation.output]) : null; break;
        case SemanticOperationKind.AwaitEffect:
          kind = RawBodyNodeKind.Task;
          outputs = admittedServiceTask(operation.effect, operation.bpmnErrorRoute, data) ? follow([operation.output]) : null;
          accesses.set(operation.id, accessOf(operation.effect));
          break;
        case SemanticOperationKind.Duplicate: kind = RawBodyNodeKind.Fork; outputs = follow(operation.outputs); break;
        case SemanticOperationKind.Synchronize: kind = RawBodyNodeKind.Join; outputs = follow([operation.output]); break;
        case SemanticOperationKind.SelectMany:
          kind = RawBodyNodeKind.Fork;
          outputs = structured ? follow([...operation.candidates.map(({ output }) => output),
            ...(operation.defaultBranch === undefined ? [] : [operation.defaultBranch.output])]) : null;
          break;
        case SemanticOperationKind.SynchronizeSelected:
          kind = RawBodyNodeKind.Join; outputs = structured ? follow([operation.output]) : null; break;
        case SemanticOperationKind.MergeExclusive:
          // PTPB-ADMIT-01: under the nested scope-data profile a one-input merge is a lowered pass-through Task.
          kind = structured && operation.inputs.length === 1 ? RawBodyNodeKind.Pass : RawBodyNodeKind.Merge;
          outputs = follow([operation.output]);
          break;
        case SemanticOperationKind.ReachNoneEnd: kind = RawBodyNodeKind.End; outputs = []; break;
        case SemanticOperationKind.EnterScope: {
          const output = parentOutputs(operation.childScopeId);
          const entry = consumer(operation.childScopeId, operation.childEntry);
          kind = RawBodyNodeKind.Task;
          outputs = output === undefined || entry === undefined ? null : follow(output);
          children.set(operation.id, operation.childScopeId);
          break;
        }
        // SCPH-ADMIT-01: a `process` host is the root Start over its entries; a `subProcess` host is a Sub-Process
        // vertex whose child body starts on its entries.
        case SemanticOperationKind.Scope:
          if (operation.work.kind === ScopeWorkKind.Process) {
            kind = RawBodyNodeKind.Start;
            outputs = follow(operation.entries.map(({ place }) => place));
          } else {
            const output = parentOutputs(operation.work.childScopeId);
            kind = RawBodyNodeKind.Task;
            outputs = output === undefined ? null : follow(output);
            children.set(operation.id, operation.work.childScopeId);
          }
          break;
        case SemanticOperationKind.InvokeProcess: {
          const returned = returns.filter(({ id }) => id === operation.returnOperationId);
          kind = RawBodyNodeKind.Task;
          // The return carries the invocation's own mappings, so CVM-OUT-01 reads exactly what this Call declares.
          outputs = returned.length !== 1 || returned[0]!.calledRootScopeId !== operation.calledRootScopeId ||
              returned[0]!.calledProcessId !== operation.calledProcessId || !callDataAdmitted(operation.data, data) ||
              !sameCallDataInterface(operation.data, returned[0]!.data) ||
              consumer(operation.calledRootScopeId, operation.calledEntry) === undefined
            ? null : follow([returned[0]!.callerOutput]);
          calls.set(operation.id, operation.calledRootScopeId);
          if (operation.data.kind === CallDataKind.VariableMappings) {
            mapped.add(operation.id);
            accesses.set(operation.id, callAccess(operation.data));
          }
          break;
        }
        // ACTH-ADMIT-01: a merging host belongs to the re-entry account, never to a concurrent body. ACSP-ADMIT-01: a
        // splitting host is its work's task vertex with every output's consumer a successor.
        case SemanticOperationKind.Activity: {
          const work = activityHostSettledProjection(operation);
          kind = RawBodyNodeKind.Task;
          outputs = operation.inputs.length !== 1 || work === null ? null
            : work.kind === SemanticOperationKind.AwaitUserTask
              ? (work.task.metadata === undefined ? follow(operation.outputs.map(({ place }) => place)) : null)
              : (admittedServiceTask(work.effect, null, data) ? follow(operation.outputs.map(({ place }) => place)) : null);
          if (work?.kind === SemanticOperationKind.AwaitEffect) accesses.set(operation.id, accessOf(work.effect));
          break;
        }
        default: return null;
      }
      if (outputs === null) return null;
      vertices.push({ id: operation.id, kind, outputs });
    }
    // ACSP-ADMIT-01: a host counts as its work's kind, so the Task and Service Task bounds see it.
    const workKind = (member: SemanticOperation) => settledOperation(member)?.kind;
    const serviceTasks = members.filter(member => workKind(member) === SemanticOperationKind.AwaitEffect).map(({ id }) => id);
    bodies.set(scope, { scope, nodes: vertices, children, calls, mapped, serviceTasks, accesses,
      tasks: [...members.filter(member => workKind(member) === SemanticOperationKind.AwaitUserTask).map(({ id }) => id),
        ...serviceTasks] });
  }
  // Every return pairs with exactly one invocation, so no called root completes without a caller to continue.
  const invokes = operations.filter(({ kind }) => kind === SemanticOperationKind.InvokeProcess);
  if (!returns.every(({ id }) => invokes.filter(operation =>
    operation.kind === SemanticOperationKind.InvokeProcess && operation.returnOperationId === id).length === 1)) return null;
  // Child bodies take a synthetic Start in front of the operation their entry place feeds.
  for (const body of [...bodies.values()]) {
    for (const [vertex, child] of body.children) {
      const entries = childEntries(operations.find(({ id }) => id === vertex));
      const childBody = bodies.get(child);
      const entry = entries?.map(place => consumer(child, place));
      if (childBody === undefined || entry === undefined || !entry.every(target => target !== undefined)) return null;
      bodies.set(child, { ...childBody, nodes: [{ id: childStart(child), kind: RawBodyNodeKind.Start, outputs: entry as string[] }, ...childBody.nodes] });
    }
  }
  // A called root takes its synthetic Start once, however many Calls name it; they must agree on its entry place.
  for (const root of calledRoots) {
    const entries = new Set(invokes.flatMap(operation => operation.kind === SemanticOperationKind.InvokeProcess &&
      operation.calledRootScopeId === root ? [operation.calledEntry] : []));
    const calledBody = bodies.get(root);
    const entry = entries.size === 1 ? consumer(root, [...entries][0]!) : undefined;
    if (calledBody === undefined || entry === undefined) return null;
    bodies.set(root, { ...calledBody, nodes: [{ id: childStart(root), kind: RawBodyNodeKind.Start, outputs: [entry] }, ...calledBody.nodes] });
  }
  return bodies;
}
