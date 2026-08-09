import {
  CheckedNodeKind,
  CheckedProcessKind,
  SemanticProfileId,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import {
  orderedElementDiagnostics,
} from "./admission-diagnostics.js";
import {
  BpmnSourceDiagnosticCode,
} from "./contracts.js";
import type {
  BpmnSourceIdentity,
  CheckedCompilationProjection,
} from "./contracts.js";
import type { MappedServiceTaskSourcePolicy } from "./mapped-service-task-source-policy.js";
import {
  hasFlow,
  projectMappedSuccessSequenceFlows,
  projectMappedSuccessServiceTask,
  projectPlainNode,
} from "./mapped-service-task-source.js";
import {
  asElement,
  asElementArray,
  hasOnlyModelledKeys,
  readId,
} from "./moddle-graph.js";
import {
  FlowElementProjectionProfile,
  projectedFlowElementKeyRejections,
} from "./projected-flow-element-keys.js";
import { definitionScopeId } from "./scoped-flow-elements.js";

export const mappedSuccessServiceTaskProfile =
  SemanticProfileId.MappedSuccessServiceTask;

const bpmnTypes = metamodelManifest.compilerProjection;

/** Projects the bounded neutral mapped-success Service Task source shape. */
export function compileMappedSuccessServiceTask(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  policy: MappedServiceTaskSourcePolicy,
): CheckedCompilationProjection {
  const definitions = asElement(rootElement);
  if (
    definitions === undefined ||
    definitions.$type !== bpmnTypes.definitionsType ||
    !hasOnlyModelledKeys(definitions, [
      "$type",
      "id",
      "targetNamespace",
      "exporter",
      "exporterVersion",
      "rootElements",
      "diagrams",
    ])
  ) {
    return unsupported(
      "The mapped-success profile requires one exact BPMN Definitions document.",
    );
  }
  const roots = asElementArray(definitions.rootElements);
  const process = roots?.[0];
  if (
    roots?.length !== 1 ||
    process?.$type !== bpmnTypes.processType ||
    !hasOnlyModelledKeys(process, [
      "$type",
      "id",
      "name",
      "isExecutable",
      "flowElements",
    ]) ||
    process.isExecutable !== true
  ) {
    return unsupported(
      "The mapped-success profile requires one private executable Process.",
    );
  }
  const processId = readId(process);
  const elements = asElementArray(process.flowElements);
  if (processId === undefined || elements === undefined) {
    return unsupported("The mapped-success Process and executable elements require IDs.");
  }
  const starts = elements.filter(({ $type }) =>
    $type === bpmnTypes.startEventType
  );
  const tasks = elements.filter(({ $type }) =>
    $type === bpmnTypes.serviceTaskType
  );
  const ends = elements.filter(({ $type }) =>
    $type === bpmnTypes.endEventType
  );
  const sourceFlows = elements.filter(({ $type }) =>
    $type === bpmnTypes.sequenceFlowType
  );
  if (
    starts.length !== 1 ||
    tasks.length !== 1 ||
    ends.length !== 1 ||
    sourceFlows.length !== 2 ||
    elements.length !== 5
  ) {
    return unsupported(
      "The mapped-success profile requires the exact Start, Service Task, End topology.",
    );
  }
  const keyRejections = projectedFlowElementKeyRejections(
    definitions,
    elements,
    FlowElementProjectionProfile.MappedSuccessServiceTask,
  );
  if (keyRejections === undefined) {
    return unsupported(
      "Every mapped-success flow element requires an exact key inventory entry.",
    );
  }
  if (keyRejections.length > 0) {
    return {
      checkedProcess: undefined,
      diagnostics: orderedElementDiagnostics(keyRejections),
    };
  }
  const start = projectPlainNode(
    starts[0],
    CheckedNodeKind.NoneStartEvent,
  );
  const task = tasks[0] === undefined
    ? undefined
    : projectMappedSuccessServiceTask(
        tasks[0],
        definitions,
        policy,
      );
  const end = projectPlainNode(
    ends[0],
    CheckedNodeKind.NoneEndEvent,
  );
  const flows = projectMappedSuccessSequenceFlows(sourceFlows);
  if (
    start === undefined ||
    task === undefined ||
    end === undefined ||
    flows === undefined ||
    !hasFlow(flows, start.id, task.id) ||
    !hasFlow(flows, task.id, end.id)
  ) {
    return unsupported(
      "The mapped-success binding, mappings, or linear flow is outside the selected profile.",
    );
  }
  return accepted(source, policy, processId, [start, task, end], flows);
}

function accepted(
  source: BpmnSourceIdentity,
  policy: MappedServiceTaskSourcePolicy,
  processId: string,
  nodes: ReadonlyArray<CheckedNode>,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): CheckedCompilationProjection {
  const ids = [processId, ...nodes.map(({ id }) => id), ...flows.map(({ id }) => id)];
  if (new Set(ids).size !== ids.length) {
    return unsupported("Process, node, and Sequence Flow IDs must be distinct.");
  }
  const rootScopeId = definitionScopeId(processId);
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile: mappedSuccessServiceTaskProfile,
        sourceId: source.id,
        sourceSha256: source.sha256,
        sourceOverlay: policy.sourceOverlay,
      },
      processId,
      definitionScopes: [{
        id: rootScopeId,
        parentScopeId: null,
        originElementId: processId,
      }],
      nodeScopes: nodes.map(({ id: nodeId }) => ({
        nodeId,
        scopeId: rootScopeId,
      })).sort((left, right) =>
        compareCanonicalStrings(left.nodeId, right.nodeId)
      ),
      sequenceFlowScopes: flows.map(({ id: sequenceFlowId }) => ({
        sequenceFlowId,
        scopeId: rootScopeId,
      })).sort((left, right) =>
        compareCanonicalStrings(left.sequenceFlowId, right.sequenceFlowId)
      ),
      nodes: [...nodes].sort(compareIds),
      sequenceFlows: [...flows].sort(compareIds),
    },
    diagnostics: [],
  };
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
    diagnostics: [{
      code: BpmnSourceDiagnosticCode.UnsupportedModel,
      element: null,
      evidence,
    }],
  };
}
