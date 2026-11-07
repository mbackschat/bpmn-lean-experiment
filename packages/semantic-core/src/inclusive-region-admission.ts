/**
 * IGR-ADMIT-01 conditions 2 to 6 and IGR-BIND-01: what the shared nested analysis cannot see about root Inclusive
 * regions of the nested scope-data profile. The analysis projects a split as a fork and its join as a join, so it
 * already admits the region's structure, depth and burst; this leaf checks the kind of each paired vertex, root-only
 * placement with at most one live region, the outputs and default rule, the strict cut, the Call exclusion and, at the Program level, every
 * branch's expected join input. Owner: the [Inclusive regions specification](../../../docs/capsules/INCLUSIVE-GATEWAY-REGIONS-SPEC.md#admission).
 */
import { checkedNodeMerges, checkedNodeSplits } from "./checked-pass-through-flow.js";
import { CheckedNodeKind, GatewayDirection } from "./checked-process-contract.js";
import type { CheckedNode, CheckedSequenceFlow } from "./checked-process-contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import type { CheckedProcess } from "./checked-process-contract.js";
import { SimpleBooleanExpressionKind } from "./semantic-value-contract.js";
import type { SimpleBooleanExpression } from "./semantic-value-contract.js";

export enum RegionVertexKind {
  Start = "start",
  Work = "work",
  Pass = "pass",
  Fork = "fork",
  Join = "join",
  Split = "split",
  InclusiveJoin = "inclusiveJoin",
  End = "end",
  Call = "call",
  Other = "other",
}

/** How a split output is gated: by a condition that can be false, always (absent or literal `true`), or as default. */
export enum RegionGuard {
  Conditioned = "conditioned",
  Always = "always",
  Default = "default",
}

/** One Sequence Flow or control place; `expectedJoinInput` is the Program's recorded value on a split output. */
export type RegionEdge = Readonly<{ id: string; target: string; guard?: RegionGuard; expectedJoinInput?: string }>;

/** `pairing` is the split a join names: its `pairedGatewayId` or `selectionKey`. */
export type RegionVertex = Readonly<{
  id: string; kind: RegionVertexKind; scope: string; outputs: readonly RegionEdge[]; pairing?: string;
  inputs: readonly string[];
}>;

export type RegionGraph = Readonly<{ root: string; vertices: ReadonlyMap<string, RegionVertex> }>;

/**
 * The walk of IGR-BIND-01 from one branch edge: a serial vertex passes to its sole output, a nested Parallel or Inclusive
 * split to its paired join's output, and the walk stops at the edge into the first join it meets, which is the input of
 * the branch's own paired join. `undefined` when the branch ends, forks unevenly or leaves the structured form.
 */
export function regionBranchEnd(graph: RegionGraph, edge: RegionEdge, depth = graph.vertices.size): RegionEdge | undefined {
  let current = edge;
  for (let fuel = graph.vertices.size + 1; fuel > 0 && depth > 0; fuel -= 1) {
    const vertex = graph.vertices.get(current.target);
    switch (vertex?.kind) {
      case RegionVertexKind.Work:
      case RegionVertexKind.Pass:
      case RegionVertexKind.Call: {
        if (vertex.outputs.length !== 1) return undefined;
        current = vertex.outputs[0]!;
        break;
      }
      case RegionVertexKind.Fork:
      case RegionVertexKind.Split: {
        const join = pairedJoin(graph, vertex, depth - 1);
        if (join === undefined || join.outputs.length !== 1) return undefined;
        current = join.outputs[0]!;
        break;
      }
      case RegionVertexKind.Join:
      case RegionVertexKind.InclusiveJoin: return current;
      default: return undefined;
    }
  }
  return undefined;
}

/** The join every output of a fork or split reaches, when they all reach the same one through distinct inputs. */
export function regionPairedJoin(graph: RegionGraph, split: RegionVertex): RegionVertex | undefined {
  return pairedJoin(graph, split);
}

function pairedJoin(graph: RegionGraph, split: RegionVertex, depth = graph.vertices.size): RegionVertex | undefined {
  const ends = split.outputs.map(output => regionBranchEnd(graph, output, depth));
  const target = ends[0]?.target;
  const join = target === undefined ? undefined : graph.vertices.get(target);
  return join !== undefined && ends.every(end => end !== undefined && end.target === target) &&
    new Set(ends.map(end => end!.id)).size === ends.length && join.inputs.length === ends.length &&
    ends.every(end => join.inputs.includes(end!.id)) ? join : undefined;
}

/** Condition 4, the strict cut: every path from the edge reaches a User Task, Service Task or Sub-Process first. */
function arms(graph: RegionGraph, edge: RegionEdge, fuel: number): boolean {
  const vertex = graph.vertices.get(edge.target);
  if (fuel <= 0 || vertex === undefined) return false;
  switch (vertex.kind) {
    case RegionVertexKind.Work: return true;
    case RegionVertexKind.Pass: return vertex.outputs.length === 1 && arms(graph, vertex.outputs[0]!, fuel - 1);
    case RegionVertexKind.Fork:
    case RegionVertexKind.Split: return vertex.outputs.every(output => arms(graph, output, fuel - 1));
    default: return false;
  }
}

/**
 * Condition 2's outermost rule: whether the branch from the edge holds an Inclusive split before its own join. A region
 * nested in a region creates two live selection records under one owner, which no Lean, Temporal or CIB witness of this
 * family exercises (closure review of `60786474`, finding 5); a Parallel block on the branch is searched through to its join.
 * Exhausted fuel counts as nesting, so the check fails closed.
 */
function nestsSplit(graph: RegionGraph, edge: RegionEdge, fuel: number): boolean {
  const vertex = graph.vertices.get(edge.target);
  if (fuel <= 0) return true;
  if (vertex === undefined) return false;
  switch (vertex.kind) {
    case RegionVertexKind.Split: return true;
    case RegionVertexKind.Work:
    case RegionVertexKind.Pass:
    case RegionVertexKind.Call: return vertex.outputs.some(output => nestsSplit(graph, output, fuel - 1));
    case RegionVertexKind.Fork: {
      const join = pairedJoin(graph, vertex);
      return vertex.outputs.some(output => nestsSplit(graph, output, fuel - 1)) ||
        (join?.outputs ?? []).some(output => nestsSplit(graph, output, fuel - 1));
    }
    default: return false;
  }
}

/** Condition 3: two or more outputs, at most one default, and a selection that is never empty and reaches its default. */
function guardsAdmitted(outputs: readonly RegionEdge[]): boolean {
  const defaults = outputs.filter(({ guard }) => guard === RegionGuard.Default).length;
  const always = outputs.some(({ guard }) => guard === RegionGuard.Always);
  return outputs.length >= 2 && new Set(outputs.map(({ id }) => id)).size === outputs.length && defaults <= 1 &&
    (defaults === 1 ? !always : always);
}

/** Conditions 2 to 5 over one projected graph, and condition 6 when `program` asks for the expected join inputs. */
export function inclusiveRegionsAdmitted(graph: RegionGraph, program: boolean): boolean {
  const vertices = [...graph.vertices.values()];
  const splits = vertices.filter(({ kind }) => kind === RegionVertexKind.Split);
  if (splits.length === 0 && !vertices.some(({ kind }) => kind === RegionVertexKind.InclusiveJoin)) return true;
  const paired = new Set<string>();
  for (const split of splits) {
    const join = pairedJoin(graph, split);
    if (split.scope !== graph.root || join?.kind !== RegionVertexKind.InclusiveJoin || join.pairing !== split.id ||
        !guardsAdmitted(split.outputs) || !split.outputs.every(output => arms(graph, output, graph.vertices.size)) ||
        split.outputs.some(output => nestsSplit(graph, output, graph.vertices.size)) ||
        (program && !split.outputs.every(output => output.expectedJoinInput === regionBranchEnd(graph, output)?.id))) {
      return false;
    }
    paired.add(join.id);
  }
  return vertices.every(vertex =>
    // A terminal fork pairs with no join; a fork that does pairs with a Parallel join (condition 2). At most one branch
    // of a fork holds a region, so that no two selection records are live at once (closure audit of `50790a59`).
    (vertex.kind !== RegionVertexKind.Fork || pairedJoin(graph, vertex)?.kind !== RegionVertexKind.InclusiveJoin) &&
    (vertex.kind !== RegionVertexKind.Fork ||
      vertex.outputs.filter(output => nestsSplit(graph, output, graph.vertices.size)).length <= 1) &&
    (vertex.kind !== RegionVertexKind.InclusiveJoin || paired.has(vertex.id)) &&
    vertex.kind !== RegionVertexKind.Call);
}

function isAlwaysTrue(condition: SimpleBooleanExpression): boolean {
  return condition.kind === SimpleBooleanExpressionKind.Literal && condition.value;
}

/** PTSM-ADMIT-01: a several-flow pass-through node is classified as its lowered `duplicate` or many-input merge is. */
function checkedVertexKind(node: CheckedNode, flows: readonly CheckedSequenceFlow[]): RegionVertexKind {
  if (checkedNodeSplits(node, flows)) return RegionVertexKind.Fork;
  if (checkedNodeMerges(node, flows)) return RegionVertexKind.Other;
  switch (node.kind) {
    case CheckedNodeKind.NoneStartEvent: return RegionVertexKind.Start;
    case CheckedNodeKind.UserTask:
    case CheckedNodeKind.ServiceTask:
    case CheckedNodeKind.EmbeddedSubProcess: return RegionVertexKind.Work;
    case CheckedNodeKind.NonOperationalTask:
    case CheckedNodeKind.NoneIntermediateThrowEvent: return RegionVertexKind.Pass;
    case CheckedNodeKind.ParallelGateway:
      return node.direction === GatewayDirection.Diverging ? RegionVertexKind.Fork : RegionVertexKind.Join;
    case CheckedNodeKind.InclusiveGateway:
      return node.direction === GatewayDirection.Diverging ? RegionVertexKind.Split : RegionVertexKind.InclusiveJoin;
    case CheckedNodeKind.NoneEndEvent: return RegionVertexKind.End;
    case CheckedNodeKind.CallActivity: return RegionVertexKind.Call;
    default: return RegionVertexKind.Other;
  }
}

/**
 * The checked graph as a region graph. An absent condition and the literal `true` are both always true (CIB-INT-0005),
 * so both levels classify a guard alike: the Program lowers an absent condition to that literal, and Simple Boolean v1
 * parses exactly the body `true` to it.
 */
export function checkedRegionGraph(source: Readonly<{
  definitionScopes: CheckedProcess["definitionScopes"]; nodeScopes: CheckedProcess["nodeScopes"];
  nodes: readonly CheckedNode[]; sequenceFlows: readonly CheckedSequenceFlow[];
}>): RegionGraph {
  // A graph with a called Process holds a Call, which condition 5 refuses beside a split, so one root is the caller's.
  const roots = source.definitionScopes.filter(({ parentScopeId }) => parentScopeId === null);
  const root = roots.length === 1 ? roots[0]!.id : "";
  const scopeOf = new Map(source.nodeScopes.map(({ nodeId, scopeId }) => [nodeId, scopeId]));
  const vertices = new Map(source.nodes.map(node => {
    const defaultFlowId = node.kind === CheckedNodeKind.InclusiveGateway && node.direction === GatewayDirection.Diverging
      ? node.defaultFlowId : undefined;
    const outputs = source.sequenceFlows.filter(({ sourceId }) => sourceId === node.id).map(flow => ({
      id: flow.id, target: flow.targetId,
      guard: flow.id === defaultFlowId ? RegionGuard.Default
        : flow.condition === null || flow.condition.body === "true" ? RegionGuard.Always : RegionGuard.Conditioned,
    }));
    const pairing = node.kind === CheckedNodeKind.InclusiveGateway && node.direction === GatewayDirection.Converging
      ? { pairing: node.pairedGatewayId } : {};
    return [node.id, { id: node.id, kind: checkedVertexKind(node, source.sequenceFlows), scope: scopeOf.get(node.id) ?? "", outputs, ...pairing,
      inputs: source.sequenceFlows.filter(({ targetId }) => targetId === node.id).map(({ id }) => id) }];
  }));
  return { root, vertices };
}

function programVertexKind(operation: SemanticOperation): RegionVertexKind {
  switch (operation.kind) {
    case SemanticOperationKind.Initiate: return RegionVertexKind.Start;
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitEffect:
    case SemanticOperationKind.EnterScope: return RegionVertexKind.Work;
    case SemanticOperationKind.MergeExclusive:
      return operation.inputs.length === 1 ? RegionVertexKind.Pass : RegionVertexKind.Other;
    case SemanticOperationKind.Duplicate: return RegionVertexKind.Fork;
    case SemanticOperationKind.Synchronize: return RegionVertexKind.Join;
    case SemanticOperationKind.SelectMany: return RegionVertexKind.Split;
    case SemanticOperationKind.SynchronizeSelected: return RegionVertexKind.InclusiveJoin;
    case SemanticOperationKind.ReachNoneEnd: return RegionVertexKind.End;
    case SemanticOperationKind.InvokeProcess: return RegionVertexKind.Call;
    // ACTH-ADMIT-01: a merging Task belongs to the re-entry account, which no Inclusive region shares.
    case SemanticOperationKind.Activity: return RegionVertexKind.Other;
    default: return RegionVertexKind.Other;
  }
}

function programInputs(operation: SemanticOperation): readonly string[] {
  switch (operation.kind) {
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.SynchronizeSelected:
    case SemanticOperationKind.MergeExclusive: return operation.inputs;
    default: return "input" in operation && typeof operation.input === "string" ? [operation.input] : [];
  }
}

/** The Program's own control places as a region graph; a Sub-Process continues at its completion's parent output. */
export function programRegionGraph(program: SemanticProcessProgram): RegionGraph {
  const root = program.definitionScopes.find(({ parentScopeId, originElementId }) =>
    parentScopeId === null && originElementId === program.processId)?.id ?? "";
  const scopeOf = new Map(program.operationScopes.map(({ operationId, scopeId }) => [operationId, scopeId]));
  const operations = program.operations.filter(({ kind }) =>
    kind !== SemanticOperationKind.CompleteScope && kind !== SemanticOperationKind.ReturnProcess);
  const consumer = (place: string): string => {
    const matching = operations.filter(operation => programInputs(operation).includes(place));
    return matching.length === 1 ? matching[0]!.id : "";
  };
  const edge = (place: string, extra: Omit<RegionEdge, "id" | "target"> = {}): RegionEdge =>
    ({ id: place, target: consumer(place), ...extra });
  const outputs = (operation: SemanticOperation): readonly RegionEdge[] => {
    switch (operation.kind) {
      case SemanticOperationKind.SelectMany: return [
        ...operation.candidates.map(({ output, expectedJoinInput, condition }) =>
          edge(output, { guard: isAlwaysTrue(condition) ? RegionGuard.Always : RegionGuard.Conditioned, expectedJoinInput })),
        ...(operation.defaultBranch === undefined ? [] : [edge(operation.defaultBranch.output,
          { guard: RegionGuard.Default, expectedJoinInput: operation.defaultBranch.expectedJoinInput })]),
      ];
      case SemanticOperationKind.Duplicate: return operation.outputs.map(place => edge(place));
      case SemanticOperationKind.EnterScope: {
        const completions = program.operations.filter(candidate =>
          candidate.kind === SemanticOperationKind.CompleteScope && candidate.scopeId === operation.childScopeId);
        const completion = completions.length === 1 ? completions[0] : undefined;
        return completion?.kind === SemanticOperationKind.CompleteScope && completion.parentOutput !== null
          ? [edge(completion.parentOutput)] : [];
      }
      case SemanticOperationKind.InvokeProcess: return [];
      default: return "output" in operation && typeof operation.output === "string" ? [edge(operation.output)] : [];
    }
  };
  // A join names its split by selection key; the pairing is the one split operation carrying that key.
  const splitOf = (key: string): string => {
    const matching = operations.filter(operation =>
      operation.kind === SemanticOperationKind.SelectMany && operation.selectionKey === key);
    return matching.length === 1 ? matching[0]!.id : "";
  };
  const vertices = new Map(operations.map(operation => [operation.id, {
    id: operation.id, kind: programVertexKind(operation), scope: scopeOf.get(operation.id) ?? "", outputs: outputs(operation),
    inputs: programInputs(operation),
    ...(operation.kind === SemanticOperationKind.SynchronizeSelected ? { pairing: splitOf(operation.selectionKey) } : {}),
  }]));
  return { root, vertices };
}

/** IGR-ADMIT-01 and IGR-BIND-01 over the Program, independent of the checked graph. */
export function inclusiveRegionsProgramAdmitted(program: SemanticProcessProgram): boolean {
  return inclusiveRegionsAdmitted(programRegionGraph(program), true);
}
