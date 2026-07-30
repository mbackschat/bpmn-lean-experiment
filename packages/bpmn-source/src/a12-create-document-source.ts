import {
  CheckedNodeKind,
  CheckedProcessKind,
  EffectOperation,
  EffectProtocol,
  MappingExpressionKind,
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

export const a12CreateDocumentProfile =
  "cibseven-2.0.0-a12-create-document-draft";

const bpmnTypes = metamodelManifest.compilerProjection;
const camundaNamespace = "http://camunda.org/schema/1.0/bpmn";
const protocol = "urn:bpmn-lean:a12-delegate:v1";
const handlerExpression = "${createDocumentDelegate}";

type Projection =
  | Readonly<{
      checkedProcess: CheckedProcess;
      diagnostic: undefined;
    }>
  | Readonly<{
      checkedProcess: undefined;
      diagnostic: BpmnSourceDiagnostic;
    }>;

/**
 * Projects the one approved A12 CreateDocument source shape.
 *
 * Layout and Modeler metadata remain in the exact source bytes, while this
 * boundary rejects any unrecognized executable node, attribute, or extension.
 */
export function compileA12CreateDocument(
  rootElement: unknown,
  source: BpmnSourceIdentity,
): Projection {
  const definitions = asElement(rootElement);
  if (
    definitions === undefined ||
    definitions.$type !== bpmnTypes.definitionsType ||
    !hasOnlyOwnKeys(definitions, [
      "$type",
      "id",
      "targetNamespace",
      "exporter",
      "exporterVersion",
      "rootElements",
      "diagrams",
    ])
  ) {
    return unsupported("The A12 profile requires one modeler-authored BPMN Definitions document.");
  }

  const roots = asElementArray(definitions.rootElements);
  const process = roots?.[0];
  if (
    roots?.length !== 1 ||
    process?.$type !== bpmnTypes.processType ||
    !hasOnlyOwnKeys(process, [
      "$type",
      "id",
      "name",
      "isExecutable",
      "flowElements",
    ]) ||
    process.isExecutable !== true ||
    !hasExactVersionTag(process, definitions)
  ) {
    return unsupported("The A12 profile requires one executable Process with a Camunda version tag.");
  }

  const processId = readId(process);
  const elements = asElementArray(process.flowElements);
  if (processId === undefined || elements === undefined) {
    return unsupported("The Process and every executable element require an ID.");
  }

  const starts = elements.filter(({ $type }) => $type === bpmnTypes.startEventType);
  const tasks = elements.filter(({ $type }) => $type === bpmnTypes.serviceTaskType);
  const ends = elements.filter(({ $type }) => $type === bpmnTypes.endEventType);
  const sourceFlows = elements.filter(({ $type }) => $type === bpmnTypes.sequenceFlowType);
  if (
    starts.length !== 1 ||
    tasks.length !== 1 ||
    ends.length !== 1 ||
    sourceFlows.length !== 2 ||
    starts.length + tasks.length + ends.length + sourceFlows.length !==
      elements.length
  ) {
    return unsupported("The A12 profile requires the exact Start → CreateDocument → End topology.");
  }

  const start = projectPlainNode(starts[0], CheckedNodeKind.NoneStartEvent);
  const task = projectCreateDocument(tasks[0], definitions);
  const end = projectPlainNode(ends[0], CheckedNodeKind.NoneEndEvent);
  const flows = projectFlows(sourceFlows);
  if (
    start === undefined ||
    task === undefined ||
    end === undefined ||
    flows === undefined ||
    !hasFlow(flows, start.id, task.id) ||
    !hasFlow(flows, task.id, end.id)
  ) {
    return unsupported("The A12 profile requires the exact CreateDocument binding, mappings, and linear flow.");
  }

  const ids = [processId, start.id, task.id, end.id, ...flows.map(({ id }) => id)];
  if (new Set(ids).size !== ids.length) {
    return unsupported("Process, node, and Sequence Flow IDs must be distinct.");
  }
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile: a12CreateDocumentProfile,
        sourceId: source.id,
        sourceSha256: source.sha256,
      },
      processId,
      nodes: [start, task, end].sort(compareIds),
      sequenceFlows: [...flows].sort(compareIds),
    },
    diagnostic: undefined,
  };
}

function projectPlainNode(
  value: ElementRecord | undefined,
  kind: CheckedNodeKind.NoneStartEvent | CheckedNodeKind.NoneEndEvent,
): Extract<CheckedNode, { kind: typeof kind }> | undefined {
  const id = value === undefined ? undefined : readId(value);
  return value !== undefined &&
      id !== undefined &&
      hasOnlyOwnKeys(value, ["$type", "id", "name"])
    ? ({ kind, id } as Extract<CheckedNode, { kind: typeof kind }>)
    : undefined;
}

function projectCreateDocument(
  value: ElementRecord | undefined,
  definitions: ElementRecord,
): Extract<CheckedNode, { kind: CheckedNodeKind.ServiceTask }> | undefined {
  if (
    value === undefined ||
    !hasOnlyOwnKeys(value, ["$type", "id", "name", "extensionElements"])
  ) {
    return undefined;
  }
  const id = readId(value);
  const attributes = readForeignAttributes(value, definitions);
  const inputOutput = readInputOutput(value.extensionElements);
  if (
    id !== "CreateDocument" ||
    attributes?.size !== 3 ||
    attributes.get(`${camundaNamespace}#delegateExpression`) !==
      handlerExpression ||
    attributes.get(`${camundaNamespace}#modelerTemplate`) !==
      "createDocumentDelegateTemplate" ||
    attributes.get(`${camundaNamespace}#modelerTemplateVersion`) !== "1" ||
    inputOutput === undefined
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.ServiceTask,
    id,
    descriptor: {
      protocol: EffectProtocol.Activity,
      operation: EffectOperation.MappedSuccess,
    },
    bpmnErrorRoute: null,
    inputMappings: [{
      target: inputOutput.inputParameter.name,
      expression: {
        kind: MappingExpressionKind.StringLiteral,
        value: inputOutput.inputParameter.body,
      },
    }],
    outputMappings: [{
      target: inputOutput.outputParameter.name,
      expression: {
        kind: MappingExpressionKind.LocalVariable,
        name: "newDocRef",
      },
    }],
  };
}

function readInputOutput(value: unknown):
  | Readonly<{
      inputParameter: Readonly<{
        name: "documentModelName";
        body: "MyDocumentModel";
      }>;
      outputParameter: Readonly<{
        name: "myDocumentReference";
        body: "${newDocRef}";
      }>;
    }>
  | undefined {
  const extension = asElement(value);
  const values = asElementArray(extension?.values);
  const inputOutput = values?.[0];
  const children = asElementArray(inputOutput?.$children);
  const input = children?.[0];
  const output = children?.[1];
  if (
    extension?.$type !== "bpmn:ExtensionElements" ||
    !hasOnlyOwnKeys(extension, ["$type", "values"]) ||
    values?.length !== 1 ||
    inputOutput?.$type !== "camunda:inputOutput" ||
    !hasOnlyOwnKeys(inputOutput, ["$type", "$children"]) ||
    children?.length !== 2 ||
    !isParameter(input, "camunda:inputParameter", "documentModelName", "MyDocumentModel") ||
    !isParameter(output, "camunda:outputParameter", "myDocumentReference", "${newDocRef}")
  ) {
    return undefined;
  }
  return {
    inputParameter: { name: "documentModelName", body: "MyDocumentModel" },
    outputParameter: { name: "myDocumentReference", body: "${newDocRef}" },
  };
}

function isParameter(
  value: ElementRecord | undefined,
  type: string,
  name: string,
  body: string,
): boolean {
  return value?.$type === type &&
    value.name === name &&
    value.$body === body &&
    hasOnlyOwnKeys(value, ["$type", "name", "$body"]);
}

function hasExactVersionTag(
  process: ElementRecord,
  definitions: ElementRecord,
): boolean {
  const attributes = readForeignAttributes(process, definitions);
  return attributes?.size === 1 &&
    typeof attributes.get(`${camundaNamespace}#versionTag`) === "string";
}

function projectFlows(
  values: ReadonlyArray<ElementRecord>,
): ReadonlyArray<CheckedSequenceFlow> | undefined {
  const flows = values.map((flow) => {
    const source = asElement(flow.sourceRef);
    const target = asElement(flow.targetRef);
    const id = readId(flow);
    const sourceId = source === undefined ? undefined : readId(source);
    const targetId = target === undefined ? undefined : readId(target);
    return hasOnlyOwnKeys(flow, ["$type", "id", "name"]) &&
        id !== undefined &&
        sourceId !== undefined &&
        targetId !== undefined
      ? { id, sourceId, targetId }
      : undefined;
  });
  return flows.every((flow) => flow !== undefined)
    ? (flows as ReadonlyArray<CheckedSequenceFlow>)
    : undefined;
}

function hasFlow(
  flows: ReadonlyArray<CheckedSequenceFlow>,
  sourceId: string,
  targetId: string,
): boolean {
  return flows.some((flow) =>
    flow.sourceId === sourceId && flow.targetId === targetId
  );
}

function compareIds(
  left: Readonly<{ id: string }>,
  right: Readonly<{ id: string }>,
): number {
  return compareCanonicalStrings(left.id, right.id);
}

function unsupported(evidence: string): Projection {
  return {
    checkedProcess: undefined,
    diagnostic: {
      code: BpmnSourceDiagnosticCode.UnsupportedModel,
      evidence,
    },
  };
}
