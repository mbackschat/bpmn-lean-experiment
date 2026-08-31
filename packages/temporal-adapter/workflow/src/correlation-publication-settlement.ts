import {
  CorrelatedMessageMatchKind,
  matchCorrelatedMessageCandidates,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationPublicationScanResolutionKind,
  CorrelationPublicationSemanticOutcomeKind,
  CorrelationPublicationStoredResolutionKind,
  CorrelationCandidateScanResultKind,
  requireCorrelationCandidateScanActivityRequest,
  requireCorrelationCandidateScanCompletion,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationState,
  CorrelationCandidateScanCompletion,
  CorrelationIngressConfiguration,
  CorrelationPublicationState,
  CorrelationPublicationTarget,
} from "@bpmn-lean/temporal-protocol";

import {
  finishCorrelationCandidateScan,
} from "./correlation-candidate-registration.js";
import {
  reserveCorrelationPublicationTarget,
  settleCorrelationPublication,
} from "./correlation-publication-admission.js";

export type CorrelationPublicationScanResolution =
  | Readonly<{
      kind:
        | CorrelationPublicationScanResolutionKind.RejectedNoMatch
        | CorrelationPublicationScanResolutionKind.RejectedAmbiguous;
      commandId: string;
      ordinal: number;
    }>
  | Readonly<{
      kind: CorrelationPublicationScanResolutionKind.TargetSelected;
      commandId: string;
      ordinal: number;
      target: CorrelationPublicationTarget;
    }>;

export type CorrelationPublicationScanTransition = Readonly<{
  publicationState: CorrelationPublicationState;
  registrationState: CorrelationCandidateRegistrationState;
  result: CorrelationPublicationScanResolution;
}>;

/** Resolves only the complete vector retained by the current publication's scan barrier. */
export function resolveCorrelationPublicationScan(
  publicationState: CorrelationPublicationState,
  registrationState: CorrelationCandidateRegistrationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  completionValue: CorrelationCandidateScanCompletion,
): CorrelationPublicationScanTransition {
  const inFlight = publicationState.inFlight;
  const barrier = registrationState.scanBarrier;
  if (inFlight === null || barrier === null) {
    throw new TypeError("Correlation settlement requires one in-flight publication and scan");
  }
  if (barrier.scanId !== inFlight.contentSha256) {
    throw new TypeError("Correlation publication and scan identities disagree");
  }
  if (inFlight.target !== null) {
    return {
      publicationState,
      registrationState,
      result: {
        kind: CorrelationPublicationScanResolutionKind.TargetSelected,
        commandId: inFlight.commandId,
        ordinal: inFlight.ordinal,
        target: inFlight.target,
      },
    };
  }
  const request = requireCorrelationCandidateScanActivityRequest({
    scanId: barrier.scanId,
    address,
    registrations: barrier.candidates,
    configuration,
  });
  const completion = requireCorrelationCandidateScanCompletion(
    completionValue,
    request,
  );
  const match = matchCorrelatedMessageCandidates(
    address,
    inFlight.payload,
    completion.candidates,
  );
  if (match === null) {
    throw new TypeError("Complete correlation candidate evidence is malformed");
  }
  switch (match.kind) {
    case CorrelatedMessageMatchKind.NoMatch:
      return settleWithoutTarget(
        publicationState,
        registrationState,
        address,
        configuration,
        completion.scanId,
        CorrelationPublicationScanResolutionKind.RejectedNoMatch,
        CorrelationPublicationSemanticOutcomeKind.RejectedNoMatch,
      );
    case CorrelatedMessageMatchKind.Ambiguous:
      return settleWithoutTarget(
        publicationState,
        registrationState,
        address,
        configuration,
        completion.scanId,
        CorrelationPublicationScanResolutionKind.RejectedAmbiguous,
        CorrelationPublicationSemanticOutcomeKind.RejectedAmbiguous,
      );
    case CorrelatedMessageMatchKind.Unique: {
      const target = {
        processInstanceId: match.candidate.processInstanceId,
        subscriptionId: match.candidate.subscriptionId,
      } satisfies CorrelationPublicationTarget;
      return {
        publicationState: reserveCorrelationPublicationTarget(
          publicationState,
          address,
          configuration,
          inFlight.commandId,
          inFlight.ordinal,
          target,
        ),
        registrationState,
        result: {
          kind: CorrelationPublicationScanResolutionKind.TargetSelected,
          commandId: inFlight.commandId,
          ordinal: inFlight.ordinal,
          target,
        },
      };
    }
  }
}

function settleWithoutTarget(
  publicationState: CorrelationPublicationState,
  registrationState: CorrelationCandidateRegistrationState,
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  scanId: string,
  resultKind:
    | CorrelationPublicationScanResolutionKind.RejectedNoMatch
    | CorrelationPublicationScanResolutionKind.RejectedAmbiguous,
  outcomeKind:
    | CorrelationPublicationSemanticOutcomeKind.RejectedNoMatch
    | CorrelationPublicationSemanticOutcomeKind.RejectedAmbiguous,
): CorrelationPublicationScanTransition {
  const inFlight = publicationState.inFlight;
  if (inFlight === null) {
    throw new TypeError("Correlation settlement lost its in-flight publication");
  }
  const settled = settleCorrelationPublication(
    publicationState,
    address,
    configuration,
    {
      commandId: inFlight.commandId,
      ordinal: inFlight.ordinal,
      resolution: {
        kind: CorrelationPublicationStoredResolutionKind.Semantic,
        outcome: { kind: outcomeKind },
      },
    },
  );
  const finished = finishCorrelationCandidateScan(
    registrationState,
    address,
    configuration,
    scanId,
  );
  if (finished.result.kind !== CorrelationCandidateScanResultKind.Finished) {
    throw new TypeError("Correlation settlement did not finish its exact scan");
  }
  return {
    publicationState: settled.state,
    registrationState: finished.state,
    result: {
      kind: resultKind,
      commandId: inFlight.commandId,
      ordinal: inFlight.ordinal,
    },
  };
}
