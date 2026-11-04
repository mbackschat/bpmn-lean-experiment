import { sameCallDataInterface } from "./call-data-admission.js";
import { CallDataKind } from "./call-data-contract.js";
import type { CallDataInterface, VariableMappingCallData } from "./call-data-contract.js";
import { CheckedNodeKind, GatewayDirection } from "./checked-process-contract.js";
import { concurrentScopeStartNames, enclosingReads } from "./concurrent-scope-data-availability.js";
import type { ScopeDataAccess } from "./concurrent-scope-data-availability.js";
import { callMappingsAdmitted, scopeCountAdmitted, scopeLocalRecordAdmitted } from "./nested-scope-data-admission.js";
import type { NestedScopeStartNames } from "./nested-scope-data-admission.js";
import { embeddedScopeDataBearing } from "./scope-data-bearing.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import type { CheckedNode, CheckedSequenceFlow } from "./checked-process-contract.js";
import { branchesStartWithWork } from "./nested-scope-branch-work.js";
import { parallelBodyScans } from "./parallel-body-burst-analysis.js";
import type { ParallelBodyScans } from "./parallel-body-burst-analysis.js";
import { InternalSchedulingMode, SemanticOperationKind } from "./semantic-process-contract.js";
import type { ReturnProcessOperation, SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { semanticProcessClosureLimit } from "./semantic-process-limits.js";
import { ParallelBodyNodeKind as Kind } from "./structured-parallel-body-analysis.js";
import type { ParallelBodyNode } from "./structured-parallel-body-analysis.js";
import { RawBodyNodeKind, contractMergeRegions, multiplicityWeightedExtra } from "./merge-region-admission.js";
import { serialBusinessEffectAdmitted, serialChainRulesForProfile } from "./serial-business-task-policy.js";
import type { MergeRegion, RawBodyNode } from "./merge-region-admission.js";
import type { DefinitionScope, ScopeLocalData, VariableMapping } from "./semantic-value-contract.js";
import { compareCanonicalStrings } from "./wire.js";

/**
 * NSC-ADMIT-01 for the embedded completion profile, an independent transcription of the Lean `NestedScopeControl`
 * admission. Each definition scope's body is projected to the reviewed structured-body analysis, a Sub-Process
 * appearing in its parent as a task vertex, so contraction, pairing and separate Ends are that owner's. This module
 * adds only the scope tree, the branch condition and the nested burst composition. CEA-ADMIT-01 merge regions are
 * contracted first by the merge-region owner; their target bodies stay in the tree and their bursts are composed here.
 *
 * CALLN-ADMIT-01 adds Process-root Calls: a Call is a task vertex of the caller root whose called Process body, a serial
 * chain, is expanded once per call site below it, so the burst composition and the task bound see the call tree exactly
 * as a Sub-Process tree.
 *
 * CSE-ADMIT-01 makes a data-free, overlay-bound Service Task a task wherever a User Task is one, except in a called body
 * or beside a Call. Its completion resumes like a User Task's, so it joins the per-body task list that drives the bursts,
 * the task bound and the merge-target check.
 *
 * CSD-ADMIT-01 admits data: Sub-Process declarations and mapped Service Tasks under the bounded String rules, with the
 * required Start names of CSD-AVAILABLE-01 computed over the raw bodies. CMCALL-ADMIT-01 adds mapped Calls to a
 * data-bearing model: at the Call placements of CALLN-ADMIT-01 and after the first vertex of a serial Sub-Process body at
 * depth one or two, each called Process a serial User Task chain invoked only by mapped or only by unmapped Calls.
 */

/** Definition depth of the deepest admitted Sub-Process body below the root. */
const depthLimit = 3;
/** Concurrent-wait ceiling shared with the parallel Multi-Instance capacity account. */
const taskLimit = 128;
/** CSE-ADMIT-01: the concurrent-Activity ceiling of the hosting preflight, multiplicity-weighted like the task bound. */
export const nestedScopeControlServiceTaskLimit = 32;
/** Call nesting below the caller root, a Call in the caller being depth one (CALLN-ADMIT-01). */
const callDepthLimit = 3;
/** The vertices of a called Process body between its None Start and None End (CALLN-ADMIT-01). */
const calledBodyVertexLimit = 3;
/** CMCALL-ADMIT-01: the deepest Sub-Process body that may hold a mapped Call. */
const embeddedCallDepthLimit = 2;

type RawBody = Readonly<{
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

/** A merge target's body is a serial chain of tasks; it owns no Sub-Process, gateway or region. */
function serialTargetBody(body: Body | undefined): body is Body {
  return body !== undefined && body.children.size === 0 && body.calls.size === 0 && body.regions.length === 0 &&
    body.tasks.length > 0 &&
    body.nodes.every(({ kind }) => kind === Kind.Start || kind === Kind.End || kind === Kind.Task) &&
    body.nodes.filter(({ kind }) => kind === Kind.Task).length === body.tasks.length;
}

type Tree = Readonly<{ root: string; bodies: ReadonlyMap<string, Body>; parent: ReadonlyMap<string, Readonly<{ scope: string; vertex: string }>> }>;

/**
 * CMCALL-ADMIT-01: a Call outside the root is a mapped Call of a data-bearing model in a serial body at depth one or
 * two, never the body's first vertex. Its invocation therefore follows a wait in the same body and is never co-enabled
 * with sibling work, since the parentless caller is the only one Lean's control selection prepares.
 */
function embeddedCallsPlaced(body: Body, depth: number, dataBearing: boolean): boolean {
  if (body.calls.size === 0) return true;
  // PTPB-CALL-01: pass vertices never wait, so the first vertex is the first one after them. The walk runs before the
  // structure check refuses cycles, so it is bounded by the vertex count, as Lean's `afterPasses` fuel is.
  let first = body.nodes.find(({ kind }) => kind === Kind.Start)?.outputs ?? [];
  for (let fuel = body.nodes.length; fuel > 0 && first.length === 1; fuel--) {
    const pass = body.nodes.find(({ id }) => id === first[0]);
    if (pass?.kind !== Kind.Pass) break;
    first = pass.outputs;
  }
  return dataBearing && depth <= embeddedCallDepthLimit && body.regions.length === 0 &&
    body.nodes.every(({ kind }) => kind === Kind.Start || kind === Kind.End || kind === Kind.Task || kind === Kind.Pass) &&
    [...body.calls.keys()].every(vertex => body.mapped.has(vertex) && !first.includes(vertex));
}

/** Validates the scope tree and every body, returning the tree with its per-body scans. */
function analyzeTree(scopes: readonly DefinitionScope[], bodies: ReadonlyMap<string, Body>, dataBearing: boolean):
  Readonly<{ tree: Tree; scans: ReadonlyMap<string, ParallelBodyScans>; weightedTasks: number; weightedServiceTasks: number }> | null {
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
  if (parent.size !== scopes.length - 1) return null;
  // Climbs at most `depthLimit` levels, so a parent cycle that never reaches the root is refused rather than recursed.
  const depthOf = (scope: string): number | undefined => {
    let current = scope;
    for (let level = 1; level <= depthLimit; level += 1) {
      const owner = parent.get(current);
      if (owner === undefined) return undefined;
      if (owner.scope === root) return level;
      current = owner.scope;
    }
    return undefined;
  };
  if (scopes.some(({ id }) => id !== root && depthOf(id) === undefined)) return null;
  const rootBody = bodies.get(root);
  // A terminal fork is admitted only in a child body; the root keeps its single End.
  if (rootBody === undefined || rootBody.nodes.filter(({ kind }) => kind === Kind.End).length !== 1 ||
      rootBody.regions.length > 0 || [...bodies.values()].some(body => body.scope !== root &&
        !embeddedCallsPlaced(body, depthOf(body.scope)!, dataBearing))) return null;
  const regions = [...bodies.values()].flatMap(({ regions }) => regions);
  if (!regions.every(({ targetScope }) => serialTargetBody(bodies.get(targetScope)))) return null;
  // CEA-ADMIT-01 weights the target body's tasks and those after it once per fork output; CSE-ADMIT-01 weights
  // Service Tasks the same way against their own bound.
  const weight = (listed: (body: Body) => readonly string[]): number =>
    [...bodies.values()].reduce((count, body) => count + listed(body).length + body.regions.reduce((extra, region) =>
      extra + multiplicityWeightedExtra(region, listed(bodies.get(region.targetScope)!).length,
        task => listed(body).includes(task)), 0), 0);
  const scans = new Map<string, ParallelBodyScans>();
  for (const body of bodies.values()) {
    const scan = parallelBodyScans(body.nodes);
    if (scan === undefined || !branchesStartWithWork(body.nodes)) return null;
    scans.set(body.scope, scan);
  }
  return { tree: { root, bodies, parent }, scans, weightedTasks: weight(({ tasks }) => tasks),
    weightedServiceTasks: weight(({ serviceTasks }) => serviceTasks) };
}

/**
 * A called Process body is a serial chain of one to three User Task or Call vertices (CALLN-ADMIT-01, CSE-ADMIT-01); in a
 * data-bearing model, of User Tasks only (CMCALL-ADMIT-01).
 */
function serialCalledBody(body: Body | undefined, dataBearing: boolean): body is Body {
  const vertices = body?.nodes.filter(({ kind }) => kind === Kind.Task) ?? [];
  return body !== undefined && body.children.size === 0 && body.regions.length === 0 && (!dataBearing || body.calls.size === 0) &&
    vertices.length >= 1 && vertices.length <= calledBodyVertexLimit &&
    body.serviceTasks.length === 0 && vertices.length === body.tasks.length + body.calls.size &&
    body.nodes.every(({ kind }) => kind === Kind.Start || kind === Kind.End || kind === Kind.Task);
}

type Forest = Readonly<{
  scopes: readonly DefinitionScope[];
  bodies: ReadonlyMap<string, Body>;
  /** Each called Process root scope with its serial body. */
  called: ReadonlyMap<string, Body>;
}>;

/**
 * Splits off the called roots; the remaining scopes are the caller root, the one root no Call names, and its tree. A
 * called root invoked by both a mapped and an unmapped Call is refused (CMCALL-ADMIT-01), because whether its frame
 * isolates called-owned names is decided per definition.
 */
function splitForest(scopes: readonly DefinitionScope[], bodies: ReadonlyMap<string, Body>, dataBearing: boolean):
  Forest | null {
  const sites = [...bodies.values()].flatMap(({ calls, mapped }) =>
    [...calls].map(([vertex, scope]) => ({ scope, mapped: mapped.has(vertex) })));
  const calledRoots = new Set(sites.map(({ scope }) => scope));
  const roots = scopes.filter(({ parentScopeId }) => parentScopeId === null);
  if (roots.filter(({ id }) => !calledRoots.has(id)).length !== 1 ||
      ![...calledRoots].every(scope => roots.some(({ id }) => id === scope))) return null;
  const called = new Map<string, Body>();
  for (const scope of calledRoots) {
    const body = bodies.get(scope);
    if (!serialCalledBody(body, dataBearing) ||
        new Set(sites.filter(site => site.scope === scope).map(site => site.mapped)).size !== 1) return null;
    called.set(scope, body);
  }
  return {
    scopes: scopes.filter(({ id }) => !calledRoots.has(id)),
    bodies: new Map([...bodies].filter(([scope]) => !calledRoots.has(scope))),
    called,
  };
}

/** The tree with every Call vertex owning one expanded copy of its called body, and that copy's called definition. */
type ExpandedTree = Readonly<{
  tree: Tree;
  scans: ReadonlyMap<string, ParallelBodyScans>;
  invoked: ReadonlyMap<string, string>;
  calledTasks: number;
}>;

/**
 * Expands the call tree once per call site, so one definition called from two sites is analysed twice. A site key
 * joins its caller key and Call vertex with `>`, which no XML ID or derived operation ID contains, so it never meets a
 * definition scope. A call cycle exceeds the depth bound; a called root no site reaches is refused. A Call in a
 * Sub-Process body is at the depth of a Call in the root, since a Sub-Process adds no call nesting.
 */
function expandCalls(tree: Tree, scans: ReadonlyMap<string, ParallelBodyScans>, called: ReadonlyMap<string, Body>):
  ExpandedTree | null {
  const calledScans = new Map<string, ParallelBodyScans>();
  for (const [scope, body] of called) {
    const scan = parallelBodyScans(body.nodes);
    if (scan === undefined) return null;
    calledScans.set(scope, scan);
  }
  const bodies = new Map(tree.bodies);
  const parent = new Map(tree.parent);
  const allScans = new Map(scans);
  const invoked = new Map<string, string>();
  const reached = new Set<string>();
  let calledTasks = 0;
  const attach = (key: string, body: Body, depth: number): boolean => {
    const children = new Map(body.children);
    for (const [vertex, definition] of body.calls) {
      const calledBody = called.get(definition);
      if (depth > callDepthLimit || calledBody === undefined) return false;
      const site = `${key}>${vertex}`;
      reached.add(definition);
      calledTasks += calledBody.tasks.length;
      children.set(vertex, site);
      parent.set(site, { scope: key, vertex });
      allScans.set(site, calledScans.get(definition)!);
      invoked.set(site, definition);
      if (!attach(site, calledBody, depth + 1)) return false;
    }
    for (const child of body.children.values()) if (!attach(child, tree.bodies.get(child)!, depth)) return false;
    bodies.set(key, { ...body, scope: key, children });
    return true;
  };
  if (!attach(tree.root, tree.bodies.get(tree.root)!, 1) || reached.size !== called.size) return null;
  return { tree: { root: tree.root, bodies, parent }, scans: allScans, invoked, calledTasks };
}

/**
 * CALLN-ONCE-01: no closure invokes two instances of one definition. Mirrors `maximumBurst`'s composition, collecting
 * the definitions each entry or resumption invokes, leading Calls of called bodies and the cascade upward included.
 * Every task vertex's resumption is checked, a superset of the closures a journey reaches.
 */
function invokesEachDefinitionOnce(expanded: ExpandedTree): boolean {
  const { tree, scans, invoked } = expanded;
  const armedDefinitions = (scope: string, armed: readonly string[]): string[] => armed.flatMap(vertex => {
    const child = tree.bodies.get(scope)!.children.get(vertex);
    if (child === undefined) return [];
    const definition = invoked.get(child);
    return [...definition === undefined ? [] : [definition], ...entryDefinitions(child)];
  });
  const entryDefinitions = (scope: string): string[] => armedDefinitions(scope, scans.get(scope)!.entry.armed);
  const resumeDefinitions = (scope: string, vertex: string): string[] => {
    const scan = scans.get(scope)!.resumptions.get(vertex);
    if (scan === undefined) {
      // A merge target's vertex lies inside its region; leaving the target continues as `maximumBurst`'s `leaveTarget`.
      const region = tree.bodies.get(scope)!.regions.find(({ target }) => target === vertex)!;
      return region.after.length > 0 ? [] : resumeDefinitions(scope, region.vertex);
    }
    const owner = tree.parent.get(scope);
    return [...armedDefinitions(scope, scan.armed),
      ...scan.waits === 0 && owner !== undefined ? resumeDefinitions(owner.scope, owner.vertex) : []];
  };
  const distinct = (definitions: readonly string[]) => new Set(definitions).size === definitions.length;
  return distinct(entryDefinitions(tree.root)) && [...tree.bodies.keys()].every(scope =>
    [...scans.get(scope)!.resumptions.keys()].every(vertex => distinct(resumeDefinitions(scope, vertex))));
}

/**
 * CALLN-SHARED-01: the call trees of two concurrent Calls of the caller root share no definition that contains a Call.
 * The root body is a structured fork-join body with one End, so two of its vertices lie on distinct branches of one
 * Parallel block exactly when neither reaches the other.
 */
function sharesNoCallBearingDefinition(expanded: ExpandedTree, called: ReadonlyMap<string, Body>): boolean {
  const { tree, invoked } = expanded;
  const rootBody = tree.bodies.get(tree.root)!;
  const outputs = new Map(rootBody.nodes.map(({ id, outputs }) => [id, outputs]));
  const reaches = (from: string, to: string): boolean => {
    const seen = new Set<string>();
    const pending = [...outputs.get(from) ?? []];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      if (next === to) return true;
      if (!seen.has(next)) { seen.add(next); pending.push(...outputs.get(next) ?? []); }
    }
    return false;
  };
  const callBearing = (site: string): string[] => {
    const definition = invoked.get(site)!;
    return [...called.get(definition)!.calls.size > 0 ? [definition] : [],
      ...[...tree.bodies.get(site)!.children.values()].flatMap(callBearing)];
  };
  const sites = [...rootBody.children].filter(([, site]) => invoked.has(site));
  return sites.every(([left, leftSite], index) => sites.slice(index + 1).every(([right, rightSite]) =>
    reaches(left, right) || reaches(right, left) ||
    !callBearing(leftSite).some(definition => callBearing(rightSite).includes(definition))));
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
    const targetTasks = tree.bodies.get(region.targetScope)!.tasks;
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
      for (const task of body.tasks) if (!inRegion.has(task)) maximum = Math.max(maximum, resume(body.scope, task));
    }
    for (const region of body.regions) maximum = Math.max(maximum, ...regionTasks(body.scope, region));
  }
  return maximum;
}

/** A model's data: its scope declarations and handler names, or `null` for a data-free model. */
type ModelData = Readonly<{ records: readonly ScopeLocalData[]; handlers: ReadonlySet<string> }>;

/**
 * The admitted largest closure and, for a data-bearing model, its required Start names; `optional` is `null` without a
 * mapped Call, where every admitted Start name is allowed (CMCALL-START-01).
 */
type Admitted = Readonly<{ burst: number; required: readonly string[]; optional: readonly string[] | null }>;

/**
 * CSD-ADMIT-01's data rules over a tree whose control is already admitted: declarations sorted by scope, each on a
 * Sub-Process scope and within the declaration rule, then CSD-AVAILABLE-01 and CMCALL-START-01 over the raw bodies.
 */
function admittedData(scopes: readonly DefinitionScope[], raw: ReadonlyMap<string, RawBody>, data: ModelData):
  Omit<Admitted, "burst"> | null {
  // The caller root is the one parentless scope no Call names; called roots declare nothing.
  const calledRoots = new Set([...raw.values()].flatMap(({ calls }) => [...calls.values()]));
  const roots = scopes.filter(({ id, parentScopeId }) => parentScopeId === null && !calledRoots.has(id));
  const { records, handlers } = data;
  if (roots.length !== 1 || !records.every(({ scopeId }, index) =>
      index === 0 || compareCanonicalStrings(records[index - 1]!.scopeId, scopeId) < 0) ||
      !records.every(record => record.scopeId !== roots[0]!.id && raw.has(record.scopeId) &&
        scopeLocalRecordAdmitted(handlers, record))) return null;
  const accesses = new Map([...raw.values()].flatMap(({ accesses }) => [...accesses]));
  const names = concurrentScopeStartNames(roots[0]!.id, raw, records, accesses);
  const mapped = [...raw.values()].some(({ mapped }) => mapped.size > 0);
  return names === null ? null : { required: names.required, optional: mapped ? names.optional : null };
}

function admittedModel(scopes: readonly DefinitionScope[], raw: ReadonlyMap<string, RawBody> | null,
  data: ModelData | null): Admitted | null {
  const burst = admittedBurst(scopes, raw, data !== null);
  if (burst === null || raw === null) return null;
  if (data === null) return { burst, required: [], optional: null };
  const names = admittedData(scopes, raw, data);
  return names === null ? null : { burst, ...names };
}

function admittedBurst(scopes: readonly DefinitionScope[], raw: ReadonlyMap<string, RawBody> | null,
  dataBearing: boolean): number | null {
  const bodies = contractBodies(raw);
  if (bodies === null) return null;
  const forest = splitForest(scopes, bodies, dataBearing);
  if (forest === null) return null;
  const analyzed = analyzeTree(forest.scopes, forest.bodies, dataBearing);
  // CSE-ADMIT-01 refuses a Service Task beside a Call; called bodies refuse them in `serialCalledBody`.
  if (analyzed === null || analyzed.weightedServiceTasks > nestedScopeControlServiceTaskLimit ||
      (forest.called.size > 0 && analyzed.weightedServiceTasks > 0)) return null;
  const expanded = expandCalls(analyzed.tree, analyzed.scans, forest.called);
  if (expanded === null || analyzed.weightedTasks + expanded.calledTasks > taskLimit ||
      !invokesEachDefinitionOnce(expanded) || !sharesNoCallBearingDefinition(expanded, forest.called)) return null;
  const burst = maximumBurst(expanded.tree, expanded.scans);
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
  scopeLocalData?: readonly ScopeLocalData[];
  /** The admitting profile, which alone decides whether a pass-through Task maps to a pass vertex (PTPB-PROFILE-01). */
  identity?: Readonly<{ semanticProfile: string }>;
}>;

/** CSE-ADMIT-01: no mapping, no Error route, and the serial business-task Activity descriptor. */
function dataFreeServiceTask(effect: Readonly<{ inputMappings: readonly unknown[]; outputMappings: readonly unknown[] }>,
  bpmnErrorRoute: unknown): boolean {
  return effect.inputMappings.length === 0 && effect.outputMappings.length === 0 && bpmnErrorRoute === null &&
    serialBusinessEffectAdmitted(effect);
}

const scopeDataRules = serialChainRulesForProfile(SemanticProfileId.EmbeddedSubProcessCompletion);

/**
 * CSD-ADMIT-01 and CSSD-ADMIT-01: in a data-bearing model a Service Task may map data. Mapping admission reads only the
 * 1,024-byte literal ceiling, which both data profiles share; each profile's value policy applies when values arrive.
 */
function admittedServiceTask(effect: Readonly<{ inputMappings: readonly VariableMapping[]; outputMappings: readonly VariableMapping[] }>,
  bpmnErrorRoute: unknown, data: ModelData | null): boolean {
  return data === null ? dataFreeServiceTask(effect, bpmnErrorRoute)
    : bpmnErrorRoute === null && serialBusinessEffectAdmitted(effect, data.handlers, scopeDataRules);
}

function accessOf(effect: Readonly<{ inputMappings: readonly VariableMapping[]; outputMappings: readonly VariableMapping[] }>):
  ScopeDataAccess {
  return { reads: enclosingReads(effect.inputMappings), writes: effect.outputMappings.map(({ target }) => target) };
}

/** A mapped Call reads without requiring and definitely writes its outputs (CMCALL-AVAILABLE-01, CMCALL-START-01). */
function callAccess(data: VariableMappingCallData): ScopeDataAccess {
  const writes = data.outputs.map(({ target }) => target);
  return { reads: [], writes, optional: [...enclosingReads(data.inputs), ...writes] };
}

/** CALLN-ADMIT-01's empty Call anywhere; in a data-bearing model also CVM-ADMIT-01's mappings (CMCALL-ADMIT-01). */
function callDataAdmitted(callData: CallDataInterface, data: ModelData | null): boolean {
  switch (callData.kind) {
    case CallDataKind.Empty: return true;
    case CallDataKind.VariableMappings: return data !== null && callMappingsAdmitted(callData, data.handlers);
    case CallDataKind.Scalar: return false;
  }
}

/** CSD-ADMIT-01's Service Task data and CMCALL-ADMIT-01's Call data. */
function checkedKind(node: CheckedNode, data: ModelData | null, passThrough: boolean): RawBodyNodeKind | null {
  switch (node.kind) {
    case CheckedNodeKind.NonOperationalTask:
    case CheckedNodeKind.NoneIntermediateThrowEvent: return passThrough ? RawBodyNodeKind.Pass : null;
    case CheckedNodeKind.NoneStartEvent: return RawBodyNodeKind.Start;
    case CheckedNodeKind.NoneEndEvent: return RawBodyNodeKind.End;
    case CheckedNodeKind.UserTask: return node.metadata === undefined ? RawBodyNodeKind.Task : null;
    case CheckedNodeKind.ServiceTask: return admittedServiceTask(node, node.bpmnErrorRoute, data) ? RawBodyNodeKind.Task : null;
    case CheckedNodeKind.EmbeddedSubProcess: return RawBodyNodeKind.Task;
    case CheckedNodeKind.CallActivity: return callDataAdmitted(node.data, data) ? RawBodyNodeKind.Task : null;
    case CheckedNodeKind.ExclusiveMerge: return RawBodyNodeKind.Merge;
    case CheckedNodeKind.ParallelGateway:
      return node.direction === GatewayDirection.Diverging ? RawBodyNodeKind.Fork
        : node.direction === GatewayDirection.Converging ? RawBodyNodeKind.Join : null;
    default: return null;
  }
}

/** A checked graph carries data exactly when a scope declares a local, a Service Task maps one or a Call maps. */
function checkedData(graph: NestedScopeControlCheckedGraph): ModelData | null {
  const services = graph.nodes.flatMap(node => node.kind === CheckedNodeKind.ServiceTask ? [node] : []);
  const records = graph.scopeLocalData ?? [];
  return records.length === 0 && services.every(({ inputMappings, outputMappings }) =>
      inputMappings.length === 0 && outputMappings.length === 0) &&
    !graph.nodes.some(node => node.kind === CheckedNodeKind.CallActivity && node.data.kind === CallDataKind.VariableMappings)
    ? null
    : { records, handlers: new Set(services.map(({ descriptor }) => descriptor.operation)) };
}

function checkedBodies(graph: NestedScopeControlCheckedGraph, data: ModelData | null, passThrough: boolean): Map<string, RawBody> | null {
  const calledRoot = (processId: string): string | undefined => {
    const roots = graph.definitionScopes.filter(({ parentScopeId, originElementId }) =>
      parentScopeId === null && originElementId === processId);
    return roots.length === 1 ? roots[0]!.id : undefined;
  };
  const scopeOf = new Map(graph.nodeScopes.map(({ nodeId, scopeId }) => [nodeId, scopeId]));
  if (scopeOf.size !== graph.nodes.length || graph.flows.some(flow => flow.condition !== null ||
      scopeOf.get(flow.sourceId) === undefined || scopeOf.get(flow.sourceId) !== scopeOf.get(flow.targetId))) return null;
  const grouped = group(graph.nodes, node => scopeOf.get(node.id));
  if (grouped === null) return null;
  const bodies = new Map<string, RawBody>();
  for (const [scope, nodes] of grouped) {
    const vertices: RawBodyNode[] = [];
    const children = new Map<string, string>();
    const calls = new Map<string, string>();
    const mapped = new Set<string>();
    const accesses = new Map<string, ScopeDataAccess>();
    for (const node of nodes) {
      const kind = checkedKind(node, data, passThrough);
      if (kind === null) return null;
      if (node.kind === CheckedNodeKind.ServiceTask) accesses.set(node.id, accessOf(node));
      if (node.kind === CheckedNodeKind.EmbeddedSubProcess) children.set(node.id, node.childScopeId);
      if (node.kind === CheckedNodeKind.CallActivity) {
        const root = calledRoot(node.calledProcessId);
        if (root === undefined) return null;
        calls.set(node.id, root);
        if (node.data.kind === CallDataKind.VariableMappings) {
          mapped.add(node.id);
          accesses.set(node.id, callAccess(node.data));
        }
      }
      vertices.push({ id: node.id, kind, outputs: graph.flows.filter(({ sourceId }) => sourceId === node.id).map(({ targetId }) => targetId) });
    }
    const serviceTasks = nodes.filter(({ kind }) => kind === CheckedNodeKind.ServiceTask).map(({ id }) => id);
    bodies.set(scope, { scope, nodes: vertices, children, calls, mapped, serviceTasks, accesses,
      tasks: [...nodes.filter(({ kind }) => kind === CheckedNodeKind.UserTask).map(({ id }) => id), ...serviceTasks] });
  }
  return bodies;
}

function checkedModel(graph: NestedScopeControlCheckedGraph): Admitted | null {
  const data = checkedData(graph);
  const passThrough = graph.identity?.semanticProfile === SemanticProfileId.NestedEmbeddedScopeData;
  if (!scopeCountAdmitted(graph.identity?.semanticProfile ?? "", graph.definitionScopes.length)) return null;
  return admittedModel(graph.definitionScopes, checkedBodies(graph, data, passThrough), data);
}

/** NSC-ADMIT-01 and CSD-ADMIT-01 over the checked graph; `null` refuses it, otherwise the admitted largest closure. */
export function nestedScopeControlCheckedAnalysis(graph: NestedScopeControlCheckedGraph): number | null {
  return checkedModel(graph)?.burst ?? null;
}

/** CSD-AVAILABLE-01's required Start names over the checked graph, empty for a data-free model. */
export function nestedScopeControlCheckedStartNames(graph: NestedScopeControlCheckedGraph): readonly string[] | null {
  return checkedModel(graph)?.required ?? null;
}

/** CSD-AVAILABLE-01 and CMCALL-START-01 over the checked graph; `optional` is `null` without a mapped Call. */
export function nestedScopeControlCheckedStartNameRule(graph: NestedScopeControlCheckedGraph): NestedScopeStartNames | null {
  const model = checkedModel(graph);
  return model === null ? null : { required: model.required, optional: model.optional };
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
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.MergeExclusive:
      return operation.inputs;
    default:
      return [];
  }
}

/** The lowered child Start is elided; this synthetic vertex stands for the child's entry place. */
const childStart = (scope: string): string => `start:${scope}`;

function programBodies(program: SemanticProcessProgram, data: ModelData | null, passThrough: boolean): Map<string, RawBody> | null {
  const scopeOf = new Map(program.operationScopes.map(({ operationId, scopeId }) => [operationId, scopeId]));
  const completions = program.operations.filter(({ kind }) => kind === SemanticOperationKind.CompleteScope);
  const returns = program.operations.filter((operation): operation is ReturnProcessOperation =>
    operation.kind === SemanticOperationKind.ReturnProcess);
  const operations = program.operations.filter(({ kind }) =>
    kind !== SemanticOperationKind.CompleteScope && kind !== SemanticOperationKind.ReturnProcess);
  // A called root completes by its returns, one per Call naming it, so it has no `completeScope`.
  const calledRoots = new Set(returns.map(({ calledRootScopeId }) => calledRootScopeId));
  if (scopeOf.size !== program.operations.length ||
      completions.length !== program.definitionScopes.length - calledRoots.size ||
      !returns.every(({ id, calledRootScopeId }) => scopeOf.get(id) === calledRootScopeId)) return null;
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
        case SemanticOperationKind.MergeExclusive:
          // PTPB-ADMIT-01: under the nested scope-data profile a one-input merge is a lowered pass-through Task.
          kind = passThrough && operation.inputs.length === 1 ? RawBodyNodeKind.Pass : RawBodyNodeKind.Merge;
          outputs = follow([operation.output]);
          break;
        case SemanticOperationKind.ReachNoneEnd: kind = RawBodyNodeKind.End; outputs = []; break;
        case SemanticOperationKind.EnterScope: {
          const output = parentOutput(operation.childScopeId);
          const entry = consumer(operation.childScopeId, operation.childEntry);
          kind = RawBodyNodeKind.Task;
          outputs = output === null || output === undefined || entry === undefined ? null : follow([output]);
          children.set(operation.id, operation.childScopeId);
          break;
        }
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
        default: return null;
      }
      if (outputs === null) return null;
      vertices.push({ id: operation.id, kind, outputs });
    }
    const serviceTasks = members.filter(({ kind }) => kind === SemanticOperationKind.AwaitEffect).map(({ id }) => id);
    bodies.set(scope, { scope, nodes: vertices, children, calls, mapped, serviceTasks, accesses,
      tasks: [...members.filter(({ kind }) => kind === SemanticOperationKind.AwaitUserTask).map(({ id }) => id), ...serviceTasks] });
  }
  // Every return pairs with exactly one invocation, so no called root completes without a caller to continue.
  const invokes = operations.filter(({ kind }) => kind === SemanticOperationKind.InvokeProcess);
  if (!returns.every(({ id }) => invokes.filter(operation =>
    operation.kind === SemanticOperationKind.InvokeProcess && operation.returnOperationId === id).length === 1)) return null;
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

/** NSC-ADMIT-01 and CSD-ADMIT-01 over the Program, independent of the checked graph; `null` refuses it. */
export function nestedScopeControlProgramAnalysis(program: SemanticProcessProgram): number | null {
  return programModel(program)?.burst ?? null;
}

/** CSD-AVAILABLE-01's required Start names over the Program, empty for a data-free Program. */
export function nestedScopeControlProgramStartNames(program: SemanticProcessProgram): readonly string[] | null {
  return programModel(program)?.required ?? null;
}

/** CSD-AVAILABLE-01 and CMCALL-START-01 over the Program; `optional` is `null` without a mapped Call. */
export function nestedScopeControlProgramStartNameRule(program: SemanticProcessProgram): NestedScopeStartNames | null {
  const model = programModel(program);
  return model === null ? null : { required: model.required, optional: model.optional };
}

function programModel(program: SemanticProcessProgram): Admitted | null {
  // CSE-ADMIT-01: the source overlay binds Service Task handlers, so a Program carries one exactly when it has an effect.
  // The nested scope-data profile requires one on every model and always carries data (CSSD-ADMIT-01).
  const structured = program.identity.semanticProfile === SemanticProfileId.NestedEmbeddedScopeData;
  const hasEffect = program.operations.some(({ kind }) => kind === SemanticOperationKind.AwaitEffect);
  if ((program.identity.sourceOverlay !== null) !== (structured || hasEffect) ||
      program.internalSchedulingMode !== InternalSchedulingMode.RejectObservableChoice ||
      program.compensationActivityRetention !== undefined || program.compensationEventSubProcessSnapshots !== undefined ||
      program.compensationExecution !== undefined || program.interruptingMessageEventSubProcesses !== undefined ||
      (program.scopeLocalData !== undefined && !structured &&
        program.identity.semanticProfile !== SemanticProfileId.EmbeddedSubProcessCompletion) ||
      !scopeCountAdmitted(program.identity.semanticProfile, program.definitionScopes.length)) {
    return null;
  }
  const root = program.definitionScopes.find(({ parentScopeId, originElementId }) =>
    parentScopeId === null && originElementId === program.processId);
  const rootCompletion = program.operations.filter(operation =>
    operation.kind === SemanticOperationKind.CompleteScope && operation.scopeId === root?.id && operation.parentOutput === null);
  const data: ModelData | null = structured || embeddedScopeDataBearing(program) ? {
    records: program.scopeLocalData ?? [],
    handlers: new Set(program.operations.flatMap(operation =>
      operation.kind === SemanticOperationKind.AwaitEffect ? [operation.effect.descriptor.operation] : [])),
  } : null;
  return rootCompletion.length === 1 ? admittedModel(program.definitionScopes, programBodies(program, data, structured), data) : null;
}

const programOperationKinds: ReadonlySet<SemanticOperationKind> = new Set([
  SemanticOperationKind.Initiate, SemanticOperationKind.EnterScope, SemanticOperationKind.AwaitUserTask,
  SemanticOperationKind.Duplicate, SemanticOperationKind.Synchronize, SemanticOperationKind.ReachNoneEnd,
  SemanticOperationKind.CompleteScope, SemanticOperationKind.MergeExclusive, SemanticOperationKind.InvokeProcess,
  SemanticOperationKind.ReturnProcess, SemanticOperationKind.AwaitEffect,
]);

const checkedNodeKinds: ReadonlySet<CheckedNodeKind> = new Set([
  CheckedNodeKind.NoneStartEvent, CheckedNodeKind.EmbeddedSubProcess, CheckedNodeKind.UserTask,
  CheckedNodeKind.ParallelGateway, CheckedNodeKind.NoneEndEvent, CheckedNodeKind.ExclusiveMerge,
  CheckedNodeKind.CallActivity, CheckedNodeKind.ServiceTask,
]);

/** The operation alphabet and the profile's lower scope bound; the analyses above bound depth, tasks and bursts. */
export function nestedScopeControlProgramShape(operations: readonly SemanticOperation[], semanticProfile: string,
  scopeCount: number): boolean {
  return scopeCountAdmitted(semanticProfile, scopeCount) && operations.every(({ kind }) => programOperationKinds.has(kind));
}

export function nestedScopeControlCheckedShape(nodes: readonly CheckedNode[], semanticProfile: string,
  scopeCount: number): boolean {
  return scopeCountAdmitted(semanticProfile, scopeCount) && nodes.every(({ kind }) => checkedNodeKinds.has(kind));
}
