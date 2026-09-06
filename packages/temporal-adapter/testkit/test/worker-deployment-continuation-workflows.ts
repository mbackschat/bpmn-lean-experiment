import type { CorrelatedMessageAddress } from "@bpmn-lean/semantic-core";
import type { CorrelationIngressConfiguration, CorrelationIngressContinuationV1 } from "@bpmn-lean/temporal-protocol";
import { runBpmnCorrelationIngressWithRolloverPolicy } from "@bpmn-lean/temporal-workflow";

export { runBpmnProcess } from "@bpmn-lean/temporal-workflow/workflows";

// DEPLOY-CHAIN-01 exercises native pin inheritance through the existing deterministic rollover seam.
export async function runBpmnCorrelationIngress(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  continuation?: CorrelationIngressContinuationV1,
): Promise<void> {
  return runBpmnCorrelationIngressWithRolloverPolicy(
    address,
    configuration,
    continuation,
    (state) => state.runOrdinal === 1 && state.registrationState.records.length > 0,
  );
}
