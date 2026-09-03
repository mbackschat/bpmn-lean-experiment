import {
  sameCorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
} from "@temporalio/workflow";

import {
  CorrelationCandidateRegistrationPhase,
  CorrelationIngressInFlightPhase,
  bpmnCorrelationIngressContinuationV1,
  correlationIngressContinuationBudgetViolation,
  correlationPublicationContentSha256,
  requireCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationState,
  CorrelationIngressConfiguration,
  CorrelationIngressContinuationV1,
  CorrelationPublicationState,
} from "@bpmn-lean/temporal-protocol";

import {
  emptyCorrelationCandidateRegistrationState,
  requireCorrelationActiveTargetRegistration,
  requireCorrelationCandidateRegistrationState,
} from "./correlation-candidate-registration.js";
import {
  emptyCorrelationPublicationState,
} from "./correlation-publication-admission.js";
import {
  requireCorrelationPublicationState,
} from "./correlation-publication-state.js";

export const bpmnCorrelationIngressContinuationInvalidFailureType =
  "BpmnCorrelationIngressContinuationInvalid" as const;
export const bpmnCorrelationIngressContinuationCapacityFailureType =
  "BpmnCorrelationIngressContinuationCapacityExhausted" as const;
export const bpmnCorrelationIngressRunCapacityFailureType =
  "BpmnCorrelationIngressRunCapacityExhausted" as const;

export type CorrelationIngressRuntimeState = Readonly<{
  runOrdinal: number;
  registrationState: CorrelationCandidateRegistrationState;
  publicationState: CorrelationPublicationState;
  inFlightPhase: CorrelationIngressInFlightPhase | null;
}>;

export type CorrelationIngressSuccessorArguments = readonly [
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  continuation: CorrelationIngressContinuationV1,
];

export function restoreCorrelationIngressState(
  address: CorrelatedMessageAddress,
  configurationValue: CorrelationIngressConfiguration,
  continuationValue?: unknown,
): CorrelationIngressRuntimeState {
  const configuration = requireCorrelationIngressConfiguration(
    configurationValue,
  );
  if (continuationValue === undefined) {
    return {
      runOrdinal: 1,
      registrationState: emptyCorrelationCandidateRegistrationState(),
      publicationState: emptyCorrelationPublicationState(),
      inFlightPhase: null,
    };
  }
  try {
    const continuation = requireCorrelationIngressContinuation(
      address,
      configuration,
      continuationValue,
    );
    return {
      runOrdinal: continuation.runOrdinal,
      registrationState: continuation.registrationState,
      publicationState: continuation.publicationState,
      inFlightPhase: continuation.inFlightPhase,
    };
  } catch (error: unknown) {
    throw invalidContinuation(error);
  }
}

export function buildCorrelationIngressSuccessor(
  address: CorrelatedMessageAddress,
  configurationValue: CorrelationIngressConfiguration,
  runtime: CorrelationIngressRuntimeState,
): CorrelationIngressSuccessorArguments {
  const configuration = requireCorrelationIngressConfiguration(
    configurationValue,
  );
  const currentRunOrdinal = runtime.runOrdinal;
  const successorRunOrdinal = currentRunOrdinal + 1;
  if (!Number.isSafeInteger(successorRunOrdinal) ||
    successorRunOrdinal > configuration.maxRuns) {
    throw ApplicationFailure.nonRetryable(
      "Correlation ingress Run capacity is exhausted",
      bpmnCorrelationIngressRunCapacityFailureType,
      {
        configuredBound: configuration.maxRuns,
        observedValue: successorRunOrdinal,
        runOrdinal: currentRunOrdinal,
      },
    );
  }
  const continuation = requireCorrelationIngressContinuation(
    address,
    configuration,
    {
      protocol: bpmnCorrelationIngressContinuationV1,
      runOrdinal: successorRunOrdinal,
      registrationState: runtime.registrationState,
      publicationState: runtime.publicationState,
      inFlightPhase: runtime.inFlightPhase,
    },
  );
  const violation = correlationIngressContinuationBudgetViolation(
    address,
    configuration,
    continuation,
  );
  if (violation !== null) {
    throw ApplicationFailure.nonRetryable(
      "Correlation ingress continuation capacity is exhausted",
      bpmnCorrelationIngressContinuationCapacityFailureType,
      { ...violation, runOrdinal: currentRunOrdinal },
    );
  }
  return [address, configuration, continuation];
}

function requireCorrelationIngressContinuation(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  value: unknown,
): CorrelationIngressContinuationV1 {
  if (!isRecordWithExactKeys(value, [
    "protocol",
    "runOrdinal",
    "registrationState",
    "publicationState",
    "inFlightPhase",
  ]) ||
    value.protocol !== bpmnCorrelationIngressContinuationV1 ||
    !Number.isSafeInteger(value.runOrdinal) ||
    Number(value.runOrdinal) < 2 ||
    Number(value.runOrdinal) > configuration.maxRuns ||
    !(value.inFlightPhase === null ||
      Object.values(CorrelationIngressInFlightPhase).includes(
        value.inFlightPhase as CorrelationIngressInFlightPhase,
      ))) {
    throw new TypeError("Correlation ingress continuation is malformed");
  }
  const registrationState = requireCorrelationCandidateRegistrationState(
    value.registrationState,
    address,
    configuration,
  );
  const publicationState = requireCorrelationPublicationState(
    value.publicationState,
    configuration,
  );
  requirePublicationContentIdentity(publicationState, address);
  requirePhaseRelation(
    value.inFlightPhase as CorrelationIngressInFlightPhase | null,
    registrationState,
    publicationState,
    address,
    configuration,
  );
  return {
    protocol: bpmnCorrelationIngressContinuationV1,
    runOrdinal: Number(value.runOrdinal),
    registrationState,
    publicationState,
    inFlightPhase:
      value.inFlightPhase as CorrelationIngressInFlightPhase | null,
  };
}

function requirePublicationContentIdentity(
  state: CorrelationPublicationState,
  address: CorrelatedMessageAddress,
): void {
  for (const record of state.queue) {
    if (record.contentSha256 !== correlationPublicationContentSha256({
      commandId: record.commandId,
      address,
      payload: record.payload,
    })) {
      throw new TypeError("Queued correlation publication changed content identity");
    }
  }
  if (state.inFlight !== null &&
    state.inFlight.contentSha256 !== correlationPublicationContentSha256({
      commandId: state.inFlight.commandId,
      address,
      payload: state.inFlight.payload,
    })) {
    throw new TypeError("In-flight correlation publication changed content identity");
  }
}

function requirePhaseRelation(
  phase: CorrelationIngressInFlightPhase | null,
  registrationState: CorrelationCandidateRegistrationState,
  publicationState: CorrelationPublicationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
): void {
  const inFlight = publicationState.inFlight;
  const barrier = registrationState.scanBarrier;
  switch (phase) {
    case null:
      if (inFlight !== null || barrier !== null) {
        throw new TypeError("Idle ingress continuation retains in-flight work");
      }
      return;
    case CorrelationIngressInFlightPhase.CandidateFanout:
      if (inFlight === null || inFlight.target !== null ||
        (barrier === null
          ? !registrationState.records.some(({ phase: registrationPhase }) =>
              registrationPhase === CorrelationCandidateRegistrationPhase.Pending
            ) || registrationState.records.some(({ phase: registrationPhase }) =>
              registrationPhase === CorrelationCandidateRegistrationPhase.Quarantined
            )
          : barrier.scanId !== inFlight.contentSha256)) {
        throw new TypeError("Candidate-fanout continuation lost its exact barrier");
      }
      return;
    case CorrelationIngressInFlightPhase.TargetDelivery:
      if (inFlight === null || inFlight.target === null || barrier === null ||
        barrier.scanId !== inFlight.contentSha256) {
        throw new TypeError("Target-delivery continuation lost its exact target");
      }
      requireCorrelationActiveTargetRegistration(
        registrationState,
        address,
        configuration,
        inFlight.target,
      );
      return;
    default:
      return assertNever(phase);
  }
}

function invalidContinuation(cause: unknown): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    "Correlation ingress continuation is invalid",
    bpmnCorrelationIngressContinuationInvalidFailureType,
    String(cause),
  );
}

function isRecordWithExactKeys<const Key extends string>(
  value: unknown,
  keys: ReadonlyArray<Key>,
): value is Record<Key, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value);
  return actual.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported correlation ingress phase: ${String(value)}`);
}
