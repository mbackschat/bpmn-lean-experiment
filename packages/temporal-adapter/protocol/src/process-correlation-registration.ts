import {
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  isCorrelatedMessageAddress,
  isCorrelatedMessageCandidate,
  isWellFormedStimulus,
  isWellFormedWireString,
  projectCorrelatedMessageCandidate,
  sameCorrelatedMessageAddress,
  sameOccurrenceId,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
  CorrelatedMessageCandidate,
  DeepReadonly,
  DeliverPayloadMessageStimulus,
  MessageSubscriptionId,
  RuntimeState,
  ScenarioStep,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  CorrelationCandidateRegistrationPhase,
  requireCorrelationCandidateCapacityFailure,
  requireCorrelationCandidateRegistrationRequest,
  sameCorrelationCandidateRegistrationRequest,
} from "./correlation-candidate-registration.js";
import type {
  CorrelationCandidateCapacityFailure,
  CorrelationCandidateRegistrationRequest,
} from "./correlation-candidate-registration.js";
import {
  requireCorrelationIngressConfiguration,
} from "./correlation-ingress.js";
import {
  canonicalWorkflowChainJson,
} from "./workflow-chain.js";
import { requireWorkflowChainPlainDataTree } from "./workflow-chain-plain-data.js";
import type {
  CorrelationIngressConfiguration,
} from "./correlation-ingress.js";

export const bpmnProcessCorrelationCandidateQueryName =
  "bpmn-process-correlation-candidate";
export const bpmnResolveCorrelationCandidateRegistrationActivityName =
  "resolveBpmnCorrelationCandidateRegistration";
export const bpmnProcessCorrelationRegistrationPatchId =
  "bpmn-process-correlation-registration-v1";
export const bpmnProcessCorrelationRegistrationContinuationV1 =
  "bpmn-lean.process-correlation-registration.v1" as const;

export enum ProcessCorrelationRegistrationPhase {
  Prepare = "prepare",
  Finalize = "finalize",
}

export enum ProcessCorrelationRegistrationResolutionKind {
  Prepared = "prepared",
  Finalized = "finalized",
  DeferredByScan = "deferredByScan",
  CandidateCapacity = "candidateCapacity",
  AddressQuarantined = "addressQuarantined",
  IngressUnavailable = "ingressUnavailable",
}

export type ProcessCorrelationCandidateQueryRequest = DeepReadonly<{
  address: CorrelatedMessageAddress;
  subscriptionId: MessageSubscriptionId;
}>;

export type ProcessCorrelationRegistrationActivityRequest = DeepReadonly<{
  phase: ProcessCorrelationRegistrationPhase;
  taskQueue: string;
  configuration: CorrelationIngressConfiguration;
  registration: CorrelationCandidateRegistrationRequest;
}>;

type ProcessCorrelationRegistrationIdentity = DeepReadonly<{
  transactionId: string;
}>;

export type ProcessCorrelationRegistrationResolution =
  | (ProcessCorrelationRegistrationIdentity & DeepReadonly<{
      kind: ProcessCorrelationRegistrationResolutionKind.Prepared;
      phase: CorrelationCandidateRegistrationPhase.Pending;
    }>)
  | (ProcessCorrelationRegistrationIdentity & DeepReadonly<{
      kind: ProcessCorrelationRegistrationResolutionKind.Finalized;
      phase: CorrelationCandidateRegistrationPhase.Active;
    }>)
  | (ProcessCorrelationRegistrationIdentity & DeepReadonly<{
      kind: ProcessCorrelationRegistrationResolutionKind.DeferredByScan;
      scanId: string;
    }>)
  | (ProcessCorrelationRegistrationIdentity & DeepReadonly<{
      kind: ProcessCorrelationRegistrationResolutionKind.CandidateCapacity;
      failure: CorrelationCandidateCapacityFailure;
    }>)
  | (ProcessCorrelationRegistrationIdentity & DeepReadonly<{
      kind: ProcessCorrelationRegistrationResolutionKind.AddressQuarantined;
    }>)
  | (ProcessCorrelationRegistrationIdentity & DeepReadonly<{
      kind: ProcessCorrelationRegistrationResolutionKind.IngressUnavailable;
      workflowId: string;
      failure: "unqueryable" | "echoMismatch";
    }>);

export type ProcessCorrelationRegistrationStage = DeepReadonly<{
  phase: ProcessCorrelationRegistrationPhase;
  registration: CorrelationCandidateRegistrationRequest;
  preState: RuntimeState;
  step: Extract<ScenarioStep, { kind: ScenarioStepKind.Committed }>;
  stimulus: DeliverPayloadMessageStimulus;
  committedAtEpochMs: number;
}>;

export type BpmnWorkflowContinuationCorrelationV1 = DeepReadonly<{
  protocol: typeof bpmnProcessCorrelationRegistrationContinuationV1;
  registration: ProcessCorrelationRegistrationStage | null;
}>;

export type CorrelationRegistrationActivities = Readonly<{
  [bpmnResolveCorrelationCandidateRegistrationActivityName]: (
    request: ProcessCorrelationRegistrationActivityRequest,
  ) => Promise<ProcessCorrelationRegistrationResolution>;
}>;

export function requireBpmnWorkflowContinuationCorrelationV1(
  value: unknown,
  program: SemanticProcessProgram,
  currentState: RuntimeState,
): BpmnWorkflowContinuationCorrelationV1 {
  requireWorkflowChainPlainDataTree(value);
  if (!isRecordWithExactKeys(value, ["protocol", "registration"]) ||
    value.protocol !== bpmnProcessCorrelationRegistrationContinuationV1) {
    throw new TypeError("Malformed Process correlation continuation");
  }
  if (value.registration === null) {
    return {
      protocol: bpmnProcessCorrelationRegistrationContinuationV1,
      registration: null,
    };
  }
  const stage = value.registration;
  if (!isRecordWithExactKeys(stage, [
    "phase",
    "registration",
    "preState",
    "step",
    "stimulus",
    "committedAtEpochMs",
  ]) ||
    !Object.values(ProcessCorrelationRegistrationPhase).includes(
      stage.phase as ProcessCorrelationRegistrationPhase,
    ) ||
    !isWellFormedStimulus(stage.stimulus) ||
    stage.stimulus.kind !== StimulusKind.DeliverPayloadMessage ||
    !Number.isSafeInteger(stage.committedAtEpochMs) ||
    Number(stage.committedAtEpochMs) < 0) {
    throw new TypeError("Malformed staged correlation registration");
  }
  const registration = requireCorrelationCandidateRegistrationRequest(
    stage.registration,
  );
  const stimulus = stage.stimulus as DeliverPayloadMessageStimulus;
  if (registration.transactionId !== stimulus.commandId) {
    throw new TypeError("Correlation registration transaction changed command identity");
  }
  const recomputed = advanceScenario(
    program,
    stage.preState as RuntimeState,
    stimulus,
  );
  if (recomputed.kind !== ScenarioStepKind.Committed ||
    canonicalWorkflowChainJson(recomputed) !==
      canonicalWorkflowChainJson(stage.step)) {
    throw new TypeError("Staged correlation semantic successor changed");
  }
  const candidate = projectCorrelatedMessageCandidate(program, recomputed.state);
  if (candidate === null ||
    !sameCorrelationCandidateRegistrationRequest(
      { ...registration, candidate },
      registration,
    )) {
    throw new TypeError("Staged correlation candidate changed");
  }
  const expectedCurrent = stage.phase === ProcessCorrelationRegistrationPhase.Prepare
    ? stage.preState
    : recomputed.state;
  if (canonicalWorkflowChainJson(expectedCurrent) !==
    canonicalWorkflowChainJson(currentState)) {
    throw new TypeError("Correlation registration phase disagrees with committed state");
  }
  return {
    protocol: bpmnProcessCorrelationRegistrationContinuationV1,
    registration: {
      phase: stage.phase as ProcessCorrelationRegistrationPhase,
      registration,
      preState: stage.preState as RuntimeState,
      step: recomputed,
      stimulus,
      committedAtEpochMs: Number(stage.committedAtEpochMs),
    },
  };
}

export function requireProcessCorrelationCandidateQueryRequest(
  value: unknown,
): ProcessCorrelationCandidateQueryRequest {
  if (!isRecordWithExactKeys(value, ["address", "subscriptionId"]) ||
    !isCorrelatedMessageAddress(value.address) ||
    !isSubscriptionId(value.subscriptionId)) {
    throw new TypeError("Correlation candidate Query request is malformed");
  }
  return {
    address: value.address,
    subscriptionId: value.subscriptionId,
  };
}

export function requireProcessCorrelationRegistrationActivityRequest(
  value: unknown,
): ProcessCorrelationRegistrationActivityRequest {
  if (!isRecordWithExactKeys(value, [
    "phase",
    "taskQueue",
    "configuration",
    "registration",
  ]) ||
    !Object.values(ProcessCorrelationRegistrationPhase).includes(
      value.phase as ProcessCorrelationRegistrationPhase,
    ) ||
    !nonemptyWireString(value.taskQueue)) {
    throw new TypeError("Process correlation registration request is malformed");
  }
  const registration = requireCorrelationCandidateRegistrationRequest(
    value.registration,
  );
  const configuration = requireCorrelationIngressConfiguration(
    value.configuration,
  );
  return {
    phase: value.phase as ProcessCorrelationRegistrationPhase,
    taskQueue: value.taskQueue,
    configuration,
    registration,
  };
}

export function requireProcessCorrelationRegistrationResolution(
  value: unknown,
  request: ProcessCorrelationRegistrationActivityRequest,
): ProcessCorrelationRegistrationResolution {
  if (!isRecord(value) || value.transactionId !== request.registration.transactionId) {
    throw new TypeError("Correlation registration resolution identity changed");
  }
  switch (value.kind) {
    case ProcessCorrelationRegistrationResolutionKind.Prepared:
      requireOnlyKeys(value, ["kind", "transactionId", "phase"]);
      if (
        request.phase !== ProcessCorrelationRegistrationPhase.Prepare ||
        value.phase !== CorrelationCandidateRegistrationPhase.Pending
      ) {
        throw new TypeError("Correlation prepare resolution changed phase");
      }
      return value as ProcessCorrelationRegistrationResolution;
    case ProcessCorrelationRegistrationResolutionKind.Finalized:
      requireOnlyKeys(value, ["kind", "transactionId", "phase"]);
      if (
        request.phase !== ProcessCorrelationRegistrationPhase.Finalize ||
        value.phase !== CorrelationCandidateRegistrationPhase.Active
      ) {
        throw new TypeError("Correlation finalize resolution changed phase");
      }
      return value as ProcessCorrelationRegistrationResolution;
    case ProcessCorrelationRegistrationResolutionKind.DeferredByScan:
      requireOnlyKeys(value, ["kind", "transactionId", "scanId"]);
      if (
        request.phase !== ProcessCorrelationRegistrationPhase.Prepare ||
        !nonemptyWireString(value.scanId)
      ) {
        throw new TypeError("Correlation scan deferral is malformed");
      }
      return value as ProcessCorrelationRegistrationResolution;
    case ProcessCorrelationRegistrationResolutionKind.CandidateCapacity:
      requireOnlyKeys(value, ["kind", "transactionId", "failure"]);
      if (
        request.phase !== ProcessCorrelationRegistrationPhase.Prepare ||
        !isCapacityFailure(value.failure)
      ) {
        throw new TypeError("Correlation candidate capacity is malformed");
      }
      return value as ProcessCorrelationRegistrationResolution;
    case ProcessCorrelationRegistrationResolutionKind.AddressQuarantined:
      requireOnlyKeys(value, ["kind", "transactionId"]);
      if (request.phase !== ProcessCorrelationRegistrationPhase.Prepare) {
        throw new TypeError("Correlation quarantine changed phase");
      }
      return value as ProcessCorrelationRegistrationResolution;
    case ProcessCorrelationRegistrationResolutionKind.IngressUnavailable:
      requireOnlyKeys(value, [
        "kind",
        "transactionId",
        "workflowId",
        "failure",
      ]);
      if (
        !nonemptyWireString(value.workflowId) ||
        (value.failure !== "unqueryable" && value.failure !== "echoMismatch")
      ) {
        throw new TypeError("Correlation ingress resolution is malformed");
      }
      return value as ProcessCorrelationRegistrationResolution;
    default:
      throw new TypeError("Unknown Process correlation registration resolution");
  }
}

export function sameProcessCorrelationCandidateQuery(
  candidate: unknown,
  request: ProcessCorrelationCandidateQueryRequest,
): candidate is CorrelatedMessageCandidate {
  return isCorrelatedMessageCandidate(candidate) &&
    sameCorrelatedMessageAddress(candidate.address, request.address) &&
    sameOccurrenceId(candidate.subscriptionId, request.subscriptionId);
}

function isCapacityFailure(value: unknown): value is CorrelationCandidateCapacityFailure {
  try {
    requireCorrelationCandidateCapacityFailure(value);
    return true;
  } catch {
    return false;
  }
}

function isSubscriptionId(value: unknown): value is MessageSubscriptionId {
  return isRecordWithExactKeys(value, [
    "processInstanceId",
    "elementId",
    "activation",
  ]) &&
    nonemptyWireString(value.processInstanceId) &&
    nonemptyWireString(value.elementId) &&
    positiveSafeInteger(value.activation);
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonemptyWireString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && isWellFormedWireString(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordWithExactKeys<const Key extends string>(
  value: unknown,
  keys: ReadonlyArray<Key>,
): value is Record<Key, unknown> {
  return isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function requireOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): void {
  if (!isRecordWithExactKeys(value, keys)) {
    throw new TypeError("Correlation registration resolution is widened");
  }
}
