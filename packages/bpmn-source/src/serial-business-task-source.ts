import { readBusinessTaskMappings } from "./business-task-mapping-source.js";
import { projectExclusiveGateway } from "./simple-boolean-exclusive-gateway-source.js";
import { projectCheckedSequenceFlows, projectExclusiveMerge } from "./checked-element-projection.js";
import {
  MIXED_TASK_BUSINESS_ERROR_CHECKPOINT_PROFILE_ID, MIXED_TASK_CONTROL_FLOW_CHECKPOINT_PROFILE_ID, mixedTaskControlCheckedGraph,
  CheckedNodeKind, CheckedProcessKind, SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID,
  compareCanonicalStrings, serialBusinessCheckedGraph,
} from "@bpmn-lean/semantic-core";
import type { CheckedBpmnErrorRoute, CheckedNode, CheckedProcess, CheckedSequenceFlow } from "@bpmn-lean/semantic-core";
import { isAdmittedCheckedProcess } from "./checked-process-admission.js";
import { locateContainedElements, orderedElementDiagnostics } from "./admission-diagnostics.js";
import { BpmnSourceDiagnosticCode } from "./contracts.js";
import type { BpmnSourceIdentity, CheckedCompilationProjection } from "./contracts.js";
import { asElement, asElementArray, hasOnlyModelledKeys, readForeignAttributes, readId } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import { selectMappedServiceTaskSourcePolicy, selectedEffectBinding } from "./mapped-service-task-source-policy.js";
import type { MappedServiceTaskSourcePolicy } from "./mapped-service-task-source-policy.js";
import { projectMappedSuccessSequenceFlows, projectPlainNode } from "./mapped-service-task-source.js";
import { isExactRootError, projectBoundaryRoute } from "./mapped-boundary-error-service-task-source.js";
import { hasOnlyProjectedFlowElementKeys, ProjectedFlowElementShape } from "./projected-flow-element-keys.js";
import { exactForeignAttributeRejections } from "./preserved-element-classification.js";
import { definitionScopeId } from "./scoped-flow-elements.js";
import type { AdmittedSourceOverlay } from "./source-overlay.js";

const camunda = "http://camunda.org/schema/1.0/bpmn";

/** CIB-EXT-0015 consumes exact binding and mapping syntax before independent checked-chain admission. */
export function compileSerialBusinessTaskSource(root: unknown, source: BpmnSourceIdentity, overlay: AdmittedSourceOverlay | null): CheckedCompilationProjection {
  return compileBusinessTaskSource(root, source, overlay, SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID);
}

export function compileMixedTaskControlFlowSource(root: unknown, source: BpmnSourceIdentity, overlay: AdmittedSourceOverlay | null): CheckedCompilationProjection {
  return compileBusinessTaskSource(root, source, overlay, MIXED_TASK_CONTROL_FLOW_CHECKPOINT_PROFILE_ID);
}

export function compileMixedTaskBusinessErrorSource(root: unknown, source: BpmnSourceIdentity, overlay: AdmittedSourceOverlay | null): CheckedCompilationProjection {
  return compileBusinessTaskSource(root, source, overlay, MIXED_TASK_BUSINESS_ERROR_CHECKPOINT_PROFILE_ID);
}

function compileBusinessTaskSource(root: unknown, source: BpmnSourceIdentity, overlay: AdmittedSourceOverlay | null, semanticProfile: string): CheckedCompilationProjection {
  const businessError = semanticProfile === MIXED_TASK_BUSINESS_ERROR_CHECKPOINT_PROFILE_ID;
  const mixed = businessError || semanticProfile === MIXED_TASK_CONTROL_FLOW_CHECKPOINT_PROFILE_ID;
  const selection = selectMappedServiceTaskSourcePolicy(semanticProfile, overlay);
  if (selection.policy === null) return unsupported(selection.rejection);
  const definitions = asElement(root);
  if (definitions?.$type !== "bpmn:Definitions" || !hasOnlyModelledKeys(definitions,
    ["$type", "id", "targetNamespace", "exporter", "exporterVersion", "rootElements", "diagrams", ...(mixed ? ["expressionLanguage"] : [])])) return unsupported("Expected one exact BPMN Definitions document.");
  const foreign = exactForeignAttributeRejections(definitions, locateContainedElements(definitions),
    (type, namespace, name) => type === "bpmn:ServiceTask" && namespace === camunda && (name === "delegateExpression" || name === "asyncBefore"));
  if (foreign.length > 0) return { checkedProcess: undefined, diagnostics: orderedElementDiagnostics(foreign) };
  const roots = asElementArray(definitions.rootElements);
  const processes = roots?.filter(element => element.$type === "bpmn:Process");
  const errors = roots?.filter(element => element.$type === "bpmn:Error") ?? [];
  const process = processes?.[0];
  if (processes?.length !== 1 || roots?.length !== 1 + errors.length || (!businessError && errors.length !== 0) ||
      !errors.every(isExactRootError) || process?.isExecutable !== true ||
      !hasOnlyModelledKeys(process, ["$type", "id", "name", "isExecutable", "flowElements"])) return unsupported("Expected one executable root Process.");
  const processId = readId(process);
  const elements = asElementArray(process.flowElements);
  if (processId === undefined || elements === undefined) return unsupported("Process and flow elements require IDs.");
  const flowElements = elements.filter(element => element.$type === "bpmn:SequenceFlow");
  const flows = mixed ? projectCheckedSequenceFlows(flowElements, definitions.expressionLanguage, undefined) : projectMappedSuccessSequenceFlows(flowElements);
  if (flows === undefined) return unsupported("Sequence Flows exceed the selected condition contract.");
  const routes = businessError ? businessErrorRoutes(elements, errors, flows) : new Map<string, CheckedBpmnErrorRoute>();
  if (routes === undefined) return unsupported("Error boundaries require exact referenced declarations and Service Task attachments.");
  const nodes: CheckedNode[] = [];
  for (const element of elements) {
    let node: CheckedNode | undefined;
    switch (element.$type) {
      case "bpmn:SequenceFlow": continue;
      case "bpmn:StartEvent": node = projectPlainNode(element, CheckedNodeKind.NoneStartEvent); break;
      case "bpmn:EndEvent": node = projectPlainNode(element, CheckedNodeKind.NoneEndEvent); break;
      case "bpmn:UserTask": {
        const id = readId(element);
        if (id !== undefined && hasOnlyProjectedFlowElementKeys(element, ProjectedFlowElementShape.PlainNode)) {
          node = { kind: CheckedNodeKind.UserTask, id, name: typeof element.name === "string" ? element.name : null };
        }
        break;
      }
      case "bpmn:ExclusiveGateway": {
        const id = readId(element);
        if (mixed && id !== undefined) node = projectExclusiveMerge(element, id, flows, true) ?? projectExclusiveGateway(element, id, flows, true);
        break;
      }
      case "bpmn:BoundaryEvent":
        if (businessError) continue;
        return unsupported("Error boundaries require the selected business Error profile.");
      case "bpmn:ServiceTask": {
        node = serviceNode(element, definitions, selection.policy);
        if (node?.kind === CheckedNodeKind.ServiceTask) node = { ...node, bpmnErrorRoute: routes.get(node.id) ?? null };
        break;
      }
      default: return unsupported("The flow element is outside the selected business-task contract.");
    }
    if (node === undefined) return unsupported("A flow element exceeds the selected business-task contract.");
    nodes.push(node);
  }
  const ids = [processId, ...elements.map(readId), ...errors.map(readId)];
  if (new Set(ids).size !== ids.length || (!mixed && !serialBusinessCheckedGraph({ nodes, flows }))) return unsupported("Expected a complete, unique serial business chain with exact mappings.");
  const scopeId = definitionScopeId(processId);
  const checkedProcess: CheckedProcess = {
    kind: CheckedProcessKind.CheckedProcess,
    identity: { semanticProfile, sourceId: source.id, sourceSha256: source.sha256, sourceOverlay: selection.policy.sourceOverlay },
    processId, definitionScopes: [{ id: scopeId, parentScopeId: null, originElementId: processId }],
    nodeScopes: nodes.map(({ id }) => ({ nodeId: id, scopeId })).sort((a, b) => compareCanonicalStrings(a.nodeId, b.nodeId)),
    sequenceFlowScopes: flows.map(({ id }) => ({ sequenceFlowId: id, scopeId })).sort((a, b) => compareCanonicalStrings(a.sequenceFlowId, b.sequenceFlowId)),
    nodes: [...nodes].sort((a, b) => compareCanonicalStrings(a.id, b.id)), sequenceFlows: [...flows].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
  };
  if (mixed && !mixedTaskControlCheckedGraph({ ...checkedProcess, flows }, semanticProfile)) return unsupported("The mixed-task control graph fails admission.");
  return isAdmittedCheckedProcess({ ...checkedProcess, flows: checkedProcess.sequenceFlows }, definitions.expressionLanguage, semanticProfile)
    ? { checkedProcess, diagnostics: [] } : unsupported("The checked business-task graph does not satisfy root graph admission.");
}

function businessErrorRoutes(elements: readonly ElementRecord[], errors: readonly ElementRecord[],
  flows: readonly CheckedSequenceFlow[]): ReadonlyMap<string, CheckedBpmnErrorRoute> | undefined {
  const routes = new Map<string, CheckedBpmnErrorRoute>();
  const referenced = new Set<string>();
  for (const boundary of elements.filter(element => element.$type === "bpmn:BoundaryEvent")) {
    const serviceId = readId(asElement(boundary.attachedToRef) ?? {});
    const service = elements.find(element => element.$type === "bpmn:ServiceTask" && readId(element) === serviceId);
    const definition = asElementArray(boundary.eventDefinitions)?.[0];
    const errorId = readId(asElement(definition?.errorRef) ?? {});
    const error = errors.find(element => readId(element) === errorId);
    if (service === undefined || error === undefined) return undefined;
    const route = projectBoundaryRoute(boundary, service, error, flows);
    if (route === undefined || routes.has(route.attachedToRef)) return undefined;
    routes.set(route.attachedToRef, route);
    referenced.add(route.errorElementId);
  }
  return routes.size > 0 && referenced.size === errors.length ? routes : undefined;
}

function serviceNode(element: ElementRecord, definitions: ElementRecord, policy: MappedServiceTaskSourcePolicy): CheckedNode | undefined {
  if (!hasOnlyProjectedFlowElementKeys(element, ProjectedFlowElementShape.SerialBusinessServiceTask)) return undefined;
  const id = readId(element);
  const attributes = readForeignAttributes(element, definitions);
  const binding = selectedEffectBinding(policy, typeof element.implementation === "string" ? element.implementation : null, attributes?.get(`${camunda}#delegateExpression`));
  if (id === undefined || binding === undefined || attributes?.get(`${camunda}#asyncBefore`) !== "true") return undefined;
  const mappings = readBusinessTaskMappings(element.extensionElements);
  return mappings === undefined ? undefined : { kind: CheckedNodeKind.ServiceTask, id, descriptor: binding.descriptor, ...mappings, bpmnErrorRoute: null };
}


function unsupported(evidence: string): CheckedCompilationProjection {
  return { checkedProcess: undefined, diagnostics: [{ code: BpmnSourceDiagnosticCode.UnsupportedModel, element: null, evidence }] };
}
