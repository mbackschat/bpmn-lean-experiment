import type {
  TemporalWorkflowClient,
} from "@bpmn-lean/temporal-client";
import {
  CorrelationCandidateScanCompletionKind,
  bpmnProcessCorrelationCandidateQueryName,
  bpmnResolveCorrelationCandidateScanActivityName,
  correlationCandidateRegistrationRequestFromRecord,
  requireCorrelationCandidateScanActivityRequest,
  requireCorrelationCandidateScanCompletion,
  sameCorrelationCandidateRegistrationRequest,
  sameProcessCorrelationCandidateQuery,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateScanActivities,
  ProcessCorrelationCandidateQueryRequest,
} from "@bpmn-lean/temporal-protocol";

/** Resolves one barrier-held registration snapshot without emitting a partial vector. */
export function createCorrelationCandidateScanActivities(
  workflowClient: TemporalWorkflowClient,
): CorrelationCandidateScanActivities {
  return {
    [bpmnResolveCorrelationCandidateScanActivityName]: async (scanRequest) => {
      const request = requireCorrelationCandidateScanActivityRequest(scanRequest);
      const candidates = await Promise.all(request.registrations.map(
        async (record) => {
          const queryRequest: ProcessCorrelationCandidateQueryRequest = {
            address: request.address,
            subscriptionId: record.candidate.subscriptionId,
          };
          const handle = workflowClient.getHandle(
            record.processLocator.workflowId,
          );
          const [description, observed] = await Promise.all([
            handle.describe(),
            handle.query<unknown, [ProcessCorrelationCandidateQueryRequest]>(
              bpmnProcessCorrelationCandidateQueryName,
              queryRequest,
            ),
          ]);
          if (description.status.name !== "RUNNING" ||
            !sameProcessCorrelationCandidateQuery(observed, queryRequest) ||
            !sameCorrelationCandidateRegistrationRequest(
              {
                ...correlationCandidateRegistrationRequestFromRecord(record),
                candidate: observed,
              },
              correlationCandidateRegistrationRequestFromRecord(record),
            )) {
            throw new TypeError(
              `Process ${record.processLocator.workflowId} did not return its exact correlation candidate`,
            );
          }
          return observed;
        },
      ));
      return requireCorrelationCandidateScanCompletion(
        {
          kind: CorrelationCandidateScanCompletionKind.Complete,
          scanId: request.scanId,
          candidates,
        },
        request,
      );
    },
  };
}
