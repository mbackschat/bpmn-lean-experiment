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
  CorrelationCandidateRegistrationState,
  CorrelationIngressConfiguration,
  CorrelationIngressEcho,
} from "@bpmn-lean/temporal-protocol";

import {
  emptyCorrelationCandidateRegistrationState,
  registerCorrelationCandidateRegistrationHandlers,
} from "./correlation-candidate-registration.js";

export const bpmnCorrelationIngressConfigurationQuery = defineQuery<
  CorrelationIngressEcho
>(bpmnCorrelationIngressConfigurationQueryName);

/** Hosts immutable ingress identity and configuration for canonical-start recovery. */
export async function runBpmnCorrelationIngress(
  address: CorrelatedMessageAddress,
  configuration: CorrelationIngressConfiguration,
): Promise<void> {
  const echo = createCorrelationIngressEcho(address, configuration);
  let registrationState: CorrelationCandidateRegistrationState =
    emptyCorrelationCandidateRegistrationState();
  setHandler(bpmnCorrelationIngressConfigurationQuery, () => echo);
  registerCorrelationCandidateRegistrationHandlers(
    address,
    configuration,
    () => registrationState,
    (successor) => {
      registrationState = successor;
    },
  );
  await condition(() => false);
}
