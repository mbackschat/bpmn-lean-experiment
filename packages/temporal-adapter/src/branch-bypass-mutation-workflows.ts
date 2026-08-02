import {
  SemanticOperationKind,
  SimpleBooleanExpressionKind,
  type SemanticProcessProgram,
  type StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import type {
  CompletedProcessReceipt,
} from "./contracts.js";
import {
  runBpmnProcessWithHostEffects,
} from "./workflow-implementation.js";

export function runBpmnProcessBranchBypassMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  const mutatedProcess = mutateConditionalSelection(semanticProcess);
  return runBpmnProcessWithHostEffects(
    start,
    mutatedProcess,
    async () => {
      throw new TypeError(
        "Branch-bypass mutation does not host timer waits",
      );
    },
    async () => {
      throw new TypeError(
        "Branch-bypass mutation does not host Service Task effects",
      );
    },
  );
}

function mutateConditionalSelection(
  semanticProcess: SemanticProcessProgram,
): SemanticProcessProgram {
  let conditionalSelectionCount = 0;
  const operations = semanticProcess.operations.map((operation) => {
    switch (operation.kind) {
      case SemanticOperationKind.Choose: {
        conditionalSelectionCount += 1;
        const [first, second] = operation.candidates;
        return {
          ...operation,
          candidates: [
            {
              ...first,
              output: second.output,
              origin: second.origin,
            },
            {
              ...second,
              output: first.output,
              origin: first.origin,
            },
          ],
        } as const;
      }
      case SemanticOperationKind.SelectMany: {
        conditionalSelectionCount += 1;
        const [first, second] = operation.candidates;
        return {
          ...operation,
          candidates: [
            first,
            {
              ...second,
              condition: {
                kind: SimpleBooleanExpressionKind.Literal,
                value: false,
              },
            },
          ],
        } as const;
      }
      default:
        return operation;
    }
  });
  if (conditionalSelectionCount !== 1) {
    throw new TypeError(
      "Branch-bypass mutation requires one conditional branch selection",
    );
  }
  return {
    ...semanticProcess,
    operations,
  };
}
