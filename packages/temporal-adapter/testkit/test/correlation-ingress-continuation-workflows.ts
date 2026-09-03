/** Private Workflow bundle that requests one deterministic ingress rollover after Activity failure. */
import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelationIngressConfiguration,
  CorrelationIngressContinuationV1,
} from "@bpmn-lean/temporal-protocol";
import {
  runBpmnCorrelationIngressWithRolloverPolicy,
} from "@bpmn-lean/temporal-workflow";

export async function correlationIngressContinuationProbe(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
  continuation?: CorrelationIngressContinuationV1,
): Promise<void> {
  return runBpmnCorrelationIngressWithRolloverPolicy(
    address,
    configuration,
    continuation,
    (state) => state.runOrdinal === 1 && state.inFlightPhase !== null,
  );
}
