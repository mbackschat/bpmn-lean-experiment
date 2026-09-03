import type {
  DefinitionCorrelatedMessageCapabilities,
  DefinitionCorrelatedMessagePublication,
  PublicCorrelatedMessageCapability,
  PutDefinitionCorrelatedMessagePublicationRequest,
} from "../src/index.js";

declare const capability: PublicCorrelatedMessageCapability;

// @ts-expect-error Catch Event identity is immutable.
capability.catchEventId = "replacement";
// @ts-expect-error Correlation-key identity is immutable.
capability.correlationKeyId = "replacement";
// @ts-expect-error Channel identity is deeply immutable.
capability.channel.interfaceOperationId = "replacement";
// @ts-expect-error A caller-selected Process target is not public capability state.
capability.processInstanceId;
// @ts-expect-error Subscription occurrence identity is not public capability state.
capability.subscriptionId;

declare const capabilities: DefinitionCorrelatedMessageCapabilities;

// @ts-expect-error Capability collections are immutable.
capabilities.messages.push(capability);
// @ts-expect-error Exact definition identity is deeply immutable.
capabilities.definition.source.sha256 = "0".repeat(64);

declare const request: PutDefinitionCorrelatedMessagePublicationRequest;

// @ts-expect-error Payloads are deeply immutable.
request.payload.value = "replacement";
// @ts-expect-error The payload is the correlation value; there is no second key input.
request.correlationKey;
// @ts-expect-error The caller cannot select a Process instance.
request.processInstanceId;

declare const publication: DefinitionCorrelatedMessagePublication;

// @ts-expect-error The selected capability remains immutable.
publication.correlatedMessage.catchEventId = "replacement";
// @ts-expect-error Resolution identity is immutable.
publication.resolution.commandId = "replacement";
// @ts-expect-error Temporal Workflow identity is never public resolution state.
publication.resolution.workflowId;
// @ts-expect-error Temporal Run identity is never public resolution state.
publication.resolution.runId;

if (
  publication.resolution.kind === "semantic" &&
  publication.resolution.outcome.kind === "committed"
) {
  // @ts-expect-error The engine-selected Process instance is immutable.
  publication.resolution.outcome.target.processInstanceId = "replacement";
  // @ts-expect-error Subscription occurrence identity remains private.
  publication.resolution.outcome.target.subscriptionId;
}
