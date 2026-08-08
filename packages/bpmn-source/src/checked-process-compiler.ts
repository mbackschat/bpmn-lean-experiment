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
  BpmnAdmissionCapability,
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
import {
  isAdmittedCheckedProcess,
} from "./checked-process-admission.js";
import {
  isProjectableNodeType,
  projectCheckedNodes,
  projectCheckedSequenceFlows,
} from "./checked-element-projection.js";
import {
  containedLocus,
  definitionsLocus,
  locateContainedElements,
  orderedElementDiagnostics,
  rejectElement,
} from "./admission-diagnostics.js";
import type {
  ElementRejection,
} from "./admission-diagnostics.js";
import {
  baseElementRetentionRejections,
  foreignAttributeConsumingTypes,
  foreignAttributeRejections,
  preservationCapability,
  unadmittedKeyRejections,
} from "./preserved-element-classification.js";
import {
  FlowElementProjectionProfile,
  projectedFlowElementKeyRejections,
} from "./projected-flow-element-keys.js";
import {
  selectRootDefinitions,
} from "./root-definition-selection.js";
import type {
  RootDefinitionSelectionResult,
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
 * Compiles one admitted `bpmn:Definitions` into the checked graph, or reports why it was refused.
 *
 * Refusals come from two kinds of rule and the difference is visible in the result. **Classification**
 * decides, for each parsed element, whether the selected profile executes it, preserves it, or
 * rejects it; every such refusal names the element and its containment path, and they are collected
 * across loci rather than returned at the first one, so an external author fixing one construct does
 * not have to recompile to discover the next. **Structural** rules are stated over the whole document
 * or over the checked graph — the root multiset, connectivity, arity, profile cardinalities — and
 * carry no element, because naming one would be a location this compiler cannot justify.
 *
 * A structural gate that cannot pass still emits whatever classification found, rather than
 * discarding it: the two are independent facts about the source and suppressing the first would
 * rebuild the one-message-per-file behavior this contract exists to remove.
 */
export function compileCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  semanticProfile: string,
): CheckedCompilationProjection {
  const capability = preservationCapability(semanticProfile);
  const definitions = asElement(rootElement);
  if (
    definitions === undefined ||
    definitions.$type !== bpmnTypes.definitionsType
  ) {
    return unsupported(
      [],
      "The bounded compiler requires one bpmn:Definitions source.",
    );
  }
  const located = locateContainedElements(definitions);
  const classification: ElementRejection[] = [
    ...unadmittedKeyRejections(
      definitions,
      definitionsLocus,
      [
        "$type",
        "id",
        "targetNamespace",
        "expressionLanguage",
        "rootElements",
      ],
      capability?.definitionsKeys ?? new Set(),
      capability,
    ),
    ...foreignAttributeRejections(
      definitions,
      located,
      foreignAttributeConsumingTypes(semanticProfile),
    ),
    ...baseElementRetentionRejections(located, capability),
  ];

  const rootElementsLocus = containedLocus(definitionsLocus, "rootElements");
  const rootElements = asElementArray(definitions.rootElements);
  const rootSelection: RootDefinitionSelectionResult = rootElements === undefined
    ? { selection: undefined, rejections: [] }
    : selectRootDefinitions(rootElements, semanticProfile, rootElementsLocus);
  classification.push(...rootSelection.rejections);
  const selection = rootSelection.selection;
  if (selection === undefined) {
    return unsupported(
      classification,
      "The bounded compiler requires exactly the selected profile's Process and root-definition multiset.",
    );
  }

  const process = selection.process;
  const processLocus = containedLocus(
    rootElementsLocus,
    rootElements?.indexOf(process) ?? 0,
  );
  classification.push(
    ...unadmittedKeyRejections(
      process,
      processLocus,
      ["$type", "id", "name", "isExecutable", "flowElements"],
      capability?.processKeys ?? new Set(),
      capability,
    ),
  );
  if (process.isExecutable !== true) {
    return unsupported(
      classification,
      "The bounded compiler requires an explicitly executable Process.",
    );
  }

  const processId = readId(process);
  if (processId === undefined) {
    return unsupported(
      classification,
      "The Process and every compiled element require an ID.",
    );
  }
  const scoped = collectScopedFlowElements(
    process,
    processId,
    bpmnTypes.subProcessType,
    processLocus,
  );
  if (scoped === undefined) {
    return unsupported(
      classification,
      "Every embedded SubProcess must be ordinary, have an ID, and contain a FlowElements graph.",
    );
  }

  const { nodes: sourceNodes, flows: sourceFlows, unexecuted } =
    partitionScopedElements(scoped.elements);
  classification.push(...unexecutedFlowElementRejections(unexecuted));
  const flowKeyRejections = projectedFlowElementKeyRejections(
    definitions,
    [...sourceNodes, ...sourceFlows].map(({ element }) => element),
    FlowElementProjectionProfile.Generic,
    capability,
  );
  if (flowKeyRejections === undefined) {
    return unsupported(
      classification,
      "Every selected flow element requires an exact key inventory entry.",
    );
  }
  classification.push(...flowKeyRejections);
  if (classification.length > 0) {
    return {
      checkedProcess: undefined,
      diagnostics: orderedElementDiagnostics(classification),
    };
  }

  const sequenceFlows = projectCheckedSequenceFlows(
    sourceFlows.map(({ element }) => element),
    definitions.expressionLanguage,
    capability,
  );
  if (sequenceFlows === undefined) {
    return unsupported(
      [],
      "Every Sequence Flow requires a distinct ID and resolved source and target references.",
    );
  }
  const nodes = projectCheckedNodes(
    sourceNodes.map(({ element }) => element),
    sequenceFlows,
    definitions,
    selection,
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
      [],
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
      [],
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
      [],
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
    diagnostics: [],
  };
}

/**
 * The scoped flow elements split into the two the projectors take and the remainder.
 *
 * Stated once, in one pass, because the remainder is defined as *not the other two*: deriving it
 * from a separately written predicate is how a type comes to be projected and reported at the same
 * time, or dropped from both.
 */
function partitionScopedElements(
  elements: ReadonlyArray<ScopedSourceElement>,
): Readonly<{
  nodes: ReadonlyArray<ScopedSourceElement>;
  flows: ReadonlyArray<ScopedSourceElement>;
  unexecuted: ReadonlyArray<ScopedSourceElement>;
}> {
  const nodes: ScopedSourceElement[] = [];
  const flows: ScopedSourceElement[] = [];
  const unexecuted: ScopedSourceElement[] = [];
  for (const scoped of elements) {
    if (isProjectableNodeType(scoped.element.$type)) {
      nodes.push(scoped);
    } else if (scoped.element.$type === bpmnTypes.sequenceFlowType) {
      flows.push(scoped);
    } else {
      unexecuted.push(scoped);
    }
  }
  return { nodes, flows, unexecuted };
}

/**
 * Refusals for flow elements the selected profile does not execute.
 *
 * A flow element sits inside the executable Process, so the capability its author needs is
 * *execution*: preserving it would remove behavior the model asks for, which is the silent omission
 * the three-way partition exists to prevent.
 */
function unexecutedFlowElementRejections(
  elements: ReadonlyArray<ScopedSourceElement>,
): ReadonlyArray<ElementRejection> {
  return elements.map(({ element, locus }) =>
    rejectElement(
      element,
      locus,
      BpmnSourceDiagnosticCode.UnsupportedElementType,
      null,
      BpmnAdmissionCapability.ExecuteElementType,
    )
  );
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

/**
 * A structural refusal, reported after whatever classification already found.
 *
 * The structural diagnostic comes last because it is the coarser fact: an author reads the elements
 * that must change before the shape the profile requires of what remains.
 */
function unsupported(
  classification: ReadonlyArray<ElementRejection>,
  evidence: string,
): CheckedCompilationProjection {
  return {
    checkedProcess: undefined,
    diagnostics: [
      ...orderedElementDiagnostics(classification),
      {
        code: BpmnSourceDiagnosticCode.UnsupportedModel,
        element: null,
        evidence,
      },
    ],
  };
}
