import {
  sleep,
} from "@temporalio/workflow";

import type {
  BpmnProcessWorkflow,
} from "@bpmn-lean/temporal-protocol";
import {
  runBpmnProcessWithHostEffects,
} from "./workflow-implementation.js";
import { executeEffectForProfile } from "./effect-activities.js";
import { ActivationDrain } from "./activation-tagged-readiness.js";

export { runBpmnCorrelationIngress } from "./correlation-ingress-workflow.js";

export const runBpmnProcess: BpmnProcessWorkflow = (
  start,
  semanticProcess,
  hostInput,
  carriedState,
  carriedRecovery,
  carriedPublication,
  carriedCorrelation,
) => runBpmnProcessWithHostEffects(
  start,
  semanticProcess,
  sleep,
  executeEffectForProfile(semanticProcess.identity.semanticProfile),
  ActivationDrain.Required,
  hostInput,
  carriedState,
  carriedRecovery,
  carriedPublication,
  carriedCorrelation,
);
