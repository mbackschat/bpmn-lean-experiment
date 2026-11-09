import type {
  FlowNodeOccurrenceKey,
  FlowNodeOccurrencePage,
} from "@bpmn-lean/platform-contracts";
import type { OperateProcessRegistration } from "@bpmn-lean/platform-operate";

import { identity, registration } from "./execution-publication-fixture.ts";

export const definitionVersion = registration.instance.definition;

export const occurrenceIdentity = identity;

export const occurrenceRegistration: OperateProcessRegistration = registration;

export const startEventOccurrence = {
  processInstanceId: occurrenceIdentity.processInstanceId,
  elementId: "StartEvent_1",
  activation: 1,
  role: "element",
} as const satisfies FlowNodeOccurrenceKey;

export const taskOccurrence = {
  processInstanceId: occurrenceIdentity.processInstanceId,
  elementId: "Task_1",
  activation: 1,
  role: "element",
} as const satisfies FlowNodeOccurrenceKey;

/** The occurrences of the execution fixture's first batch: the start event passes through, the task stays open. */
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
      transitions: [{
        revision: 1,
        started: [{ occurrence: startEventOccurrence, owner: 0, sourceType: "startEvent" }],
        ended: [{ occurrence: startEventOccurrence, terminal: "completed" }],
      }, {
        revision: 2,
        started: [{ occurrence: taskOccurrence, owner: 0, sourceType: "userTask" }],
        ended: [],
      }],
    }],
  };
}

export function occurrenceSecondPage(): FlowNodeOccurrencePage {
  return {
    ...occurrenceIdentity,
    requestedAfterRevision: 2,
    pageThroughRevision: 3,
    headRevision: 3,
    batches: [{
      commandId: "command-retry",
      fromRevision: 2,
      throughRevision: 3,
      transitions: [{
        revision: 3,
        started: [],
        ended: [{ occurrence: taskOccurrence, terminal: "completed" }],
      }],
    }],
  };
}

/** An input that began and ended no occurrence: its batch is aligned with E1 and has no transitions. */
export function occurrenceSecondPageWithoutLifecycle(): FlowNodeOccurrencePage {
  const page = occurrenceSecondPage();
  return { ...page, batches: [{ ...page.batches[0]!, transitions: [] }] };
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
      transitions: [],
    }],
  };
}
