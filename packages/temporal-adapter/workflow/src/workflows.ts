import type {
  SemanticProcessProgram,
  ProcessStartStimulus,
} from "@bpmn-lean/semantic-core";
import {
  sleep,
} from "@temporalio/workflow";

import type {
  BpmnWorkflowContinuationPublicationV1,
  BpmnWorkflowContinuationRecoveryV1,
  BpmnWorkflowContinuationStateV1,
  BpmnWorkflowHostInputV1,
  TerminalProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import {
  runBpmnProcessWithHostEffects,
} from "./workflow-implementation.js";
import { executeEffectForProfile } from "./effect-activities.js";
import { ActivationDrain } from "./activation-tagged-readiness.js";

export function runBpmnProcess(
  start: ProcessStartStimulus,
  semanticProcess: SemanticProcessProgram,
  hostInput?: BpmnWorkflowHostInputV1,
  carriedState?: BpmnWorkflowContinuationStateV1,
  carriedRecovery?: BpmnWorkflowContinuationRecoveryV1,
  carriedPublication?: BpmnWorkflowContinuationPublicationV1,
): Promise<TerminalProcessReceipt> {
  return runBpmnProcessWithHostEffects(
    start,
    semanticProcess,
    sleep,
    executeEffectForProfile(semanticProcess.identity.semanticProfile),
    ActivationDrain.Required,
    hostInput,
    carriedState,
    carriedRecovery,
    carriedPublication,
  );
}
