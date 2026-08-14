import type { DeepReadonly } from "@bpmn-lean/contract-types";
import type { PublicProcessInstanceIdentity } from "./process-instances.js";

export type FlowNodeOccurrencePublicationSourceOverlayIdentity = DeepReadonly<{
  id: string;
  sha256: string;
}>;

/** Product 2's separate mirror of the public semantic definition identity. */
export type FlowNodeOccurrencePublicationDefinitionIdentity = DeepReadonly<{
  compiler: "bpmn-source-semantic-process";
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
  sourceOverlay: FlowNodeOccurrencePublicationSourceOverlayIdentity | null;
}>;

export type FlowNodeOccurrencePublicationIdentity = DeepReadonly<{
  definition: FlowNodeOccurrencePublicationDefinitionIdentity;
  processId: string;
  processInstanceId: string;
}>;

/** Maps one exact deployed Process instance to Product 1's occurrence identity. */
export function flowNodeOccurrencePublicationIdentityForPublicProcessInstance(
  instance: PublicProcessInstanceIdentity,
): FlowNodeOccurrencePublicationIdentity {
  return {
    definition: {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: instance.definition.semanticProfile,
      sourceId: instance.definition.source.id,
      sourceSha256: instance.definition.source.sha256,
      sourceOverlay: null,
    },
    processId: instance.definition.processId,
    processInstanceId: instance.processInstanceId,
  };
}

export type FlowNodeOccurrencePublicationRequest = DeepReadonly<{
  afterRevision: number;
  limit?: number;
}>;

export type FlowNodeOccurrencePublicationDecodeContext = DeepReadonly<
  FlowNodeOccurrencePublicationIdentity & FlowNodeOccurrencePublicationRequest
>;

export type FlowNodeOccurrenceScopeId = DeepReadonly<{
  processInstanceId: string;
  definitionScopeId: string;
  activation: number;
}>;

export const FlowNodeOccurrenceTerminalKind = {
  Completed: "completed",
  Cancelled: "cancelled",
} as const;

export type FlowNodeOccurrenceTerminalKind =
  typeof FlowNodeOccurrenceTerminalKind[keyof typeof FlowNodeOccurrenceTerminalKind];

export type FlowNodeOccurrenceId = DeepReadonly<{
  processInstanceId: string;
  startRevision: number;
  startIndex: number;
}>;

export type FlowNodeOccurrenceStart = DeepReadonly<{
  id: FlowNodeOccurrenceId;
  processId: string;
  elementId: string;
  owner: FlowNodeOccurrenceScopeId;
}>;

export type FlowNodeOccurrenceEnd = DeepReadonly<{
  id: FlowNodeOccurrenceId;
  terminal: FlowNodeOccurrenceTerminalKind;
}>;

export type FlowNodeOccurrenceDelta = DeepReadonly<{
  started: FlowNodeOccurrenceStart[];
  ended: FlowNodeOccurrenceEnd[];
}>;

export type FlowNodeOccurrenceTransition = DeepReadonly<{
  revision: number;
  lifecycle: FlowNodeOccurrenceDelta;
}>;

export type FlowNodeOccurrenceBatch = DeepReadonly<{
  commandId: string;
  fromRevision: number;
  throughRevision: number;
  committedAtEpochMs: number;
  transitions: [FlowNodeOccurrenceTransition, ...FlowNodeOccurrenceTransition[]];
}>;

export type OpenFlowNodeOccurrence = DeepReadonly<{
  id: FlowNodeOccurrenceId;
  processId: string;
  elementId: string;
  owner: FlowNodeOccurrenceScopeId;
  startedAtEpochMs: number;
}>;

export type FlowNodeOccurrencePage = DeepReadonly<
  FlowNodeOccurrencePublicationIdentity & {
    requestedAfterRevision: number;
    pageThroughRevision: number;
    headRevision: number;
    batches: FlowNodeOccurrenceBatch[];
    currentOpen: OpenFlowNodeOccurrence[] | null;
  }
>;

export const FlowNodeOccurrencePublicationResultKind = {
  Available: "available",
  NotReady: "notReady",
  NotFound: "notFound",
  Unavailable: "unavailable",
  Gap: "gap",
} as const;

export type FlowNodeOccurrencePublicationResult = DeepReadonly<
  | {
      kind: typeof FlowNodeOccurrencePublicationResultKind.Available;
      page: FlowNodeOccurrencePage;
    }
  | { kind: typeof FlowNodeOccurrencePublicationResultKind.NotReady }
  | { kind: typeof FlowNodeOccurrencePublicationResultKind.NotFound }
  | { kind: typeof FlowNodeOccurrencePublicationResultKind.Unavailable }
  | { kind: typeof FlowNodeOccurrencePublicationResultKind.Gap }
>;
