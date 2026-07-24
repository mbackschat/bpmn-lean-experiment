import {
  BpmnExecutableIrKind,
} from "@bpmn-lean/semantic-core";
import type {
  ExecutableSequenceFlow,
  SequentialUserTaskExecutableIr,
} from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-m0-metamodel.json" with {
  type: "json",
};
import {
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import type {
  BpmnSourceDiagnostic,
  BpmnSourceIdentity,
} from "./contracts.js";

const compilerIdentity = "bpmn-source-sequential-user-task@0.1.0";
const bpmnTypes = metamodelManifest.compilerProjection;

type ElementRecord = Record<string, unknown>;

type CompilationProjection =
  | Readonly<{
      executableIr: SequentialUserTaskExecutableIr;
      diagnostic: undefined;
    }>
  | Readonly<{
      executableIr: undefined;
      diagnostic: BpmnSourceDiagnostic;
    }>;

export function compileSequentialUserTaskGraph(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  semanticProfile: string,
): CompilationProjection {
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
      "The first compiler requires one plain bpmn:Definitions source without imports, extensions, or diagram interchange.",
    );
  }

  const rootElements = asElementArray(definitions.rootElements);
  if (
    rootElements === undefined ||
    rootElements.length !== 1 ||
    rootElements[0]?.$type !== bpmnTypes.processType
  ) {
    return unsupported(
      "The first compiler requires exactly one bpmn:Process root element.",
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
      "The first compiler requires an executable Process without subprocesses, lanes, artifacts, extensions, or other process properties.",
    );
  }

  const processId = readId(process);
  const flowElements = asElementArray(process.flowElements);
  if (processId === undefined || flowElements === undefined) {
    return unsupported("The Process and every compiled element require an ID.");
  }

  const startEvents = elementsOfType(
    flowElements,
    bpmnTypes.startEventType,
  );
  const userTasks = elementsOfType(flowElements, bpmnTypes.userTaskType);
  const endEvents = elementsOfType(flowElements, bpmnTypes.endEventType);
  const sequenceFlows = elementsOfType(
    flowElements,
    bpmnTypes.sequenceFlowType,
  );
  if (
    flowElements.length !== 5 ||
    startEvents.length !== 1 ||
    userTasks.length !== 1 ||
    endEvents.length !== 1 ||
    sequenceFlows.length !== 2
  ) {
    return unsupported(
      "The first compiler supports only one None Start Event, one User Task, one None End Event, and two Sequence Flows.",
    );
  }

  const startEvent = startEvents[0];
  const userTask = userTasks[0];
  const endEvent = endEvents[0];
  if (
    startEvent === undefined ||
    userTask === undefined ||
    endEvent === undefined ||
    !isPlainFlowNode(startEvent) ||
    !isPlainFlowNode(userTask) ||
    !isPlainFlowNode(endEvent)
  ) {
    return unsupported(
      "The first compiler does not support event definitions, task behavior properties, extensions, or attached elements.",
    );
  }

  const startEventId = readId(startEvent);
  const userTaskId = readId(userTask);
  const endEventId = readId(endEvent);
  const projectedFlows = projectSequenceFlows(sequenceFlows);
  if (
    startEventId === undefined ||
    userTaskId === undefined ||
    endEventId === undefined ||
    projectedFlows === undefined ||
    new Set([
      processId,
      startEventId,
      userTaskId,
      endEventId,
      ...projectedFlows.map(({ id }) => id),
    ]).size !== 6
  ) {
    return unsupported(
      "The first compiler requires six distinct IDs and two fully resolved Sequence Flow references.",
    );
  }

  if (
    !hasFlow(projectedFlows, startEventId, userTaskId) ||
    !hasFlow(projectedFlows, userTaskId, endEventId)
  ) {
    return unsupported(
      "The first compiler requires the topology None Start Event → User Task → None End Event.",
    );
  }

  return {
    executableIr: {
      schemaVersion: "0.1.0",
      kind: BpmnExecutableIrKind.SequentialUserTask,
      identity: {
        compiler: compilerIdentity,
        semanticProfile,
        sourceId: source.id,
        sourceSha256: source.sha256,
      },
      processId,
      startEventId,
      userTaskId,
      endEventId,
      sequenceFlows: projectedFlows,
    },
    diagnostic: undefined,
  };
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

function projectSequenceFlows(
  flows: ReadonlyArray<ElementRecord>,
): readonly [ExecutableSequenceFlow, ExecutableSequenceFlow] | undefined {
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
  if (
    projected.length !== 2 ||
    projected[0] === undefined ||
    projected[1] === undefined
  ) {
    return undefined;
  }
  return [projected[0], projected[1]];
}

function hasFlow(
  flows: ReadonlyArray<ExecutableSequenceFlow>,
  sourceId: string,
  targetId: string,
): boolean {
  return flows.some(
    (flow) => flow.sourceId === sourceId && flow.targetId === targetId,
  );
}

function unsupported(evidence: string): CompilationProjection {
  return {
    executableIr: undefined,
    diagnostic: {
      code: BpmnSourceDiagnosticCode.UnsupportedModel,
      evidence,
    },
  };
}
