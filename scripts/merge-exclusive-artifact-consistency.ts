import { isDeepStrictEqual } from "node:util";

import type {
  CheckedProcess,
  SemanticProcessProgram,
} from "../packages/semantic-core/src/index.ts";

/** Verifies the exact checked-Sequence-Flow to Exclusive Merge operation binding. */
export function verifyMergeExclusiveBindings(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
  compareStrings: (left: string, right: string) => number,
): void {
  const merges = checkedProcess.nodes.filter(
    (node) => node.kind === "exclusiveMerge",
  );
  const operations = semanticProcess.operations.filter(
    (operation) => operation.kind === "mergeExclusive",
  );
  for (const merge of merges) {
    const matching = operations.filter(
      ({ origin }) => origin.elementId === merge.id,
    );
    const operation = matching[0];
    const incomingPlaces = checkedProcess.sequenceFlows
      .filter(({ targetId }) => targetId === merge.id)
      .map(({ id }) => controlPlaceForFlow(semanticProcess, id));
    const incoming = incomingPlaces
      .filter((place): place is string => place !== undefined)
      .sort(compareStrings);
    const outgoing = checkedProcess.sequenceFlows
      .filter(({ sourceId }) => sourceId === merge.id)
      .map(({ id }) => controlPlaceForFlow(semanticProcess, id));
    if (
      matching.length !== 1 ||
      operation === undefined ||
      incoming.length !== incomingPlaces.length ||
      outgoing.length !== 1 ||
      outgoing[0] === undefined ||
      !isDeepStrictEqual(operation.inputs, incoming) ||
      operation.output !== outgoing[0]
    ) {
      throw new Error(
        `checked Exclusive Merge ${merge.id} has no exact operation endpoint binding`,
      );
    }
  }
  if (operations.length !== merges.length) {
    throw new Error("Exclusive Merge operation cardinality differs from checked source");
  }
}

function controlPlaceForFlow(
  semanticProcess: SemanticProcessProgram,
  flowId: string,
): string | undefined {
  const matches = semanticProcess.controlPlaces.filter(
    ({ origin }) => origin.elementId === flowId,
  );
  return matches.length === 1 ? matches[0]?.id : undefined;
}
