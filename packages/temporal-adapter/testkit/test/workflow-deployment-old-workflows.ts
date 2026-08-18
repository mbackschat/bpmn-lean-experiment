/** Retained pre-chain Workflow bundle used only by deployment-compatibility replay evidence. */
import type {
  ProcessStartStimulus,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import { sleep } from "@temporalio/workflow";

import {
  ActivationDrain,
  runBpmnProcessWithHostEffects,
} from "@bpmn-lean/temporal-workflow";

export function runBpmnProcess(
  start: ProcessStartStimulus,
  semanticProcess: SemanticProcessProgram,
) {
  return runBpmnProcessWithHostEffects(
    start,
    semanticProcess,
    sleep,
    async () => {
      throw new Error("old deployment fixture does not admit effect Activities");
    },
    ActivationDrain.Required,
  );
}
