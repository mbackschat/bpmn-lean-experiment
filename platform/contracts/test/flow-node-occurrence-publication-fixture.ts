import type {
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrenceKey,
  FlowNodeOccurrencePage,
} from "@bpmn-lean/platform-contracts";

import {
  completeBatch,
  elementFreeBatch,
  publicationIdentity,
  startBatch,
} from "./execution-publication-fixture.ts";

export const startEvent = {
  processInstanceId: publicationIdentity.processInstanceId,
  elementId: "StartEvent_1",
  activation: 1,
  role: "element",
} as const satisfies FlowNodeOccurrenceKey;

export const reviewTask = {
  processInstanceId: publicationIdentity.processInstanceId,
  elementId: "UserTask_Review",
  activation: 1,
  role: "element",
} as const satisfies FlowNodeOccurrenceKey;

export const endEvent = {
  processInstanceId: publicationIdentity.processInstanceId,
  elementId: "EndEvent_1",
  activation: 1,
  role: "element",
} as const satisfies FlowNodeOccurrenceKey;

// The occurrence batches below are aligned with the execution batches of the same names: the same command and the
// same revision range, one batch per committed input.

export const startOccurrenceBatch = {
  commandId: startBatch.commandId,
  fromRevision: startBatch.fromRevision,
  throughRevision: startBatch.throughRevision,
  transitions: [
    { revision: 1, started: [{ occurrence: startEvent, sourceType: "startEvent" }], ended: [] },
    {
      revision: 2,
      started: [{ occurrence: reviewTask, sourceType: "userTask" }],
      ended: [{ occurrence: startEvent, terminal: "completed" }],
    },
  ],
} as const satisfies FlowNodeOccurrenceBatch;

/**
 * The start batch with its User Task held (PD2): its Data Input is unavailable, so the step that starts it leaves it in
 * BPMN's Ready state and names it in `ready`.
 */
export const heldOccurrenceBatch = {
  ...startOccurrenceBatch,
  transitions: [
    startOccurrenceBatch.transitions[0],
    { ...startOccurrenceBatch.transitions[1], ready: [reviewTask] },
  ],
} as const satisfies FlowNodeOccurrenceBatch;

/** An input that began and ended no occurrence still has its batch, with no transitions. */
export const emptyOccurrenceBatch = {
  commandId: elementFreeBatch.commandId,
  fromRevision: elementFreeBatch.fromRevision,
  throughRevision: elementFreeBatch.throughRevision,
  transitions: [],
} as const satisfies FlowNodeOccurrenceBatch;

export const completeOccurrenceBatch = {
  commandId: completeBatch.commandId,
  fromRevision: completeBatch.fromRevision,
  throughRevision: completeBatch.throughRevision,
  transitions: [
    { revision: 5, started: [], ended: [{ occurrence: reviewTask, terminal: "completed" }] },
    { revision: 6, started: [{ occurrence: endEvent, sourceType: "endEvent" }], ended: [] },
    { revision: 7, started: [], ended: [{ occurrence: endEvent, terminal: "completed" }] },
  ],
} as const satisfies FlowNodeOccurrenceBatch;

/** The page from the first revision to the head at revision 3. */
export function occurrencePage(): FlowNodeOccurrencePage {
  return {
    ...publicationIdentity,
    requestedAfterRevision: 0,
    pageThroughRevision: 3,
    headRevision: 3,
    batches: [startOccurrenceBatch],
  };
}

/** `occurrencePage` with its User Task held. */
export function heldOccurrencePage(): FlowNodeOccurrencePage {
  return { ...occurrencePage(), batches: [heldOccurrenceBatch] };
}

/** A page after revision 3 that ends the task the page's cursor hid the start of. */
export function positiveCursorPage(): FlowNodeOccurrencePage {
  return {
    ...publicationIdentity,
    requestedAfterRevision: 3,
    pageThroughRevision: 7,
    headRevision: 7,
    batches: [emptyOccurrenceBatch, completeOccurrenceBatch],
  };
}
