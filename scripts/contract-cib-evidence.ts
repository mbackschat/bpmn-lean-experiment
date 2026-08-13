/** Raw CIB producer evidence retained before canonical projection. */
import type {
  ScenarioResult,
  VariableBinding,
} from "../packages/semantic-core/src/index.ts";

export type CibIdentityLink = Readonly<{
  type: string;
  userId: string | null;
  groupId: string | null;
}>;

export type CibFormField = Readonly<{
  id: string;
  typeName: string;
}>;

export type TaskQueryTask = Readonly<{
  elementId: string;
  name: string | null;
  identityLinks?: ReadonlyArray<CibIdentityLink>;
  formFields?: ReadonlyArray<CibFormField>;
}>;

export type ProcessVariableSnapshot = Readonly<{
  name: string;
  value: string | boolean | null;
}>;

export type StateQuerySnapshot = Readonly<{
  afterCommandId: string;
  processInstanceCount: number;
  engineClockTimeMs: number;
  variables: ReadonlyArray<ProcessVariableSnapshot>;
}>;

type TaskQuerySnapshot = Readonly<{
  afterCommandId: string;
  tasks: ReadonlyArray<TaskQueryTask>;
}>;

export type TimerJob = Readonly<{
  elementId: string;
  dueDateDeltaMs: number;
  executable: boolean;
}>;

type TimerJobSnapshot = Readonly<{
  afterCommandId: string;
  jobs: ReadonlyArray<TimerJob>;
}>;

export type MessageSubscriptionEvidence = Readonly<{
  elementId: string;
  eventName: string;
  messageId: string;
  processInstanceIdMatches: boolean;
  executionIdPresent: boolean;
}>;

type MessageSubscriptionSnapshot = Readonly<{
  afterCommandId: string;
  subscriptions: ReadonlyArray<MessageSubscriptionEvidence>;
}>;

export type EffectJob = Readonly<{
  elementId: string;
  activation: number;
  protocol: string;
  handler: string;
  retries: number;
  executable: boolean;
  dueDatePresent: boolean;
}>;

export type EffectJobSnapshot = Readonly<{
  afterCommandId: string;
  jobs: ReadonlyArray<EffectJob>;
}>;

export type CibFailedJobIncident = Readonly<{
  publicIncidentId: string;
  type: string;
  configurationJobId: string;
  processInstanceId: string;
  elementId: string;
  causeIncidentId: string;
  rootCauseIncidentId: string;
}>;

export type IncidentJob = Readonly<{
  publicJobId: string;
  retries: number;
  executable: boolean;
  dueDatePresent: boolean;
  processInstanceId: string;
  elementId: string;
  incident: CibFailedJobIncident | null;
}>;

export type IncidentJobSnapshot = Readonly<{
  afterCommandId: string;
  createIncidentOnFailedJobEnabled: true;
  jobs: ReadonlyArray<IncidentJob>;
}>;

type EffectExecutionSnapshot = Readonly<{
  afterCommandId: string;
  schedule: string;
  invocations: number;
  mutations: number;
  initialRetries: number;
  retriesAfterFirstFailure: number | null;
}>;

export type MappingExecutionSnapshot = Readonly<{
  afterCommandId: string;
  handler: string;
  arguments: ReadonlyArray<VariableBinding>;
  localPatch: ReadonlyArray<VariableBinding>;
  invocations: number;
}>;

export type CibSevenEvidence = Readonly<{
  kind: "cibSevenScenarioEvidence";
  scenario: Readonly<{ id: string; sha256: string }>;
  profile: Readonly<{ id: string; sha256: string }>;
  producer: Readonly<{
    engineVersion: string;
    engineRevision: string;
  }>;
  producerObservations: Readonly<{
    stateQueries: ReadonlyArray<StateQuerySnapshot>;
    taskQueries: ReadonlyArray<TaskQuerySnapshot>;
    messageSubscriptions?: ReadonlyArray<MessageSubscriptionSnapshot>;
    timerJobs: ReadonlyArray<TimerJobSnapshot>;
    effectJobs?: ReadonlyArray<EffectJobSnapshot>;
    incidentJobs?: ReadonlyArray<IncidentJobSnapshot>;
    effectExecutions?: ReadonlyArray<EffectExecutionSnapshot>;
    mappingExecutions?: ReadonlyArray<MappingExecutionSnapshot>;
  }>;
  result: ScenarioResult;
}>;
