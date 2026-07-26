import type {
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import type {
  CompletedProcessReceipt,
} from "./contracts.js";
import {
  runBpmnProcessWithTimerWait,
} from "./workflow-implementation.js";

export function runBpmnProcessTimerBypassMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  return runBpmnProcessWithTimerWait(
    start,
    semanticProcess,
    async () => undefined,
  );
}
