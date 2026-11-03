import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with { type: "json" };
import { readBusinessTaskMappings } from "./business-task-mapping-source.js";
import {
  classifyGateway, projectCheckedSequenceFlows, projectExclusiveMerge, projectUserTaskMetadata,
} from "./checked-element-projection.js";
import {
  CallDataKind, CheckedNodeKind, CheckedProcessKind, GatewayDirection, MappingExpressionKind, SemanticProfileId,
  TaskNotation, callDataInterfaceValid, compareCanonicalStrings, isWellFormedWireString, structuredScopeDataCheckedAnalysis,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode, CheckedProcess, CheckedSequenceFlow, DefinitionScope, ScopeLocalData, VariableMapping,
} from "@bpmn-lean/semantic-core";
import { isAdmittedCheckedProcess } from "./checked-process-admission.js";
import { locateContainedElements, orderedElementDiagnostics } from "./admission-diagnostics.js";
import { BpmnSourceDiagnosticCode } from "./contracts.js";
import type { BpmnSourceIdentity, CheckedCompilationProjection } from "./contracts.js";
import { asElement, asElementArray, hasOnlyModelledKeys, readId } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import { selectMappedServiceTaskSourcePolicy } from "./mapped-service-task-source-policy.js";
import type { MappedServiceTaskSourcePolicy } from "./mapped-service-task-source-policy.js";
import { projectMappedSuccessSequenceFlows, projectPlainNode } from "./mapped-service-task-source.js";
import { ProjectedFlowElementShape, hasOnlyProjectedFlowElementKeys } from "./projected-flow-element-keys.js";
import { exactForeignAttributeRejections } from "./preserved-element-classification.js";
import { definitionScopeId } from "./scoped-flow-elements.js";
import { projectSerialBusinessServiceTask } from "./serial-business-task-source.js";
import { projectExclusiveGateway } from "./simple-boolean-exclusive-gateway-source.js";
import type { AdmittedSourceOverlay } from "./source-overlay.js";

const camunda = "http://camunda.org/schema/1.0/bpmn";
const bpmnTypes = metamodelManifest.compilerProjection;

/** One more level than NSD-ADMIT-01 admits, so the reader's recursion stays bounded while admission decides depth. */
const readerDepthLimit = 4;

type ProcessRoot = Readonly<{ processId: string; scopeId: string }>;

type Collected = {
  nodes: CheckedNode[];
  flows: CheckedSequenceFlow[];
  scopes: DefinitionScope[];
  nodeScopes: { nodeId: string; scopeId: string }[];
  flowScopes: { sequenceFlowId: string; scopeId: string }[];
  records: ScopeLocalData[];
  ids: string[];
};

/**
 * What one scope-data profile's reader admits beyond the shared element grammar: Parallel gateways and Exclusive
 * merges, mapped and unmapped Calls of several called Processes for the embedded completion profile (CSD-ADMIT-01,
 * CMCALL-ADMIT-01), mapped Calls of one called Process for the nested scope-data profile, whose admission keeps
 * Parallel blocks inside Sub-Process bodies (CSSD-ADMIT-01).
 */
type ScopeDataReader = Readonly<{
  semanticProfile: string;
  gateways: boolean;
  /** SRE-ADMIT-01: conditional flows and two-condition Exclusive Choices in a Process root body. */
  rootChoices: boolean;
  /** PTT-ADMIT-01, NIT-ADMIT-01: Abstract and Manual Tasks and None Throws, which the profile's lowering passes through. */
  nonOperationalTasks: boolean;
  projectCall: (element: ElementRecord) => CheckedNode | undefined;
  /** The caller Process of the read roots, or `undefined` when the roots and Calls do not form one call forest. */
  caller: (roots: readonly ProcessRoot[], collected: Collected) => string | undefined;
  /** Whether a model needs the overlay even without a Service Task; otherwise it binds one exactly when it has one. */
  overlayRequired: boolean;
  /** The profile's own analysis of the graph and its handler bindings, beside the shared checked admission. */
  admitted: (checkedProcess: CheckedProcess, policy: MappedServiceTaskSourcePolicy) => boolean;
  refusal: string;
}>;

const nestedScopeDataReader: ScopeDataReader = {
  semanticProfile: SemanticProfileId.NestedEmbeddedScopeData, gateways: true, rootChoices: true, nonOperationalTasks: true,
  projectCall: projectMappedCall,
  caller: callerProcess, overlayRequired: true,
  // CSSD-ADMIT-01: the routed analysis refuses the merges and forking-root Calls (RPF-ADMIT-01) the shared gateway
  // grammar reads, and only a model with a Parallel fork may bind no handler, so a serial model keeps NSD-ADMIT-01's
  // overlay rule.
  admitted: (checkedProcess, policy) => structuredScopeDataCheckedAnalysis(checkedProcess) !== null &&
    (policy.effectBindings.length > 0 || checkedProcess.nodes.some(node =>
      node.kind === CheckedNodeKind.ParallelGateway && node.direction === GatewayDirection.Diverging)),
  refusal: "The checked graph does not satisfy nested scope-data admission.",
};

// Checked admission of the embedded completion profile already runs its nested scope-control and data analysis.
const embeddedScopeDataReader: ScopeDataReader = {
  semanticProfile: SemanticProfileId.EmbeddedSubProcessCompletion, gateways: true, rootChoices: false, nonOperationalTasks: false,
  projectCall: projectEmbeddedCall,
  caller: callForestCaller, overlayRequired: false,
  admitted: checkedProcess => (checkedProcess.identity.sourceOverlay !== null) ===
    checkedProcess.nodes.some(({ kind }) => kind === CheckedNodeKind.ServiceTask),
  refusal: "The checked graph does not satisfy concurrent scope-data admission.",
};

/** A model of the embedded completion profile without a Service Task binds no handler (CSE-ADMIT-01). */
const noBindings: MappedServiceTaskSourcePolicy = { sourceOverlay: null, effectBindings: [], inertAttributes: [] };

/**
 * NSD-ADMIT-01's source reader: scopes of None Start, User Task, mapped Service Task, ordinary embedded Sub-Process,
 * None End and, for CSSD-ADMIT-01, Parallel gateways. A Sub-Process `camunda:inputOutput` becomes that child scope's `scopeLocalData` record;
 * the parameter grammar is the Service Task's (CIB-EXT-0015), and independent checked admission decides the rest.
 */
export function compileNestedScopeDataSource(root: unknown, source: BpmnSourceIdentity,
  overlay: AdmittedSourceOverlay | null): CheckedCompilationProjection {
  return compileScopeDataSource(root, source, overlay, nestedScopeDataReader);
}

/**
 * CSD-ADMIT-01's reader for a data-bearing embedded completion model: the same elements and declarations, plus
 * Parallel gateways and Exclusive merges, in one executable Process without a Call.
 */
export function compileEmbeddedScopeDataSource(root: unknown, source: BpmnSourceIdentity,
  overlay: AdmittedSourceOverlay | null): CheckedCompilationProjection {
  return compileScopeDataSource(root, source, overlay, embeddedScopeDataReader);
}

function compileScopeDataSource(root: unknown, source: BpmnSourceIdentity, overlay: AdmittedSourceOverlay | null,
  reader: ScopeDataReader): CheckedCompilationProjection {
  const { semanticProfile } = reader;
  const selection = overlay === null && !reader.overlayRequired ? { policy: noBindings, rejection: null }
    : selectMappedServiceTaskSourcePolicy(semanticProfile, overlay);
  if (selection.policy === null) return unsupported(selection.rejection);
  const definitions = asElement(root);
  if (definitions?.$type !== "bpmn:Definitions" || !hasOnlyModelledKeys(definitions,
    ["$type", "id", "targetNamespace", "exporter", "exporterVersion", "rootElements", "diagrams",
      ...(reader.rootChoices ? ["expressionLanguage"] : [])])) {
    return unsupported("Expected one exact BPMN Definitions document.");
  }
  const foreign = exactForeignAttributeRejections(definitions, locateContainedElements(definitions),
    (type, namespace, name) =>
      type === "bpmn:ServiceTask" && namespace === camunda && (name === "delegateExpression" || name === "asyncBefore"));
  if (foreign.length > 0) return { checkedProcess: undefined, diagnostics: orderedElementDiagnostics(foreign) };
  const processes = asElementArray(definitions.rootElements);
  if (processes === undefined || processes.length < 1 || !processes.every(process =>
    process.$type === "bpmn:Process" && process.isExecutable === true &&
    hasOnlyModelledKeys(process, ["$type", "id", "name", "isExecutable", "flowElements"]))) {
    return unsupported("Expected one executable root Process, or a caller and one called Process.");
  }
  const collected: Collected = { nodes: [], flows: [], scopes: [], nodeScopes: [], flowScopes: [], records: [], ids: [] };
  const roots: ProcessRoot[] = [];
  for (const process of processes) {
    const processId = readId(process);
    const elements = asElementArray(process.flowElements);
    if (processId === undefined || elements === undefined) return unsupported("Process and flow elements require IDs.");
    const scopeId = definitionScopeId(processId);
    roots.push({ processId, scopeId });
    collected.scopes.push({ id: scopeId, parentScopeId: null, originElementId: processId });
    collected.ids.push(processId);
    const failure = readScope(elements, scopeId, 0, definitions, selection.policy, reader, collected);
    if (failure !== null) return unsupported(failure);
  }
  const caller = reader.caller(roots, collected);
  if (caller === undefined) return unsupported("A second Process must be the called Process of every Call Activity in the caller.");
  const processId = caller;
  // SRE-ADMIT-01: a Choice reads Process bindings only, so it stands only in the caller's root body.
  const callerScope = definitionScopeId(caller);
  if (collected.nodes.some(node => node.kind === CheckedNodeKind.ExclusiveGateway &&
      collected.nodeScopes.find(({ nodeId }) => nodeId === node.id)?.scopeId !== callerScope)) {
    return unsupported("An Exclusive Choice stands outside the caller's root body.");
  }
  if (new Set(collected.ids).size !== collected.ids.length) return unsupported("Flow element IDs must be unique.");
  const byId = <T extends { id: string }>(values: readonly T[]) =>
    [...values].sort((a, b) => compareCanonicalStrings(a.id, b.id));
  const checkedProcess: CheckedProcess = {
    kind: CheckedProcessKind.CheckedProcess,
    identity: { semanticProfile, sourceId: source.id, sourceSha256: source.sha256, sourceOverlay: selection.policy.sourceOverlay },
    processId,
    definitionScopes: byId(collected.scopes),
    nodeScopes: [...collected.nodeScopes].sort((a, b) => compareCanonicalStrings(a.nodeId, b.nodeId)),
    sequenceFlowScopes: [...collected.flowScopes].sort((a, b) => compareCanonicalStrings(a.sequenceFlowId, b.sequenceFlowId)),
    nodes: byId(collected.nodes),
    sequenceFlows: byId(collected.flows),
    ...(collected.records.length === 0 ? {} : {
      scopeLocalData: [...collected.records].sort((a, b) => compareCanonicalStrings(a.scopeId, b.scopeId)),
    }),
  };
  return reader.admitted(checkedProcess, selection.policy) &&
      isAdmittedCheckedProcess({ ...checkedProcess, flows: checkedProcess.sequenceFlows }, definitions.expressionLanguage, semanticProfile)
    ? { checkedProcess, diagnostics: [] }
    : unsupported(reader.refusal);
}

/** Reads one scope's flow elements into `collected`; returns the rejection evidence, or `null`. */
function readScope(elements: readonly ElementRecord[], scopeId: string, depth: number, definitions: ElementRecord,
  policy: MappedServiceTaskSourcePolicy, reader: ScopeDataReader, collected: Collected): string | null {
  const flowElements = elements.filter(element => element.$type === "bpmn:SequenceFlow");
  const conditional = reader.rootChoices && depth === 0 && flowElements.some(flow => flow.conditionExpression !== undefined);
  const flows = conditional ? projectCheckedSequenceFlows(flowElements, definitions.expressionLanguage, undefined)
    : projectMappedSuccessSequenceFlows(flowElements);
  if (flows === undefined) return "Sequence Flows exceed the selected condition contract.";
  for (const flow of flows) {
    collected.flows.push(flow);
    collected.flowScopes.push({ sequenceFlowId: flow.id, scopeId });
  }
  for (const element of elements) {
    collected.ids.push(readId(element) ?? "");
    let node: CheckedNode | undefined;
    switch (element.$type) {
      case "bpmn:SequenceFlow": continue;
      case "bpmn:StartEvent": node = projectPlainNode(element, CheckedNodeKind.NoneStartEvent); break;
      case "bpmn:EndEvent": node = projectPlainNode(element, CheckedNodeKind.NoneEndEvent); break;
      case "bpmn:UserTask": {
        const id = readId(element);
        if (id !== undefined) node = projectUserTaskMetadata(element, definitions, id,
          typeof element.name === "string" ? element.name : null, reader.semanticProfile);
        break;
      }
      case "bpmn:ServiceTask": node = projectSerialBusinessServiceTask(element, definitions, policy); break;
      case "bpmn:SubProcess": {
        const id = readId(element);
        const children = asElementArray(element.flowElements);
        if (id === undefined || children === undefined || depth + 1 > readerDepthLimit ||
            element.triggeredByEvent === true ||
            !hasOnlyModelledKeys(element, ["$type", "id", "name", "triggeredByEvent", "flowElements", "extensionElements"])) {
          return "A Sub-Process exceeds the ordinary embedded scope contract.";
        }
        const mappings = readBusinessTaskMappings(element.extensionElements);
        if (mappings === undefined) return "A Sub-Process declares locals outside the exact parameter grammar.";
        const childScopeId = definitionScopeId(id);
        collected.scopes.push({ id: childScopeId, parentScopeId: scopeId, originElementId: id });
        if (mappings.inputMappings.length > 0 || mappings.outputMappings.length > 0) {
          collected.records.push({ scopeId: childScopeId, localInputs: mappings.inputMappings,
            localOutputs: mappings.outputMappings });
        }
        const failure = readScope(children, childScopeId, depth + 1, definitions, policy, reader, collected);
        if (failure !== null) return failure;
        node = { kind: CheckedNodeKind.EmbeddedSubProcess, id, childScopeId };
        break;
      }
      case "bpmn:CallActivity": node = reader.projectCall(element); break;
      case bpmnTypes.taskType:
      case bpmnTypes.manualTaskType:
        if (!reader.nonOperationalTasks) return "The flow element is outside the nested scope-data contract.";
        node = projectNonOperationalTask(element);
        break;
      case bpmnTypes.intermediateThrowEventType:
        if (!reader.nonOperationalTasks) return "The flow element is outside the nested scope-data contract.";
        node = projectNoneThrow(element);
        break;
      case "bpmn:ParallelGateway":
      case "bpmn:ExclusiveGateway":
        if (!reader.gateways) return "The flow element is outside the nested scope-data contract.";
        node = reader.rootChoices && depth === 0 && element.$type === "bpmn:ExclusiveGateway"
          ? projectExclusiveMerge(element, readId(element) ?? "", flows, true) ??
            projectExclusiveGateway(element, readId(element) ?? "", flows, true)
          : projectGateway(element, flows, reader.semanticProfile);
        break;
      default: return "The flow element is outside the nested scope-data contract.";
    }
    if (node === undefined) return "A flow element exceeds the nested scope-data contract.";
    collected.nodes.push(node);
    collected.nodeScopes.push({ nodeId: node.id, scopeId });
  }
  return null;
}

/**
 * PTT-ADMIT-01: an Abstract or Manual Task with only an identity and a name. Any CIB attribute, extension element, loop
 * or compensation marker is another key, so the Task is refused rather than passed through with that meaning dropped.
 * `default` is checked by name because moddle defines reference-valued attributes as non-enumerable
 * (moddle 8.2.0 `dist/index.js:1139`), so the key inventory never sees it.
 */
function projectNonOperationalTask(element: ElementRecord): CheckedNode | undefined {
  const id = readId(element);
  return id === undefined || element["default"] !== undefined ||
    !hasOnlyProjectedFlowElementKeys(element, ProjectedFlowElementShape.PlainNode) ? undefined
    : { kind: CheckedNodeKind.NonOperationalTask, id,
      notation: element.$type === bpmnTypes.manualTaskType ? TaskNotation.ManualTask : TaskNotation.AbstractTask };
}

/**
 * NIT-ADMIT-01: only the None form passes. An `eventDefinitions` entry is an enumerable key the plain-node inventory
 * refuses, but moddle keeps the `eventDefinitionRef` reference out of that inventory, so it is refused by name as
 * `default` is. Not decisive today: reference typing refuses a non-EventDefinition target and the definitions reader a
 * root EventDefinition; the clause keeps the None form exact once a later family admits root EventDefinitions.
 */
function projectNoneThrow(element: ElementRecord): CheckedNode | undefined {
  const id = readId(element);
  return id === undefined || element["eventDefinitionRef"] !== undefined ||
    !hasOnlyProjectedFlowElementKeys(element, ProjectedFlowElementShape.PlainNode) ? undefined
    : { kind: CheckedNodeKind.NoneIntermediateThrowEvent, id };
}

/** CSD-ADMIT-01's gateways: a paired Parallel fork or join, or a converging Exclusive merge of any width. */
function projectGateway(element: ElementRecord, flows: readonly CheckedSequenceFlow[], profile: string): CheckedNode | undefined {
  const id = readId(element);
  if (id === undefined) return undefined;
  if (element.$type === "bpmn:ExclusiveGateway") return projectExclusiveMerge(element, id, flows, true);
  const direction = classifyGateway(element, id, flows, profile);
  return direction === undefined ? undefined : { kind: CheckedNodeKind.ParallelGateway, id, direction };
}

/**
 * CVM-RESOLVE-01: CIB reads `calledElement` as a raw definition key (BpmnParse.java:3934, tag v2.2.0), so the caller is
 * the Process whose tree holds every Call and each Call must name the other Process by exact identifier; a lone Process
 * keeps the profile's single-Process account. CALLN-ADMIT-01's Stage B admits up to two Calls of that one definition;
 * where they lie, at most two Sub-Processes deep, is the nested scope-data analysis's decision.
 */
function callerProcess(roots: readonly ProcessRoot[], collected: Collected): string | undefined {
  const calls = collected.nodes.flatMap(node => node.kind === CheckedNodeKind.CallActivity ? [node] : []);
  if (roots.length === 1) return calls.length === 0 ? roots[0]!.processId : undefined;
  if (roots.length !== 2) return undefined;
  const rootOf = (scopeId: string | undefined): string | undefined => {
    let current = scopeId;
    for (let fuel = collected.scopes.length; fuel > 0 && current !== undefined; fuel -= 1) {
      const scope = collected.scopes.find(({ id }) => id === current);
      if (scope?.parentScopeId === null) return scope.id;
      current = scope?.parentScopeId;
    }
    return undefined;
  };
  const owners = new Set(calls.map(call =>
    rootOf(collected.nodeScopes.find(({ nodeId }) => nodeId === call.id)?.scopeId)));
  const owner = owners.size === 1 ? [...owners][0] : undefined;
  const callerId = roots.find(({ scopeId }) => scopeId === owner)?.processId;
  const called = roots.find(({ processId }) => processId !== callerId);
  return calls.length >= 1 && calls.length <= 2 && callerId !== undefined && called !== undefined &&
      calls.every(call => call.calledProcessId === called.processId) ? callerId : undefined;
}

/**
 * CMCALL-ADMIT-01's forest: the caller is the one Process no Call names and every other Process is named by a Call.
 * Where each Call lies, and whether a called Process may hold one, is the nested scope-control analysis's decision.
 */
function callForestCaller(roots: readonly ProcessRoot[], collected: Collected): string | undefined {
  const named = new Set(collected.nodes.flatMap(node => node.kind === CheckedNodeKind.CallActivity ? [node.calledProcessId] : []));
  const callers = roots.filter(({ processId }) => !named.has(processId));
  return callers.length === 1 && named.size === roots.length - 1 &&
      [...named].every(processId => roots.some(root => root.processId === processId))
    ? callers[0]!.processId : undefined;
}

/**
 * The embedded completion profile's Call: CALLN-ADMIT-01's unmapped Call with no extension, or CVM-ADMIT-01's mapped
 * Call. An extension list with no `camunda:in` is refused by the mapping rule, never read as an unmapped Call.
 */
function projectEmbeddedCall(element: ElementRecord): CheckedNode | undefined {
  const id = readId(element);
  if (element.extensionElements !== undefined) return projectMappedCall(element);
  return id !== undefined && typeof element.calledElement === "string" && element.calledElement.length > 0 &&
      hasOnlyModelledKeys(element, ["$type", "id", "name", "calledElement"]) &&
      (element.name === undefined || typeof element.name === "string")
    ? { kind: CheckedNodeKind.CallActivity, id, calledProcessId: element.calledElement, data: { kind: CallDataKind.Empty } }
    : undefined;
}

/**
 * CVM-ADMIT-01's reader: `calledElement` and an extension list of `camunda:in` and `camunda:out`, each with exactly a
 * nonempty `source` and `target`. Any other attribute (`sourceExpression`, `variables`, `local`, `businessKey`) or
 * extension refuses rather than falling back to a narrower reading. Document order is kept because CIB evaluates in it.
 */
function projectMappedCall(element: ElementRecord): CheckedNode | undefined {
  const id = readId(element);
  if (id === undefined || typeof element.calledElement !== "string" || element.calledElement.length === 0 ||
      !hasOnlyModelledKeys(element, ["$type", "id", "name", "calledElement", "extensionElements"]) ||
      (element.name !== undefined && typeof element.name !== "string")) return undefined;
  const extension = asElement(element.extensionElements);
  const values = asElementArray(extension?.values);
  if (extension?.$type !== "bpmn:ExtensionElements" || !hasOnlyModelledKeys(extension, ["$type", "values"]) ||
      values === undefined) return undefined;
  const inputs: VariableMapping[] = [];
  const outputs: VariableMapping[] = [];
  for (const value of values) {
    if (!hasOnlyModelledKeys(value, ["$type", "source", "target"]) || !nonempty(value.source) || !nonempty(value.target)) {
      return undefined;
    }
    switch (value.$type) {
      case "camunda:in":
        inputs.push({ target: value.target, expression: { kind: MappingExpressionKind.EnclosingVariable, name: value.source } });
        break;
      case "camunda:out":
        outputs.push({ target: value.target, expression: { kind: MappingExpressionKind.LocalVariable, name: value.source } });
        break;
      default: return undefined;
    }
  }
  const data = { kind: CallDataKind.VariableMappings, inputs, outputs } as const;
  return callDataInterfaceValid(data, id, element.calledElement)
    ? { kind: CheckedNodeKind.CallActivity, id, calledProcessId: element.calledElement, data } : undefined;
}

function nonempty(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}

function unsupported(evidence: string): CheckedCompilationProjection {
  return { checkedProcess: undefined, diagnostics: [{ code: BpmnSourceDiagnosticCode.UnsupportedModel, element: null, evidence }] };
}
