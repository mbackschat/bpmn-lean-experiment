import { projectInterruptingMessageEventSubProcesses } from "./interrupting-message-event-subprocess-source.js";
import { scalarProcessProperties } from "./activity-data-input-output-projection.js";
import { declaresExactPropertyCount, selectsStructuredCompositionSource } from "./structured-source-profile.js";
import {
  INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID,
  CheckedNodeKind,
  CheckedProcessKind,
  SemanticProfileId,
  compareCanonicalStrings,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
  CheckedProcess,
  SourceOverlayIdentity,
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
import type {
  ElementRecord,
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
  ElementLocus,
} from "./admission-diagnostics.js";
import {
  baseElementRetentionRejections,
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
  RootDefinitionSelection,
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
import {
  terminateEndSourcePropertiesValid,
} from "./terminate-end-event-source.js";
import {
  configuredTaskProjectionPolicyForProfile,
} from "./configured-task-source.js";
import type {
  ConfiguredTaskProjectionPolicy,
} from "./configured-task-source.js";
import {
  isUserTaskMetadataProfile,
} from "./user-task-metadata-source.js";

const bpmnTypes = metamodelManifest.compilerProjection;

export type ForeignAttributeClassification = (
  definitions: ElementRecord,
  located: ReadonlyMap<ElementRecord, ElementLocus>,
) => ReadonlyArray<ElementRejection>;

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
  classifyForeignAttributes: ForeignAttributeClassification,
  sourceOverlay: SourceOverlayIdentity | null,
): CheckedCompilationProjection {
  const capability = preservationCapability(semanticProfile);
  const configuredTaskPolicy =
    configuredTaskProjectionPolicyForProfile(semanticProfile);
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
    ...classifyForeignAttributes(definitions, located),
    ...baseElementRetentionRejections(located, capability),
  ];

  const rootElementsLocus = containedLocus(definitionsLocus, "rootElements");
  const rootElements = asElementArray(definitions.rootElements);
  if (semanticProfile === SemanticProfileId.EmbeddedSubProcessCompletion && rootElements !== undefined &&
      rootElements.length > 1) {
    return compileProcessForest(definitions, rootElements, rootElementsLocus, classification, source,
      semanticProfile, capability, configuredTaskPolicy, sourceOverlay);
  }
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
  const classified = classifyProcess(
    definitions,
    process,
    containedLocus(rootElementsLocus, rootElements?.indexOf(process) ?? 0),
    semanticProfile,
    capability,
    configuredTaskPolicy,
  );
  classification.push(...classified.classification);
  if (classified.kind === ProcessProjectionKind.Refused) {
    return unsupported(classification, classified.evidence);
  }
  if (classification.length > 0) {
    return {
      checkedProcess: undefined,
      diagnostics: orderedElementDiagnostics(classification),
    };
  }
  const projected = projectClassifiedProcess(
    classified,
    definitions,
    selection,
    capability,
    configuredTaskPolicy,
    semanticProfile,
  );
  if (projected.kind === ProcessProjectionKind.Refused) {
    return unsupported([], projected.evidence);
  }
  const { processId, scoped, nodes, sequenceFlows, nodeScopes, sequenceFlowScopes } = projected;

  const messageHandlers = semanticProfile === INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID
    ? projectInterruptingMessageEventSubProcesses(process, scoped.elements, nodes, sequenceFlows) : undefined;
  if (semanticProfile === INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID && messageHandlers === undefined) {
    return unsupported([], "The interrupting Message handler requires exact owned containment, interruption, channel and entry flow.");
  }
  const handlerDeclarations = messageHandlers === undefined ? {} : { interruptingMessageEventSubProcesses: messageHandlers };

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
        ...handlerDeclarations,
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
        sourceOverlay,
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
      ...handlerDeclarations,
    },
    diagnostics: [],
  };
}

/** CALLN-ADMIT-01 bounds a Call forest to the caller and seven called Processes. */
const processForestRootLimit = 8;

/**
 * CALLN-ADMIT-01's reader for a `SCOPE` document of several Process roots: each root is classified and projected
 * exactly as a single Process is, and the merged forest's entry is the one Process no Call names. Whether every Call
 * names another root, the call graph's shape and every body rule are checked admission's, not this reader's.
 */
function compileProcessForest(
  definitions: ElementRecord,
  rootElements: ReadonlyArray<ElementRecord>,
  rootElementsLocus: ElementLocus,
  documentClassification: ReadonlyArray<ElementRejection>,
  source: BpmnSourceIdentity,
  semanticProfile: string,
  capability: ReturnType<typeof preservationCapability>,
  configuredTaskPolicy: ConfiguredTaskProjectionPolicy | undefined,
  sourceOverlay: SourceOverlayIdentity | null,
): CheckedCompilationProjection {
  const classification: ElementRejection[] = [...documentClassification];
  if (rootElements.length > processForestRootLimit ||
      !rootElements.every(({ $type }) => $type === bpmnTypes.processType)) {
    return unsupported(classification, "A Call forest admits two to eight Process roots and no other root element.");
  }
  const classified: ClassifiedProcess[] = [];
  for (const [index, process] of rootElements.entries()) {
    const result = classifyProcess(definitions, process, containedLocus(rootElementsLocus, index), semanticProfile,
      capability, configuredTaskPolicy);
    classification.push(...result.classification);
    if (result.kind === ProcessProjectionKind.Refused) return unsupported(classification, result.evidence);
    classified.push(result);
  }
  if (classification.length > 0) {
    return { checkedProcess: undefined, diagnostics: orderedElementDiagnostics(classification) };
  }
  const projected: ProjectedProcess[] = [];
  for (const [index, entry] of classified.entries()) {
    const process = rootElements[index]!;
    const result = projectClassifiedProcess(entry, definitions,
      { process, messageArtifacts: undefined, errorArtifact: undefined }, capability, configuredTaskPolicy, semanticProfile);
    if (result.kind === ProcessProjectionKind.Refused) return unsupported([], result.evidence);
    projected.push(result);
  }
  const nodes = projected.flatMap(({ nodes }) => nodes);
  const sequenceFlows = projected.flatMap(({ sequenceFlows }) => sequenceFlows);
  const called = new Set(nodes.flatMap(node => node.kind === CheckedNodeKind.CallActivity ? [node.calledProcessId] : []));
  const entries = projected.filter(({ processId }) => !called.has(processId));
  const allIds = [...projected.map(({ processId }) => processId), ...nodes.map(({ id }) => id),
    ...sequenceFlows.map(({ id }) => id)];
  if (entries.length !== 1 || new Set(allIds).size !== allIds.length) {
    return unsupported([], "A Call forest requires one entry Process that no Call names and distinct Process, node, and Sequence Flow IDs.");
  }
  const processId = entries[0]!.processId;
  const definitionScopes = projected.flatMap(({ scoped }) => scoped.definitionScopes);
  const nodeScopes = projected.flatMap(({ nodeScopes }) => nodeScopes);
  const sequenceFlowScopes = projected.flatMap(({ sequenceFlowScopes }) => sequenceFlowScopes);
  if (!isAdmittedCheckedProcess({ processId, definitionScopes, nodeScopes, sequenceFlowScopes, nodes,
    flows: sequenceFlows }, definitions.expressionLanguage, semanticProfile)) {
    return unsupported([], "The checked Call forest is outside the selected profile's mechanism, cardinality, graph, or expression capabilities.");
  }
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: { semanticProfile, sourceId: source.id, sourceSha256: source.sha256, sourceOverlay },
      processId,
      definitionScopes: [...definitionScopes].sort(compareIds),
      nodeScopes: [...nodeScopes].sort((left, right) => compareCanonicalStrings(left.nodeId, right.nodeId)),
      sequenceFlowScopes: [...sequenceFlowScopes].sort((left, right) =>
        compareCanonicalStrings(left.sequenceFlowId, right.sequenceFlowId)),
      nodes: [...nodes].sort(compareIds),
      sequenceFlows: [...sequenceFlows].sort(compareIds),
    },
    diagnostics: [],
  };
}

export const ProcessProjectionKind = Object.freeze({
  Classified: "classified",
  Projected: "projected",
  Refused: "refused",
} as const);

type ProcessRefusal = Readonly<{
  kind: typeof ProcessProjectionKind.Refused;
  classification: ReadonlyArray<ElementRejection>;
  evidence: string;
}>;

export type ClassifiedProcess = Readonly<{
  kind: typeof ProcessProjectionKind.Classified;
  classification: ReadonlyArray<ElementRejection>;
  processId: string;
  scoped: NonNullable<ReturnType<typeof collectScopedFlowElements>>;
  sourceNodes: ReadonlyArray<ScopedSourceElement>;
  sourceFlows: ReadonlyArray<ScopedSourceElement>;
}>;

export type ProjectedProcess = Readonly<{
  kind: typeof ProcessProjectionKind.Projected;
  processId: string;
  scoped: ClassifiedProcess["scoped"];
  nodes: ReadonlyArray<CheckedNode>;
  sequenceFlows: ReadonlyArray<CheckedSequenceFlow>;
  nodeScopes: ReadonlyArray<Readonly<{ nodeId: string; scopeId: string }>>;
  sequenceFlowScopes: ReadonlyArray<Readonly<{ sequenceFlowId: string; scopeId: string }>>;
}>;

/**
 * One Process root's classification: its keys, executability, scoped elements and the flow elements the profile
 * does not execute. Element-level refusals are returned for the caller to merge with document-level ones, so a
 * Process forest reports every locus as a single Process does.
 */
export function classifyProcess(
  definitions: ElementRecord,
  process: ElementRecord,
  processLocus: ElementLocus,
  semanticProfile: string,
  capability: ReturnType<typeof preservationCapability>,
  configuredTaskPolicy: ConfiguredTaskProjectionPolicy | undefined,
): ClassifiedProcess | ProcessRefusal {
  const structuredComposition = selectsStructuredCompositionSource(semanticProfile);
  const classification: ElementRejection[] = [
    ...unadmittedKeyRejections(
      process,
      processLocus,
      ["$type", "id", "name", "isExecutable", "flowElements",
        ...(structuredComposition ? ["properties"] : [])],
      capability?.processKeys ?? new Set(),
      capability,
    ),
  ];
  const refused = (evidence: string): ProcessRefusal =>
    ({ kind: ProcessProjectionKind.Refused, classification, evidence });
  const declaredProperties = structuredComposition ? scalarProcessProperties(process) : undefined;
  if (process.isExecutable !== true ||
      (structuredComposition && (declaredProperties === undefined ||
        !declaresExactPropertyCount(semanticProfile, declaredProperties)))) {
    return refused("The bounded compiler requires an explicitly executable Process and the selected Process-property shape.");
  }
  const processId = readId(process);
  if (processId === undefined) {
    return refused("The Process and every compiled element require an ID.");
  }
  const scoped = collectScopedFlowElements(
    process,
    processId,
    bpmnTypes.subProcessType,
    processLocus,
    semanticProfile,
  );
  if (scoped === undefined) {
    return refused("Every embedded SubProcess must have an admitted trigger, an ID, and a FlowElements graph.");
  }
  if (!terminateEndSourcePropertiesValid(scoped.elements, semanticProfile)) {
    return refused("The Terminate End profile requires one ordinary embedded Sub-Process whose triggeredByEvent value resolves to false.");
  }
  const { nodes: sourceNodes, flows: sourceFlows, unexecuted } =
    partitionScopedElements(scoped.elements, configuredTaskPolicy, semanticProfile);
  classification.push(...unexecutedFlowElementRejections(unexecuted));
  const flowKeyRejections = projectedFlowElementKeyRejections(
    definitions,
    [...sourceNodes, ...sourceFlows].map(({ element }) => element),
    structuredComposition ? FlowElementProjectionProfile.StructuredComposition :
    isUserTaskMetadataProfile(semanticProfile)
      ? FlowElementProjectionProfile.UserTaskMetadata
      : FlowElementProjectionProfile.Generic,
    capability,
  );
  if (flowKeyRejections === undefined) {
    return refused("Every selected flow element requires an exact key inventory entry.");
  }
  classification.push(...flowKeyRejections);
  return { kind: ProcessProjectionKind.Classified, classification, processId, scoped, sourceNodes, sourceFlows };
}

/** Projects a classified Process root free of element-level refusals into its checked nodes, flows and ownership. */
export function projectClassifiedProcess(
  classified: ClassifiedProcess,
  definitions: ElementRecord,
  selection: RootDefinitionSelection,
  capability: ReturnType<typeof preservationCapability>,
  configuredTaskPolicy: ConfiguredTaskProjectionPolicy | undefined,
  semanticProfile: string,
): ProjectedProcess | ProcessRefusal {
  const refused = (evidence: string): ProcessRefusal =>
    ({ kind: ProcessProjectionKind.Refused, classification: [], evidence });
  const sequenceFlows = projectCheckedSequenceFlows(
    classified.sourceFlows.map(({ element }) => element),
    definitions.expressionLanguage,
    capability,
  );
  if (sequenceFlows === undefined) {
    return refused("Every Sequence Flow requires a distinct ID and resolved source and target references.");
  }
  const nodes = projectCheckedNodes(
    classified.sourceNodes.map(({ element }) => element),
    sequenceFlows,
    definitions,
    selection,
    capability,
    configuredTaskPolicy,
    semanticProfile,
  );
  const nodeScopes = projectOwnership(
    classified.sourceNodes,
    (nodeId, scopeId) => ({ nodeId, scopeId }),
  );
  const sequenceFlowScopes = projectOwnership(
    classified.sourceFlows,
    (sequenceFlowId, scopeId) => ({ sequenceFlowId, scopeId }),
  );
  if (
    nodes === undefined ||
    nodeScopes === undefined ||
    sequenceFlowScopes === undefined
  ) {
    return refused("Every admitted node requires a supported plain shape, distinct ID, and gateway direction consistent with its arity.");
  }
  return {
    kind: ProcessProjectionKind.Projected,
    processId: classified.processId,
    scoped: classified.scoped,
    nodes,
    sequenceFlows,
    nodeScopes,
    sequenceFlowScopes,
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
  configuredTaskPolicy: ConfiguredTaskProjectionPolicy | undefined,
  semanticProfile: string,
): Readonly<{
  nodes: ReadonlyArray<ScopedSourceElement>;
  flows: ReadonlyArray<ScopedSourceElement>;
  unexecuted: ReadonlyArray<ScopedSourceElement>;
}> {
  const nodes: ScopedSourceElement[] = [];
  const flows: ScopedSourceElement[] = [];
  const unexecuted: ScopedSourceElement[] = [];
  for (const scoped of elements) {
    if (isProjectableNodeType(scoped.element.$type, configuredTaskPolicy, semanticProfile)) {
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
