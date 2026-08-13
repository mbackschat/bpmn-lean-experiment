import type {
  SemanticProcessProgram,
  ProcessStartStimulus,
} from "@bpmn-lean/semantic-core";
import {
  sleep,
} from "@temporalio/workflow";

import type {
  TerminalProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import {
  runBpmnProcessWithHostEffects,
} from "./workflow-implementation.js";
import { executeEffectForProfile } from "./effect-activities.js";

export function runBpmnProcess(
  start: ProcessStartStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<TerminalProcessReceipt> {
  return runBpmnProcessWithHostEffects(
    start,
    semanticProcess,
    sleep,
    executeEffectForProfile(semanticProcess.identity.semanticProfile),
  );
}
