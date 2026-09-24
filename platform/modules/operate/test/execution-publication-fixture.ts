import type {
  ExecutionPublicationPage,
} from "@bpmn-lean/platform-contracts";
import type { OperateProcessRegistration } from "@bpmn-lean/platform-operate";

export const definition = {
  compiler: "bpmn-source-semantic-process",
  semanticProfile: "profile-publication",
  sourceId: "source-publication",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;

export const identity = {
  definition,
  processId: "Process_1",
  processInstanceId: "Instance_1",
} as const;

export const rootScope = {
  processInstanceId: "Instance_1",
  definitionScopeId: "Scope_Process_1",
  activation: 1,
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
    },
  },
};

const emptyDelta = {
  consumedTokens: [],
  producedTokens: [],
  enteredScopes: [],
  exitedScopes: [],
} as const;

const state = {
  kind: "state",
  instanceId: "Instance_1",
  status: "running",
  activeWaits: [],
  openUserTasks: [],
  openMessageSubscriptions: [],
  openTimers: [],
  openEffects: [],
  openIncidents: [],
  variables: [],
  enabledInteractions: [],
  logicalTimeMs: 0,
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
        logicalTimeMs: 0,
        transition: {
          kind: "externalStimulus",
          stimulus: {
            kind: "startProcess",
            commandId: "command-start",
            processId: "Process_1",
            instanceId: "Instance_1",
            initialVariables: [],
          },
        },
        positionDelta: emptyDelta,
      }, {
        revision: 2,
        logicalTimeMs: 0,
        transition: {
          kind: "internalOperation",
          operationId: "Operation_Start",
          operationKind: "initiate",
          origin: { kind: "bpmnElement", elementId: "StartEvent_1" },
          owner: rootScope,
        },
        positionDelta: {
          consumedTokens: [],
          producedTokens: [{
            sequenceFlowId: "Flow_1",
            owner: rootScope,
            multiplicity: 1,
          }],
          enteredScopes: [{
            id: rootScope,
            parent: null,
            bpmnElementId: "Process_1",
          }],
          exitedScopes: [],
        },
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
        logicalTimeMs: 0,
        transition: {
          kind: "externalStimulus",
          stimulus: {
            kind: "retryIncident",
            commandId: "command-retry",
            incidentId: {
              effectId: {
                processInstanceId: "Instance_1",
                elementId: "Process_1",
                activation: 1,
              },
              generation: 1,
            },
          },
        },
        positionDelta: emptyDelta,
      }],
    }],
    current: current(3),
  };
}

export function failedPage(message: string | null = "échec 😀\u0000"): ExecutionPublicationPage {
  const effectId = { processInstanceId: "Instance_1", elementId: "Undo_Service", activation: 3 };
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
        logicalTimeMs: 0,
        transition: {
          kind: "externalStimulus",
          stimulus: {
            kind: "completeEffect",
            commandId: "command-failure",
            effectId,
            result: { kind: "bpmnError", code: "undo-échec", message, localPatch: [] },
          },
        },
        positionDelta: {
          consumedTokens: current(2).controlTokens,
          producedTokens: [],
          enteredScopes: [],
          exitedScopes: current(2).scopes,
        },
      }],
    }],
    current: {
      revision: 3,
      state: {
        ...state,
        status: "failed",
        failure: {
          kind: "compensationHandlerFailure",
          triggerId: { processInstanceId: "Instance_1", elementId: "Throw", activation: 1 },
          handlerId: { processInstanceId: "Instance_1", elementId: "Undo", activation: 2 },
          effectId,
          code: "undo-échec",
          message,
        },
      },
      controlTokens: [],
      scopes: [],
    },
  };
}

function current(revision: number) {
  return {
    revision,
    state,
    controlTokens: [{
      sequenceFlowId: "Flow_1",
      owner: rootScope,
      multiplicity: 1,
    }],
    scopes: [{
      id: rootScope,
      parent: null,
      bpmnElementId: "Process_1",
    }],
  } as const;
}
