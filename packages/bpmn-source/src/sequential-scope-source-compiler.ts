import { CheckedNodeKind as Kind, CheckedProcessKind, GatewayDirection, compareCanonicalStrings,
  SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID as profile,
  analyzeSequentialScopeControl, analyzeSequentialScopeData } from "@bpmn-lean/semantic-core";
import type { CheckedNode, CheckedProcess, CheckedSequenceFlow } from "@bpmn-lean/semantic-core";
import { BpmnSourceDiagnosticCode } from "./contracts.js";
import type { BpmnSourceIdentity, CheckedCompilationProjection } from "./contracts.js";
import { asElement, asElementArray, hasOnlyModelledKeys, readId } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import { definitionsLocus, locateContainedElements, orderedElementDiagnostics } from "./admission-diagnostics.js";
import { exactForeignAttributeRejections } from "./preserved-element-classification.js";
import { collectScopedFlowElements, definitionScopeId } from "./scoped-flow-elements.js";
import { hasOnlyProjectedFlowElementKeys, ProjectedFlowElementShape } from "./projected-flow-element-keys.js";
import { declaredGatewayDirectionMatches } from "./gateway-direction-source.js";
import { projectMappedSuccessSequenceFlows, projectPlainNode } from "./mapped-service-task-source.js";
import { selectMappedServiceTaskSourcePolicy } from "./mapped-service-task-source-policy.js";
import { projectSerialBusinessServiceTask } from "./serial-business-task-source.js";
import { readSequentialSubProcessDeclaration } from "./sequential-multi-instance-subprocess-source.js";
import { resolveAdmittedCheckedProcessGraph } from "./checked-process-graph-admission.js";
import { lowerCheckedProcess } from "./semantic-process-lowering.js";
import type { AdmittedSourceOverlay } from "./source-overlay.js";

/** SMIS-ADMIT-01 composes source, scoped graph, control-burst and data checks; execution registration remains separate. */
export function compileSequentialScopeSource(root: unknown, source: BpmnSourceIdentity,
  overlay: AdmittedSourceOverlay | null): CheckedCompilationProjection {
  const selection = selectMappedServiceTaskSourcePolicy(profile, overlay);
  if (selection.policy === null) return unsupported(selection.rejection);
  const definitions = asElement(root);
  if (definitions?.$type !== "bpmn:Definitions" || !hasOnlyModelledKeys(definitions,
    ["$type", "id", "targetNamespace", "rootElements"])) return unsupported("Expected one exact BPMN Definitions document.");
  const roots = asElementArray(definitions.rootElements);
  const process = roots?.[0];
  if (roots?.length !== 1 || process?.$type !== "bpmn:Process" || process.isExecutable !== true ||
      !hasOnlyModelledKeys(process, ["$type", "id", "name", "isExecutable", "flowElements"])) return unsupported("Expected one executable root Process.");
  const processId = readId(process);
  if (processId === undefined) return unsupported("The Process requires an ID.");
  const located = locateContainedElements(definitions);
  const foreign = exactForeignAttributeRejections(definitions, located, (type, namespace, name) =>
    namespace === "http://camunda.org/schema/1.0/bpmn" &&
    ((type === "bpmn:ServiceTask" && (name === "delegateExpression" || name === "asyncBefore")) ||
      (type === "bpmn:MultiInstanceLoopCharacteristics" && (name === "collection" || name === "elementVariable"))));
  if (foreign.length > 0) return { checkedProcess: undefined, diagnostics: orderedElementDiagnostics(foreign) };
  const scoped = collectScopedFlowElements(process, processId, "bpmn:SubProcess", located.get(process) ?? definitionsLocus, profile);
  if (scoped === undefined || scoped.definitionScopes.length !== 2) return unsupported("Expected one ordinary repeated child scope.");
  const ids = [processId, ...scoped.elements.map(({ element }) => readId(element))];
  if (ids.includes(undefined) || new Set(ids).size !== ids.length) return unsupported("Process and flow-element identities must be distinct.");
  const flows = projectMappedSuccessSequenceFlows(scoped.elements.filter(({ element }) => element.$type === "bpmn:SequenceFlow").map(({ element }) => element));
  if (flows === undefined) return unsupported("Only unconditional Sequence Flows are selected.");
  const handlers = new Set(selection.policy.effectBindings.map(({ descriptor }) => descriptor.operation));
  const nodes: CheckedNode[] = [];
  for (const { element } of scoped.elements) {
    let node: CheckedNode | undefined;
    const id = readId(element)!;
    switch (element.$type) {
      case "bpmn:SequenceFlow": continue;
      case "bpmn:StartEvent": node = projectPlainNode(element, Kind.NoneStartEvent); break;
      case "bpmn:EndEvent": node = projectPlainNode(element, Kind.NoneEndEvent); break;
      case "bpmn:UserTask":
        if (hasOnlyProjectedFlowElementKeys(element, ProjectedFlowElementShape.PlainNode))
          node = { kind: Kind.UserTask, id, name: typeof element.name === "string" ? element.name : null };
        break;
      case "bpmn:ServiceTask": node = projectSerialBusinessServiceTask(element, definitions, selection.policy); break;
      case "bpmn:ParallelGateway": node = parallelGateway(element, id, flows); break;
      case "bpmn:SubProcess": {
        const declaration = readSequentialSubProcessDeclaration(element, definitions, handlers);
        if (declaration !== undefined) node = { kind: Kind.SequentialMultiInstanceSubProcess, id, childScopeId: definitionScopeId(id),
          collectionName: declaration.collectionName, itemName: declaration.itemName,
          bodyInputs: declaration.bodyInputs, completionBooleanName: declaration.completionBooleanName };
        break;
      }
      default: return unsupported("A flow element is outside the repeated mixed-task body contract.");
    }
    if (node === undefined) return unsupported("A flow element exceeds its selected source contract.");
    nodes.push(node);
  }
  const nodeIds = new Set(nodes.map(node => node.id));
  const checkedProcess: CheckedProcess = {
    kind: CheckedProcessKind.CheckedProcess,
    identity: { semanticProfile: profile, sourceId: source.id, sourceSha256: source.sha256, sourceOverlay: selection.policy.sourceOverlay },
    processId, definitionScopes: [...scoped.definitionScopes].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    nodeScopes: scoped.elements.filter(({ element }) => nodeIds.has(readId(element)!)).map(({ element, scopeId }) => ({ nodeId: readId(element)!, scopeId }))
      .sort((a, b) => compareCanonicalStrings(a.nodeId, b.nodeId)),
    sequenceFlowScopes: scoped.elements.filter(({ element }) => element.$type === "bpmn:SequenceFlow").map(({ element, scopeId }) => ({ sequenceFlowId: readId(element)!, scopeId }))
      .sort((a, b) => compareCanonicalStrings(a.sequenceFlowId, b.sequenceFlowId)),
    nodes: nodes.sort((a, b) => compareCanonicalStrings(a.id, b.id)), sequenceFlows: [...flows].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
  };
  const entries = nodes.filter(node => node.kind === Kind.SequentialMultiInstanceSubProcess);
  const entry = entries[0];
  if (entries.length !== 1 || entry === undefined ||
      !resolveAdmittedCheckedProcessGraph({ ...checkedProcess, flows }, profile)) return unsupported("Repeated-scope ownership or graph admission failed.");
  const childIds = new Set(checkedProcess.nodeScopes.filter(owner => owner.scopeId === entry.childScopeId).map(owner => owner.nodeId));
  if (![Kind.UserTask, Kind.ServiceTask].every(kind => nodes.some(node => childIds.has(node.id) && node.kind === kind)))
    return unsupported("The repeated body requires both a User Task and a mapped Service Task.");
  const program = lowerCheckedProcess(checkedProcess);
  return analyzeSequentialScopeControl(program) !== undefined && analyzeSequentialScopeData(program) !== undefined
    ? { checkedProcess, diagnostics: [] } : unsupported("Repeated-scope control bursts or data dependencies exceed admission.");
}

function parallelGateway(element: ElementRecord, id: string, flows: readonly CheckedSequenceFlow[]): CheckedNode | undefined {
  if (!hasOnlyProjectedFlowElementKeys(element, ProjectedFlowElementShape.ParallelGateway)) return undefined;
  const incoming = flows.filter(flow => flow.targetId === id).length;
  const outgoing = flows.filter(flow => flow.sourceId === id).length;
  const direction = incoming === 1 && outgoing >= 2 ? GatewayDirection.Diverging
    : incoming >= 2 && outgoing === 1 ? GatewayDirection.Converging : undefined;
  return direction !== undefined && declaredGatewayDirectionMatches(element.gatewayDirection, direction)
    ? { kind: Kind.ParallelGateway, id, direction } : undefined;
}

function unsupported(evidence: string): CheckedCompilationProjection {
  return { checkedProcess: undefined, diagnostics: [{ code: BpmnSourceDiagnosticCode.UnsupportedModel, element: null, evidence }] };
}
