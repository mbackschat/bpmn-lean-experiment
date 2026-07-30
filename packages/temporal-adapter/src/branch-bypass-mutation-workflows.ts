import {
  SemanticOperationKind,
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
  const mutatedProcess = swapConditionalRoutes(semanticProcess);
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

function swapConditionalRoutes(
  semanticProcess: SemanticProcessProgram,
): SemanticProcessProgram {
  let chooseCount = 0;
  const operations = semanticProcess.operations.map((operation) => {
    if (operation.kind !== SemanticOperationKind.Choose) {
      return operation;
    }
    chooseCount += 1;
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
  });
  if (chooseCount !== 1) {
    throw new TypeError(
      "Branch-bypass mutation requires one conditional choice",
    );
  }
  return {
    ...semanticProcess,
    operations,
  };
}
