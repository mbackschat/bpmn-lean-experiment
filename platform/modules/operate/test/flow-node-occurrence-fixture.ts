import type {
  FlowNodeOccurrencePage,
} from "@bpmn-lean/platform-contracts";
import type { OperateProcessRegistration } from "@bpmn-lean/platform-operate";

export const definitionVersion = {
  processId: "Process_1",
  version: 1,
  source: {
    kind: "bpmnSource",
    id: "source-publication",
    sha256: "a".repeat(64),
    byteLength: 512,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "profile-publication",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const;

export const occurrenceDefinition = {
  compiler: "bpmn-source-semantic-process",
  semanticProfile: definitionVersion.semanticProfile,
  sourceId: definitionVersion.source.id,
  sourceSha256: definitionVersion.source.sha256,
  sourceOverlay: null,
} as const;

export const occurrenceIdentity = {
  definition: occurrenceDefinition,
  processId: definitionVersion.processId,
  processInstanceId: "Instance_1",
} as const;

export const occurrenceRootScope = {
  processInstanceId: occurrenceIdentity.processInstanceId,
  definitionScopeId: "Scope_Process_1",
  activation: 1,
} as const;

export const occurrenceRegistration: OperateProcessRegistration = {
  ordinal: 1,
  locator: "opaque-private-locator",
  observation: "active",
  instance: {
    processInstanceId: occurrenceIdentity.processInstanceId,
    definition: definitionVersion,
  },
};

export const taskOccurrenceId = {
  processInstanceId: occurrenceIdentity.processInstanceId,
  startRevision: 2,
  startIndex: 0,
} as const;

export function occurrenceFirstPage(
  producerHeadRevision: number = 2,
): FlowNodeOccurrencePage {
  return {
    ...occurrenceIdentity,
    requestedAfterRevision: 0,
    pageThroughRevision: 2,
    headRevision: producerHeadRevision,
    batches: [{
      commandId: "command-start",
      fromRevision: 0,
      throughRevision: 2,
      committedAtEpochMs: 100,
      transitions: [{
        revision: 1,
        lifecycle: { started: [], ended: [] },
      }, {
        revision: 2,
        lifecycle: {
          started: [{
            id: taskOccurrenceId,
            processId: definitionVersion.processId,
            elementId: "Task_1",
            owner: occurrenceRootScope,
          }],
          ended: [],
        },
      }],
    }],
    currentOpen: producerHeadRevision === 2
      ? [{
          id: taskOccurrenceId,
          processId: definitionVersion.processId,
          elementId: "Task_1",
          owner: occurrenceRootScope,
          startedAtEpochMs: 100,
        }]
      : null,
  };
}

export function occurrenceSecondPage(
  committedAtEpochMs: number = 150,
): FlowNodeOccurrencePage {
  return {
    ...occurrenceIdentity,
    requestedAfterRevision: 2,
    pageThroughRevision: 3,
    headRevision: 3,
    batches: [{
      commandId: "command-retry",
      fromRevision: 2,
      throughRevision: 3,
      committedAtEpochMs,
      transitions: [{
        revision: 3,
        lifecycle: {
          started: [],
          ended: [{ id: taskOccurrenceId, terminal: "completed" }],
        },
      }],
    }],
    currentOpen: [],
  };
}

export function occurrencePageAheadOfExecution(): FlowNodeOccurrencePage {
  return {
    ...occurrenceIdentity,
    requestedAfterRevision: 3,
    pageThroughRevision: 4,
    headRevision: 4,
    batches: [{
      commandId: "command-not-yet-in-e1",
      fromRevision: 3,
      throughRevision: 4,
      committedAtEpochMs: 200,
      transitions: [{
        revision: 4,
        lifecycle: { started: [], ended: [] },
      }],
    }],
    currentOpen: [],
  };
}
