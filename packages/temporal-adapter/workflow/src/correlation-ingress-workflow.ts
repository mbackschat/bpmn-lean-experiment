import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import {
  ActivityFailure,
  condition,
  defineQuery,
  setHandler,
  sleep,
} from "@temporalio/workflow";

import {
  CorrelationCandidateScanCompletionKind,
  CorrelationPublicationOrderResultKind,
  bpmnCorrelationIngressConfigurationQueryName,
  createCorrelationIngressEcho,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationState,
  CorrelationIngressConfiguration,
  CorrelationIngressEcho,
  CorrelationPublicationState,
} from "@bpmn-lean/temporal-protocol";

import {
  emptyCorrelationCandidateRegistrationState,
  registerCorrelationCandidateRegistrationHandlers,
} from "./correlation-candidate-registration.js";
import {
  resolveBpmnCorrelationCandidateScan,
} from "./correlation-candidate-scan-activity.js";
import {
  CorrelationCandidateScanCoordinator,
  registerCorrelationCandidateScanHandlers,
} from "./correlation-ingress-scan.js";
import {
  emptyCorrelationPublicationState,
  registerCorrelationPublicationHandlers,
  startNextCorrelationPublication,
} from "./correlation-publication-admission.js";

export const bpmnCorrelationIngressConfigurationQuery = defineQuery<
  CorrelationIngressEcho
>(bpmnCorrelationIngressConfigurationQueryName);

/** Hosts immutable ingress identity and configuration for canonical-start recovery. */
export async function runBpmnCorrelationIngress(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
): Promise<void> {
  const echo = createCorrelationIngressEcho(address, configuration);
  let registrationState: CorrelationCandidateRegistrationState =
    emptyCorrelationCandidateRegistrationState();
  let publicationState: CorrelationPublicationState =
    emptyCorrelationPublicationState();
  setHandler(bpmnCorrelationIngressConfigurationQuery, () => echo);
  registerCorrelationCandidateRegistrationHandlers(
    address,
    configuration,
    () => registrationState,
    (successor) => {
      registrationState = successor;
    },
  );
  const scanCoordinator = new CorrelationCandidateScanCoordinator({
    address,
    configuration,
    currentState: () => registrationState,
    replaceState: (successor) => {
      registrationState = successor;
    },
    resolve: resolveBpmnCorrelationCandidateScan,
  });
  registerCorrelationCandidateScanHandlers(scanCoordinator);
  registerCorrelationPublicationHandlers(
    address,
    configuration,
    () => publicationState,
    (successor) => {
      publicationState = successor;
    },
  );
  for (;;) {
    await condition(() =>
      publicationState.inFlight === null && publicationState.queue.length > 0
    );
    const transition = startNextCorrelationPublication(
      publicationState,
      address,
      configuration,
    );
    if (transition.result.kind !== CorrelationPublicationOrderResultKind.Started) {
      throw new TypeError("A ready correlation publication did not start");
    }
    publicationState = transition.state;
    for (;;) {
      try {
        const scan = await scanCoordinator.begin({
          scanId: transition.result.contentSha256,
        });
        if (scan.kind === CorrelationCandidateScanCompletionKind.Complete) {
          break;
        }
        await sleep("1s");
      } catch (error: unknown) {
        if (!(error instanceof ActivityFailure)) {
          throw error;
        }
        await sleep("1s");
      }
    }
    await condition(() => publicationState.inFlight === null);
  }
}
