/** Exact checked-source binding for one payload-bearing Intermediate Catch Message Event. */
import { isDeepStrictEqual } from "node:util";

import type {
  CheckedNode,
  CheckedProcess,
  SemanticOperation,
  SemanticProcessProgram,
} from "../packages/semantic-core/src/index.ts";

type PayloadMessageCatchNode = Extract<
  CheckedNode,
  Readonly<{ kind: "payloadMessageCatchEvent" }>
>;

type AwaitPayloadMessageOperation = Extract<
  SemanticOperation,
  Readonly<{ kind: "awaitPayloadMessage" }>
>;

/** Requires a one-to-one, exact binding from every checked payload catch to its IL wait. */
export function verifyPayloadMessageCatchBindings(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
): void {
  const checkedCatches = checkedProcess.nodes.filter(
    (node): node is PayloadMessageCatchNode =>
      node.kind === "payloadMessageCatchEvent",
  );
  const operations = semanticProcess.operations.filter(
    (operation): operation is AwaitPayloadMessageOperation =>
      operation.kind === "awaitPayloadMessage",
  );

  for (const checkedCatch of checkedCatches) {
    const matching = operations.filter(
      ({ origin }) => origin.elementId === checkedCatch.id,
    );
    const operation = matching[0];
    if (
      matching.length !== 1 ||
      operation === undefined ||
      operation.message.elementId !== checkedCatch.id ||
      !isDeepStrictEqual(operation.message.channel, checkedCatch.channel) ||
      !isDeepStrictEqual(operation.directOutput, checkedCatch.directOutput)
    ) {
      throw new Error(
        `payload Message catch ${checkedCatch.id} has no exact checked-to-IL binding`,
      );
    }
  }

  if (operations.length !== checkedCatches.length) {
    throw new Error(
      "payload Message catch operation cardinality differs from checked source",
    );
  }
}
