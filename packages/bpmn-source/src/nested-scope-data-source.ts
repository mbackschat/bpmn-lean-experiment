import { readBusinessTaskMappings } from "./business-task-mapping-source.js";
import { projectUserTaskMetadata } from "./checked-element-projection.js";
import {
  CheckedNodeKind, CheckedProcessKind, SemanticProfileId, compareCanonicalStrings, nestedScopeCheckedAnalysis,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode, CheckedProcess, CheckedSequenceFlow, DefinitionScope, ScopeLocalData,
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
  const roots = asElementArray(definitions.rootElements);
  const process = roots?.[0];
  if (roots?.length !== 1 || process?.$type !== "bpmn:Process" || process.isExecutable !== true ||
      !hasOnlyModelledKeys(process, ["$type", "id", "name", "isExecutable", "flowElements"])) {
    return unsupported("Expected one executable root Process.");
  }
  const processId = readId(process);
  const elements = asElementArray(process.flowElements);
  if (processId === undefined || elements === undefined) return unsupported("Process and flow elements require IDs.");
  const rootScope = definitionScopeId(processId);
  const collected: Collected = {
    nodes: [], flows: [], scopes: [{ id: rootScope, parentScopeId: null, originElementId: processId }],
    nodeScopes: [], flowScopes: [], records: [], ids: [processId],
  };
  const failure = readScope(elements, rootScope, 0, definitions, selection.policy, collected);
  if (failure !== null) return unsupported(failure);
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
      default: return "The flow element is outside the nested scope-data contract.";
    }
    if (node === undefined) return "A flow element exceeds the nested scope-data contract.";
    collected.nodes.push(node);
    collected.nodeScopes.push({ nodeId: node.id, scopeId });
  }
  return null;
}

function unsupported(evidence: string): CheckedCompilationProjection {
  return { checkedProcess: undefined, diagnostics: [{ code: BpmnSourceDiagnosticCode.UnsupportedModel, element: null, evidence }] };
}
