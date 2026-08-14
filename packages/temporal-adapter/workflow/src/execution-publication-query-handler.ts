import type {
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  defineQuery,
  setHandler,
} from "@temporalio/workflow";
import {
  ExecutionPublicationResultKind,
  bpmnExecutionPublicationQueryName,
  requireExecutionPublicationRequest,
  requireExecutionPublicationResult,
} from "@bpmn-lean/temporal-protocol";
import type {
  ExecutionPublicationRequest,
  ExecutionPublicationResult,
} from "@bpmn-lean/temporal-protocol";

import type {
  ExecutionPublicationState,
} from "./execution-publication-state.js";

export const bpmnExecutionPublicationQuery = defineQuery<
  ExecutionPublicationResult,
  [request: ExecutionPublicationRequest]
>(bpmnExecutionPublicationQueryName);

/** Installs the unconditional, read-only publication Query before semantic evaluation. */
export function registerExecutionPublicationQueryHandler(
  program: SemanticProcessProgram,
  publication: () => ExecutionPublicationState,
): void {
  setHandler(
    bpmnExecutionPublicationQuery,
    (request) => queryExecutionPublication(program, publication(), request),
  );
}

/** Returns only complete command batches from one exact batch-boundary cursor. */
export function queryExecutionPublication(
  program: SemanticProcessProgram,
  state: ExecutionPublicationState,
  requestValue: unknown,
): ExecutionPublicationResult {
  const request = requireExecutionPublicationRequest(requestValue);
  if (state.headRevision === 0) {
    return requireResult(program, state, request, {
      kind: ExecutionPublicationResultKind.NotReady,
    });
  }
  const startIndex = batchStartIndex(state, request.afterRevision);
  if (startIndex === null) {
    return requireResult(program, state, request, {
      kind: ExecutionPublicationResultKind.Gap,
    });
  }
  const limit = request.limit ?? 50;
  const batches = state.batches.slice(startIndex, startIndex + limit);
  const pageThroughRevision = batches.at(-1)?.throughRevision ??
    request.afterRevision;
  return requireResult(program, state, request, {
    kind: ExecutionPublicationResultKind.Available,
    page: {
      definition: state.definition,
      processId: state.processId,
      processInstanceId: state.processInstanceId,
      requestedAfterRevision: request.afterRevision,
      pageThroughRevision,
      headRevision: state.headRevision,
      batches,
      current: pageThroughRevision === state.headRevision
        ? state.current
        : null,
    },
  });
}

function batchStartIndex(
  state: ExecutionPublicationState,
  afterRevision: number,
): number | null {
  if (afterRevision > state.headRevision) {
    return null;
  }
  if (afterRevision === 0) {
    return state.batches[0]?.fromRevision === 0 ? 0 : null;
  }
  if (afterRevision === state.headRevision) {
    return state.batches.at(-1)?.throughRevision === state.headRevision
      ? state.batches.length
      : null;
  }
  const preceding = state.batches.findIndex(
    ({ throughRevision }) => throughRevision === afterRevision,
  );
  return preceding >= 0 &&
      state.batches[preceding + 1]?.fromRevision === afterRevision
    ? preceding + 1
    : null;
}

function requireResult(
  program: SemanticProcessProgram,
  state: ExecutionPublicationState,
  request: ExecutionPublicationRequest,
  value: unknown,
): ExecutionPublicationResult {
  return requireExecutionPublicationResult(value, {
    program,
    processInstanceId: state.processInstanceId,
    afterRevision: request.afterRevision,
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  });
}
