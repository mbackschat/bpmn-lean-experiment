import {
  CorrelationIngressEnsureResultKind,
  ensureCorrelationIngress,
} from "@bpmn-lean/temporal-client";
import type {
  TemporalWorkflowClient,
} from "@bpmn-lean/temporal-client";
import {
  CorrelationCandidateRegistrationPhase,
  CorrelationCandidateRegistrationResultKind,
  ProcessCorrelationRegistrationPhase,
  ProcessCorrelationRegistrationResolutionKind,
  bpmnFinalizeCorrelationCandidateUpdateName,
  bpmnPrepareCorrelationCandidateUpdateName,
  bpmnProcessCorrelationCandidateQueryName,
  bpmnResolveCorrelationCandidateRegistrationActivityName,
  finalizeCorrelationCandidateRegistrationUpdateId,
  prepareCorrelationCandidateRegistrationUpdateId,
  requireCorrelationCandidateRegistrationResult,
  requireProcessCorrelationRegistrationActivityRequest,
  requireProcessCorrelationRegistrationResolution,
  sameCorrelationCandidateRegistrationRequest,
  sameProcessCorrelationCandidateQuery,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationRegistrationActivities,
  ProcessCorrelationCandidateQueryRequest,
  ProcessCorrelationRegistrationResolution,
} from "@bpmn-lean/temporal-protocol";

/** Binds the private cross-Workflow registration protocol to one Worker-owned client. */
export function createCorrelationRegistrationActivities(
  client: TemporalWorkflowClient | Readonly<{ workflow: TemporalWorkflowClient }>,
  taskQueue: string,
): CorrelationRegistrationActivities {
  if (taskQueue.length === 0) {
    throw new TypeError("Correlation registration Activity task queue is empty");
  }
  const workflowClient = workflowClientOf(client);
  return {
    [bpmnResolveCorrelationCandidateRegistrationActivityName]: async (
      candidateRequest,
    ) => {
      const request = requireProcessCorrelationRegistrationActivityRequest(
        candidateRequest,
      );
      if (request.taskQueue !== taskQueue) {
        throw new TypeError("Correlation registration Activity task queue changed");
      }
      const ensure = await ensureCorrelationIngress(client as never, {
        address: request.registration.candidate.address,
        configuration: request.configuration,
        taskQueue,
      });
      if (ensure.kind === CorrelationIngressEnsureResultKind.Unavailable) {
        return requireProcessCorrelationRegistrationResolution({
          kind: ProcessCorrelationRegistrationResolutionKind.IngressUnavailable,
          transactionId: request.registration.transactionId,
          workflowId: ensure.workflowId,
          failure: ensure.failure.kind,
        }, request);
      }

      if (request.phase === ProcessCorrelationRegistrationPhase.Finalize) {
        const queryRequest: ProcessCorrelationCandidateQueryRequest = {
          address: request.registration.candidate.address,
          subscriptionId: request.registration.candidate.subscriptionId,
        };
        const observed = await workflowClient.getHandle(
          request.registration.processLocator.workflowId,
        ).query<unknown, [ProcessCorrelationCandidateQueryRequest]>(
          bpmnProcessCorrelationCandidateQueryName,
          queryRequest,
        );
        if (!sameProcessCorrelationCandidateQuery(observed, queryRequest) ||
          !sameCorrelationCandidateRegistrationRequest(
            {
              ...request.registration,
              candidate: observed,
            },
            request.registration,
          )) {
          throw new TypeError("Process correlation candidate is not current");
        }
      }

      const ingress = workflowClient.getHandle(ensure.workflowId);
      const updateName = request.phase === ProcessCorrelationRegistrationPhase.Prepare
        ? bpmnPrepareCorrelationCandidateUpdateName
        : bpmnFinalizeCorrelationCandidateUpdateName;
      const updateId = request.phase === ProcessCorrelationRegistrationPhase.Prepare
        ? prepareCorrelationCandidateRegistrationUpdateId(request.registration)
        : finalizeCorrelationCandidateRegistrationUpdateId(request.registration);
      const observed = await ingress.executeUpdate<unknown, [typeof request.registration]>(
        updateName,
        { args: [request.registration], updateId },
      );
      const result = requireCorrelationCandidateRegistrationResult(
        observed,
        request.registration.transactionId,
      );
      return requireProcessCorrelationRegistrationResolution(
        mapRegistrationResult(request.phase, result),
        request,
      );
    },
  };
}

function mapRegistrationResult(
  requestedPhase: ProcessCorrelationRegistrationPhase,
  result: ReturnType<typeof requireCorrelationCandidateRegistrationResult>,
): ProcessCorrelationRegistrationResolution {
  switch (result.kind) {
    case CorrelationCandidateRegistrationResultKind.Prepared:
      if (requestedPhase !== ProcessCorrelationRegistrationPhase.Prepare) {
        throw new TypeError("Finalize returned a prepare result");
      }
      return {
        kind: ProcessCorrelationRegistrationResolutionKind.Prepared,
        transactionId: result.transactionId,
        phase: CorrelationCandidateRegistrationPhase.Pending,
      };
    case CorrelationCandidateRegistrationResultKind.Finalized:
      if (requestedPhase !== ProcessCorrelationRegistrationPhase.Finalize) {
        throw new TypeError("Prepare returned a finalize result");
      }
      return {
        kind: ProcessCorrelationRegistrationResolutionKind.Finalized,
        transactionId: result.transactionId,
        phase: CorrelationCandidateRegistrationPhase.Active,
      };
    case CorrelationCandidateRegistrationResultKind.Retained:
      if (
        requestedPhase === ProcessCorrelationRegistrationPhase.Prepare &&
        result.phase === CorrelationCandidateRegistrationPhase.Pending
      ) {
        return {
          kind: ProcessCorrelationRegistrationResolutionKind.Prepared,
          transactionId: result.transactionId,
          phase: CorrelationCandidateRegistrationPhase.Pending,
        };
      }
      if (
        requestedPhase === ProcessCorrelationRegistrationPhase.Finalize &&
        result.phase === CorrelationCandidateRegistrationPhase.Active
      ) {
        return {
          kind: ProcessCorrelationRegistrationResolutionKind.Finalized,
          transactionId: result.transactionId,
          phase: CorrelationCandidateRegistrationPhase.Active,
        };
      }
      throw new TypeError("Correlation registration retained an incompatible phase");
    case CorrelationCandidateRegistrationResultKind.DeferredByScan:
      return {
        kind: ProcessCorrelationRegistrationResolutionKind.DeferredByScan,
        transactionId: result.transactionId,
        scanId: result.scanId,
      };
    case CorrelationCandidateRegistrationResultKind.CandidateCapacity:
      return {
        kind: ProcessCorrelationRegistrationResolutionKind.CandidateCapacity,
        transactionId: result.transactionId,
        failure: result.failure,
      };
    case CorrelationCandidateRegistrationResultKind.AddressQuarantined:
      return {
        kind: ProcessCorrelationRegistrationResolutionKind.AddressQuarantined,
        transactionId: result.transactionId,
      };
    default:
      return assertNever(result);
  }
}

function workflowClientOf(
  client: TemporalWorkflowClient | Readonly<{ workflow: TemporalWorkflowClient }>,
): TemporalWorkflowClient {
  const concrete = client as unknown as Readonly<{
    workflow?: TemporalWorkflowClient;
  }>;
  return concrete.workflow ?? client as unknown as TemporalWorkflowClient;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported correlation registration result: ${String(value)}`);
}
