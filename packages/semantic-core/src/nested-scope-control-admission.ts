import { CheckedNodeKind, GatewayDirection } from "./checked-process-contract.js";
import type { CheckedNode, CheckedSequenceFlow } from "./checked-process-contract.js";
import { parallelBodyScans } from "./parallel-body-burst-analysis.js";
import type { ParallelBodyScans } from "./parallel-body-burst-analysis.js";
import { InternalSchedulingMode, SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { semanticProcessClosureLimit } from "./semantic-process-limits.js";
import { ParallelBodyNodeKind as Kind } from "./structured-parallel-body-analysis.js";
import type { ParallelBodyNode } from "./structured-parallel-body-analysis.js";
import { RawBodyNodeKind, contractMergeRegions, multiplicityWeightedExtra } from "./merge-region-admission.js";
import type { MergeRegion, RawBodyNode } from "./merge-region-admission.js";
import type { DefinitionScope } from "./semantic-value-contract.js";

/**
 * NSC-ADMIT-01 for the embedded completion profile, an independent transcription of the Lean `NestedScopeControl`
 * admission. Each definition scope's body is projected to the reviewed structured-body analysis, a Sub-Process
 * appearing in its parent as a task vertex, so contraction, pairing and separate Ends are that owner's. This module
 * adds only the scope tree, the branch condition and the nested burst composition. CEA-ADMIT-01 merge regions are
 * contracted first by the merge-region owner; their target bodies stay in the tree and their bursts are composed here.
 */

/** Definition depth of the deepest admitted Sub-Process body below the root. */
const depthLimit = 3;
/** Concurrent-wait ceiling shared with the parallel Multi-Instance capacity account. */
const userTaskLimit = 128;

type RawBody = Readonly<{
  scope: string;
  nodes: readonly RawBodyNode[];
  /** The child scope of every Sub-Process vertex of this body, merge targets included. */
  children: ReadonlyMap<string, string>;
  userTasks: readonly string[];
}>;

type Body = Omit<RawBody, "nodes"> & Readonly<{ nodes: readonly ParallelBodyNode[]; regions: readonly MergeRegion[] }>;

function contractBodies(raw: ReadonlyMap<string, RawBody> | null): Map<string, Body> | null {
  if (raw === null) return null;
  const bodies = new Map<string, Body>();
  for (const [scope, body] of raw) {
    const contracted = contractMergeRegions(body.nodes, body.children);
    if (contracted === null) return null;
    bodies.set(scope, { ...body, ...contracted });
  }
  return bodies;
}

/** A merge target's body is a serial chain of User Tasks; it owns no Sub-Process, gateway or region. */
function serialTargetBody(body: Body | undefined): body is Body {
  return body !== undefined && body.children.size === 0 && body.regions.length === 0 && body.userTasks.length > 0 &&
    body.nodes.every(({ kind }) => kind === Kind.Start || kind === Kind.End || kind === Kind.Task) &&
    body.nodes.filter(({ kind }) => kind === Kind.Task).length === body.userTasks.length;
}

type Tree = Readonly<{ root: string; bodies: ReadonlyMap<string, Body>; parent: ReadonlyMap<string, Readonly<{ scope: string; vertex: string }>> }>;

/** BPMN 13.4.1: every path from a fork output reaches a task vertex before a join or End can consume it. */
function branchesStartWithWork(nodes: readonly ParallelBodyNode[]): boolean {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const reachesWork = (id: string): boolean => {
    const node = byId.get(id);
    switch (node?.kind) {
      case Kind.Task: return true;
      case Kind.Fork: return node.outputs.every(reachesWork);
      default: return false;
    }
  };
  return nodes.every(node => node.kind !== Kind.Fork || node.outputs.every(reachesWork));
}

/** Validates the scope tree and every body, returning the tree with its per-body scans. */
function analyzeTree(scopes: readonly DefinitionScope[], bodies: ReadonlyMap<string, Body>):
  Readonly<{ tree: Tree; scans: ReadonlyMap<string, ParallelBodyScans> }> | null {
  const roots = scopes.filter(({ parentScopeId }) => parentScopeId === null);
  // Equal sizes alone admit a body in an undeclared scope beside a declared scope without one.
  if (roots.length !== 1 || bodies.size !== scopes.length || !scopes.every(({ id }) => bodies.has(id))) return null;
  const root = roots[0]!.id;
  const parent = new Map<string, Readonly<{ scope: string; vertex: string }>>();
  for (const body of bodies.values()) {
    for (const [vertex, child] of body.children) {
      const declared = scopes.filter(({ id }) => id === child);
      if (declared.length !== 1 || declared[0]!.parentScopeId !== body.scope || parent.has(child)) return null;
      parent.set(child, { scope: body.scope, vertex });
    }
  }
  if (parent.size !== scopes.length - 1 || parent.size === 0) return null;
  // Climbs at most `depthLimit` levels, so a parent cycle that never reaches the root is refused rather than recursed.
  const withinDepth = (scope: string): boolean => {
    let current = scope;
    for (let level = 0; level < depthLimit; level += 1) {
      const owner = parent.get(current);
      if (owner === undefined) return false;
      if (owner.scope === root) return true;
      current = owner.scope;
    }
    return false;
  };
  if (scopes.some(({ id }) => id !== root && !withinDepth(id))) return null;
  const rootBody = bodies.get(root);
  // A terminal fork is admitted only in a child body; the root keeps its single End.
  if (rootBody === undefined || rootBody.nodes.filter(({ kind }) => kind === Kind.End).length !== 1 ||
      rootBody.regions.length > 0) return null;
  const regions = [...bodies.values()].flatMap(({ regions }) => regions);
  if (!regions.every(({ targetScope }) => serialTargetBody(bodies.get(targetScope)))) return null;
  // CEA-ADMIT-01 weights the target body's tasks and those after it once per fork output.
  const weighted = [...bodies.values()].reduce((count, body) => count + body.userTasks.length, 0) +
    regions.reduce((extra, region) => extra + multiplicityWeightedExtra(region, bodies.get(region.targetScope)!.userTasks.length), 0);
  if (weighted > userTaskLimit) return null;
  const scans = new Map<string, ParallelBodyScans>();
  for (const body of bodies.values()) {
    const scan = parallelBodyScans(body.nodes);
    if (scan === undefined || !branchesStartWithWork(body.nodes)) return null;
    scans.set(body.scope, scan);
  }
  return { tree: { root, bodies, parent }, scans };
}

/**
 * The largest automatic closure of any admitted journey, composed over the scope tree. A Sub-Process vertex's own step
 * is `enterScope`; its child's entry scan runs in the same closure. A resumption that leaves its body without a wait
 * may have completed that body, which charges `completeScope` and continues in the parent. Under a terminal fork the
 * body may still be live, so this over-approximates and stays sound without tracking exact quiescence.
 *
 * A merge region's vertex arms like a task, but arming it runs the fork and one arming per branch, so it adds one step
 * per branch. Region tasks resume by CEA-ADMIT-01's per-arrival charges, never summed across arrivals; a resumption
 * that reaches the region's End continues as the region vertex's own resumption, with its completion cascade.
 */
function maximumBurst(tree: Tree, scans: ReadonlyMap<string, ParallelBodyScans>): number {
  const regionAt = (scope: string, vertex: string): MergeRegion | undefined =>
    tree.bodies.get(scope)!.regions.find(region => region.vertex === vertex);
  const childEntries = (scope: string, armed: readonly string[]): number =>
    armed.reduce((total, vertex) => {
      const region = regionAt(scope, vertex);
      if (region !== undefined) return total + region.branches.length;
      const child = tree.bodies.get(scope)!.children.get(vertex);
      return child === undefined ? total : total + entry(child);
    }, 0);
  const entry = (scope: string): number => {
    const scan = scans.get(scope)!.entry;
    return scan.steps + childEntries(scope, scan.armed);
  };
  const resume = (scope: string, vertex: string): number => {
    const scan = scans.get(scope)!.resumptions.get(vertex)!;
    let steps = scan.steps + childEntries(scope, scan.armed);
    if (scan.waits === 0) {
      const owner = tree.parent.get(scope);
      steps += 1 + (owner === undefined ? 0 : resume(owner.scope, owner.vertex));
    }
    return steps;
  };
  // After a region's last target task: its End, `completeScope`, then the first task after the target or the region End.
  const leaveTarget = (scope: string, region: MergeRegion): number =>
    2 + (region.after.length > 0 ? 1 : resume(scope, region.vertex));
  const regionTasks = (scope: string, region: MergeRegion): readonly number[] => {
    const targetTasks = tree.bodies.get(region.targetScope)!.userTasks;
    return [
      ...region.branches.flatMap(branch => branch.map((_, index) => index + 1 < branch.length ? 1 : 3)),
      ...targetTasks.map((_, index) => index + 1 < targetTasks.length ? 1 : leaveTarget(scope, region)),
      ...region.after.map((_, index) => index + 1 < region.after.length ? 1 : resume(scope, region.vertex)),
    ];
  };
  const targets = new Set([...tree.bodies.values()].flatMap(({ regions }) => regions.map(({ targetScope }) => targetScope)));
  // Start applies `initiate` as the closure's first step; a child body's elided Start costs nothing.
  let maximum = 1 + entry(tree.root);
  for (const body of tree.bodies.values()) {
    const inRegion = new Set(body.regions.flatMap(({ branches, after }) => [...branches.flat(), ...after]));
    if (!targets.has(body.scope)) {
      for (const task of body.userTasks) if (!inRegion.has(task)) maximum = Math.max(maximum, resume(body.scope, task));
    }
    for (const region of body.regions) maximum = Math.max(maximum, ...regionTasks(body.scope, region));
  }
  return maximum;
}

function admittedBurst(scopes: readonly DefinitionScope[], raw: ReadonlyMap<string, RawBody> | null): number | null {
  const bodies = contractBodies(raw);
  if (bodies === null) return null;
  const analyzed = analyzeTree(scopes, bodies);
  if (analyzed === null) return null;
  const burst = maximumBurst(analyzed.tree, analyzed.scans);
  return burst <= semanticProcessClosureLimit ? burst : null;
}

function group<T>(values: readonly T[], scopeOf: (value: T) => string | undefined): Map<string, T[]> | null {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const scope = scopeOf(value);
    if (scope === undefined) return null;
    grouped.set(scope, [...grouped.get(scope) ?? [], value]);
  }
  return grouped;
}

export type NestedScopeControlCheckedGraph = Readonly<{
  definitionScopes: readonly DefinitionScope[];
  nodeScopes: readonly Readonly<{ nodeId: string; scopeId: string }>[];
  nodes: readonly CheckedNode[];
  flows: readonly CheckedSequenceFlow[];
}>;

function checkedKind(node: CheckedNode): RawBodyNodeKind | null {
  switch (node.kind) {
    case CheckedNodeKind.NoneStartEvent: return RawBodyNodeKind.Start;
    case CheckedNodeKind.NoneEndEvent: return RawBodyNodeKind.End;
    case CheckedNodeKind.UserTask: return node.metadata === undefined ? RawBodyNodeKind.Task : null;
    case CheckedNodeKind.EmbeddedSubProcess: return RawBodyNodeKind.Task;
    case CheckedNodeKind.ExclusiveMerge: return RawBodyNodeKind.Merge;
    case CheckedNodeKind.ParallelGateway:
      return node.direction === GatewayDirection.Diverging ? RawBodyNodeKind.Fork
        : node.direction === GatewayDirection.Converging ? RawBodyNodeKind.Join : null;
    default: return null;
  }
}

function checkedBodies(graph: NestedScopeControlCheckedGraph): Map<string, RawBody> | null {
  const scopeOf = new Map(graph.nodeScopes.map(({ nodeId, scopeId }) => [nodeId, scopeId]));
  if (scopeOf.size !== graph.nodes.length || graph.flows.some(flow => flow.condition !== null ||
      scopeOf.get(flow.sourceId) === undefined || scopeOf.get(flow.sourceId) !== scopeOf.get(flow.targetId))) return null;
  const grouped = group(graph.nodes, node => scopeOf.get(node.id));
  if (grouped === null) return null;
  const bodies = new Map<string, RawBody>();
  for (const [scope, nodes] of grouped) {
    const vertices: RawBodyNode[] = [];
    const children = new Map<string, string>();
    for (const node of nodes) {
      const kind = checkedKind(node);
      if (kind === null) return null;
      if (node.kind === CheckedNodeKind.EmbeddedSubProcess) children.set(node.id, node.childScopeId);
      vertices.push({ id: node.id, kind, outputs: graph.flows.filter(({ sourceId }) => sourceId === node.id).map(({ targetId }) => targetId) });
    }
    bodies.set(scope, { scope, nodes: vertices, children,
      userTasks: nodes.filter(({ kind }) => kind === CheckedNodeKind.UserTask).map(({ id }) => id) });
  }
  return bodies;
}

/** NSC-ADMIT-01 over the checked graph; `null` refuses it, otherwise the admitted largest closure. */
export function nestedScopeControlCheckedAnalysis(graph: NestedScopeControlCheckedGraph): number | null {
  return admittedBurst(graph.definitionScopes, checkedBodies(graph));
}

function inputsOf(operation: SemanticOperation): readonly string[] {
  switch (operation.kind) {
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.Duplicate:
    case SemanticOperationKind.ReachNoneEnd:
      return [operation.input];
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.MergeExclusive:
      return operation.inputs;
    default:
      return [];
  }
}

/** The lowered child Start is elided; this synthetic vertex stands for the child's entry place. */
const childStart = (scope: string): string => `start:${scope}`;

function programBodies(program: SemanticProcessProgram): Map<string, RawBody> | null {
  const scopeOf = new Map(program.operationScopes.map(({ operationId, scopeId }) => [operationId, scopeId]));
  const completions = program.operations.filter(({ kind }) => kind === SemanticOperationKind.CompleteScope);
  const operations = program.operations.filter(({ kind }) => kind !== SemanticOperationKind.CompleteScope);
  if (scopeOf.size !== program.operations.length || completions.length !== program.definitionScopes.length) return null;
  const consumer = (scope: string, place: string): string | undefined => {
    const matching = operations.filter(operation => inputsOf(operation).includes(place));
    return matching.length === 1 && scopeOf.get(matching[0]!.id) === scope ? matching[0]!.id : undefined;
  };
  const parentOutput = (child: string): string | null | undefined => {
    const matching = completions.filter(operation => operation.kind === SemanticOperationKind.CompleteScope && operation.scopeId === child);
    const [completion] = matching;
    return matching.length === 1 && completion?.kind === SemanticOperationKind.CompleteScope &&
      scopeOf.get(completion.id) === child ? completion.parentOutput : undefined;
  };
  const grouped = group(operations, operation => scopeOf.get(operation.id));
  if (grouped === null) return null;
  const bodies = new Map<string, RawBody>();
  for (const [scope, members] of grouped) {
    const vertices: RawBodyNode[] = [];
    const children = new Map<string, string>();
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
        case SemanticOperationKind.Duplicate: kind = RawBodyNodeKind.Fork; outputs = follow(operation.outputs); break;
        case SemanticOperationKind.Synchronize: kind = RawBodyNodeKind.Join; outputs = follow([operation.output]); break;
        case SemanticOperationKind.MergeExclusive: kind = RawBodyNodeKind.Merge; outputs = follow([operation.output]); break;
        case SemanticOperationKind.ReachNoneEnd: kind = RawBodyNodeKind.End; outputs = []; break;
        case SemanticOperationKind.EnterScope: {
          const output = parentOutput(operation.childScopeId);
          const entry = consumer(operation.childScopeId, operation.childEntry);
          kind = RawBodyNodeKind.Task;
          outputs = output === null || output === undefined || entry === undefined ? null : follow([output]);
          children.set(operation.id, operation.childScopeId);
          break;
        }
        default: return null;
      }
      if (outputs === null) return null;
      vertices.push({ id: operation.id, kind, outputs });
    }
    bodies.set(scope, { scope, nodes: vertices, children,
      userTasks: members.filter(({ kind }) => kind === SemanticOperationKind.AwaitUserTask).map(({ id }) => id) });
  }
  // Child bodies take a synthetic Start in front of the operation their entry place feeds.
  for (const body of [...bodies.values()]) {
    for (const [vertex, child] of body.children) {
      const enter = operations.find(({ id }) => id === vertex);
      const childBody = bodies.get(child);
      if (enter?.kind !== SemanticOperationKind.EnterScope || childBody === undefined) return null;
      const entry = consumer(child, enter.childEntry);
      if (entry === undefined) return null;
      bodies.set(child, { ...childBody, nodes: [{ id: childStart(child), kind: RawBodyNodeKind.Start, outputs: [entry] }, ...childBody.nodes] });
    }
  }
  return bodies;
}

/** NSC-ADMIT-01 over the Program, independent of the checked graph; `null` refuses it. */
export function nestedScopeControlProgramAnalysis(program: SemanticProcessProgram): number | null {
  if (program.identity.sourceOverlay !== null ||
      program.internalSchedulingMode !== InternalSchedulingMode.RejectObservableChoice ||
      program.compensationActivityRetention !== undefined || program.compensationEventSubProcessSnapshots !== undefined ||
      program.compensationExecution !== undefined || program.interruptingMessageEventSubProcesses !== undefined ||
      program.scopeLocalData !== undefined) return null;
  const root = program.definitionScopes.find(({ parentScopeId }) => parentScopeId === null);
  const rootCompletion = program.operations.filter(operation =>
    operation.kind === SemanticOperationKind.CompleteScope && operation.scopeId === root?.id && operation.parentOutput === null);
  return rootCompletion.length === 1 ? admittedBurst(program.definitionScopes, programBodies(program)) : null;
}

const programOperationKinds: ReadonlySet<SemanticOperationKind> = new Set([
  SemanticOperationKind.Initiate, SemanticOperationKind.EnterScope, SemanticOperationKind.AwaitUserTask,
  SemanticOperationKind.Duplicate, SemanticOperationKind.Synchronize, SemanticOperationKind.ReachNoneEnd,
  SemanticOperationKind.CompleteScope, SemanticOperationKind.MergeExclusive,
]);

const checkedNodeKinds: ReadonlySet<CheckedNodeKind> = new Set([
  CheckedNodeKind.NoneStartEvent, CheckedNodeKind.EmbeddedSubProcess, CheckedNodeKind.UserTask,
  CheckedNodeKind.ParallelGateway, CheckedNodeKind.NoneEndEvent, CheckedNodeKind.ExclusiveMerge,
]);

/** The operation alphabet and the lower scope bound; the analyses above bound depth, tasks and bursts. */
export function nestedScopeControlProgramShape(operations: readonly SemanticOperation[], scopeCount: number): boolean {
  return scopeCount >= 2 && operations.every(({ kind }) => programOperationKinds.has(kind));
}

export function nestedScopeControlCheckedShape(nodes: readonly CheckedNode[], scopeCount: number): boolean {
  return scopeCount >= 2 && nodes.every(({ kind }) => checkedNodeKinds.has(kind));
}
