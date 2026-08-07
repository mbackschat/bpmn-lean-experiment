import {
  CheckedProcessKind,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedProcess,
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
  hasOnlyModelledKeys,
  readId,
} from "./moddle-graph.js";
import {
  isAdmittedCheckedProcess,
} from "./checked-process-admission.js";
import {
  isProjectableNodeType,
  projectCheckedNodes,
  projectCheckedSequenceFlows,
} from "./checked-element-projection.js";
import {
  selectRootDefinitions,
} from "./root-definition-selection.js";
import {
  collectScopedFlowElements,
} from "./scoped-flow-elements.js";
import type {
  ScopedSourceElement,
} from "./scoped-flow-elements.js";
import {
  hasDistinctErrorIdentity,
} from "./subprocess-error-source.js";

const bpmnTypes = metamodelManifest.compilerProjection;

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
    !hasOnlyModelledKeys(definitions, [
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
    isProjectableNodeType(element.$type)
  );
  const sourceFlows = scoped.elements.filter(
    ({ element }) => element.$type === bpmnTypes.sequenceFlowType,
  );
  if (sourceNodes.length + sourceFlows.length !== scoped.elements.length) {
    return unsupported(
      "The bounded compiler supports only ordinary embedded SubProcesses, selected boundary Error Events, None Start Events, exact PT1S Intermediate Catch Timer Events, selected Message Receive Tasks, User Tasks, selected Service Tasks, Parallel or selected Exclusive or Inclusive Gateways, selected Error or None End Events, and Sequence Flows.",
    );
  }

  const sequenceFlows = projectCheckedSequenceFlows(
    sourceFlows.map(({ element }) => element),
    definitions.expressionLanguage,
  );
  if (sequenceFlows === undefined) {
    return unsupported(
      "Every Sequence Flow requires a distinct ID and resolved source and target references.",
    );
  }
  const nodes = projectCheckedNodes(
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
