import { sameCallDataInterface, variableMappingsValid } from "./call-data-admission.js";
import { activityHostSettledProjection, settledOperations } from "./activity-host-work.js";
import { CallDataKind } from "./call-data-contract.js";
import type { VariableMappingCallData } from "./call-data-contract.js";
import { checkedNodeMerges } from "./checked-pass-through-flow.js";
import { CheckedNodeKind } from "./checked-process-contract.js";
import type { CheckedProcess } from "./checked-process-contract.js";
import { EffectExecutionResultKind, StimulusKind } from "./contract.js";
import type { Stimulus, VariableBinding } from "./contract.js";
import { effectMappingAcceptsValue, effectMappingValuePolicyForProgram } from "./effect-mapping-value-policy.js";
import { InternalSchedulingMode, SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { MappingExpressionKind } from "./semantic-value-contract.js";
import type { DefinitionScope, ScopeLocalData, VariableMapping } from "./semantic-value-contract.js";
import {
  isSerialBusinessIdentifier, serialBusinessBindingsAdmitted, serialBusinessMappingsAdmitted,
  serialChainRulesForProfile,
} from "./serial-business-task-policy.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { compareCanonicalStrings } from "./wire.js";

/**
 * NSD-ADMIT-01 and NSD-AVAILABLE-01 for the nested scope-data profile, an independent transcription of the Lean
 * `NestedScopeData` admission. The checked graph and the Program are each reduced to one transient tree walk: every
 * scope is one serial path, and a Sub-Process vertex walks its child scope before its own successor. The walk records
 * each read and definite write with the names declared by its enclosing frames; it is analysis evidence only.
 */

/** Definition depth of the deepest admitted Sub-Process below the root. */
const depthLimit = 3;
/** Input and output declarations admitted per Sub-Process. */
const declarationLimit = 8;
const rules = serialChainRulesForProfile(SemanticProfileId.NestedEmbeddedScopeData);

/**
 * `Choice` and `Merge` occur only in a re-entry root graph (SRE-ADMIT-01); the serial walk refuses both. `PassThrough`
 * is an Abstract or Manual Task (PTT-ADMIT-01), on the Program side a one-input merge: it reads and writes nothing.
 */
export const ScopeDataVertexKind = {
  Start: "start", Human: "human", Service: "service", SubProcess: "subProcess", Call: "call", Finish: "finish",
  Choice: "choice", Merge: "merge", PassThrough: "passThrough",
} as const;
const VertexKind = ScopeDataVertexKind;
/** CVM-ADMIT-01: the called Process is one serial path through one to three User Tasks. */
const calledTaskLimit = 3;
/**
 * CALLN-ADMIT-01's Stage B: up to two Calls, each on the root path or at most two Sub-Processes deep. The profile's
 * concurrent routing (CSSD-ADMIT-01) keeps the same Call bound.
 */
export const nestedScopeCallLimit = 2;
const callDepthLimit = 2;
type VertexKind = typeof VertexKind[keyof typeof VertexKind];

export type ScopeDataVertex = Vertex;
type Vertex = Readonly<{
  id: string;
  scope: string;
  kind: VertexKind;
  /** Set only for a Sub-Process: its child scope, the child's first vertex and the Sub-Process element. */
  child?: Readonly<{ scope: string; entry: string; origin: string }>;
  /** Set only for a Call: the called root scope, its first vertex, the called Process and the mappings. */
  call?: Readonly<{ scope: string; entry: string; calledProcessId: string; data: VariableMappingCallData }>;
  outputs: readonly string[];
  reads: readonly string[];
  writes: readonly string[];
}>;

/**
 * `callInput` is a Call input source, read without making Start bind it because an absent source becomes a present
 * null (CVM-IN-01); `callOutput` is a Call output target, a definite write because return always writes (CVM-AVAILABLE-01).
 */
type AccessKind = "read" | "write" | "callInput" | "callOutput";
export type ScopeDataAccess = Access;
type Access = Readonly<{ kind: AccessKind; name: string; frames: readonly (readonly string[])[] }>;

function readNames(mappings: readonly VariableMapping[]): string[] {
  return mappings.flatMap(({ expression }) =>
    expression.kind === MappingExpressionKind.EnclosingVariable ? [expression.name] : []);
}

function strictlySorted(names: readonly string[]): boolean {
  return names.every((name, index) => index === 0 || compareCanonicalStrings(names[index - 1]!, name) < 0);
}

/**
 * NSD-ADMIT-01's declaration rule, which CSD-ADMIT-01 reuses: one to eight inputs and at most eight outputs, every name
 * an admitted identifier outside the handler namespace, each output copying an input of the same scope.
 */
export function scopeLocalRecordAdmitted(handlers: ReadonlySet<string>, record: ScopeLocalData): boolean {
  const inputs = new Set(record.localInputs.map(({ target }) => target));
  return record.localInputs.length > 0 && record.localInputs.length <= declarationLimit &&
    record.localOutputs.length <= declarationLimit &&
    serialBusinessMappingsAdmitted(record.localInputs, true, handlers, rules) &&
    strictlySorted(record.localOutputs.map(({ target }) => target)) &&
    record.localOutputs.every(({ target, expression }) =>
      isSerialBusinessIdentifier(target) && !handlers.has(target) &&
      expression.kind === MappingExpressionKind.LocalVariable && inputs.has(expression.name));
}

function calledScopeValid(scopes: readonly DefinitionScope[], scope: string, calledProcessId: string): boolean {
  const matching = scopes.filter(({ id }) => id === scope);
  return matching.length === 1 && matching[0]!.parentScopeId === null && matching[0]!.originElementId === calledProcessId;
}

/**
 * CVM-ADMIT-01: the mapping shape of `variableMappingsValid`, every source and target an admitted identifier that no
 * handler uses, as for every other name.
 */
export function callMappingsAdmitted(data: VariableMappingCallData, handlers: ReadonlySet<string>): boolean {
  return variableMappingsValid(data) && [...data.inputs, ...data.outputs].every(({ target, expression }) =>
    isSerialBusinessIdentifier(target) && !handlers.has(target) && expression.kind !== MappingExpressionKind.StringLiteral &&
    isSerialBusinessIdentifier(expression.name) && !handlers.has(expression.name));
}

function childScopeValid(scopes: readonly DefinitionScope[], parent: string, child: string, origin: string): boolean {
  const matching = scopes.filter(({ id }) => id === child);
  return matching.length === 1 && matching[0]!.parentScopeId === parent && matching[0]!.originElementId === origin;
}

/** `visited` is the caller tree, each vertex once; `called` is every called body walk, once per call site. */
export type Walked = Readonly<{ accesses: readonly Access[]; visited: readonly string[]; called: readonly string[] }>;

function walk(vertices: readonly Vertex[], records: readonly ScopeLocalData[], scopes: readonly DefinitionScope[],
  fuel: number, depth: number, frames: readonly (readonly string[])[], scope: string, id: string): Walked | null {
  if (fuel === 0) return null;
  const matching = vertices.filter(vertex => vertex.id === id);
  const vertex = matching.length === 1 ? matching[0]! : undefined;
  if (vertex === undefined || vertex.scope !== scope) return null;
  if (vertex.kind === VertexKind.Finish) {
    return vertex.outputs.length === 0 ? { accesses: [], visited: [vertex.id], called: [] } : null;
  }
  const next = vertex.outputs.length === 1 ? vertex.outputs[0]! : undefined;
  if (next === undefined) return null;
  switch (vertex.kind) {
    case VertexKind.Start:
    case VertexKind.PassThrough:
    case VertexKind.Human:
    case VertexKind.Service: {
      const rest = walk(vertices, records, scopes, fuel - 1, depth, frames, scope, next);
      if (rest === null) return null;
      const own: Access[] = vertex.kind === VertexKind.Service ? [
        ...vertex.reads.map(name => ({ kind: "read" as const, name, frames })),
        ...vertex.writes.map(name => ({ kind: "write" as const, name, frames })),
      ] : [];
      return { accesses: [...own, ...rest.accesses], visited: [vertex.id, ...rest.visited], called: rest.called };
    }
    case VertexKind.SubProcess: {
      const child = vertex.child;
      if (child === undefined || depth >= depthLimit || !childScopeValid(scopes, scope, child.scope, child.origin)) return null;
      const record = records.find(({ scopeId }) => scopeId === child.scope);
      const inputs = record?.localInputs ?? [];
      const outputs = record?.localOutputs ?? [];
      const inner = walk(vertices, records, scopes, fuel - 1, depth + 1,
        [inputs.map(({ target }) => target), ...frames], child.scope, child.entry);
      const rest = inner === null ? null : walk(vertices, records, scopes, fuel - 1, depth, frames, scope, next);
      if (inner === null || rest === null) return null;
      return {
        accesses: [
          ...readNames(inputs).map(name => ({ kind: "read" as const, name, frames })),
          ...inner.accesses,
          ...outputs.map(({ target }) => ({ kind: "write" as const, name: target, frames })),
          ...rest.accesses,
        ],
        visited: [vertex.id, ...inner.visited, ...rest.visited],
        called: [...inner.called, ...rest.called],
      };
    }
    case VertexKind.Choice:
    case VertexKind.Merge:
      return null;
    case VertexKind.Call: {
      const call = vertex.call;
      // The Call's inputs read and its outputs write along the enclosing `frames`, so a Call inside a Sub-Process
      // resolves through that Sub-Process's chain (CALLN-FRAME-01).
      if (call === undefined || depth > callDepthLimit || !calledScopeValid(scopes, call.scope, call.calledProcessId)) {
        return null;
      }
      // The called instance has no parent scope, so its walk starts with no enclosing frame (CVM-ISOLATE-01).
      const inner = walk(vertices, records, scopes, fuel - 1, depth, [], call.scope, call.entry);
      const rest = inner === null ? null : walk(vertices, records, scopes, fuel - 1, depth, frames, scope, next);
      if (inner === null || rest === null || !calledPathValid(vertices, inner.visited)) return null;
      return {
        accesses: [
          ...call.data.inputs.flatMap(({ expression }) => expression.kind === MappingExpressionKind.EnclosingVariable
            ? [{ kind: "callInput" as const, name: expression.name, frames }] : []),
          ...call.data.outputs.map(({ target }) => ({ kind: "callOutput" as const, name: target, frames })),
          ...rest.accesses,
        ],
        visited: [vertex.id, ...rest.visited],
        called: [...inner.visited, ...rest.called],
      };
    }
  }
}

/** The called path: an optional Start (absent from the Program, which enters at the first task), tasks, then End. */
function calledPathValid(vertices: readonly Vertex[], visited: readonly string[]): boolean {
  const kinds = visited.map(id => vertices.find(vertex => vertex.id === id)?.kind);
  const tasks = kinds.filter(kind => kind === VertexKind.Human).length;
  return tasks >= 1 && tasks <= calledTaskLimit && kinds.every(kind =>
    kind === VertexKind.Start || kind === VertexKind.Human || kind === VertexKind.Finish);
}

/**
 * NSD-AVAILABLE-01: a read is available when an enclosing frame declares it or an earlier definite write landed at
 * the Process; a write landing in a declaring frame adds nothing, since only readers inside that frame could see it.
 */
export function requiredReads(accesses: readonly Access[]): readonly string[] {
  const produced = new Set<string>();
  const required: string[] = [];
  for (const { kind, name, frames } of accesses) {
    const declared = frames.some(frame => frame.includes(name));
    if (kind === "write" || kind === "callOutput") {
      if (!declared) produced.add(name);
    } else if (kind === "read" && !declared && !produced.has(name) && !required.includes(name)) {
      required.push(name);
    }
  }
  return required;
}

/**
 * CVM-START-01: the Call input sources and output targets a Start binding would supply, those landing at the Process
 * because no enclosing frame of the Call declares them and no earlier step definitely produces them.
 */
export function optionalCallNames(accesses: readonly Access[]): readonly string[] {
  const produced = new Set<string>();
  const optional: string[] = [];
  for (const { kind, name, frames } of accesses) {
    const declared = frames.some(frame => frame.includes(name));
    if ((kind === "callInput" || kind === "callOutput") && !declared && !produced.has(name) && !optional.includes(name)) {
      optional.push(name);
    }
    if ((kind === "write" || kind === "callOutput") && !declared) produced.add(name);
  }
  return optional;
}

/** NSD-AVAILABLE-01's required Start names; `optional` is `null` without a Call, where any admitted name may be bound. */
export type NestedScopeStartNames = Readonly<{ required: readonly string[]; optional: readonly string[] | null }>;

/**
 * One checked graph or Program of the profile as vertices, independent of how its root body is shaped. The serial
 * analysis and the re-entry root-graph analysis both start from it.
 */
export type ScopeDataModel = Readonly<{
  vertices: readonly Vertex[];
  records: readonly ScopeLocalData[];
  scopes: readonly DefinitionScope[];
  root: string;
  entry: string;
  handlers: ReadonlySet<string>;
}>;

/** NSD-ADMIT-01's scope, Call and declaration bounds, shared by the serial and re-entry accounts. */
export function scopeDataStructureAdmitted({ vertices, records, scopes, root, handlers }: ScopeDataModel): boolean {
  const children = vertices.flatMap(vertex => vertex.child === undefined ? [] : [vertex.child.scope]);
  const calls = vertices.flatMap(vertex => vertex.call === undefined ? [] : [vertex.call]);
  const calledScopes = new Set(calls.map(({ scope }) => scope));
  const roots = scopes.filter(({ parentScopeId }) => parentScopeId === null);
  return scopes.length === children.length + calledScopes.size + 1 &&
    calls.length <= nestedScopeCallLimit && calledScopes.size <= 1 && roots.length === calledScopes.size + 1 &&
    roots.some(({ id }) => id === root) && calls.every(call => call.scope !== root && callMappingsAdmitted(call.data, handlers)) &&
    strictlySorted(records.map(({ scopeId }) => scopeId)) &&
    records.every(record => children.includes(record.scopeId) && scopeLocalRecordAdmitted(handlers, record));
}

/**
 * The accesses of one root-body vertex of a re-entry root graph, with the body vertices its walk visits: a
 * Sub-Process or Call walks its body exactly as the serial walk does, without continuing to the vertex's successor.
 */
export function scopeDataVertexWalk(model: ScopeDataModel, vertex: Vertex): Walked | null {
  const { vertices, records, scopes } = model;
  const fuel = vertices.length + 1;
  switch (vertex.kind) {
    case VertexKind.SubProcess: {
      const child = vertex.child;
      if (child === undefined || !childScopeValid(scopes, vertex.scope, child.scope, child.origin)) return null;
      const record = records.find(({ scopeId }) => scopeId === child.scope);
      const inputs = record?.localInputs ?? [];
      const inner = walk(vertices, records, scopes, fuel, 1, [inputs.map(({ target }) => target)], child.scope, child.entry);
      return inner === null ? null : {
        accesses: [...readNames(inputs).map(name => ({ kind: "read" as const, name, frames: [] })), ...inner.accesses,
          ...(record?.localOutputs ?? []).map(({ target }) => ({ kind: "write" as const, name: target, frames: [] }))],
        visited: inner.visited, called: inner.called,
      };
    }
    case VertexKind.Call: {
      const call = vertex.call;
      if (call === undefined || !calledScopeValid(scopes, call.scope, call.calledProcessId)) return null;
      const inner = walk(vertices, records, scopes, fuel, 0, [], call.scope, call.entry);
      return inner === null || !calledPathValid(vertices, inner.visited) ? null : {
        accesses: [
          ...call.data.inputs.flatMap(({ expression }) => expression.kind === MappingExpressionKind.EnclosingVariable
            ? [{ kind: "callInput" as const, name: expression.name, frames: [] }] : []),
          ...call.data.outputs.map(({ target }) => ({ kind: "callOutput" as const, name: target, frames: [] })),
        ],
        visited: [], called: inner.visited,
      };
    }
    case VertexKind.Service:
      return { accesses: [...vertex.reads.map(name => ({ kind: "read" as const, name, frames: [] })),
        ...vertex.writes.map(name => ({ kind: "write" as const, name, frames: [] }))], visited: [], called: [] };
    default:
      return { accesses: [], visited: [], called: [] };
  }
}

function analyze(model: ScopeDataModel): NestedScopeStartNames | null {
  const { vertices, records, scopes, root, entry } = model;
  const calls = vertices.flatMap(vertex => vertex.call === undefined ? [] : [vertex.call]);
  if (!scopeDataStructureAdmitted(model) ||
      vertices.some(({ kind }) => kind === VertexKind.Choice || kind === VertexKind.Merge)) return null;
  const walked = walk(vertices, records, scopes, vertices.length + 1, 0, [], root, entry);
  const calledVertices = new Set(walked?.called ?? []);
  if (walked === null || new Set(walked.visited).size !== walked.visited.length ||
      walked.visited.some(id => calledVertices.has(id)) ||
      walked.visited.length + calledVertices.size !== vertices.length) return null;
  return { required: requiredReads(walked.accesses), optional: calls.length === 0 ? null : optionalCallNames(walked.accesses) };
}

/** NSD-ADMIT-01 admits no form: the patch names come from the scope chain, not from a declared form field. */
function metadataValid(metadata: unknown): boolean {
  return metadata === undefined;
}

function unique<T>(values: readonly T[]): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function checkedVertex(source: CheckedProcess, node: CheckedProcess["nodes"][number],
  handlers: ReadonlySet<string>): Vertex | null {
  const scope = unique(source.nodeScopes.filter(({ nodeId }) => nodeId === node.id))?.scopeId;
  if (scope === undefined) return null;
  const outputs = source.sequenceFlows.filter(({ sourceId }) => sourceId === node.id).map(({ targetId }) => targetId);
  const base = { id: node.id, scope, outputs, reads: [], writes: [] };
  switch (node.kind) {
    case CheckedNodeKind.NoneStartEvent: return { ...base, kind: VertexKind.Start };
    case CheckedNodeKind.NoneEndEvent: return { ...base, kind: VertexKind.Finish };
    case CheckedNodeKind.UserTask: return metadataValid(node.metadata) ? { ...base, kind: VertexKind.Human } : null;
    case CheckedNodeKind.ServiceTask:
      return node.bpmnErrorRoute === null && serviceValid(node, handlers)
        ? { ...base, kind: VertexKind.Service, reads: readNames(node.inputMappings),
          writes: node.outputMappings.map(({ target }) => target) }
        : null;
    case CheckedNodeKind.EmbeddedSubProcess: {
      const entry = checkedStart(source, node.childScopeId);
      return entry === undefined ? null
        : { ...base, kind: VertexKind.SubProcess, child: { scope: node.childScopeId, entry, origin: node.id } };
    }
    case CheckedNodeKind.ExclusiveGateway: {
      // SRE-ADMIT-01: the ordered conditional candidates, then the default when the source declares one (XND-ADMIT-01).
      const target = (flowId: string) => source.sequenceFlows.find(({ id }) => id === flowId)?.targetId;
      const targets = [...node.candidateFlowIds, ...(node.defaultFlowId === undefined ? [] : [node.defaultFlowId])].map(target);
      return node.candidateFlowIds.length > 0 && targets.every(id => id !== undefined)
        ? { ...base, kind: VertexKind.Choice, outputs: targets as string[] } : null;
    }
    case CheckedNodeKind.ExclusiveMerge: return { ...base, kind: VertexKind.Merge };
    // PTSM-ADMIT-01: several incoming flows make it the many-input merge it lowers to.
    case CheckedNodeKind.NonOperationalTask:
    case CheckedNodeKind.NoneIntermediateThrowEvent:
      return { ...base, kind: checkedNodeMerges(node, source.sequenceFlows) ? VertexKind.Merge : VertexKind.PassThrough };
    case CheckedNodeKind.CallActivity: {
      const calledRoot = unique(source.definitionScopes.filter(({ parentScopeId, originElementId }) =>
        parentScopeId === null && originElementId === node.calledProcessId));
      const entry = calledRoot === undefined ? undefined : checkedStart(source, calledRoot.id);
      return calledRoot === undefined || entry === undefined || node.data.kind !== CallDataKind.VariableMappings ? null
        : { ...base, kind: VertexKind.Call,
          call: { scope: calledRoot.id, entry, calledProcessId: node.calledProcessId, data: node.data } };
    }
    default: return null;
  }
}

function checkedStart(source: CheckedProcess, scope: string): string | undefined {
  return unique(source.nodes.filter(node => node.kind === CheckedNodeKind.NoneStartEvent &&
    unique(source.nodeScopes.filter(({ nodeId }) => nodeId === node.id))?.scopeId === scope).map(({ id }) => id));
}

function serviceValid(effect: unknown, handlers: ReadonlySet<string>): boolean {
  const value = effect as Readonly<{ descriptor: unknown; inputMappings: unknown; outputMappings: unknown }>;
  return serialBusinessMappingsAdmitted(value.inputMappings, true, handlers, rules) &&
    serialBusinessMappingsAdmitted(value.outputMappings, false, handlers, rules) &&
    isEffectDescriptor(value.descriptor);
}

function isEffectDescriptor(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const descriptor = value as Readonly<{ protocol?: unknown; operation?: unknown }>;
  return descriptor.protocol === "urn:bpmn-lean:effect-protocol:activity-v1" &&
    isSerialBusinessIdentifier(descriptor.operation) && descriptor.operation.length <= 1024;
}

/** NSD-ADMIT-01 over the checked graph; `null` refuses the definition. */
export function nestedScopeCheckedAnalysis(source: CheckedProcess): readonly string[] | null {
  return nestedScopeCheckedStartNames(source)?.required ?? null;
}

/** NSD-ADMIT-01 and CVM-START-01 over the checked graph; `null` refuses the definition. */
export function nestedScopeCheckedStartNames(source: CheckedProcess): NestedScopeStartNames | null {
  const model = source.sequenceFlows.some(({ condition }) => condition !== null) ? null : nestedScopeCheckedModel(source);
  return model === null ? null : analyze(model);
}

/** The checked graph as the profile's vertex model, refusing everything outside the shared element grammar. */
export function nestedScopeCheckedModel(source: CheckedProcess): ScopeDataModel | null {
  const identities = [source.processId, ...source.nodes.map(({ id }) => id), ...source.sequenceFlows.map(({ id }) => id)];
  if (source.identity.sourceOverlay === null || source.compensation !== undefined ||
      source.transactionCancellation !== undefined || source.interruptingMessageEventSubProcesses !== undefined ||
      new Set(identities).size !== identities.length || !scopeCountAdmitted(source.identity.semanticProfile,
        source.definitionScopes.length)) {
    return null;
  }
  const root = unique(source.definitionScopes.filter(({ parentScopeId, originElementId }) =>
    parentScopeId === null && originElementId === source.processId));
  const entry = root === undefined ? undefined : checkedStart(source, root.id);
  if (root === undefined || entry === undefined) return null;
  const handlers = new Set(source.nodes.flatMap(node =>
    node.kind === CheckedNodeKind.ServiceTask ? [node.descriptor.operation] : []));
  const vertices: Vertex[] = [];
  for (const node of source.nodes) {
    const vertex = checkedVertex(source, node, handlers);
    if (vertex === null) return null;
    vertices.push(vertex);
  }
  return { vertices, records: source.scopeLocalData ?? [], scopes: source.definitionScopes, root: root.id, entry, handlers };
}

function operationInputs(operation: SemanticOperation): readonly string[] {
  switch (operation.kind) {
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.InvokeProcess:
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitEffect:
    case SemanticOperationKind.ReachNoneEnd:
    case SemanticOperationKind.Choose:
      return [operation.input];
    case SemanticOperationKind.MergeExclusive:
    case SemanticOperationKind.Activity:
      return operation.inputs;
    default:
      return [];
  }
}

function programHandlers(program: SemanticProcessProgram): ReadonlySet<string> {
  return new Set(settledOperations(program.operations).flatMap(operation =>
    operation.kind === SemanticOperationKind.AwaitEffect ? [operation.effect.descriptor.operation] : []));
}

function operationVertex(program: SemanticProcessProgram, operation: SemanticOperation,
  handlers: ReadonlySet<string>): Vertex | null {
  const scope = unique(program.operationScopes.filter(({ operationId }) => operationId === operation.id))?.scopeId;
  const consumer = (place: string): string | undefined =>
    unique(program.operations.filter(candidate => operationInputs(candidate).includes(place)))?.id;
  if (scope === undefined) return null;
  const base = { id: operation.id, scope, reads: [], writes: [] };
  const following = (place: string): readonly string[] | null => {
    const next = consumer(place);
    return next === undefined ? null : [next];
  };
  switch (operation.kind) {
    case SemanticOperationKind.Initiate: {
      const outputs = following(operation.output);
      return outputs === null ? null : { ...base, kind: VertexKind.Start, outputs };
    }
    case SemanticOperationKind.ReachNoneEnd: return { ...base, kind: VertexKind.Finish, outputs: [] };
    case SemanticOperationKind.AwaitUserTask: {
      const outputs = following(operation.output);
      return outputs === null || !metadataValid(operation.task.metadata) ? null
        : { ...base, kind: VertexKind.Human, outputs };
    }
    case SemanticOperationKind.AwaitEffect: {
      const outputs = following(operation.output);
      return outputs === null || operation.bpmnErrorRoute !== null || operation.origin.elementId !== operation.effect.elementId ||
          !serviceValid(operation.effect, handlers) ? null
        : { ...base, kind: VertexKind.Service, outputs, reads: readNames(operation.effect.inputMappings),
          writes: operation.effect.outputMappings.map(({ target }) => target) };
    }
    case SemanticOperationKind.Choose: {
      const targets = [...operation.candidates.map(({ output }) => output),
        ...(operation.defaultOutput === undefined ? [] : [operation.defaultOutput])].map(following);
      return operation.candidates.length > 0 && targets.every(target => target !== null)
        ? { ...base, kind: VertexKind.Choice, outputs: targets.flatMap(target => target ?? []) } : null;
    }
    case SemanticOperationKind.MergeExclusive: {
      const outputs = following(operation.output);
      // Every checked Exclusive merge has at least two inputs, so one input is an Abstract or Manual Task (PTT-ADMIT-01);
      // a pass-through node with several inputs is a merge at both levels (PTSM-ADMIT-01).
      return outputs === null ? null
        : { ...base, kind: operation.inputs.length === 1 ? VertexKind.PassThrough : VertexKind.Merge, outputs };
    }
    case SemanticOperationKind.InvokeProcess: {
      const returns = program.operations.filter(candidate => candidate.id === operation.returnOperationId);
      const returned = unique(returns);
      const entry = consumer(operation.calledEntry);
      const outputs = returned?.kind === SemanticOperationKind.ReturnProcess ? following(returned.callerOutput) : null;
      return returned?.kind !== SemanticOperationKind.ReturnProcess || entry === undefined || outputs === null ||
          operation.data.kind !== CallDataKind.VariableMappings || !sameCallDataInterface(operation.data, returned.data) ||
          returned.calledRootScopeId !== operation.calledRootScopeId ? null : {
        ...base, kind: VertexKind.Call, outputs,
        call: { scope: operation.calledRootScopeId, entry, calledProcessId: operation.calledProcessId, data: operation.data },
      };
    }
    case SemanticOperationKind.EnterScope: {
      const completions = program.operations.filter(candidate =>
        candidate.kind === SemanticOperationKind.CompleteScope && candidate.scopeId === operation.childScopeId);
      const completion = unique(completions);
      const parentOutput = completion?.kind === SemanticOperationKind.CompleteScope ? completion.parentOutput : null;
      const entry = consumer(operation.childEntry);
      const outputs = parentOutput === null ? null : following(parentOutput);
      return entry === undefined || outputs === null ? null : {
        ...base, kind: VertexKind.SubProcess, outputs,
        child: { scope: operation.childScopeId, entry, origin: operation.origin.elementId },
      };
    }
    // ACTH-ADMIT-01: a host is the vertex of its work's legacy projection, its inputs being its several predecessors.
    case SemanticOperationKind.Activity: {
      const settled = activityHostSettledProjection(operation);
      return settled === null ? null : operationVertex(program, settled, handlers);
    }
    default: return null;
  }
}

/** NSD-ADMIT-01 over the Program, independent of the checked graph; `null` refuses the Program. */
export function nestedScopeProgramAnalysis(program: SemanticProcessProgram): readonly string[] | null {
  return nestedScopeProgramStartNames(program)?.required ?? null;
}

/**
 * NSD-ADMIT-01 and CVM-START-01 over the Program. A Call's return is no vertex: it shares the Call's element identity
 * and continues the caller, so the walk reaches the caller's successor from the invocation, as a Sub-Process does.
 */
export function nestedScopeProgramStartNames(program: SemanticProcessProgram): NestedScopeStartNames | null {
  const model = nestedScopeProgramModel(program);
  return model === null ? null : analyze(model);
}

/** The Program as the profile's vertex model, independent of the checked graph. */
export function nestedScopeProgramModel(program: SemanticProcessProgram): ScopeDataModel | null {
  if (program.identity.sourceOverlay === null ||
      program.internalSchedulingMode !== InternalSchedulingMode.RejectObservableChoice ||
      program.compensationActivityRetention !== undefined || program.compensationEventSubProcessSnapshots !== undefined ||
      program.compensationExecution !== undefined || program.interruptingMessageEventSubProcesses !== undefined ||
      !scopeCountAdmitted(program.identity.semanticProfile, program.definitionScopes.length)) return null;
  const root = unique(program.definitionScopes.filter(({ parentScopeId, originElementId }) =>
    parentScopeId === null && originElementId === program.processId));
  if (root === undefined) return null;
  const calledRoots = program.definitionScopes.filter(({ parentScopeId }) => parentScopeId === null).length - 1;
  const completions = program.operations.filter(({ kind }) => kind === SemanticOperationKind.CompleteScope);
  const operations = program.operations.filter(({ kind }) =>
    kind !== SemanticOperationKind.CompleteScope && kind !== SemanticOperationKind.ReturnProcess);
  const rootCompleted = completions.some(operation =>
    operation.kind === SemanticOperationKind.CompleteScope && operation.parentOutput === null && operation.scopeId === root.id);
  const identities: string[] = [program.processId];
  // NEF-ADMIT-01: the arrivals of one fan-in End share its origin and count once, only when all lie in the root graph;
  // every other repeated origin still refuses, keeping one vertex per element.
  const arrivalScopes = new Map<string, string[]>();
  for (const operation of operations) {
    if (!("elementId" in operation.origin)) return null;
    if (operation.kind !== SemanticOperationKind.ReachNoneEnd) {
      identities.push(operation.origin.elementId);
      continue;
    }
    const scopes = arrivalScopes.get(operation.origin.elementId) ?? [];
    scopes.push(program.operationScopes.find(({ operationId }) => operationId === operation.id)?.scopeId ?? "");
    arrivalScopes.set(operation.origin.elementId, scopes);
  }
  for (const [origin, scopes] of arrivalScopes) {
    if (scopes.length > 1 && scopes.some(scope => scope !== root.id)) return null;
    identities.push(origin);
  }
  identities.push(...program.controlPlaces.map(({ origin }) => origin.elementId));
  if (!rootCompleted || completions.length !== program.definitionScopes.length - calledRoots ||
      new Set(identities).size !== identities.length) return null;
  const start = unique(operations.filter(({ kind }) => kind === SemanticOperationKind.Initiate));
  if (start === undefined) return null;
  const handlers = programHandlers(program);
  const vertices: Vertex[] = [];
  for (const operation of operations) {
    const vertex = operationVertex(program, operation, handlers);
    if (vertex === null) return null;
    vertices.push(vertex);
  }
  return { vertices, records: program.scopeLocalData ?? [], scopes: program.definitionScopes, root: root.id, entry: start.id,
    handlers };
}

/**
 * NSD-AVAILABLE-01, CSD-AVAILABLE-01 and the Start domain of a Program whose frames resolve by the occurrence chain:
 * admitted names, each within the Program's effect policy, covering every required name, a present null included. A
 * completion patch's name rule is NSD-TASK-01's, checked against the committed state by the command path; here it
 * keeps only the shared identifier and value rules. `names` is the Program's own analysis, which every command
 * re-runs, as the Lean completions do, so a refused Program commits nothing.
 */
export function scopeDataStimulusWithin(program: SemanticProcessProgram, stimulus: Stimulus,
  names: NestedScopeStartNames): boolean {
  const { required, optional } = names;
  const handlers = programHandlers(program);
  const policy = effectMappingValuePolicyForProgram(program);
  const value = (binding: VariableBinding["value"]): boolean => effectMappingAcceptsValue(policy, binding, true);
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
      // CVM-START-01 restricts Start names only in Programs with a Call, keeping every earlier admission unchanged.
      return stimulus.instanceId.length > 0 &&
        serialBusinessBindingsAdmitted(stimulus.initialVariables, handlers, value) &&
        required.every(name => stimulus.initialVariables.some(binding => binding.name === name)) &&
        (optional === null || stimulus.initialVariables.every(({ name }) => required.includes(name) || optional.includes(name)));
    case StimulusKind.CompleteUserTaskInstance:
      return serialBusinessBindingsAdmitted(stimulus.submittedValues, handlers, value);
    case StimulusKind.CompleteEffect:
      return stimulus.result.kind === EffectExecutionResultKind.Success &&
        serialBusinessBindingsAdmitted(stimulus.result.localPatch, handlers, value);
    default:
      return false;
  }
}

/**
 * The wire shape of the optional Program and checked `scopeLocalData` table: absent unless nonempty, so an empty array
 * is a second spelling of "no table" and is refused. Profile admission decides every capability.
 */
export function isScopeLocalDataTable(value: unknown): value is readonly ScopeLocalData[] {
  return Array.isArray(value) && value.length > 0 && value.every(record =>
    typeof record === "object" && record !== null && !Array.isArray(record) &&
    Object.keys(record).length === 3 && typeof record.scopeId === "string" && record.scopeId.length > 0 &&
    serialBusinessMappingsAdmitted(record.localInputs, true, new Set(), rules) &&
    serialBusinessMappingsAdmitted(record.localOutputs, false));
}

const programOperationKinds: ReadonlySet<SemanticOperationKind> = new Set([
  SemanticOperationKind.Initiate, SemanticOperationKind.EnterScope, SemanticOperationKind.AwaitUserTask,
  SemanticOperationKind.AwaitEffect, SemanticOperationKind.CompleteScope, SemanticOperationKind.ReachNoneEnd,
  SemanticOperationKind.InvokeProcess, SemanticOperationKind.ReturnProcess,
  // SRE-ADMIT-01: root Choices and Merges, which only the re-entry route admits; ACTH-ADMIT-01: root hosts likewise.
  SemanticOperationKind.Choose, SemanticOperationKind.MergeExclusive, SemanticOperationKind.Activity,
]);

const checkedNodeKinds: ReadonlySet<CheckedNodeKind> = new Set([
  CheckedNodeKind.NoneStartEvent, CheckedNodeKind.EmbeddedSubProcess, CheckedNodeKind.UserTask,
  CheckedNodeKind.ServiceTask, CheckedNodeKind.NoneEndEvent, CheckedNodeKind.CallActivity,
  CheckedNodeKind.ExclusiveGateway, CheckedNodeKind.ExclusiveMerge, CheckedNodeKind.NonOperationalTask,
  CheckedNodeKind.NoneIntermediateThrowEvent,
]);

/**
 * SSM-ADMIT-01 and SSM-PROFILE-01: the nested scope-data profile admits a Process whose only scope is its root, while
 * every other profile reaching these analyses keeps needing a Sub-Process or a Call, a second scope.
 */
export function scopeCountAdmitted(semanticProfile: string, scopeCount: number): boolean {
  return scopeCount >= (semanticProfile === SemanticProfileId.NestedEmbeddedScopeData ? 1 : 2);
}

/**
 * The operation alphabet and the profile's lower scope bound. The number of scopes has no upper bound here, matching
 * the Lean admission, which bounds only depth (`depthLimit`, enforced by the tree walk) and declarations; a serial
 * chain of sibling Sub-Processes adds scopes without adding depth.
 */
export function nestedScopeProgramShape(operations: readonly SemanticOperation[], semanticProfile: string,
  scopeCount: number): boolean {
  return scopeCountAdmitted(semanticProfile, scopeCount) && operations.every(({ kind }) => programOperationKinds.has(kind));
}

export function nestedScopeCheckedShape(nodes: readonly CheckedProcess["nodes"][number][], semanticProfile: string,
  scopeCount: number): boolean {
  return scopeCountAdmitted(semanticProfile, scopeCount) && nodes.every(({ kind }) => checkedNodeKinds.has(kind));
}
