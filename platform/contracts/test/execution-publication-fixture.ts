import type {
  ExecutionPublicationExport,
  ExecutionPublicationIdentity,
  ExecutionPublicationPage,
} from "@bpmn-lean/platform-contracts";

export const publicationIdentity = {
  definition: {
    compiler: "bpmn-source-semantic-process",
    semanticProfile: "cib-seven-2.2.0:publication-test",
    sourceId: "publication-🚀.bpmn",
    sourceSha256: "a".repeat(64),
    sourceOverlay: null,
  },
  processId: "PublicationProcess",
  processInstanceId: "process-instance-1",
} as const satisfies ExecutionPublicationIdentity;

const rootScope = {
  processInstanceId: publicationIdentity.processInstanceId,
  definitionScopeId: "scope-process",
  activation: 1,
} as const;

const rootPosition = {
  id: rootScope,
  parent: null,
  bpmnElementId: publicationIdentity.processId,
} as const;

const initialVariables = [
  { name: "alpha", value: { kind: "boolean", value: true } },
  { name: "control\u0001", value: { kind: "string", value: "line\n\"🚀\\" } },
] as const;

const transition = {
  revision: 1,
  logicalTimeMs: 0,
  transition: {
    kind: "externalStimulus",
    stimulus: {
      kind: "startProcess",
      commandId: "start-publication",
      processId: publicationIdentity.processId,
      instanceId: publicationIdentity.processInstanceId,
      initialVariables,
    },
  },
  positionDelta: {
    consumedTokens: [],
    producedTokens: [],
    enteredScopes: [rootPosition],
    exitedScopes: [],
  },
} as const;

const batch = {
  commandId: "start-publication",
  fromRevision: 0,
  throughRevision: 1,
  transitions: [transition],
} as const;

const current = {
  revision: 1,
  state: {
    kind: "state",
    instanceId: publicationIdentity.processInstanceId,
    status: "running",
    activeWaits: [],
    openUserTasks: [],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    openIncidents: [],
    variables: initialVariables,
    enabledInteractions: [],
    logicalTimeMs: 0,
  },
  controlTokens: [],
  scopes: [rootPosition],
} as const;

export function executionPublicationPage(): ExecutionPublicationPage {
  return {
    ...publicationIdentity,
    requestedAfterRevision: 0,
    pageThroughRevision: 1,
    headRevision: 1,
    batches: [batch],
    current,
  };
}

export function executionPublicationExport(): ExecutionPublicationExport {
  return {
    format: "bpmn-lean.execution-publication.v1",
    ...publicationIdentity,
    headRevision: 1,
    batches: [batch],
    current,
  };
}
