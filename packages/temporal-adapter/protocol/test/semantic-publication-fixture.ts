export const definition = {
  compiler: "bpmn-source-semantic-process",
  semanticProfile: "profile-publication",
  sourceId: "source-publication",
  sourceSha256: "a".repeat(64),
  sourceOverlay: null,
} as const;

export const rootScope = {
  processInstanceId: "Instance_1",
  definitionScopeId: "Scope_Process_1",
  activation: 1,
} as const;

export const program = {
  kind: "semanticProcess",
  identity: definition,
  processId: "Process_1",
  definitionScopes: [{
    id: "Scope_Process_1",
    parentScopeId: null,
    originElementId: "Process_1",
  }],
  operationScopes: [{
    operationId: "Operation_Start",
    scopeId: "Scope_Process_1",
  }],
  controlPlaceScopes: [{
    controlPlaceId: "Place_Flow_1",
    scopeId: "Scope_Process_1",
  }],
  controlPlaces: [{
    id: "Place_Flow_1",
    origin: { kind: "bpmnSequenceFlow", elementId: "Flow_1" },
  }],
  operations: [{
    id: "Operation_Start",
    kind: "initiate",
    origin: { kind: "bpmnElement", elementId: "StartEvent_1" },
    output: "Place_Flow_1",
  }],
} as const;

export const publicationContext = {
  program,
  processInstanceId: "Instance_1",
} as const;

const emptyDelta = {
  consumedTokens: [],
  producedTokens: [],
  enteredScopes: [],
  exitedScopes: [],
} as const;

const startStimulus = {
  kind: "startProcess",
  commandId: "command-start",
  processId: "Process_1",
  instanceId: "Instance_1",
  initialVariables: [],
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

export function publicationPage() {
  return {
    definition,
    processId: "Process_1",
    processInstanceId: "Instance_1",
    requestedAfterRevision: 0,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [{
      commandId: "command-start",
      fromRevision: 0,
      throughRevision: 2,
      transitions: [{
        revision: 1,
        logicalTimeMs: 0,
        transition: {
          kind: "externalStimulus",
          stimulus: startStimulus,
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
    current: {
      revision: 2,
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
    },
  } as const;
}

export function twoBatchPublicationPage() {
  const first = publicationPage();
  const second = {
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
  } as const;
  return {
    ...first,
    pageThroughRevision: 3,
    headRevision: 3,
    batches: [first.batches[0], second],
    current: { ...first.current, revision: 3 },
  } as const;
}

export function canonicalExportFixture() {
  return {
    format: "bpmn-lean.execution-publication.v1",
    definition,
    processId: "Process_1",
    processInstanceId: "Instance_1",
    headRevision: 1,
    batches: [{
      commandId: "command-start",
      fromRevision: 0,
      throughRevision: 1,
      transitions: [{
        revision: 1,
        logicalTimeMs: 0,
        transition: {
          kind: "externalStimulus",
          stimulus: {
            ...startStimulus,
            initialVariables: [{
              name: "note",
              value: {
                kind: "string",
                value: "control:\u0001 short:\b\f\n\r\t quote:\" slash:\\ scalar:\u{1f600}",
              },
            }, {
              name: "truth",
              value: { kind: "boolean", value: true },
            }],
          },
        },
        positionDelta: emptyDelta,
      }],
    }],
    current: {
      revision: 1,
      state: {
        ...state,
        variables: [{
          name: "note",
          value: {
            kind: "string",
            value: "control:\u0001 short:\b\f\n\r\t quote:\" slash:\\ scalar:\u{1f600}",
          },
        }, {
          name: "truth",
          value: { kind: "boolean", value: true },
        }],
      },
      controlTokens: [],
      scopes: [],
    },
  } as const;
}
