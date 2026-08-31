import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import {
  condition,
  defineQuery,
  setHandler,
} from "@temporalio/workflow";

import {
  bpmnCorrelationIngressConfigurationQueryName,
  createCorrelationIngressEcho,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationIngressConfiguration,
  CorrelationIngressEcho,
} from "@bpmn-lean/temporal-protocol";

export const bpmnCorrelationIngressConfigurationQuery = defineQuery<
  CorrelationIngressEcho
>(bpmnCorrelationIngressConfigurationQueryName);

/** Hosts immutable ingress identity and configuration for canonical-start recovery. */
export async function runBpmnCorrelationIngress(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
): Promise<void> {
  const echo = createCorrelationIngressEcho(address, configuration);
  setHandler(bpmnCorrelationIngressConfigurationQuery, () => echo);
  await condition(() => false);
}
