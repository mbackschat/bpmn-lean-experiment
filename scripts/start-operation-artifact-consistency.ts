/** Exact checked-to-IL bindings shared by the closed Process-start families. */
import { isDeepStrictEqual } from "node:util";

import type {
  CheckedProcess,
  SemanticOperation,
  SemanticProcessProgram,
} from "../packages/semantic-core/src/index.ts";

export function referencedStartControlPlaces(
  operation: SemanticOperation,
): ReadonlyArray<string> | undefined {
  switch (operation.kind) {
    case "initiate":
      return [operation.output];
    case "initiateMessage":
      return operation.outputs;
    default:
      return undefined;
  }
}

export function verifyCanonicalStartOperationOrder(
  operation: Extract<SemanticOperation, { kind: "initiateMessage" }>,
  compare: (left: string, right: string) => number,
): void {
  if (!isDeepStrictEqual(operation.outputs, [...operation.outputs].sort(compare))) {
    throw new Error(
      `Message Start operation ${operation.id} outputs must be sorted`,
    );
  }
}

export function verifyStartOperationBindings(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
  compare: (left: string, right: string) => number,
): void {
  const starts = checkedProcess.nodes.filter(
    ({ kind }) => kind === "noneStartEvent" || kind === "messageStartEvent",
  );
  const initiations = semanticProcess.operations.filter(
    ({ kind }) => kind === "initiate" || kind === "initiateMessage",
  );
  for (const start of starts) {
    const matching = initiations.filter(
      ({ origin }) => origin.elementId === start.id,
    );
    const initiation = matching[0];
    const outgoingFlowIds = checkedProcess.sequenceFlows
      .filter(({ sourceId }) => sourceId === start.id)
      .map(({ id }) => id);
    const expectedOutputs = semanticProcess.controlPlaces
      .filter(({ origin }) => outgoingFlowIds.includes(origin.elementId))
      .map(({ id }) => id)
      .sort(compare);
    switch (start.kind) {
      case "noneStartEvent":
        if (
          matching.length !== 1 ||
          initiation?.kind !== "initiate" ||
          expectedOutputs.length !== 1 ||
          initiation.output !== expectedOutputs[0]
        ) {
          throw new Error(
            `None Start ${start.id} has no exact initiation binding`,
          );
        }
        break;
      case "messageStartEvent":
        if (
          matching.length !== 1 ||
          initiation?.kind !== "initiateMessage" ||
          !isDeepStrictEqual(initiation.channel, start.channel) ||
          !isDeepStrictEqual(initiation.outputs, expectedOutputs)
        ) {
          throw new Error(
            `Message Start ${start.id} has no exact initiation binding`,
          );
        }
        break;
    }
  }
  if (initiations.length !== starts.length) {
    throw new Error("Process-start operation cardinality differs from checked source");
  }
}
