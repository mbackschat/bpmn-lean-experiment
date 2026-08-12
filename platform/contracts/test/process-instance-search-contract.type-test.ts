import type {
  ProcessInstanceSearchPage,
  ProcessInstanceSearchRequest,
  PublicProcessInstanceIdentity,
} from "../src/index.js";

declare const request: ProcessInstanceSearchRequest;

// @ts-expect-error Search filters are immutable.
request.processId = "replacement";
// @ts-expect-error Search limits are immutable.
request.limit = 100;
// @ts-expect-error Status is not a truthful search filter.
request.status;
// @ts-expect-error Temporal Workflow identity is not a search filter.
request.workflowId;

declare const page: ProcessInstanceSearchPage;
declare const instance: PublicProcessInstanceIdentity;

// @ts-expect-error Search result arrays are immutable.
page.instances.push(instance);
// @ts-expect-error Pagination cursors are immutable.
page.nextCursor = null;
if (page.instances[0] !== undefined) {
  // @ts-expect-error Semantic Process-instance identity is immutable.
  page.instances[0].processInstanceId = "replacement";
  // @ts-expect-error Exact deployed-definition identity is deeply immutable.
  page.instances[0].definition.source.sha256 = "0".repeat(64);
  const capability =
    page.instances[0].definition.startCapabilities.messageStarts[0];
  if (capability !== undefined) {
    // @ts-expect-error Nested Interface Operation identity is immutable.
    capability.channel.interfaceOperationId = "replacement";
  }
  // @ts-expect-error Temporal Run identity is not public search state.
  page.instances[0].firstExecutionRunId;
}
