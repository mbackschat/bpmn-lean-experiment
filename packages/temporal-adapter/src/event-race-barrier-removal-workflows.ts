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
  ActivationDrain,
} from "./activation-tagged-readiness.js";
import {
  runBpmnProcessWithHostEffects,
} from "./workflow-implementation.js";

/** Independently runnable mutation that classifies readiness before the activation-job microtask drain. */
export function runBpmnProcessEventRaceBarrierRemovalMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  return runBpmnProcessWithHostEffects(
    start,
    semanticProcess,
    sleep,
    async () => {
      throw new TypeError(
        "Event-race barrier mutation does not host Service Task effects",
      );
    },
    ActivationDrain.RemovedMutation,
  );
}
