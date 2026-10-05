import { InternalSchedulingMode, SemanticOperationKind as Op } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { isWellFormedSemanticProcessGraph } from "./semantic-process-graph-admission.js";
import { ParallelBodyNodeKind as Kind } from "./structured-parallel-body-analysis.js";
import type { ParallelBodyNode } from "./structured-parallel-body-analysis.js";

export type RepeatedScopeEntryKind = Op.EnterSequentialMultiInstanceScope | Op.EnterParallelMultiInstanceScope;

function bodyGraph(operations: readonly SemanticOperation[], entryId: string, childEntry: string, entryKind: RepeatedScopeEntryKind): ParallelBodyNode[] | undefined {
  const consumers = new Map<string, string>();
  const vertices: Array<{ id: string; kind: Kind; places: readonly string[] }> = [];
  for (const operation of operations) {
    let kind: Kind;
    let places: readonly string[];
    switch (operation.kind) {
      case Op.CompleteSequentialMultiInstanceScope:
        if (entryKind !== Op.EnterSequentialMultiInstanceScope) return undefined;
        continue;
      case Op.CompleteParallelMultiInstanceScope:
        if (entryKind !== Op.EnterParallelMultiInstanceScope) return undefined;
        continue;
      case Op.AwaitUserTask: kind = Kind.Task; places = [operation.output]; break;
      case Op.AwaitEffect:
        if (operation.bpmnErrorRoute !== null) return undefined;
        kind = Kind.Task; places = [operation.output]; break;
      case Op.Duplicate: kind = Kind.Fork; places = operation.outputs; break;
      case Op.Synchronize: kind = Kind.Join; places = [operation.output]; break;
      case Op.ReachNoneEnd: kind = Kind.End; places = []; break;
      default: return undefined;
    }
    const inputs = operation.kind === Op.Synchronize ? operation.inputs : [operation.input];
    for (const input of inputs) {
      if (consumers.has(input)) return undefined;
      consumers.set(input, operation.id);
    }
    vertices.push({ id: operation.id, kind, places });
  }
  const first = consumers.get(childEntry);
  if (first === undefined) return undefined;
  // SMIS-ADMIT-01 elides the child Start in IL; the distinct parent entry supplies its analysis identity.
  const nodes: ParallelBodyNode[] = [{ id: entryId, kind: Kind.Start, outputs: [first] }];
  for (const vertex of vertices) {
    const outputs: string[] = [];
    for (const place of vertex.places) {
      const target = consumers.get(place);
      if (target === undefined) return undefined;
      outputs.push(target);
    }
    nodes.push({ id: vertex.id, kind: vertex.kind, outputs });
  }
  return nodes;
}

function parentWaits(operations: readonly SemanticOperation[], entryId: string, entryKind: RepeatedScopeEntryKind): { before: number; after: number } | undefined {
  const starts = operations.filter(operation => operation.kind === Op.Initiate);
  const completions = operations.filter(operation => operation.kind === Op.CompleteScope);
  const start = starts[0];
  if (starts.length !== 1 || start === undefined || completions.length !== 1 || completions[0]!.parentOutput !== null) return undefined;
  const consumers = new Map<string, SemanticOperation>();
  for (const operation of operations) {
    switch (operation.kind) {
      case Op.Initiate:
      case Op.CompleteScope: continue;
      case Op.AwaitEffect:
        if (operation.bpmnErrorRoute !== null) return undefined;
        break;
      case Op.AwaitUserTask:
      case Op.EnterSequentialMultiInstanceScope:
      case Op.EnterParallelMultiInstanceScope:
      case Op.ReachNoneEnd: break;
      default: return undefined;
    }
    if (consumers.has(operation.input)) return undefined;
    consumers.set(operation.input, operation);
  }
  const visited = new Set([start.id, completions[0]!.id]);
  let next = start.output;
  let entered = false;
  let before = 0;
  let after = 0;
  for (;;) {
    const operation = consumers.get(next);
    if (operation === undefined || visited.has(operation.id)) return undefined;
    visited.add(operation.id);
    switch (operation.kind) {
      case Op.EnterSequentialMultiInstanceScope:
      case Op.EnterParallelMultiInstanceScope:
        if (operation.kind !== entryKind || entered || operation.id !== entryId) return undefined;
        entered = true;
        next = operation.normalOutput;
        break;
      case Op.AwaitUserTask:
      case Op.AwaitEffect:
        if (entered) after++; else before++;
        next = operation.output;
        break;
      case Op.ReachNoneEnd:
        return entered && visited.size === operations.length ? { before, after } : undefined;
      default: return undefined;
    }
  }
}

/** Repeated bodies share scoped topology, but their execution capacity is selected separately by mode. */
export function analyzeRepeatedScopeStructure(program: SemanticProcessProgram, profile: string, entryKind: RepeatedScopeEntryKind) {
  if (program.identity.semanticProfile !== profile ||
      program.internalSchedulingMode !== InternalSchedulingMode.RejectObservableChoice || program.definitionScopes.length !== 2 ||
      program.compensationActivityRetention !== undefined || program.compensationEventSubProcessSnapshots !== undefined ||
      program.compensationExecution !== undefined || program.interruptingMessageEventSubProcesses !== undefined) return undefined;
  const entries = program.operations.filter(operation => (operation.kind === Op.EnterSequentialMultiInstanceScope || operation.kind === Op.EnterParallelMultiInstanceScope)).filter(operation => operation.kind === entryKind);
  const entry = entries[0];
  const root = program.definitionScopes.find(scope => scope.parentScopeId === null);
  if (entries.length !== 1 || entry === undefined || root === undefined ||
      !program.definitionScopes.some(scope => scope.id === entry.childScopeId && scope.parentScopeId === root.id) ||
      !isWellFormedSemanticProcessGraph({ semanticProfile: program.identity.semanticProfile, processId: program.processId,
        definitionScopes: program.definitionScopes, operationScopes: program.operationScopes,
        controlPlaceScopes: program.controlPlaceScopes, controlPlaceIds: program.controlPlaces.map(({ id }) => id), operations: program.operations })) return undefined;
  const owners = new Map(program.operationScopes.map(owner => [owner.operationId, owner.scopeId]));
  if (owners.get(entry.id) !== root.id) return undefined;
  const parent = parentWaits(program.operations.filter(operation => owners.get(operation.id) === root.id), entry.id, entryKind);
  const body = bodyGraph(program.operations.filter(operation => owners.get(operation.id) === entry.childScopeId), entry.id, entry.childEntry, entryKind);
  if (parent === undefined || body === undefined) return undefined;
  return { entryOperationId: entry.id, childScopeId: entry.childScopeId, parent, body };
}
