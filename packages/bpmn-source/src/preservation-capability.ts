/** Closed profile selection for material retained in exact BPMN source without execution meaning. */
import { SemanticProfileId } from "@bpmn-lean/semantic-core";

import type {
  OpaquePropertyRetention,
} from "./opaque-rendering-retention.js";
import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};

const bpmnTypes = metamodelManifest.compilerProjection;

/** One profile's enumerated preservation capability. The absent default always means rejection. */
export type PreservationCapability = Readonly<{
  preservedTypes: ReadonlySet<string>;
  definitionsKeys: ReadonlySet<string>;
  processKeys: ReadonlySet<string>;
  baseElementKeys: ReadonlySet<string>;
  opaqueProperties: ReadonlyArray<OpaquePropertyRetention>;
}>;

enum PreservationCapabilityKind {
  StandardNotation = "standardNotation",
  StructuredHumanWorkRendering = "structuredHumanWorkRendering",
}

type SemanticProfile =
  typeof SemanticProfileId[keyof typeof SemanticProfileId];

const registeredSemanticProfiles: ReadonlySet<string> = new Set(
  Object.values(SemanticProfileId),
);

/**
 * Standard BPMN material shared by every profile that explicitly selects notation preservation.
 * Definitions provenance and preserved BaseElement documentation remain only in exact source bytes.
 */
const standardNotation: PreservationCapability = Object.freeze({
  preservedTypes: new Set([
    "bpmndi:BPMNDiagram",
    "bpmndi:BPMNPlane",
    "bpmndi:BPMNShape",
    "bpmndi:BPMNEdge",
    "bpmndi:BPMNLabel",
    "bpmndi:BPMNLabelStyle",
    "dc:Bounds",
    "dc:Point",
    "dc:Font",
    "bpmn:Collaboration",
    "bpmn:Participant",
    "bpmn:MessageFlow",
    "bpmn:LaneSet",
    "bpmn:Lane",
    "bpmn:Association",
    "bpmn:TextAnnotation",
    "bpmn:Group",
    "bpmn:Documentation",
  ]),
  definitionsKeys: new Set([
    "diagrams",
    "documentation",
    "exporter",
    "exporterVersion",
    "name",
  ]),
  processKeys: new Set(["artifacts", "documentation", "laneSets"]),
  baseElementKeys: new Set(["documentation"]),
  opaqueProperties: [],
});

const structuredHumanWorkRendering: PreservationCapability = Object.freeze({
  preservedTypes: new Set(["bpmn:Documentation"]),
  definitionsKeys: new Set<string>(),
  processKeys: new Set<string>(),
  baseElementKeys: new Set(["documentation"]),
  opaqueProperties: [{
    ownerType: bpmnTypes.userTaskType,
    property: "renderings",
    rootType: bpmnTypes.renderingType,
  }],
});

/** The capability of one profile, or `undefined` when every unexecuted source fact must reject. */
export function preservationCapability(
  semanticProfile: string,
): PreservationCapability | undefined {
  if (!registeredSemanticProfiles.has(semanticProfile)) {
    return undefined;
  }
  const kind = preservationCapabilityKind(semanticProfile as SemanticProfile);
  switch (kind) {
    case PreservationCapabilityKind.StandardNotation:
      return standardNotation;
    case PreservationCapabilityKind.StructuredHumanWorkRendering:
      return structuredHumanWorkRendering;
    case undefined:
      return undefined;
    default:
      return assertNever(kind);
  }
}

function preservationCapabilityKind(
  semanticProfile: SemanticProfile,
): PreservationCapabilityKind | undefined {
  switch (semanticProfile) {
    case SemanticProfileId.UserTaskProcessDataPreservedNotation:
    case SemanticProfileId.UserTaskPreservedNotation:
      return PreservationCapabilityKind.StandardNotation;
    case SemanticProfileId.StructuredHumanWork:
      return PreservationCapabilityKind.StructuredHumanWorkRendering;
    case SemanticProfileId.ActivityBoundaryTimer:
    case SemanticProfileId.CalledProcessCallActivity:
    case SemanticProfileId.ConfiguredTask:
    case SemanticProfileId.EmbeddedSubProcessCompletion:
    case SemanticProfileId.EventBasedGatewayMessageTimer:
    case SemanticProfileId.ExclusiveGatewaySimpleBoolean:
    case SemanticProfileId.InclusiveGatewaySelectedBranches:
    case SemanticProfileId.IntermediateCatchMessage:
    case SemanticProfileId.IntermediateCatchTimer:
    case SemanticProfileId.MappedBoundaryErrorServiceTask:
    case SemanticProfileId.MappedSuccessServiceTask:
    case SemanticProfileId.MessageAddressedReceiveTask:
    case SemanticProfileId.MessageStart:
    case SemanticProfileId.NonInterruptingBoundaryTimer:
    case SemanticProfileId.ParallelForkJoin:
    case SemanticProfileId.ParallelUserTaskAssignmentFormMetadata:
    case SemanticProfileId.ServiceTaskEffect:
    case SemanticProfileId.ServiceTaskIncident:
    case SemanticProfileId.ServiceTaskIncidentCancellation:
    case SemanticProfileId.SequentialMultiInstanceUserTask:
    case SemanticProfileId.SubProcessBoundaryTimer:
    case SemanticProfileId.SubProcessErrorPropagation:
    case SemanticProfileId.TerminateEnd:
    case SemanticProfileId.TimerStart:
    case SemanticProfileId.TimerUserTaskComposition:
    case SemanticProfileId.UserTask:
    case SemanticProfileId.UserTaskAssignmentFormMetadata:
    case SemanticProfileId.UserTaskBooleanCompletionData:
    case SemanticProfileId.UserTaskCycle:
      return undefined;
    default:
      return assertNever(semanticProfile);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`unsupported semantic profile ${String(value)}`);
}
