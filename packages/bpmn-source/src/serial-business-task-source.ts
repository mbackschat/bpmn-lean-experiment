import {
  CheckedNodeKind, CheckedProcessKind, MappingExpressionKind, SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID,
  compareCanonicalStrings, serialBusinessCheckedGraph, serialBusinessMappingsAdmitted,
} from "@bpmn-lean/semantic-core";
import type { CheckedNode, CheckedProcess, VariableMapping } from "@bpmn-lean/semantic-core";
import { isAdmittedCheckedProcess } from "./checked-process-admission.js";
import { locateContainedElements, orderedElementDiagnostics } from "./admission-diagnostics.js";
import { BpmnSourceDiagnosticCode } from "./contracts.js";
import type { BpmnSourceIdentity, CheckedCompilationProjection } from "./contracts.js";
import { asElement, asElementArray, hasOnlyModelledKeys, readForeignAttributes, readId } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import { selectMappedServiceTaskSourcePolicy, selectedEffectBinding } from "./mapped-service-task-source-policy.js";
import type { MappedServiceTaskSourcePolicy } from "./mapped-service-task-source-policy.js";
import { projectMappedSuccessSequenceFlows, projectPlainNode } from "./mapped-service-task-source.js";
import { hasOnlyProjectedFlowElementKeys, ProjectedFlowElementShape } from "./projected-flow-element-keys.js";
import { exactForeignAttributeRejections } from "./preserved-element-classification.js";
import { definitionScopeId } from "./scoped-flow-elements.js";
import type { AdmittedSourceOverlay } from "./source-overlay.js";

const camunda = "http://camunda.org/schema/1.0/bpmn";

/** CIB-EXT-0015 consumes exact binding and mapping syntax before independent checked-chain admission. */
export function compileSerialBusinessTaskSource(root: unknown, source: BpmnSourceIdentity, overlay: AdmittedSourceOverlay | null): CheckedCompilationProjection {
  const selection = selectMappedServiceTaskSourcePolicy(SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID, overlay);
  if (selection.policy === null) return unsupported(selection.rejection);
  const definitions = asElement(root);
  if (definitions?.$type !== "bpmn:Definitions" || !hasOnlyModelledKeys(definitions,
    ["$type", "id", "targetNamespace", "exporter", "exporterVersion", "rootElements", "diagrams"])) return unsupported("Expected one exact BPMN Definitions document.");
  const foreign = exactForeignAttributeRejections(definitions, locateContainedElements(definitions),
    (type, namespace, name) => type === "bpmn:ServiceTask" && namespace === camunda && (name === "delegateExpression" || name === "asyncBefore"));
  if (foreign.length > 0) return { checkedProcess: undefined, diagnostics: orderedElementDiagnostics(foreign) };
  const roots = asElementArray(definitions.rootElements);
  const process = roots?.[0];
  if (roots?.length !== 1 || process?.$type !== "bpmn:Process" || process.isExecutable !== true ||
      !hasOnlyModelledKeys(process, ["$type", "id", "name", "isExecutable", "flowElements"])) return unsupported("Expected one executable root Process.");
  const processId = readId(process);
  const elements = asElementArray(process.flowElements);
  if (processId === undefined || elements === undefined) return unsupported("Process and flow elements require IDs.");
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
      case "bpmn:ServiceTask": node = serviceNode(element, definitions, selection.policy); break;
      default: return unsupported("Only None events, User Tasks, Service Tasks and Sequence Flows are admitted.");
    }
    if (node === undefined) return unsupported("A flow element exceeds the serial business task contract.");
    nodes.push(node);
  }
  const flows = projectMappedSuccessSequenceFlows(elements.filter(element => element.$type === "bpmn:SequenceFlow"));
  const ids = [processId, ...elements.map(readId)];
  if (flows === undefined || new Set(ids).size !== ids.length || !serialBusinessCheckedGraph({ nodes, flows })) return unsupported("Expected a complete, unique serial business chain with exact mappings.");
  const scopeId = definitionScopeId(processId);
  const checkedProcess: CheckedProcess = {
    kind: CheckedProcessKind.CheckedProcess,
    identity: { semanticProfile: SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID, sourceId: source.id, sourceSha256: source.sha256, sourceOverlay: selection.policy.sourceOverlay },
    processId, definitionScopes: [{ id: scopeId, parentScopeId: null, originElementId: processId }],
    nodeScopes: nodes.map(({ id }) => ({ nodeId: id, scopeId })).sort((a, b) => compareCanonicalStrings(a.nodeId, b.nodeId)),
    sequenceFlowScopes: flows.map(({ id }) => ({ sequenceFlowId: id, scopeId })).sort((a, b) => compareCanonicalStrings(a.sequenceFlowId, b.sequenceFlowId)),
    nodes: [...nodes].sort((a, b) => compareCanonicalStrings(a.id, b.id)), sequenceFlows: [...flows].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
  };
  return isAdmittedCheckedProcess({ ...checkedProcess, flows: checkedProcess.sequenceFlows }, definitions.expressionLanguage, SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID)
    ? { checkedProcess, diagnostics: [] } : unsupported("The checked business chain does not satisfy root graph admission.");
}

function serviceNode(element: ElementRecord, definitions: ElementRecord, policy: MappedServiceTaskSourcePolicy): CheckedNode | undefined {
  if (!hasOnlyProjectedFlowElementKeys(element, ProjectedFlowElementShape.SerialBusinessServiceTask)) return undefined;
  const id = readId(element);
  const attributes = readForeignAttributes(element, definitions);
  const binding = selectedEffectBinding(policy, typeof element.implementation === "string" ? element.implementation : null, attributes?.get(`${camunda}#delegateExpression`));
  if (id === undefined || binding === undefined || attributes?.get(`${camunda}#asyncBefore`) !== "true") return undefined;
  const mappings = readMappings(element.extensionElements);
  return mappings === undefined ? undefined : { kind: CheckedNodeKind.ServiceTask, id, descriptor: binding.descriptor, ...mappings, bpmnErrorRoute: null };
}

function readMappings(value: unknown): Readonly<{ inputMappings: readonly VariableMapping[]; outputMappings: readonly VariableMapping[] }> | undefined {
  if (value === undefined) return { inputMappings: [], outputMappings: [] };
  const extension = asElement(value);
  const values = asElementArray(extension?.values);
  const io = values?.[0];
  if (extension?.$type !== "bpmn:ExtensionElements" || !hasOnlyModelledKeys(extension, ["$type", "values"]) || values?.length !== 1 ||
      io?.$type !== "camunda:inputOutput" || !hasOnlyModelledKeys(io, ["$type", "$children"])) return undefined;
  const children = io.$children === undefined ? [] : asElementArray(io.$children);
  if (children === undefined) return undefined;
  const inputMappings: VariableMapping[] = [];
  const outputMappings: VariableMapping[] = [];
  for (const parameter of children) {
    if (!hasOnlyModelledKeys(parameter, ["$type", "name", "$body"]) || typeof parameter.name !== "string" || typeof parameter.$body !== "string") return undefined;
    const name = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/u.exec(parameter.$body)?.[1];
    switch (parameter.$type) {
      case "camunda:inputParameter": inputMappings.push({ target: parameter.name, expression: name === undefined ?
        { kind: MappingExpressionKind.StringLiteral, value: parameter.$body } : { kind: MappingExpressionKind.EnclosingVariable, name } }); break;
      case "camunda:outputParameter":
        if (name === undefined) return undefined;
        outputMappings.push({ target: parameter.name, expression: { kind: MappingExpressionKind.LocalVariable, name } }); break;
      default: return undefined;
    }
  }
  inputMappings.sort((a, b) => compareCanonicalStrings(a.target, b.target));
  outputMappings.sort((a, b) => compareCanonicalStrings(a.target, b.target));
  return serialBusinessMappingsAdmitted(inputMappings, true) && serialBusinessMappingsAdmitted(outputMappings, false) ? { inputMappings, outputMappings } : undefined;
}

function unsupported(evidence: string): CheckedCompilationProjection {
  return { checkedProcess: undefined, diagnostics: [{ code: BpmnSourceDiagnosticCode.UnsupportedModel, element: null, evidence }] };
}
