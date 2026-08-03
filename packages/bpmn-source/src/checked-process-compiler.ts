import {
  CheckedNodeKind,
  CheckedProcessKind,
  EffectOperation,
  EffectProtocol,
  GatewayDirection,
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
import {
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import type {
  BpmnSourceDiagnostic,
  BpmnSourceIdentity,
} from "./contracts.js";
import {
  asElement,
  asElementArray,
  hasOnlyOwnKeys,
  readForeignAttributes,
  readId,
} from "./moddle-graph.js";
import type {
  ElementRecord,
} from "./moddle-graph.js";
import { declaredGatewayDirectionMatches } from "./gateway-direction-source.js";
import {
  projectExclusiveGateway,
  projectSimpleBooleanCondition,
} from "./simple-boolean-exclusive-gateway-source.js";
import { projectInclusiveGateway } from "./inclusive-gateway-source.js";
import { projectEventBasedGateway } from "./event-based-gateway-source.js";
import { projectTimerBoundaryEvent } from "./timer-boundary-event-source.js";
import {
  isAdmittedCheckedProcess,
} from "./checked-process-admission.js";
import {
  projectIntermediateCatchMessage,
} from "./intermediate-catch-message-source.js";
import {
  projectReceiveTask,
} from "./receive-task-source.js";
import type {
  RootDefinitionSelection,
} from "./root-definition-selection.js";
import {
  selectRootDefinitions,
} from "./root-definition-selection.js";
import {
  collectScopedFlowElements,
  definitionScopeId,
} from "./scoped-flow-elements.js";
import type {
  ScopedSourceElement,
} from "./scoped-flow-elements.js";
import {
  hasDistinctErrorIdentity,
  projectBoundaryErrorEvent,
  projectErrorEndEvent,
} from "./subprocess-error-source.js";

const bpmnTypes = metamodelManifest.compilerProjection;
const camundaNamespace = "http://camunda.org/schema/1.0/bpmn";
const effectProtocol = "urn:bpmn-lean:effect:probe-v1";
const effectHandlerExpression = "${bpmnLeanEffectHandler}";

type CheckedCompilationProjection =
  | Readonly<{
      checkedProcess: CheckedProcess;
      diagnostic: undefined;
    }>
  | Readonly<{
      checkedProcess: undefined;
      diagnostic: BpmnSourceDiagnostic;
    }>;

export function compileCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  semanticProfile: string,
): CheckedCompilationProjection {
  const definitions = asElement(rootElement);
  if (
    definitions === undefined ||
    definitions.$type !== bpmnTypes.definitionsType ||
    !hasOnlyOwnKeys(definitions, [
      "$type",
      "id",
      "targetNamespace",
      "expressionLanguage",
      "rootElements",
    ])
  ) {
    return unsupported(
      "The bounded compiler requires one plain bpmn:Definitions source without imports, extensions, or diagram interchange.",
    );
  }

  const rootElements = asElementArray(definitions.rootElements);
  const rootSelection = rootElements === undefined
    ? undefined
    : selectRootDefinitions(rootElements, semanticProfile);
  if (rootSelection === undefined) {
    return unsupported(
      "The bounded compiler requires exactly the selected profile's Process and root-definition multiset.",
    );
  }

  const process = rootSelection.process;
  if (
    !hasOnlyOwnKeys(process, [
      "$type",
      "id",
      "name",
      "isExecutable",
      "flowElements",
    ]) ||
    process.isExecutable !== true
  ) {
    return unsupported(
      "The bounded compiler requires an explicitly executable Process without lanes, artifacts, extensions, or other Process properties.",
    );
  }

  const processId = readId(process);
  if (processId === undefined) {
    return unsupported("The Process and every compiled element require an ID.");
  }
  const scoped = collectScopedFlowElements(
    process,
    processId,
    bpmnTypes.subProcessType,
  );
  if (scoped === undefined) {
    return unsupported(
      "Every embedded SubProcess must be ordinary, have an ID, and contain a FlowElements graph.",
    );
  }

  const sourceNodes = scoped.elements.filter(({ element }) =>
    isSupportedNodeType(element.$type)
  );
  const sourceFlows = scoped.elements.filter(
    ({ element }) => element.$type === bpmnTypes.sequenceFlowType,
  );
  if (sourceNodes.length + sourceFlows.length !== scoped.elements.length) {
    return unsupported(
      "The bounded compiler supports only ordinary embedded SubProcesses, selected boundary Error Events, None Start Events, exact PT1S Intermediate Catch Timer Events, selected Message Receive Tasks, User Tasks, selected Service Tasks, Parallel or selected Exclusive or Inclusive Gateways, selected Error or None End Events, and Sequence Flows.",
    );
  }

  const sequenceFlows = projectSequenceFlows(
    sourceFlows.map(({ element }) => element),
    definitions.expressionLanguage,
  );
  if (sequenceFlows === undefined) {
    return unsupported(
      "Every Sequence Flow requires a distinct ID and resolved source and target references.",
    );
  }
  const nodes = projectNodes(
    sourceNodes.map(({ element }) => element),
    sequenceFlows,
    definitions,
    rootSelection,
  );
  const nodeScopes = projectOwnership(
    sourceNodes,
    (nodeId, scopeId) => ({ nodeId, scopeId }),
  );
  const sequenceFlowScopes = projectOwnership(
    sourceFlows,
    (sequenceFlowId, scopeId) => ({ sequenceFlowId, scopeId }),
  );
  if (
    nodes === undefined ||
    nodeScopes === undefined ||
    sequenceFlowScopes === undefined
  ) {
    return unsupported(
      "Every admitted node requires a supported plain shape, distinct ID, and gateway direction consistent with its arity.",
    );
  }

  const allIds = [
    processId,
    ...nodes.map(({ id }) => id),
    ...sequenceFlows.map(({ id }) => id),
  ];
  if (
    new Set(allIds).size !== allIds.length ||
    !hasDistinctErrorIdentity(nodes, allIds)
  ) {
    return unsupported(
      "The bounded compiler requires distinct Process, node, and Sequence Flow IDs.",
    );
  }
  if (
    !isAdmittedCheckedProcess(
      {
        processId,
        definitionScopes: scoped.definitionScopes,
        nodeScopes,
        sequenceFlowScopes,
        nodes,
        flows: sequenceFlows,
      },
      definitions.expressionLanguage,
      Object.hasOwn(definitions, "expressionLanguage"),
      semanticProfile,
    )
  ) {
    return unsupported(
      "The checked graph is outside the selected profile's mechanism, cardinality, graph, or expression capabilities.",
    );
  }

  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile,
        sourceId: source.id,
        sourceSha256: source.sha256,
      },
      processId,
      definitionScopes: [...scoped.definitionScopes].sort(compareIds),
      nodeScopes: [...nodeScopes].sort((left, right) =>
        compareCanonicalStrings(left.nodeId, right.nodeId)
      ),
      sequenceFlowScopes: [...sequenceFlowScopes].sort((left, right) =>
        compareCanonicalStrings(left.sequenceFlowId, right.sequenceFlowId)
      ),
      nodes: [...nodes].sort(compareIds),
      sequenceFlows: [...sequenceFlows].sort(compareIds),
    },
    diagnostic: undefined,
  };
}

function projectNodes(
  elements: ReadonlyArray<ElementRecord>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  definitions: ElementRecord,
  rootSelection: RootDefinitionSelection,
): ReadonlyArray<CheckedNode> | undefined {
  const projected = elements.map((element) => {
    const id = readId(element);
    if (id === undefined) {
      return undefined;
    }
    switch (element.$type) {
      case bpmnTypes.startEventType:
        return isPlainFlowNode(element)
          ? { kind: CheckedNodeKind.NoneStartEvent, id }
          : undefined;
      case bpmnTypes.subProcessType:
        return {
          kind: CheckedNodeKind.EmbeddedSubProcess,
          id,
          childScopeId: definitionScopeId(id),
        };
      case bpmnTypes.boundaryEventType:
        return projectTimerBoundaryEvent(
          element,
          id,
          flows,
          bpmnTypes.timerEventDefinitionType,
        ) ??
          projectBoundaryErrorEvent(
          element,
          id,
          rootSelection.errorArtifact,
          flows,
        );
      case bpmnTypes.userTaskType: {
        const name = readOptionalName(element);
        return isPlainFlowNode(element) && name !== undefined
          ? { kind: CheckedNodeKind.UserTask, id, name }
          : undefined;
      }
      case bpmnTypes.intermediateCatchEventType:
        return isExactPt1sTimerEvent(element)
          ? {
              kind: CheckedNodeKind.IntermediateCatchTimerEvent,
              id,
              durationLiteral: "PT1S",
            }
          : projectIntermediateCatchMessage(
              element,
              id,
              rootSelection.messageArtifacts,
            );
      case bpmnTypes.receiveTaskType:
        return projectReceiveTask(
          element,
          id,
          rootSelection.messageArtifacts,
        );
      case bpmnTypes.serviceTaskType:
        return projectServiceTask(element, definitions, id);
      case bpmnTypes.parallelGatewayType: {
        const direction = classifyGateway(element, id, flows);
        return direction === undefined
          ? undefined
          : {
              kind: CheckedNodeKind.ParallelGateway,
              id,
              direction,
            };
      }
      case bpmnTypes.exclusiveGatewayType:
        return projectExclusiveGateway(element, id, flows);
      case bpmnTypes.inclusiveGatewayType:
        return projectInclusiveGateway(element, id, flows, elements);
      case bpmnTypes.eventBasedGatewayType:
        return projectEventBasedGateway(element, id, flows);
      case bpmnTypes.endEventType:
        return isPlainFlowNode(element)
          ? { kind: CheckedNodeKind.NoneEndEvent, id }
          : projectErrorEndEvent(
              element,
              id,
              rootSelection.errorArtifact,
            );
      default:
        return undefined;
    }
  });
  return projected.every((node) => node !== undefined)
    ? (projected as ReadonlyArray<CheckedNode>)
    : undefined;
}

function classifyGateway(
  element: ElementRecord,
  id: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): GatewayDirection | undefined {
  if (
    !hasOnlyOwnKeys(element, [
      "$type",
      "id",
      "name",
      "gatewayDirection",
    ])
  ) {
    return undefined;
  }
  const incoming = flows.filter(({ targetId }) => targetId === id).length;
  const outgoing = flows.filter(({ sourceId }) => sourceId === id).length;
  const direction =
    incoming === 1 && outgoing === 2
      ? GatewayDirection.Diverging
      : incoming === 2 && outgoing === 1
        ? GatewayDirection.Converging
        : undefined;
  if (direction === undefined) {
    return undefined;
  }
  if (declaredGatewayDirectionMatches(element.gatewayDirection, direction)) {
    return direction;
  }
  return undefined;
}

function projectSequenceFlows(
  flows: ReadonlyArray<ElementRecord>,
  expressionLanguage: unknown,
): ReadonlyArray<CheckedSequenceFlow> | undefined {
  const projected = flows.map((flow) => {
    if (
      !hasOnlyOwnKeys(flow, [
        "$type",
        "id",
        "name",
        "conditionExpression",
      ])
    ) {
      return undefined;
    }
    const id = readId(flow);
    const source = asElement(flow.sourceRef);
    const target = asElement(flow.targetRef);
    const sourceId = source === undefined ? undefined : readId(source);
    const targetId = target === undefined ? undefined : readId(target);
    const condition = projectSimpleBooleanCondition(
      flow.conditionExpression,
      expressionLanguage,
    );
    return (
      id === undefined ||
      sourceId === undefined ||
      targetId === undefined ||
      condition === undefined
    )
      ? undefined
      : { id, sourceId, targetId, condition };
  });
  return projected.every((flow) => flow !== undefined)
    ? (projected as ReadonlyArray<CheckedSequenceFlow>)
    : undefined;
}

function isSupportedNodeType(type: unknown): boolean {
  return [
    bpmnTypes.startEventType,
    bpmnTypes.subProcessType,
    bpmnTypes.boundaryEventType,
    bpmnTypes.intermediateCatchEventType,
    bpmnTypes.receiveTaskType,
    bpmnTypes.userTaskType,
    bpmnTypes.serviceTaskType,
    bpmnTypes.parallelGatewayType,
    bpmnTypes.exclusiveGatewayType,
    bpmnTypes.inclusiveGatewayType,
    bpmnTypes.eventBasedGatewayType,
    bpmnTypes.endEventType,
  ].includes(String(type));
}

function projectOwnership<T>(
  elements: ReadonlyArray<ScopedSourceElement>,
  project: (id: string, scopeId: string) => T,
): ReadonlyArray<T> | undefined {
  const projected = elements.map(({ element, scopeId }) => {
    const id = readId(element);
    return id === undefined ? undefined : project(id, scopeId);
  });
  return projected.every((entry) => entry !== undefined)
    ? projected
    : undefined;
}

function projectServiceTask(
  element: ElementRecord,
  definitions: ElementRecord,
  id: string,
): Extract<CheckedNode, { kind: CheckedNodeKind.ServiceTask }> | undefined {
  if (
    !hasOnlyOwnKeys(element, ["$type", "id", "name", "implementation"]) ||
    element.implementation !== effectProtocol
  ) {
    return undefined;
  }
  const attributes = readForeignAttributes(element, definitions);
  if (
    attributes === undefined ||
    attributes.size !== 2 ||
    attributes.get(`${camundaNamespace}#delegateExpression`) !==
      effectHandlerExpression ||
    attributes.get(`${camundaNamespace}#asyncBefore`) !== "true"
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.ServiceTask,
    id,
    descriptor: {
      protocol: EffectProtocol.Activity,
      operation: EffectOperation.Probe,
    },
    inputMappings: [],
    outputMappings: [],
    bpmnErrorRoute: null,
  };
}

function isExactPt1sTimerEvent(element: ElementRecord): boolean {
  if (
    !hasOnlyOwnKeys(element, [
      "$type",
      "id",
      "name",
      "eventDefinitions",
    ])
  ) {
    return false;
  }
  const eventDefinitions = asElementArray(element.eventDefinitions);
  if (
    eventDefinitions === undefined ||
    eventDefinitions.length !== 1
  ) {
    return false;
  }
  const definition = eventDefinitions[0];
  if (
    definition === undefined ||
    definition.$type !== bpmnTypes.timerEventDefinitionType ||
    !hasOnlyOwnKeys(definition, ["$type", "timeDuration"])
  ) {
    return false;
  }
  const duration = asElement(definition.timeDuration);
  return (
    duration !== undefined &&
    duration.$type === bpmnTypes.formalExpressionType &&
    hasOnlyOwnKeys(duration, ["$type", "body"]) &&
    duration.body === "PT1S"
  );
}

function isPlainFlowNode(element: ElementRecord): boolean {
  return hasOnlyOwnKeys(element, ["$type", "id", "name"]);
}

function readOptionalName(
  element: ElementRecord,
): string | null | undefined {
  if (element.name === undefined) {
    return null;
  }
  return typeof element.name === "string" ? element.name : undefined;
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
    diagnostic: {
      code: BpmnSourceDiagnosticCode.UnsupportedModel,
      evidence,
    },
  };
}
