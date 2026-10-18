import { CheckedNodeKind } from "./checked-process-contract.js";
import type { CheckedProcess } from "./checked-process-contract.js";
import { EffectExecutionResultKind, StimulusKind } from "./contract.js";
import type { Stimulus, VariableBinding } from "./contract.js";
import { EffectMappingValuePolicy, effectMappingAcceptsValue } from "./effect-mapping-value-policy.js";
import { nestedScopeDataProgram } from "./nested-scope-data.js";
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

const VertexKind = { Start: "start", Human: "human", Service: "service", SubProcess: "subProcess", Finish: "finish" } as const;
type VertexKind = typeof VertexKind[keyof typeof VertexKind];

type Vertex = Readonly<{
  id: string;
  scope: string;
  kind: VertexKind;
  /** Set only for a Sub-Process: its child scope, the child's first vertex and the Sub-Process element. */
  child?: Readonly<{ scope: string; entry: string; origin: string }>;
  outputs: readonly string[];
  reads: readonly string[];
  writes: readonly string[];
}>;

type Access = Readonly<{ kind: "read" | "write"; name: string; frames: readonly (readonly string[])[] }>;

function readNames(mappings: readonly VariableMapping[]): string[] {
  return mappings.flatMap(({ expression }) =>
    expression.kind === MappingExpressionKind.EnclosingVariable ? [expression.name] : []);
}

function strictlySorted(names: readonly string[]): boolean {
  return names.every((name, index) => index === 0 || compareCanonicalStrings(names[index - 1]!, name) < 0);
}

function recordValid(handlers: ReadonlySet<string>, record: ScopeLocalData): boolean {
  const inputs = new Set(record.localInputs.map(({ target }) => target));
  return record.localInputs.length > 0 && record.localInputs.length <= declarationLimit &&
    record.localOutputs.length <= declarationLimit &&
    serialBusinessMappingsAdmitted(record.localInputs, true, handlers, rules) &&
    strictlySorted(record.localOutputs.map(({ target }) => target)) &&
    record.localOutputs.every(({ target, expression }) =>
      isSerialBusinessIdentifier(target) && !handlers.has(target) &&
      expression.kind === MappingExpressionKind.LocalVariable && inputs.has(expression.name));
}

function childScopeValid(scopes: readonly DefinitionScope[], parent: string, child: string, origin: string): boolean {
  const matching = scopes.filter(({ id }) => id === child);
  return matching.length === 1 && matching[0]!.parentScopeId === parent && matching[0]!.originElementId === origin;
}

type Walked = Readonly<{ accesses: readonly Access[]; visited: readonly string[] }>;

function walk(vertices: readonly Vertex[], records: readonly ScopeLocalData[], scopes: readonly DefinitionScope[],
  fuel: number, depth: number, frames: readonly (readonly string[])[], scope: string, id: string): Walked | null {
  if (fuel === 0) return null;
  const matching = vertices.filter(vertex => vertex.id === id);
  const vertex = matching.length === 1 ? matching[0]! : undefined;
  if (vertex === undefined || vertex.scope !== scope) return null;
  if (vertex.kind === VertexKind.Finish) return vertex.outputs.length === 0 ? { accesses: [], visited: [vertex.id] } : null;
  const next = vertex.outputs.length === 1 ? vertex.outputs[0]! : undefined;
  if (next === undefined) return null;
  switch (vertex.kind) {
    case VertexKind.Start:
    case VertexKind.Human:
    case VertexKind.Service: {
      const rest = walk(vertices, records, scopes, fuel - 1, depth, frames, scope, next);
      if (rest === null) return null;
      const own: Access[] = vertex.kind === VertexKind.Service ? [
        ...vertex.reads.map(name => ({ kind: "read" as const, name, frames })),
        ...vertex.writes.map(name => ({ kind: "write" as const, name, frames })),
      ] : [];
      return { accesses: [...own, ...rest.accesses], visited: [vertex.id, ...rest.visited] };
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
      };
    }
  }
}

/**
 * NSD-AVAILABLE-01: a read is available when an enclosing frame declares it or an earlier definite write landed at
 * the Process; a write landing in a declaring frame adds nothing, since only readers inside that frame could see it.
 */
function requiredReads(accesses: readonly Access[]): readonly string[] {
  const produced = new Set<string>();
  const required: string[] = [];
  for (const { kind, name, frames } of accesses) {
    const declared = frames.some(frame => frame.includes(name));
    if (kind === "write") {
      if (!declared) produced.add(name);
    } else if (!declared && !produced.has(name) && !required.includes(name)) {
      required.push(name);
    }
  }
  return required;
}

function analyze(vertices: readonly Vertex[], records: readonly ScopeLocalData[], scopes: readonly DefinitionScope[],
  root: string, entry: string, handlers: ReadonlySet<string>): readonly string[] | null {
  const children = vertices.flatMap(vertex => vertex.child === undefined ? [] : [vertex.child.scope]);
  const roots = scopes.filter(({ parentScopeId }) => parentScopeId === null);
  if (scopes.length !== children.length + 1 || children.length === 0 || roots.length !== 1 || roots[0]!.id !== root ||
      !strictlySorted(records.map(({ scopeId }) => scopeId)) ||
      !records.every(record => children.includes(record.scopeId) && recordValid(handlers, record))) return null;
  const walked = walk(vertices, records, scopes, vertices.length + 1, 0, [], root, entry);
  if (walked === null || walked.visited.length !== vertices.length ||
      new Set(walked.visited).size !== walked.visited.length) return null;
  return requiredReads(walked.accesses);
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
  const identities = [source.processId, ...source.nodes.map(({ id }) => id), ...source.sequenceFlows.map(({ id }) => id)];
  if (source.identity.sourceOverlay === null || source.compensation !== undefined ||
      source.transactionCancellation !== undefined || source.interruptingMessageEventSubProcesses !== undefined ||
      new Set(identities).size !== identities.length || source.sequenceFlows.some(({ condition }) => condition !== null)) {
    return null;
  }
  const root = unique(source.definitionScopes.filter(({ parentScopeId }) => parentScopeId === null));
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
  return analyze(vertices, source.scopeLocalData ?? [], source.definitionScopes, root.id, entry, handlers);
}

function operationInputs(operation: SemanticOperation): readonly string[] {
  switch (operation.kind) {
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitEffect:
    case SemanticOperationKind.ReachNoneEnd:
      return [operation.input];
    default:
      return [];
  }
}

function programHandlers(program: SemanticProcessProgram): ReadonlySet<string> {
  return new Set(program.operations.flatMap(operation =>
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
    default: return null;
  }
}

/** NSD-ADMIT-01 over the Program, independent of the checked graph; `null` refuses the Program. */
export function nestedScopeProgramAnalysis(program: SemanticProcessProgram): readonly string[] | null {
  if (program.identity.sourceOverlay === null ||
      program.internalSchedulingMode !== InternalSchedulingMode.RejectObservableChoice ||
      program.compensationActivityRetention !== undefined || program.compensationEventSubProcessSnapshots !== undefined ||
      program.compensationExecution !== undefined || program.interruptingMessageEventSubProcesses !== undefined) return null;
  const root = unique(program.definitionScopes.filter(({ parentScopeId }) => parentScopeId === null));
  if (root === undefined) return null;
  const completions = program.operations.filter(({ kind }) => kind === SemanticOperationKind.CompleteScope);
  const operations = program.operations.filter(({ kind }) => kind !== SemanticOperationKind.CompleteScope);
  const rootCompleted = completions.some(operation =>
    operation.kind === SemanticOperationKind.CompleteScope && operation.parentOutput === null && operation.scopeId === root.id);
  const identities: string[] = [program.processId];
  for (const operation of operations) {
    if (!("elementId" in operation.origin)) return null;
    identities.push(operation.origin.elementId);
  }
  identities.push(...program.controlPlaces.map(({ origin }) => origin.elementId));
  if (!rootCompleted || completions.length !== program.definitionScopes.length ||
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
  return analyze(vertices, program.scopeLocalData ?? [], program.definitionScopes, root.id, start.id, handlers);
}

const itemValue = (binding: VariableBinding["value"]): boolean =>
  effectMappingAcceptsValue(EffectMappingValuePolicy.SingletonBusinessItem, binding, true);

/**
 * NSD-AVAILABLE-01 and the profile's Start domain: admitted names, each a `SingletonBusinessItem`, covering every
 * required name, a present null included. A completion patch's name rule is NSD-TASK-01's, checked against the
 * committed state by the command path; here it keeps only the shared identifier and value rules.
 */
export function nestedScopeStimulusDataAdmitted(program: SemanticProcessProgram, stimulus: Stimulus): boolean {
  if (!nestedScopeDataProgram(program)) return true;
  // Every command re-checks Program admission, as the Lean completions do, so a refused Program commits nothing.
  const required = nestedScopeProgramAnalysis(program);
  if (required === null) return false;
  const handlers = programHandlers(program);
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
      return stimulus.instanceId.length > 0 &&
        serialBusinessBindingsAdmitted(stimulus.initialVariables, handlers, itemValue) &&
        required.every(name => stimulus.initialVariables.some(binding => binding.name === name));
    case StimulusKind.CompleteUserTaskInstance:
      return serialBusinessBindingsAdmitted(stimulus.submittedValues, handlers, itemValue);
    case StimulusKind.CompleteEffect:
      return stimulus.result.kind === EffectExecutionResultKind.Success &&
        serialBusinessBindingsAdmitted(stimulus.result.localPatch, handlers, itemValue);
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
]);

const checkedNodeKinds: ReadonlySet<CheckedNodeKind> = new Set([
  CheckedNodeKind.NoneStartEvent, CheckedNodeKind.EmbeddedSubProcess, CheckedNodeKind.UserTask,
  CheckedNodeKind.ServiceTask, CheckedNodeKind.NoneEndEvent,
]);

/**
 * The operation alphabet and the lower scope bound: a Process needs at least one Sub-Process. The number of scopes has
 * no upper bound here, matching the Lean admission, which bounds only depth (`depthLimit`, enforced by the tree walk)
 * and declarations; a serial chain of sibling Sub-Processes adds scopes without adding depth.
 */
export function nestedScopeProgramShape(operations: readonly SemanticOperation[], scopeCount: number): boolean {
  return scopeCount >= 2 && operations.every(({ kind }) => programOperationKinds.has(kind));
}

export function nestedScopeCheckedShape(nodes: readonly CheckedProcess["nodes"][number][], scopeCount: number): boolean {
  return scopeCount >= 2 && nodes.every(({ kind }) => checkedNodeKinds.has(kind));
}
