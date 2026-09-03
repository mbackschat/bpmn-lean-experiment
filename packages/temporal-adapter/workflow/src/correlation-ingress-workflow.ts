import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import {
  ActivityFailure,
  ApplicationFailure,
  allHandlersFinished,
  condition,
  continueAsNew,
  defineQuery,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import {
  CorrelationCandidateScanCompletionKind,
  CorrelationCandidateScanResultKind,
  CorrelationIngressInFlightPhase,
  CorrelationPublicationOrderResultKind,
  CorrelationPublicationScanResolutionKind,
  WorkflowChainBudgetKind,
  bpmnCorrelationIngressConfigurationQueryName,
  correlationIngressWorkflowId,
  createCorrelationIngressEcho,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationState,
  CorrelationIngressConfiguration,
  CorrelationIngressContinuationV1,
  CorrelationIngressEcho,
  CorrelationPublicationState,
} from "@bpmn-lean/temporal-protocol";

import {
  correlationQuarantinedTarget,
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
import {
  resolveBpmnCorrelationTargetDelivery,
} from "./correlation-target-delivery-activity.js";
import {
  correlationTargetDeliveryActivityRequest,
  settleCorrelationPublicationAtQuarantinedAddress,
  settleCorrelationTargetDelivery,
} from "./correlation-target-settlement.js";
import {
  buildCorrelationIngressSuccessor,
  restoreCorrelationIngressState,
} from "./correlation-ingress-continuation.js";
import type {
  CorrelationIngressRuntimeState,
} from "./correlation-ingress-continuation.js";
import {
  workflowChainRolloverTriggered,
} from "./workflow-event-history-capacity.js";

export const bpmnCorrelationIngressConfigurationQuery = defineQuery<
  CorrelationIngressEcho
>(bpmnCorrelationIngressConfigurationQueryName);

export type CorrelationIngressRolloverPolicy = (
  state: CorrelationIngressRuntimeState,
) => boolean;

const correlationIngressEventHistoryLimits = {
  eventHistoryEventLimit: workflowChainProductionLimit(
    WorkflowChainBudgetKind.EventHistoryEvents,
  ),
  eventHistoryByteLimit: workflowChainProductionLimit(
    WorkflowChainBudgetKind.EventHistoryBytes,
  ),
};

/** Hosts immutable ingress identity and configuration for canonical-start recovery. */
export async function runBpmnCorrelationIngress(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  continuation?: CorrelationIngressContinuationV1,
): Promise<void> {
  const expectedWorkflowId = correlationIngressWorkflowId(address);
  if (workflowInfo().workflowId !== expectedWorkflowId) {
    throw ApplicationFailure.nonRetryable(
      "Correlation ingress Workflow identity does not match its address",
      "BpmnCorrelationIngressIdentityMismatch",
    );
  }
  return runBpmnCorrelationIngressWithRolloverPolicy(
    address,
    configuration,
    continuation,
    (state) => workflowChainRolloverTriggered(
      correlationIngressEventHistoryLimits,
      correlationIngressHasRetainedWork(state),
    ),
  );
}

/** Test seams may replace only the deterministic rollover decision, never the durable state. */
export async function runBpmnCorrelationIngressWithRolloverPolicy(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  continuation: CorrelationIngressContinuationV1 | undefined,
  rolloverRequested: CorrelationIngressRolloverPolicy,
): Promise<void> {
  const echo = createCorrelationIngressEcho(address, configuration);
  const restored = restoreCorrelationIngressState(
    address,
    configuration,
    continuation,
  );
  let runOrdinal = restored.runOrdinal;
  let registrationState: CorrelationCandidateRegistrationState =
    restored.registrationState;
  let publicationState: CorrelationPublicationState =
    restored.publicationState;
  let inFlightPhase = restored.inFlightPhase;
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
    () => correlationQuarantinedTarget(
      registrationState,
      address,
      configuration,
    ),
  );
  const currentRuntimeState = (): CorrelationIngressRuntimeState => ({
    runOrdinal,
    registrationState,
    publicationState,
    inFlightPhase,
  });
  const continueIfRequested = async (): Promise<void> => {
    if (!scanCoordinator.isIdleForContinuation() ||
      !rolloverRequested(currentRuntimeState())) {
      return;
    }
    await condition(allHandlersFinished);
    if (!scanCoordinator.isIdleForContinuation() ||
      !rolloverRequested(currentRuntimeState())) {
      return;
    }
    return await continueAsNew<typeof runBpmnCorrelationIngress>(
      ...buildCorrelationIngressSuccessor(
        address,
        configuration,
        currentRuntimeState(),
      ),
    );
  };
  for (;;) {
    if (inFlightPhase === null) {
      await condition(() =>
        correlationIngressReadyToStart(publicationState) ||
        scanCoordinator.isIdleForContinuation() &&
          rolloverRequested(currentRuntimeState())
      );
      await continueIfRequested();
      if (!correlationIngressReadyToStart(publicationState)) {
        continue;
      }
      const transition = startNextCorrelationPublication(
        publicationState,
        address,
        configuration,
      );
      if (transition.result.kind !== CorrelationPublicationOrderResultKind.Started) {
        throw new TypeError("A ready correlation publication did not start");
      }
      publicationState = transition.state;
      inFlightPhase = CorrelationIngressInFlightPhase.CandidateFanout;
    }

    if (inFlightPhase === CorrelationIngressInFlightPhase.CandidateFanout) {
      try {
        const inFlight = publicationState.inFlight;
        if (inFlight === null || inFlight.target !== null) {
          throw new TypeError("Candidate fanout lost its in-flight publication");
        }
        const scan = await scanCoordinator.begin({
          scanId: inFlight.contentSha256,
        });
        switch (scan.kind) {
          case CorrelationCandidateScanResultKind.BlockedByPendingRegistration:
            await continueIfRequested();
            await sleep("1s");
            continue;
          case CorrelationCandidateScanResultKind.BlockedByQuarantine:
            publicationState = settleCorrelationPublicationAtQuarantinedAddress(
              publicationState,
              registrationState,
              address,
              configuration,
            );
            inFlightPhase = null;
            await continueIfRequested();
            continue;
          case CorrelationCandidateScanResultKind.Busy:
            throw new TypeError("Correlation publication lost its exact scan barrier");
          case CorrelationCandidateScanCompletionKind.Complete:
            break;
          default:
            assertNever(scan);
        }
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
            scanCoordinator.settle(scan, resolution.registrationState);
            publicationState = resolution.publicationState;
            inFlightPhase = null;
            await continueIfRequested();
            continue;
          case CorrelationPublicationScanResolutionKind.TargetSelected:
            publicationState = resolution.publicationState;
            scanCoordinator.consumeCompletionForTarget(scan);
            inFlightPhase = CorrelationIngressInFlightPhase.TargetDelivery;
            break;
          default:
            assertNever(resolution.result);
        }
      } catch (error: unknown) {
        if (!(error instanceof ActivityFailure)) {
          throw error;
        }
        await continueIfRequested();
        await sleep("1s");
        continue;
      }
    }

    if (inFlightPhase === CorrelationIngressInFlightPhase.TargetDelivery) {
      try {
        const scanId = registrationState.scanBarrier?.scanId;
        if (scanId === undefined) {
          throw new TypeError("Target delivery lost its retained scan barrier");
        }
        const delivery = await resolveBpmnCorrelationTargetDelivery(
          correlationTargetDeliveryActivityRequest(
            publicationState,
            registrationState,
            address,
            configuration,
          ),
        );
        const settled = settleCorrelationTargetDelivery(
          publicationState,
          registrationState,
          address,
          configuration,
          delivery,
        );
        scanCoordinator.settleRetainedBarrier(
          scanId,
          settled.registrationState,
        );
        publicationState = settled.publicationState;
        inFlightPhase = null;
        await continueIfRequested();
      } catch (error: unknown) {
        if (!(error instanceof ActivityFailure)) {
          throw error;
        }
        await continueIfRequested();
        await sleep("1s");
      }
    }
  }
}

function correlationIngressReadyToStart(
  publicationState: CorrelationPublicationState,
): boolean {
  return publicationState.inFlight === null &&
    publicationState.queue.length > 0;
}

function correlationIngressHasRetainedWork(
  state: CorrelationIngressRuntimeState,
): boolean {
  return state.registrationState.records.length > 0 ||
    state.registrationState.scanBarrier !== null ||
    state.publicationState.ledger.length > 0 ||
    state.publicationState.queue.length > 0 ||
    state.publicationState.inFlight !== null;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported publication scan resolution: ${String(value)}`);
}
