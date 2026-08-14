export const occurrenceDefinition = {
  compiler: "bpmn-source-semantic-process",
  semanticProfile: "profile",
  sourceId: "metrics.bpmn",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;

export const occurrenceIdentity = {
  definition: occurrenceDefinition,
  processId: "MetricsProcess",
  processInstanceId: "instance-1",
} as const;

const rootOwner = {
  processInstanceId: occurrenceIdentity.processInstanceId,
  definitionScopeId: occurrenceIdentity.processId,
  activation: 1,
} as const;

const startEventId = {
  processInstanceId: occurrenceIdentity.processInstanceId,
  startRevision: 1,
  startIndex: 0,
} as const;

const userTaskId = {
  processInstanceId: occurrenceIdentity.processInstanceId,
  startRevision: 1,
  startIndex: 1,
} as const;

export function occurrencePage() {
  return {
    ...occurrenceIdentity,
    requestedAfterRevision: 0,
    pageThroughRevision: 1,
    headRevision: 1,
    batches: [{
      commandId: "start",
      fromRevision: 0,
      throughRevision: 1,
      committedAtEpochMs: 100,
      transitions: [{
        revision: 1,
        lifecycle: {
          started: [{
            id: startEventId,
            processId: occurrenceIdentity.processId,
            elementId: "Start",
            owner: rootOwner,
          }, {
            id: userTaskId,
            processId: occurrenceIdentity.processId,
            elementId: "Task",
            owner: rootOwner,
          }],
          ended: [{ id: startEventId, terminal: "completed" }],
        },
      }],
    }],
    currentOpen: [{
      id: userTaskId,
      processId: occurrenceIdentity.processId,
      elementId: "Task",
      owner: rootOwner,
      startedAtEpochMs: 100,
    }],
  } as const;
}

export function positiveCursorPage() {
  const page = occurrencePage();
  return {
    ...occurrenceIdentity,
    requestedAfterRevision: 1,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [{
      commandId: "complete-task",
      fromRevision: 1,
      throughRevision: 2,
      committedAtEpochMs: 140,
      transitions: [{
        revision: 2,
        lifecycle: {
          started: [],
          ended: [{
            id: page.batches[0]!.transitions[0]!.lifecycle.started[1]!.id,
            terminal: "completed",
          }],
        },
      }],
    }],
    currentOpen: [],
  } as const;
}
