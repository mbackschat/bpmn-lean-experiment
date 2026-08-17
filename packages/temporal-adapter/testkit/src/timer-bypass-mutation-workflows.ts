import type {
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import type {
  CompletedProcessReceipt,
} from "./contracts.js";
import {
  decodeWorkflowTerminalResult,
  requireCompletedProcessReceipt,
} from "./contracts.js";
import {
  runBpmnProcessWithHostEffects,
} from "@bpmn-lean/temporal-workflow";

export function runBpmnProcessTimerBypassMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  return runBpmnProcessWithHostEffects(
    start,
    semanticProcess,
    async () => undefined,
    async () => {
      throw new TypeError(
        "Timer-bypass mutation does not host Service Task effects",
      );
    },
  ).then((result) => requireCompletedProcessReceipt(
    decodeWorkflowTerminalResult(result).receipt,
  ));
}
