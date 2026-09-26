import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with { type: "json" };
import {
  CheckedNodeKind as K, CheckedProcessKind, GatewayDirection,
  TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type { CheckedNode, CheckedProcess, CheckedSequenceFlow } from "@bpmn-lean/semantic-core";
import { locateContainedElements, orderedElementDiagnostics } from "./admission-diagnostics.js";
import { BpmnSourceDiagnosticCode } from "./contracts.js";
import type { BpmnSourceIdentity, CheckedCompilationProjection } from "./contracts.js";
import { asElementArray, hasOnlyModelledKeys, readId } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import { foreignAttributeRejections } from "./preserved-element-classification.js";
import { definitionScopeId } from "./scoped-flow-elements.js";
import { compensationSingleEffectDescriptor, COMPENSATION_SINGLE_EFFECT_IMPLEMENTATION } from "./compensation-source-profile.js";
import { transactionCheckedGraphValid } from "./transaction-checked-admission.js";

/** Preserves exact parser object ownership before admitting the selected Transaction role graph. */
export function compileTransactionSourceCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
): CheckedCompilationProjection {
  const reject = (): CheckedCompilationProjection => ({ checkedProcess: undefined, diagnostics: [{
    code: BpmnSourceDiagnosticCode.UnsupportedModel, element: null,
    evidence: "Transaction cancellation requires the bounded two-branch graph, one child-owned empty-input Compensation handler, and an interrupting direct-parent Cancel Boundary.",
  }] });
  if (typeof rootElement !== "object" || rootElement === null) return reject();
  const definitions = rootElement as ElementRecord;
  const roots = asElementArray(definitions.rootElements);
  const processes = roots?.filter(({ $type }) => $type === "bpmn:Process");
  const process = processes?.[0];
  if (definitions.$type !== "bpmn:Definitions" || !readId(definitions) || !roots ||
      typeof definitions.targetNamespace !== "string" || processes?.length !== 1 || !process ||
      !hasOnlyModelledKeys(definitions, ["$type", "id", "targetNamespace", "rootElements", "expressionLanguage", "typeLanguage"]) ||
      definitions.expressionLanguage !== "http://www.w3.org/1999/XPath" ||
      definitions.typeLanguage !== "http://www.w3.org/2001/XMLSchema" ||
      !readId(process) || process.isExecutable !== true ||
      !plain(process, ["isExecutable", "flowElements"])) return reject();
  const located = locateContainedElements(definitions);
  const ids = new Set<string>();
  for (const element of located.keys()) {
    if (element.id === undefined) continue;
    const id = readId(element);
    if (!id || ids.has(id)) return reject();
    ids.add(id);
  }
  const foreign = foreignAttributeRejections(definitions, located, new Set());
  if (foreign.length) return { checkedProcess: undefined, diagnostics: orderedElementDiagnostics(foreign) };
  const rootContents = asElementArray(process.flowElements);
  const transactions = rootContents?.filter(({ $type }) => $type === metamodelManifest.compilerProjection.transactionType);
  const transaction = transactions?.[0];
  if (!rootContents || transactions?.length !== 1 || !transaction || !readId(transaction) ||
      (transaction.method !== undefined && transaction.method !== "##Compensate") || transaction.triggeredByEvent !== false ||
      !plain(transaction, ["incoming", "outgoing", "flowElements", "artifacts", "method", "triggeredByEvent"])) return reject();
  const childContents = asElementArray(transaction.flowElements);
  const artifacts = asElementArray(transaction.artifacts);
  if (!childContents || artifacts?.length !== 1) return reject();
  const usedDefinitions = new Set<ElementRecord>();
  const eventDefinition = (event: ElementRecord, type: string): boolean => {
    const inline = event.eventDefinitions === undefined ? [] : asElementArray(event.eventDefinitions);
    const refs = event.eventDefinitionRef === undefined ? [] : asElementArray(event.eventDefinitionRef);
    if (!inline || !refs || inline.length + refs.length !== 1) return false;
    const definition = [...inline, ...refs][0]!;
    if (definition.$type !== type || usedDefinitions.has(definition) ||
        (refs.includes(definition) && !roots.includes(definition)) ||
        !hasOnlyModelledKeys(definition, ["$type", "id"]) ||
        (type === "bpmn:CompensateEventDefinition" && definition.activityRef !== undefined)) return false;
    usedDefinitions.add(definition);
    return true;
  };
  const compensationBoundaries = childContents.filter((element) => element.$type === "bpmn:BoundaryEvent");
  const compensationBoundary = compensationBoundaries[0];
  const handlers = childContents.filter((element) => element.$type === "bpmn:ServiceTask");
  const handler = handlers[0];
  const association = artifacts[0]!;
  if (compensationBoundaries.length !== 1 || !compensationBoundary || handlers.length !== 1 || !handler ||
      !readId(compensationBoundary) || !readId(handler) ||
      !eventDefinition(compensationBoundary, "bpmn:CompensateEventDefinition") ||
      !plain(compensationBoundary, ["attachedToRef", "cancelActivity", "eventDefinitions", "eventDefinitionRef"]) ||
      typeof compensationBoundary.cancelActivity !== "boolean" ||
      handler.isForCompensation !== true || handler.implementation !== COMPENSATION_SINGLE_EFFECT_IMPLEMENTATION ||
      !plain(handler, ["isForCompensation", "implementation"]) ||
      association.$type !== "bpmn:Association" || !readId(association) ||
      association.sourceRef !== compensationBoundary || association.targetRef !== handler ||
      ![undefined, "None", "One", "Both"].includes(association.associationDirection as string | undefined) ||
      !plain(association, ["sourceRef", "targetRef", "associationDirection"])) return reject();
  const eligible = childContents.find((element) => element === compensationBoundary.attachedToRef);
  if (!eligible || eligible.$type !== "bpmn:UserTask" || !readId(eligible)) return reject();
  const rootScope = definitionScopeId(readId(process)!);
  const childScope = definitionScopeId(readId(transaction)!);
  const nodes: CheckedNode[] = [];
  const flows: CheckedSequenceFlow[] = [];
  const nodeScopes: Array<{ nodeId: string; scopeId: string }> = [];
  const sequenceFlowScopes: Array<{ sequenceFlowId: string; scopeId: string }> = [];
  const eventKeys = ["incoming", "outgoing", "eventDefinitions", "eventDefinitionRef"];
  const projectScope = (contents: readonly ElementRecord[], scopeId: string): boolean => {
    const ordinary = contents.filter((element) => element !== compensationBoundary && element !== handler);
    const scopeFlows = ordinary.filter(({ $type }) => $type === "bpmn:SequenceFlow");
    for (const element of ordinary) {
      const id = readId(element);
      if (!id) return false;
      if (element.$type === "bpmn:SequenceFlow") {
        const sourceElement = ordinary.find((candidate) => candidate === element.sourceRef && candidate.$type !== "bpmn:SequenceFlow");
        const targetElement = ordinary.find((candidate) => candidate === element.targetRef && candidate.$type !== "bpmn:SequenceFlow");
        if (!sourceElement || !targetElement || !plain(element, ["sourceRef", "targetRef"])) return false;
        flows.push({ id, sourceId: readId(sourceElement)!, targetId: readId(targetElement)!, condition: null });
        sequenceFlowScopes.push({ sequenceFlowId: id, scopeId });
        continue;
      }
      for (const [key, ref] of [["incoming", "targetRef"], ["outgoing", "sourceRef"]] as const) {
        if (element[key] === undefined) continue;
        const actual = asElementArray(element[key]);
        const expected = scopeFlows.filter((flow) => flow[ref] === element);
        if (!actual || actual.length !== expected.length || new Set(actual).size !== actual.length ||
            actual.some((flow) => !expected.includes(flow))) return false;
      }
      let node: CheckedNode;
      switch (element.$type) {
        case metamodelManifest.compilerProjection.transactionType:
          if (element !== transaction || scopeId !== rootScope) return false;
          node = { kind: K.TransactionSubProcess, id, childScopeId: childScope, method: "##Compensate" }; break;
        case "bpmn:StartEvent":
          if (!plain(element, ["outgoing"])) return false;
          node = { kind: K.NoneStartEvent, id }; break;
        case "bpmn:UserTask":
          if (element.isForCompensation !== false || !plain(element, ["incoming", "outgoing"])) return false;
          node = { kind: K.UserTask, id, name: typeof element.name === "string" ? element.name : null }; break;
        case "bpmn:ParallelGateway":
          if (element.gatewayDirection !== "Diverging" || !plain(element, ["incoming", "outgoing", "gatewayDirection"])) return false;
          node = { kind: K.ParallelGateway, id, direction: GatewayDirection.Diverging }; break;
        case "bpmn:EndEvent": {
          if (!plain(element, eventKeys)) return false;
          const hasDefinition = element.eventDefinitions !== undefined || element.eventDefinitionRef !== undefined;
          if (hasDefinition && (scopeId !== childScope || !eventDefinition(element, metamodelManifest.compilerProjection.cancelEventDefinitionType))) return false;
          node = { kind: hasDefinition ? K.CancelEndEvent : K.NoneEndEvent, id }; break;
        }
        case "bpmn:BoundaryEvent": {
          const outgoing = scopeFlows.filter((flow) => flow.sourceRef === element);
          if (scopeId !== rootScope || element.attachedToRef !== transaction || element.cancelActivity !== true ||
              !plain(element, [...eventKeys, "attachedToRef", "cancelActivity"]) ||
              !eventDefinition(element, metamodelManifest.compilerProjection.cancelEventDefinitionType) || outgoing.length !== 1) return false;
          node = { kind: K.CancelBoundaryEvent, id, attachedToRef: readId(transaction)!, outputFlowId: readId(outgoing[0]!)! }; break;
        }
        default: return false;
      }
      nodes.push(node);
      nodeScopes.push({ nodeId: id, scopeId });
    }
    return true;
  };
  if (!projectScope(rootContents, rootScope) || !projectScope(childContents, childScope) ||
      roots.some((element) => element !== process && !usedDefinitions.has(element))) return reject();
  const cancel = nodes.find((node) => node.kind === K.CancelEndEvent);
  if (!cancel) return reject();
  const checked: CheckedProcess = {
    kind: CheckedProcessKind.CheckedProcess,
    identity: { semanticProfile: TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID, sourceId: source.id, sourceSha256: source.sha256, sourceOverlay: null },
    processId: readId(process)!,
    definitionScopes: [
      { id: rootScope, parentScopeId: null, originElementId: readId(process)! },
      { id: childScope, parentScopeId: rootScope, originElementId: readId(transaction)! },
    ].sort(compareIds),
    nodes: nodes.sort(compareIds), sequenceFlows: flows.sort(compareIds),
    nodeScopes: nodeScopes.sort((a, b) => compareCanonicalStrings(a.nodeId, b.nodeId)),
    sequenceFlowScopes: sequenceFlowScopes.sort((a, b) => compareCanonicalStrings(a.sequenceFlowId, b.sequenceFlowId)),
    transactionCancellation: {
      definitionScopeId: childScope, triggerElementId: cancel.id,
      subject: { kind: "boundaryActivity", subjectElementId: readId(eligible)!, boundaryEventElementId: readId(compensationBoundary)!,
        body: { kind: "singleEffect", handlerElementId: readId(handler)!, effectElementId: readId(handler)!, descriptor: compensationSingleEffectDescriptor, input: { kind: "empty" } } },
      retentionLimits: { maxRecords: 1, maxCanonicalBytes: 4096 },
      executionLimits: { maxTriggers: 1, maxHandlers: 1, maxCanonicalBytes: 20480 },
    },
  };
  return transactionCheckedGraphValid(checked) ? { checkedProcess: checked, diagnostics: [] } : reject();
}

function plain(element: ElementRecord, keys: readonly string[]): boolean {
  return (element.name === undefined || typeof element.name === "string") &&
    hasOnlyModelledKeys(element, ["$type", "id", "name", ...keys]);
}
function compareIds(a: { id: string }, b: { id: string }): number {
  return compareCanonicalStrings(a.id, b.id);
}
