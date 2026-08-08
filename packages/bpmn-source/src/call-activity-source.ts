import {
  CheckedNodeKind,
  CheckedProcessKind,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedProcess,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import { isAdmittedCheckedProcess } from "./checked-process-admission.js";
import {
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import type {
  BpmnSourceIdentity,
  CheckedCompilationProjection,
} from "./contracts.js";
import {
  asElement,
  asElementArray,
  hasOnlyModelledKeys,
  readId,
} from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import {
  carriesNoUnconsumedForeignAttribute,
} from "./preserved-element-classification.js";
import { definitionScopeId } from "./scoped-flow-elements.js";

const bpmnTypes = metamodelManifest.compilerProjection;

type ProcessElements = Readonly<{
  processId: string;
  nodes: ReadonlyArray<ElementRecord>;
  flows: ReadonlyArray<ElementRecord>;
}>;

// XML 1.0 Fifth Edition NCName uses Name ranges without U+003A colon.
const ncNameStart =
  "[A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}]";
const ncName = new RegExp(
  `^${ncNameStart}(?:${ncNameStart}|[-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040])*$`,
  "u",
);

export function compileCallActivityCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  semanticProfile: string,
): CheckedCompilationProjection {
  const definitions = asElement(rootElement);
  if (
    definitions === undefined ||
    definitions.$type !== bpmnTypes.definitionsType ||
    !hasOnlyModelledKeys(definitions, [
      "$type",
      "id",
      "targetNamespace",
      "rootElements",
    ]) ||
    readId(definitions) === undefined ||
    typeof definitions.targetNamespace !== "string" ||
    definitions.targetNamespace.length === 0
  ) {
    return unsupported("Call Activity requires one plain Definitions document with one target namespace.");
  }
  // This profile's projectors read no foreign attribute at all, so every one of them is content the
  // exact-key allowlists cannot see and must reject rather than discard.
  if (!carriesNoUnconsumedForeignAttribute(definitions, new Set())) {
    return unsupported("A foreign attribute the compiler does not consume must be rejected rather than discarded.");
  }
  const roots = asElementArray(definitions.rootElements);
  const processes = roots?.filter(({ $type }) => $type === bpmnTypes.processType);
  if (roots?.length !== 2 || processes?.length !== 2) {
    return unsupported("Call Activity requires exactly two in-document Process roots.");
  }
  const projected = processes.map(projectProcessElements);
  if (!projected.every(
    (entry): entry is ProcessElements => entry !== undefined,
  )) {
    return unsupported("Both Call Activity Process roots must be plain, private, and explicitly executable.");
  }
  const processElements = projected;
  const callers = processElements.filter(hasCallerShape);
  const caller = callers[0];
  if (callers.length !== 1 || caller === undefined) {
    return unsupported("Exactly one Process must have the selected Call Activity caller shape.");
  }
  const call = caller.nodes.find(({ $type }) => $type === bpmnTypes.callActivityType);
  const calledProcessId = call === undefined
    ? undefined
    : resolveCalledProcessId(call, definitions, processElements, caller.processId);
  const called = processElements.find(({ processId }) => processId === calledProcessId);
  if (call === undefined || calledProcessId === undefined || called === undefined || !hasCalledShape(called)) {
    return unsupported("The Call Activity QName must resolve to the distinct selected called Process shape.");
  }

  const allNodes = [...caller.nodes, ...called.nodes];
  const allFlows = [...caller.flows, ...called.flows];
  const sequenceFlows = projectSequenceFlows(allFlows);
  const nodes = projectNodes(allNodes, call, calledProcessId);
  const definitionScopes = [caller, called]
    .map(({ processId }) => ({
      id: definitionScopeId(processId),
      parentScopeId: null,
      originElementId: processId,
    }))
    .sort(compareIds);
  const nodeScopes = [caller, called]
    .flatMap(({ processId, nodes }) => nodes.map((element) => ({
      nodeId: requireId(element),
      scopeId: definitionScopeId(processId),
    })))
    .sort((left, right) => compareCanonicalStrings(left.nodeId, right.nodeId));
  const sequenceFlowScopes = [caller, called]
    .flatMap(({ processId, flows }) => flows.map((element) => ({
      sequenceFlowId: requireId(element),
      scopeId: definitionScopeId(processId),
    })))
    .sort((left, right) =>
      compareCanonicalStrings(left.sequenceFlowId, right.sequenceFlowId)
    );
  if (nodes === undefined || sequenceFlows === undefined) {
    return unsupported("Every Call Activity node and Sequence Flow must have the selected plain shape and resolved references.");
  }
  const allIds = [
    caller.processId,
    called.processId,
    ...nodes.map(({ id }) => id),
    ...sequenceFlows.map(({ id }) => id),
  ];
  if (new Set(allIds).size !== allIds.length) {
    return unsupported("Both Processes, every node, and every Sequence Flow require globally distinct IDs.");
  }
  const graph = {
    processId: caller.processId,
    definitionScopes,
    nodeScopes,
    sequenceFlowScopes,
    nodes: [...nodes].sort(compareIds),
    flows: [...sequenceFlows].sort(compareIds),
  };
  if (!isAdmittedCheckedProcess(
    graph,
    definitions.expressionLanguage,
    semanticProfile,
  )) {
    return unsupported("The two Process graphs do not satisfy the bounded Call Activity profile.");
  }
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile,
        sourceId: source.id,
        sourceSha256: source.sha256,
      },
      processId: caller.processId,
      definitionScopes,
      nodeScopes,
      sequenceFlowScopes,
      nodes: graph.nodes,
      sequenceFlows: graph.flows,
    },
    diagnostics: [],
  };
}

function projectProcessElements(process: ElementRecord): ProcessElements | undefined {
  if (
    !hasOnlyModelledKeys(process, ["$type", "id", "name", "isExecutable", "flowElements"]) ||
    process.isExecutable !== true
  ) {
    return undefined;
  }
  const processId = readId(process);
  const elements = asElementArray(process.flowElements);
  if (processId === undefined || elements === undefined) {
    return undefined;
  }
  const nodes = elements.filter(({ $type }) => $type !== bpmnTypes.sequenceFlowType);
  const flows = elements.filter(({ $type }) => $type === bpmnTypes.sequenceFlowType);
  return { processId, nodes, flows };
}

function hasCallerShape(value: ProcessElements): boolean {
  return hasTypeCardinalities(value.nodes, [
    bpmnTypes.startEventType,
    bpmnTypes.callActivityType,
    bpmnTypes.userTaskType,
    bpmnTypes.endEventType,
  ]) && value.flows.length === 3;
}

function hasCalledShape(value: ProcessElements): boolean {
  return hasTypeCardinalities(value.nodes, [
    bpmnTypes.startEventType,
    bpmnTypes.userTaskType,
    bpmnTypes.endEventType,
  ]) && value.flows.length === 2;
}

function hasTypeCardinalities(
  elements: ReadonlyArray<ElementRecord>,
  requiredTypes: ReadonlyArray<string>,
): boolean {
  return elements.length === requiredTypes.length &&
    requiredTypes.every((type) =>
      elements.filter(({ $type }) => $type === type).length ===
        requiredTypes.filter((candidate) => candidate === type).length
    );
}

function resolveCalledProcessId(
  call: ElementRecord,
  definitions: ElementRecord,
  processes: ReadonlyArray<ProcessElements>,
  callerProcessId: string,
): string | undefined {
  if (!hasOnlyModelledKeys(call, ["$type", "id", "name", "calledElement"]) || typeof call.calledElement !== "string") {
    return undefined;
  }
  const parts = call.calledElement.split(":");
  const prefix = parts[0];
  const localName = parts[1];
  if (
    parts.length !== 2 ||
    prefix === undefined ||
    localName === undefined ||
    !ncName.test(prefix) ||
    !ncName.test(localName)
  ) {
    return undefined;
  }
  const namespaceAttributes = asElement(definitions.$attrs);
  if (
    namespaceAttributes?.[`xmlns:${prefix}`] !== definitions.targetNamespace ||
    localName === callerProcessId ||
    processes.filter(({ processId }) => processId === localName).length !== 1
  ) {
    return undefined;
  }
  return localName;
}

function projectNodes(
  elements: ReadonlyArray<ElementRecord>,
  call: ElementRecord,
  calledProcessId: string,
): ReadonlyArray<CheckedNode> | undefined {
  const projected = elements.map((element): CheckedNode | undefined => {
    const id = readId(element);
    if (id === undefined) {
      return undefined;
    }
    switch (element.$type) {
      case bpmnTypes.startEventType:
        return isPlainNode(element)
          ? { kind: CheckedNodeKind.NoneStartEvent, id }
          : undefined;
      case bpmnTypes.callActivityType:
        return element === call
          ? { kind: CheckedNodeKind.CallActivity, id, calledProcessId }
          : undefined;
      case bpmnTypes.userTaskType: {
        const name = readOptionalName(element);
        return isPlainNode(element) && name !== undefined
          ? { kind: CheckedNodeKind.UserTask, id, name }
          : undefined;
      }
      case bpmnTypes.endEventType:
        return isPlainNode(element)
          ? { kind: CheckedNodeKind.NoneEndEvent, id }
          : undefined;
      default:
        return undefined;
    }
  });
  return projected.every((node): node is CheckedNode => node !== undefined)
    ? projected
    : undefined;
}

function projectSequenceFlows(
  elements: ReadonlyArray<ElementRecord>,
): ReadonlyArray<CheckedSequenceFlow> | undefined {
  const projected = elements.map((flow): CheckedSequenceFlow | undefined => {
    if (!hasOnlyModelledKeys(flow, ["$type", "id", "name", "conditionExpression"])) {
      return undefined;
    }
    const id = readId(flow);
    const sourceId = asElement(flow.sourceRef) === undefined
      ? undefined
      : readId(asElement(flow.sourceRef) ?? {});
    const targetId = asElement(flow.targetRef) === undefined
      ? undefined
      : readId(asElement(flow.targetRef) ?? {});
    return id === undefined || sourceId === undefined || targetId === undefined
      ? undefined
      : { id, sourceId, targetId, condition: null };
  });
  return projected.every(
    (flow): flow is CheckedSequenceFlow => flow !== undefined,
  )
    ? projected
    : undefined;
}

function isPlainNode(element: ElementRecord): boolean {
  return hasOnlyModelledKeys(element, ["$type", "id", "name"]);
}

function readOptionalName(element: ElementRecord): string | null | undefined {
  return element.name === undefined
    ? null
    : typeof element.name === "string" ? element.name : undefined;
}

function requireId(element: ElementRecord): string {
  const id = readId(element);
  if (id === undefined) {
    throw new TypeError("Projected Call Activity elements require IDs");
  }
  return id;
}

function compareIds(
  left: Readonly<{ id: string }>,
  right: Readonly<{ id: string }>,
): number {
  return compareCanonicalStrings(left.id, right.id);
}

function unsupported(evidence: string): CheckedCompilationProjection {
  return {
    checkedProcess: undefined,
    diagnostics: [
      { code: BpmnSourceDiagnosticCode.UnsupportedModel, element: null, evidence },
    ],
  };
}
