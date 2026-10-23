import { readBusinessTaskMappings } from "./business-task-mapping-source.js";
import { projectUserTaskMetadata } from "./checked-element-projection.js";
import {
  CallDataKind, CheckedNodeKind, CheckedProcessKind, MappingExpressionKind, SemanticProfileId, callDataInterfaceValid,
  compareCanonicalStrings, isWellFormedWireString, nestedScopeCheckedAnalysis,
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
import { exactForeignAttributeRejections } from "./preserved-element-classification.js";
import { definitionScopeId } from "./scoped-flow-elements.js";
import { projectSerialBusinessServiceTask } from "./serial-business-task-source.js";
import type { AdmittedSourceOverlay } from "./source-overlay.js";

const camunda = "http://camunda.org/schema/1.0/bpmn";
const semanticProfile = SemanticProfileId.NestedEmbeddedScopeData;
/** One more level than NSD-ADMIT-01 admits, so the reader's recursion stays bounded while admission decides depth. */
const readerDepthLimit = 4;

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
 * NSD-ADMIT-01's source reader: serial scopes of None Start, User Task, mapped Service Task, ordinary embedded
 * Sub-Process and None End. A Sub-Process `camunda:inputOutput` becomes that child scope's `scopeLocalData` record;
 * the parameter grammar is the Service Task's (CIB-EXT-0015), and independent checked admission decides the rest.
 */
export function compileNestedScopeDataSource(root: unknown, source: BpmnSourceIdentity,
  overlay: AdmittedSourceOverlay | null): CheckedCompilationProjection {
  const selection = selectMappedServiceTaskSourcePolicy(semanticProfile, overlay);
  if (selection.policy === null) return unsupported(selection.rejection);
  const definitions = asElement(root);
  if (definitions?.$type !== "bpmn:Definitions" || !hasOnlyModelledKeys(definitions,
    ["$type", "id", "targetNamespace", "exporter", "exporterVersion", "rootElements", "diagrams"])) {
    return unsupported("Expected one exact BPMN Definitions document.");
  }
  const foreign = exactForeignAttributeRejections(definitions, locateContainedElements(definitions),
    (type, namespace, name) =>
      type === "bpmn:ServiceTask" && namespace === camunda && (name === "delegateExpression" || name === "asyncBefore"));
  if (foreign.length > 0) return { checkedProcess: undefined, diagnostics: orderedElementDiagnostics(foreign) };
  const processes = asElementArray(definitions.rootElements);
  if (processes === undefined || processes.length < 1 || processes.length > 2 || !processes.every(process =>
    process.$type === "bpmn:Process" && process.isExecutable === true &&
    hasOnlyModelledKeys(process, ["$type", "id", "name", "isExecutable", "flowElements"]))) {
    return unsupported("Expected one executable root Process, or a caller and one called Process.");
  }
  const collected: Collected = { nodes: [], flows: [], scopes: [], nodeScopes: [], flowScopes: [], records: [], ids: [] };
  const roots: { processId: string; scopeId: string }[] = [];
  for (const process of processes) {
    const processId = readId(process);
    const elements = asElementArray(process.flowElements);
    if (processId === undefined || elements === undefined) return unsupported("Process and flow elements require IDs.");
    const scopeId = definitionScopeId(processId);
    roots.push({ processId, scopeId });
    collected.scopes.push({ id: scopeId, parentScopeId: null, originElementId: processId });
    collected.ids.push(processId);
    const failure = readScope(elements, scopeId, 0, definitions, selection.policy, collected);
    if (failure !== null) return unsupported(failure);
  }
  const caller = callerProcess(roots, collected);
  if (caller === undefined) return unsupported("A second Process must be the called Process of every Call Activity in the caller.");
  const processId = caller;
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
  return nestedScopeCheckedAnalysis(checkedProcess) !== null &&
      isAdmittedCheckedProcess({ ...checkedProcess, flows: checkedProcess.sequenceFlows }, definitions.expressionLanguage, semanticProfile)
    ? { checkedProcess, diagnostics: [] }
    : unsupported("The checked graph does not satisfy nested scope-data admission.");
}

/** Reads one scope's flow elements into `collected`; returns the rejection evidence, or `null`. */
function readScope(elements: readonly ElementRecord[], scopeId: string, depth: number, definitions: ElementRecord,
  policy: MappedServiceTaskSourcePolicy, collected: Collected): string | null {
  const flows = projectMappedSuccessSequenceFlows(elements.filter(element => element.$type === "bpmn:SequenceFlow"));
  if (flows === undefined) return "Sequence Flows exceed the unconditional flow contract.";
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
          typeof element.name === "string" ? element.name : null, semanticProfile);
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
        const failure = readScope(children, childScopeId, depth + 1, definitions, policy, collected);
        if (failure !== null) return failure;
        node = { kind: CheckedNodeKind.EmbeddedSubProcess, id, childScopeId };
        break;
      }
      case "bpmn:CallActivity": node = projectMappedCall(element); break;
      default: return "The flow element is outside the nested scope-data contract.";
    }
    if (node === undefined) return "A flow element exceeds the nested scope-data contract.";
    collected.nodes.push(node);
    collected.nodeScopes.push({ nodeId: node.id, scopeId });
  }
  return null;
}

/**
 * CVM-RESOLVE-01: CIB reads `calledElement` as a raw definition key (BpmnParse.java:3934, tag v2.2.0), so the caller is
 * the Process whose tree holds every Call and each Call must name the other Process by exact identifier; a lone Process
 * keeps the profile's single-Process account. CALLN-ADMIT-01's Stage B admits up to two Calls of that one definition;
 * where they lie, at most two Sub-Processes deep, is the nested scope-data analysis's decision.
 */
function callerProcess(roots: readonly { processId: string; scopeId: string }[], collected: Collected): string | undefined {
  const calls = collected.nodes.flatMap(node => node.kind === CheckedNodeKind.CallActivity ? [node] : []);
  if (roots.length === 1) return calls.length === 0 ? roots[0]!.processId : undefined;
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
