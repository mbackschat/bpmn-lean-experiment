import { VariableValueKind } from "@bpmn-lean/semantic-core";
import {
  bpmnExecutionPublicationQueryName,
  bpmnWorkflowPublicationSegmentQueryName,
  ExecutionPublicationResultKind,
  WorkflowPublicationSegmentQueryResultKind,
} from "@bpmn-lean/temporal-protocol";
import type { ExecutionPublicationResult, WorkflowPublicationSegmentQueryResultV1 } from "@bpmn-lean/temporal-protocol";
import type { WorkflowInterceptorsFactory } from "@temporalio/workflow";

// DEPLOY-QUERY-01 requires a valid but wrong publication that changes no Temporal Commands.
export const interceptors: WorkflowInterceptorsFactory = () => ({
  inbound: [{
    async handleQuery(input, next) {
      const response = await next(input);
      switch (input.queryName) {
        case bpmnExecutionPublicationQueryName:
          return mutatePublication(response as ExecutionPublicationResult);
        case bpmnWorkflowPublicationSegmentQueryName: {
          const segment = response as WorkflowPublicationSegmentQueryResultV1;
          return segment.kind === WorkflowPublicationSegmentQueryResultKind.Available
            ? { ...segment, execution: mutatePublication(segment.execution) }
            : response;
        }
        default:
          return response;
      }
    },
  }],
});

function mutatePublication(publication: ExecutionPublicationResult): ExecutionPublicationResult {
  if (publication.kind !== ExecutionPublicationResultKind.Available || publication.page.current === null) return publication;
  const current = publication.page.current;
  return {
    ...publication,
    page: {
      ...publication.page,
      current: {
        ...current,
        state: {
          ...current.state,
          variables: [...current.state.variables, {
            name: "zzNativeQueryProjection",
            value: { kind: VariableValueKind.String as const, value: "candidate-B" },
          }].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
        },
      },
    },
  };
}
