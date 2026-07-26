import {
  CheckedNodeKind,
  CheckedProcessKind,
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

const bpmnTypes = metamodelManifest.compilerProjection;

type ElementRecord = Record<string, unknown>;

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
      "rootElements",
    ])
  ) {
    return unsupported(
      "The bounded compiler requires one plain bpmn:Definitions source without imports, extensions, or diagram interchange.",
    );
  }

  const rootElements = asElementArray(definitions.rootElements);
  if (
    rootElements === undefined ||
    rootElements.length !== 1 ||
    rootElements[0]?.$type !== bpmnTypes.processType
  ) {
    return unsupported(
      "The bounded compiler requires exactly one bpmn:Process root element.",
    );
  }

  const process = rootElements[0];
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
      "The bounded compiler requires an explicitly executable Process without subprocesses, lanes, artifacts, extensions, or other Process properties.",
    );
  }

  const processId = readId(process);
  const flowElements = asElementArray(process.flowElements);
  if (processId === undefined || flowElements === undefined) {
    return unsupported("The Process and every compiled element require an ID.");
  }

  const sourceNodes = flowElements.filter((element) =>
    isSupportedNodeType(element.$type)
  );
  const sourceFlows = elementsOfType(
    flowElements,
    bpmnTypes.sequenceFlowType,
  );
  if (sourceNodes.length + sourceFlows.length !== flowElements.length) {
    return unsupported(
      "The bounded compiler supports only None Start Events, exact PT1S Intermediate Catch Timer Events, User Tasks, Parallel Gateways, None End Events, and Sequence Flows.",
    );
  }

  const sequenceFlows = projectSequenceFlows(sourceFlows);
  if (sequenceFlows === undefined) {
    return unsupported(
      "Every Sequence Flow requires a distinct ID and resolved source and target references.",
    );
  }
  const nodes = projectNodes(sourceNodes, sequenceFlows);
  if (nodes === undefined) {
    return unsupported(
      "Every admitted node requires a supported plain shape, distinct ID, and gateway direction consistent with its arity.",
    );
  }

  const allIds = [
    processId,
    ...nodes.map(({ id }) => id),
    ...sequenceFlows.map(({ id }) => id),
  ];
  if (new Set(allIds).size !== allIds.length) {
    return unsupported(
      "The bounded compiler requires distinct Process, node, and Sequence Flow IDs.",
    );
  }
  if (!hasSupportedTopology(nodes, sequenceFlows)) {
    return unsupported(
      "The bounded compiler supports only the sequential User Task or balanced two-branch Parallel Gateway topology.",
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
      nodes: [...nodes].sort(compareIds),
      sequenceFlows: [...sequenceFlows].sort(compareIds),
    },
    diagnostic: undefined,
  };
}

function projectNodes(
  elements: ReadonlyArray<ElementRecord>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
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
          : undefined;
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
      case bpmnTypes.endEventType:
        return isPlainFlowNode(element)
          ? { kind: CheckedNodeKind.NoneEndEvent, id }
          : undefined;
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
  const declared = element.gatewayDirection;
  if (
    declared === undefined ||
    (typeof declared === "string" &&
      (declared.toLowerCase() === direction ||
        declared.toLowerCase() === "unspecified"))
  ) {
    return direction;
  }
  return undefined;
}

function hasSupportedTopology(
  nodes: ReadonlyArray<CheckedNode>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): boolean {
  const starts = nodes.filter(
    ({ kind }) => kind === CheckedNodeKind.NoneStartEvent,
  );
  const tasks = nodes.filter(
    ({ kind }) => kind === CheckedNodeKind.UserTask,
  );
  const timers = nodes.filter(
    ({ kind }) => kind === CheckedNodeKind.IntermediateCatchTimerEvent,
  );
  const gateways = nodes.filter(
    ({ kind }) => kind === CheckedNodeKind.ParallelGateway,
  );
  const ends = nodes.filter(
    ({ kind }) => kind === CheckedNodeKind.NoneEndEvent,
  );
  if (starts.length !== 1 || ends.length !== 1) {
    return false;
  }
  const start = starts[0];
  const end = ends[0];
  if (start === undefined || end === undefined) {
    return false;
  }
  if (
    tasks.length + timers.length === 1 &&
    gateways.length === 0 &&
    flows.length === 2
  ) {
    const waitNode = tasks[0] ?? timers[0];
    return (
      waitNode !== undefined &&
      hasFlow(flows, start.id, waitNode.id) &&
      hasFlow(flows, waitNode.id, end.id)
    );
  }
  if (
    timers.length !== 0 ||
    tasks.length !== 2 ||
    gateways.length !== 2 ||
    flows.length !== 6
  ) {
    return false;
  }
  const fork = gateways.find(
    (gateway) =>
      gateway.kind === CheckedNodeKind.ParallelGateway &&
      gateway.direction === GatewayDirection.Diverging,
  );
  const join = gateways.find(
    (gateway) =>
      gateway.kind === CheckedNodeKind.ParallelGateway &&
      gateway.direction === GatewayDirection.Converging,
  );
  return (
    fork !== undefined &&
    join !== undefined &&
    hasFlow(flows, start.id, fork.id) &&
    tasks.every(
      (task) =>
        hasFlow(flows, fork.id, task.id) &&
        hasFlow(flows, task.id, join.id),
    ) &&
    hasFlow(flows, join.id, end.id)
  );
}

function projectSequenceFlows(
  flows: ReadonlyArray<ElementRecord>,
): ReadonlyArray<CheckedSequenceFlow> | undefined {
  const projected = flows.map((flow) => {
    if (!hasOnlyOwnKeys(flow, ["$type", "id", "name"])) {
      return undefined;
    }
    const id = readId(flow);
    const source = asElement(flow.sourceRef);
    const target = asElement(flow.targetRef);
    const sourceId = source === undefined ? undefined : readId(source);
    const targetId = target === undefined ? undefined : readId(target);
    return id === undefined || sourceId === undefined || targetId === undefined
      ? undefined
      : { id, sourceId, targetId };
  });
  return projected.every((flow) => flow !== undefined)
    ? (projected as ReadonlyArray<CheckedSequenceFlow>)
    : undefined;
}

function isSupportedNodeType(type: unknown): boolean {
  return [
    bpmnTypes.startEventType,
    bpmnTypes.intermediateCatchEventType,
    bpmnTypes.userTaskType,
    bpmnTypes.parallelGatewayType,
    bpmnTypes.endEventType,
  ].includes(String(type));
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

function asElement(value: unknown): ElementRecord | undefined {
  return typeof value === "object" && value !== null
    ? (value as ElementRecord)
    : undefined;
}

function asElementArray(value: unknown): ReadonlyArray<ElementRecord> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const elements = value.map(asElement);
  return elements.every((element) => element !== undefined)
    ? (elements as ReadonlyArray<ElementRecord>)
    : undefined;
}

function elementsOfType(
  elements: ReadonlyArray<ElementRecord>,
  type: string,
): ReadonlyArray<ElementRecord> {
  return elements.filter((element) => element.$type === type);
}

function hasOnlyOwnKeys(
  element: ElementRecord,
  allowedKeys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(element).every((key) => allowed.has(key));
}

function isPlainFlowNode(element: ElementRecord): boolean {
  return hasOnlyOwnKeys(element, ["$type", "id", "name"]);
}

function readId(element: ElementRecord): string | undefined {
  return typeof element.id === "string" && element.id.length > 0
    ? element.id
    : undefined;
}

function readOptionalName(
  element: ElementRecord,
): string | null | undefined {
  if (element.name === undefined) {
    return null;
  }
  return typeof element.name === "string" ? element.name : undefined;
}

function hasFlow(
  flows: ReadonlyArray<CheckedSequenceFlow>,
  sourceId: string,
  targetId: string,
): boolean {
  return flows.some(
    (flow) => flow.sourceId === sourceId && flow.targetId === targetId,
  );
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
