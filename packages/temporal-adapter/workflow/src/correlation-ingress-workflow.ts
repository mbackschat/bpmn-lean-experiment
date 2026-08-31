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
  CorrelationPublicationScanResolutionKind,
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
import {
  resolveCorrelationPublicationScan,
} from "./correlation-publication-settlement.js";

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
    scan: for (;;) {
      try {
        const scan = await scanCoordinator.begin({
          scanId: transition.result.contentSha256,
        });
        if (scan.kind === CorrelationCandidateScanCompletionKind.Complete) {
          const resolution = resolveCorrelationPublicationScan(
            publicationState,
            registrationState,
            address,
            configuration,
            scan,
          );
          switch (resolution.result.kind) {
            case CorrelationPublicationScanResolutionKind.RejectedNoMatch:
            case CorrelationPublicationScanResolutionKind.RejectedAmbiguous:
              scanCoordinator.finish(scan);
              publicationState = resolution.publicationState;
              break scan;
            case CorrelationPublicationScanResolutionKind.TargetSelected:
              publicationState = resolution.publicationState;
              break scan;
            default:
              assertNever(resolution.result);
          }
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

function assertNever(value: never): never {
  throw new TypeError(`Unsupported publication scan resolution: ${String(value)}`);
}
