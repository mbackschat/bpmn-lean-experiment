import type {
  CommittedTransitionBatch,
  ExecutionPublicationExport,
  ExecutionPublicationPage,
  ExecutionState,
  PublicationIdentity,
} from "@bpmn-lean/platform-contracts";

export const publicationIdentity = {
  definition: {
    ref: { definitionKey: "PublicationProcess", version: 7, sha256: "a".repeat(64) },
    profile: "cib-seven-2.2.0:publication-test",
    sourceOverlay: null,
  },
  processInstanceId: "process-instance-1",
} as const satisfies PublicationIdentity;

/** The first committed input: three micro-steps, numbered as revisions 1 to 3. */
export const startBatch = {
  commandId: "start-publication",
  fromRevision: 0,
  throughRevision: 3,
  transitions: [
    { revision: 1, role: { kind: "input", input: "start" }, element: "StartEvent_1", sourceType: "startEvent", owner: 0 },
    { revision: 2, role: { kind: "arrive", flow: "Flow_Start" }, element: "UserTask_Review", sourceType: "userTask", owner: 0 },
    { revision: 3, role: { kind: "idle", scope: 0 }, element: null, sourceType: null, owner: 0 },
  ],
} as const satisfies CommittedTransitionBatch;

/** An input whose single micro-step acts on no element. */
export const elementFreeBatch = {
  commandId: "set-priority",
  fromRevision: 3,
  throughRevision: 4,
  transitions: [
    { revision: 4, role: { kind: "input", input: "command" }, element: null, sourceType: null, owner: 0 },
  ],
} as const satisfies CommittedTransitionBatch;

/** The input that closes the process: its steps carry every role arm but `start` and `idle`. */
export const completeBatch = {
  commandId: "complete-review",
  fromRevision: 4,
  throughRevision: 7,
  transitions: [
    { revision: 5, role: { kind: "input", input: "command" }, element: "UserTask_Review", sourceType: "userTask", owner: 0 },
    { revision: 6, role: { kind: "arrive", flow: "Flow_End" }, element: "EndEvent_1", sourceType: "endEvent", owner: 0 },
    { revision: 7, role: { kind: "signal", signal: "completeProcess" }, element: null, sourceType: null, owner: 0 },
  ],
} as const satisfies CommittedTransitionBatch;

export const variables = [
  { name: "alpha", value: { kind: "boolean", value: true } },
  { name: "control\u0001", value: { kind: "string", value: "line\n\"🚀\\" } },
] as const;

/** The state at revision 3, with the user task open. */
export const runningState = {
  kind: "state",
  instanceId: publicationIdentity.processInstanceId,
  status: "running",
  logicalTimeMs: 0,
  variables,
  scopes: [],
  openWaits: [{
    id: { processInstanceId: publicationIdentity.processInstanceId, elementId: "UserTask_Review", activation: 1 },
    definition: null,
    input: "command",
    detail: {
      kind: "userTask",
      name: "Review",
      assignee: null,
      candidateUsers: [],
      candidateGroups: ["reviewers"],
      formKey: null,
      formFields: [],
      dueDate: null,
      followUpDate: null,
      priority: null,
      inputs: [],
    },
  }],
} as const satisfies ExecutionState;

/** The state at revision 7, after the process completed. */
export const completedState = {
  kind: "state",
  instanceId: publicationIdentity.processInstanceId,
  status: "completed",
  logicalTimeMs: 0,
  variables,
  scopes: [],
  openWaits: [],
} as const satisfies ExecutionState;

/** The failure observation of a failed instance (`canonical-result.schema.json#/$defs/instanceFailure`). */
export const instanceFailure = {
  code: "serviceFailure",
  message: "",
  occurrence: { processInstanceId: publicationIdentity.processInstanceId, elementId: "ServiceTask_Charge", activation: 1 },
  related: [],
} as const;

/** The page from the first revision to the head, which is also the first batch's end. */
export function executionPublicationPage(): ExecutionPublicationPage {
  return {
    ...publicationIdentity,
    requestedAfterRevision: 0,
    pageThroughRevision: 3,
    headRevision: 3,
    batches: [startBatch],
    current: { revision: 3, state: runningState },
  };
}

/** The page of every input of the fixture process, reaching its completed head at revision 7. */
export function completedExecutionPublicationPage(): ExecutionPublicationPage {
  return {
    ...publicationIdentity,
    requestedAfterRevision: 0,
    pageThroughRevision: 7,
    headRevision: 7,
    batches: [startBatch, elementFreeBatch, completeBatch],
    current: { revision: 7, state: completedState },
  };
}

export function executionPublicationExport(): ExecutionPublicationExport {
  return {
    format: "bpmn-lean.execution-publication",
    ...publicationIdentity,
    headRevision: 3,
    batches: [startBatch],
    current: { revision: 3, state: runningState },
  };
}
