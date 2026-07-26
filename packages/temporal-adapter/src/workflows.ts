import type {
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  sleep,
} from "@temporalio/workflow";

import type {
  CompletedProcessReceipt,
} from "./contracts.js";
import {
  runBpmnProcessWithTimerWait,
} from "./workflow-implementation.js";

export function runBpmnProcess(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  return runBpmnProcessWithTimerWait(start, semanticProcess, sleep);
}
