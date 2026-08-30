import { isDeepStrictEqual } from "node:util";

import type {
  CheckedNode,
  CheckedProcess,
  ControlPlace,
  SemanticOperation,
  SemanticProcessProgram,
} from "../packages/semantic-core/src/index.ts";

type MessageBoundaryEvent = Extract<
  CheckedNode,
  Readonly<{ kind: "messageBoundaryEvent" }>
>;

type PlainUserTask = Extract<
  CheckedNode,
  Readonly<{ kind: "userTask" }>
>;

type AwaitMessageBoundedUserTaskOperation = Extract<
  SemanticOperation,
  Readonly<{ kind: "awaitMessageBoundedUserTask" }>
>;

/** Requires exact checked-source binding for interrupting Activity boundary Message operations. */
export function verifyActivityBoundaryMessageBindings(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
): void {
  const boundaries = checkedProcess.nodes.filter(
    (node): node is MessageBoundaryEvent => node.kind === "messageBoundaryEvent",
  );
  const operations = semanticProcess.operations.filter(
    (operation): operation is AwaitMessageBoundedUserTaskOperation =>
      operation.kind === "awaitMessageBoundedUserTask",
  );

  if (boundaries.length !== operations.length) {
    fail("checked boundary and IL operation cardinality differs");
  }

  for (const boundary of boundaries) {
    const sameBoundaries = boundaries.filter(({ id }) => id === boundary.id);
    const attachedBoundaries = boundaries.filter(
      ({ attachedToRef }) => attachedToRef === boundary.attachedToRef,
    );
    const hosts = checkedProcess.nodes.filter(
      (node): node is PlainUserTask =>
        node.kind === "userTask" && node.id === boundary.attachedToRef,
    );
    const matchingOperations = operations.filter(
      ({ boundaryMessage }) => boundaryMessage.elementId === boundary.id,
    );
    const host = hosts[0];
    const operation = matchingOperations[0];
    if (
      sameBoundaries.length !== 1 ||
      attachedBoundaries.length !== 1 ||
      hosts.length !== 1 ||
      host === undefined ||
      matchingOperations.length !== 1 ||
      operation === undefined
    ) {
      fail(`boundary ${boundary.id} has no one-to-one checked host and IL operation`);
    }

    const incoming = checkedProcess.sequenceFlows.filter(
      ({ targetId }) => targetId === host.id,
    );
    const normalOutgoing = checkedProcess.sequenceFlows.filter(
      ({ sourceId }) => sourceId === host.id,
    );
    const boundaryOutgoing = checkedProcess.sequenceFlows.filter(
      ({ sourceId }) => sourceId === boundary.id,
    );
    const inputFlow = incoming[0];
    const normalOutputFlow = normalOutgoing[0];
    const boundaryOutputFlow = boundaryOutgoing[0];
    if (
      incoming.length !== 1 ||
      inputFlow === undefined ||
      normalOutgoing.length !== 1 ||
      normalOutputFlow === undefined ||
      boundaryOutgoing.length !== 1 ||
      boundaryOutputFlow === undefined ||
      boundaryOutputFlow.id !== boundary.outputFlowId
    ) {
      fail(`boundary ${boundary.id} has no exact three-flow checked topology`);
    }

    if (
      !isDeepStrictEqual(operation.origin, {
        kind: "bpmnElement",
        elementId: host.id,
      }) ||
      operation.task.elementId !== host.id ||
      operation.task.name !== host.name ||
      operation.boundaryMessage.elementId !== boundary.id ||
      !isDeepStrictEqual(operation.boundaryMessage.channel, boundary.channel) ||
      !isDeepStrictEqual(operation.boundaryMessage.origin, {
        kind: "bpmnSequenceFlow",
        elementId: boundary.outputFlowId,
      }) ||
      !resolvesExactlyToFlow(
        semanticProcess.controlPlaces,
        operation.input,
        inputFlow.id,
      ) ||
      !resolvesExactlyToFlow(
        semanticProcess.controlPlaces,
        operation.task.output,
        normalOutputFlow.id,
      ) ||
      !resolvesExactlyToFlow(
        semanticProcess.controlPlaces,
        operation.boundaryMessage.output,
        boundaryOutputFlow.id,
      )
    ) {
      fail(`boundary ${boundary.id} differs from its exact checked-to-IL binding`);
    }
  }
}

function resolvesExactlyToFlow(
  controlPlaces: ReadonlyArray<ControlPlace>,
  placeId: string,
  sequenceFlowId: string,
): boolean {
  const matching = controlPlaces.filter(({ id }) => id === placeId);
  return matching.length === 1 && isDeepStrictEqual(matching[0]?.origin, {
    kind: "bpmnSequenceFlow",
    elementId: sequenceFlowId,
  });
}

function fail(detail: string): never {
  throw new Error(`Activity boundary Message ${detail}`);
}
