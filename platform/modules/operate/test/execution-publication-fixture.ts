import type {
  CurrentCommittedExecution,
  ExecutionPublicationPage,
} from "@bpmn-lean/platform-contracts";
import type { OperateProcessRegistration } from "@bpmn-lean/platform-operate";

export const definition = {
  ref: { definitionKey: "Process_1", version: 1, sha256: "a".repeat(64) },
  profile: "profile-publication",
  sourceOverlay: null,
} as const;

export const identity = {
  definition,
  processInstanceId: "Instance_1",
} as const;

export const registration: OperateProcessRegistration = {
  ordinal: 1,
  locator: "opaque-private-locator",
  observation: "active",
  instance: {
    processInstanceId: "Instance_1",
    definition: {
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
      sourceOverlay: null,
    },
  },
};

const state = {
  kind: "state",
  instanceId: "Instance_1",
  status: "running",
  logicalTimeMs: 0,
  variables: [],
  scopes: [],
  openWaits: [{
    id: { processInstanceId: "Instance_1", elementId: "Task_1", activation: 1 },
    definition: null,
    input: "complete",
    detail: { kind: "userTask" },
  }],
} as const;

export function firstPage(
  producerHeadRevision: number = 2,
): ExecutionPublicationPage {
  return {
    ...identity,
    requestedAfterRevision: 0,
    pageThroughRevision: 2,
    headRevision: producerHeadRevision,
    batches: [{
      commandId: "command-start",
      fromRevision: 0,
      throughRevision: 2,
      transitions: [{
        revision: 1,
        role: { kind: "input", input: "start" },
        element: "StartEvent_1",
        sourceType: "startEvent",
        owner: 0,
      }, {
        revision: 2,
        role: { kind: "arrive", flow: "Flow_1" },
        element: "Task_1",
        sourceType: "userTask",
        owner: 0,
      }],
    }],
    current: producerHeadRevision === 2 ? current(2) : null,
  };
}

export function secondPage(): ExecutionPublicationPage {
  return {
    ...identity,
    requestedAfterRevision: 2,
    pageThroughRevision: 3,
    headRevision: 3,
    batches: [{
      commandId: "command-retry",
      fromRevision: 2,
      throughRevision: 3,
      transitions: [{
        revision: 3,
        role: { kind: "input", input: "command" },
        element: "Task_1",
        sourceType: "userTask",
        owner: 0,
      }],
    }],
    current: current(3),
  };
}

/** The head page the engine answers when its head moved while it read the state: positioned, without `current`. */
export function headPageWithoutCurrent(page: ExecutionPublicationPage): ExecutionPublicationPage {
  return { ...page, current: null };
}

/** A page that reads at the head with no new batch. */
export function headOnlyPage(
  revision: number,
  withCurrent: boolean,
): ExecutionPublicationPage {
  return {
    ...identity,
    requestedAfterRevision: revision,
    pageThroughRevision: revision,
    headRevision: revision,
    batches: [],
    current: withCurrent ? current(revision) : null,
  };
}

export function failedPage(message: string | null = "échec 😀\u0000"): ExecutionPublicationPage {
  return {
    ...identity,
    requestedAfterRevision: 2,
    pageThroughRevision: 3,
    headRevision: 3,
    batches: [{
      commandId: "command-failure",
      fromRevision: 2,
      throughRevision: 3,
      transitions: [{
        revision: 3,
        role: { kind: "input", input: "effectResult" },
        element: "Undo_Service",
        sourceType: "serviceTask",
        owner: 0,
      }],
    }],
    current: {
      revision: 3,
      state: {
        ...state,
        status: "failed",
        openWaits: [],
        failure: {
          code: "undo-échec",
          message,
          occurrence: { processInstanceId: "Instance_1", elementId: "Undo_Service", activation: 3 },
          related: [
            { name: "trigger", occurrence: { processInstanceId: "Instance_1", elementId: "Throw", activation: 1 } },
            { name: "handler", occurrence: { processInstanceId: "Instance_1", elementId: "Undo", activation: 2 } },
          ],
        },
      },
    },
  };
}

export function current(revision: number): CurrentCommittedExecution {
  return { revision, state };
}
