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
  carriesNoUnconsumedForeignAttribute,
  hasOnlyExecutedOrPreservedKeys,
  preservationCapability,
} from "./preserved-element-classification.js";
import {
  referencesResolveToDeclaredType,
} from "./reference-target-admission.js";
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

/**
 * The only node type this compiler's projectors read foreign attributes from.
 *
 * The Service Task projector requires exactly the two `camunda` attributes its effect protocol
 * defines and refuses any other count, so its foreign attributes are consumed rather than discarded.
 */
const foreignAttributeConsumers: ReadonlySet<string> = new Set([
  bpmnTypes.serviceTaskType,
]);

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
  const capability = preservationCapability(semanticProfile);
  const definitions = asElement(rootElement);
  if (
    definitions === undefined ||
    definitions.$type !== bpmnTypes.definitionsType ||
    !hasOnlyExecutedOrPreservedKeys(
      definitions,
      [
        "$type",
        "id",
        "targetNamespace",
        "expressionLanguage",
        "rootElements",
      ],
      capability?.definitionsKeys ?? new Set(),
      capability,
    )
  ) {
    return unsupported(
      "The bounded compiler requires one bpmn:Definitions source carrying no import, extension, or notation beyond what the selected profile preserves.",
    );
  }
  if (!carriesNoUnconsumedForeignAttribute(definitions, foreignAttributeConsumers)) {
    return unsupported(
      "A foreign attribute the compiler does not consume must be rejected rather than discarded.",
    );
  }
  if (!referencesResolveToDeclaredType(definitions)) {
    return unsupported(
      "Every resolved reference must point at an element of the type its property declares.",
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
    !hasOnlyExecutedOrPreservedKeys(
      process,
      ["$type", "id", "name", "isExecutable", "flowElements"],
      capability?.processKeys ?? new Set(),
      capability,
    ) ||
    process.isExecutable !== true
  ) {
    return unsupported(
      "The bounded compiler requires an explicitly executable Process carrying no property beyond its flow elements and what the selected profile preserves.",
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
    capability,
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
    capability,
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
