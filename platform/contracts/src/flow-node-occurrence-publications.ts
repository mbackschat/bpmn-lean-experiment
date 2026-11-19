import type { DeepReadonly } from "@bpmn-lean/contract-types";

import type { PublicationIdentity } from "./publication-identity.js";

export type FlowNodeOccurrencePublicationRequest = DeepReadonly<{
  afterRevision: number;
  limit?: number;
}>;

export type FlowNodeOccurrencePublicationDecodeContext = DeepReadonly<
  PublicationIdentity & FlowNodeOccurrencePublicationRequest
>;

export const FlowNodeOccurrenceTerminalKind = {
  Completed: "completed",
  Cancelled: "cancelled",
} as const;

export type FlowNodeOccurrenceTerminalKind =
  typeof FlowNodeOccurrenceTerminalKind[keyof typeof FlowNodeOccurrenceTerminalKind];

/** Whether an occurrence is the element itself or the body of a Multi-Instance Activity, which number apart. */
export const FlowNodeOccurrenceRole = {
  Element: "element",
  MultiInstanceBody: "multiInstanceBody",
} as const;

export type FlowNodeOccurrenceRole = typeof FlowNodeOccurrenceRole[keyof typeof FlowNodeOccurrenceRole];

/**
 * The kernel's identity of one flow-node occurrence (`Kernel.Run.keyJson`): `activation` counts the element's
 * activations under `role` in its process instance, so the key never repeats within the instance.
 */
export type FlowNodeOccurrenceKey = DeepReadonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
  role: FlowNodeOccurrenceRole;
}>;

/** An occurrence began: its key and its element's BPMN source type; the kernel's scope ordinal is not published. */
export type FlowNodeOccurrenceStart = DeepReadonly<{
  occurrence: FlowNodeOccurrenceKey;
  sourceType: string;
}>;

export type FlowNodeOccurrenceEnd = DeepReadonly<{
  occurrence: FlowNodeOccurrenceKey;
  terminal: FlowNodeOccurrenceTerminalKind;
}>;

/**
 * The occurrences one micro-step began and ended, and those it leaves in BPMN's Ready state (`ready`, absent when none):
 * begun, their InputSet unavailable, so no work is offered (PD2). A started occurrence neither Ready nor ended is
 * Active; a Ready one ends only by removal, as cancelled. `revision` positions the transition in the publication.
 */
export type FlowNodeOccurrenceTransition = DeepReadonly<{
  revision: number;
  started: FlowNodeOccurrenceStart[];
  ended: FlowNodeOccurrenceEnd[];
  ready?: FlowNodeOccurrenceKey[];
}>;

/**
 * The occurrence facts of one committed input, over the same revisions as its execution batch; `transitions` is
 * empty when the input began and ended no occurrence.
 */
export type FlowNodeOccurrenceBatch = DeepReadonly<{
  commandId: string;
  fromRevision: number;
  throughRevision: number;
  transitions: FlowNodeOccurrenceTransition[];
}>;

export type FlowNodeOccurrencePage = DeepReadonly<
  PublicationIdentity & {
    requestedAfterRevision: number;
    pageThroughRevision: number;
    headRevision: number;
    batches: FlowNodeOccurrenceBatch[];
  }
>;

export const FlowNodeOccurrencePublicationResultKind = {
  Available: "available",
  NotFound: "notFound",
  Unavailable: "unavailable",
  Gap: "gap",
  IntegrityFailure: "integrityFailure",
} as const;

export type FlowNodeOccurrencePublicationResult = DeepReadonly<
  | {
      kind: typeof FlowNodeOccurrencePublicationResultKind.Available;
      page: FlowNodeOccurrencePage;
    }
  | { kind: typeof FlowNodeOccurrencePublicationResultKind.NotFound }
  | { kind: typeof FlowNodeOccurrencePublicationResultKind.Unavailable }
  | { kind: typeof FlowNodeOccurrencePublicationResultKind.Gap }
  | { kind: typeof FlowNodeOccurrencePublicationResultKind.IntegrityFailure }
>;
