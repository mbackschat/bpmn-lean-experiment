import type {
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  proxyActivities,
  sleep,
} from "@temporalio/workflow";

import type {
  CompletedProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import {
  runBpmnProcessWithHostEffects,
} from "./workflow-implementation.js";
import type {
  EffectActivities,
} from "@bpmn-lean/temporal-protocol";

const {
  executeBpmnEffect,
} = proxyActivities<EffectActivities>({
  startToCloseTimeout: "2s",
  scheduleToCloseTimeout: "10s",
  retry: {
    maximumAttempts: 2,
    initialInterval: "100ms",
    backoffCoefficient: 1,
  },
});

export function runBpmnProcess(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  return runBpmnProcessWithHostEffects(
    start,
    semanticProcess,
    sleep,
    executeBpmnEffect,
  );
}
