import type {
  DeployedDefinitionVersion,
  MessageStartPublication,
  PublicMessageStartCapability,
  PublicOperationMessageChannel,
  PutMessageStartPublicationRequest,
} from "../src/index.js";

declare const channel: PublicOperationMessageChannel;

// @ts-expect-error Operation channel discriminants are immutable.
channel.kind = "operationMessage";
// @ts-expect-error Interface identity is immutable.
channel.interfaceId = "replacement";
// @ts-expect-error Interface Operation identity is immutable.
channel.interfaceOperationId = "replacement";
// @ts-expect-error Message identity is immutable.
channel.messageId = "replacement";
// @ts-expect-error Temporal task queues are not public channel state.
channel.taskQueue;

declare const capability: PublicMessageStartCapability;

// @ts-expect-error Start Event identity is immutable.
capability.startEventId = "replacement";
// @ts-expect-error Nested channel fields are immutable.
capability.channel.interfaceOperationId = "replacement";

declare const definition: DeployedDefinitionVersion;

// @ts-expect-error Capability collections are immutable.
definition.startCapabilities.messageStarts.push(capability);
if (definition.startCapabilities.messageStarts[0] !== undefined) {
  // @ts-expect-error Values inside capability collections are immutable.
  definition.startCapabilities.messageStarts[0].channel.messageId = "replacement";
}

declare const request: PutMessageStartPublicationRequest;

// @ts-expect-error Request definition identity is immutable.
request.definition.version = 3;
// @ts-expect-error Request capability identity is deeply immutable.
request.messageStart.channel.interfaceId = "replacement";
// @ts-expect-error Message payload is not in the selected public request.
request.payload;
// @ts-expect-error Correlation keys are not in the selected public request.
request.correlationKey;

declare const publication: MessageStartPublication;

// @ts-expect-error Publication identity is immutable.
publication.publicationId = "replacement";

declare const discriminantPublication: MessageStartPublication;

// @ts-expect-error Publication discriminants are immutable.
discriminantPublication.status = "pending";
// @ts-expect-error Repeated definition identity is deeply immutable.
publication.definition.source.sha256 = "0".repeat(64);
// @ts-expect-error Repeated capability identity is deeply immutable.
publication.messageStart.channel.interfaceOperationId = "replacement";
// @ts-expect-error Temporal Workflow identity is not public publication state.
publication.workflowId;
// @ts-expect-error Temporal Run identity is not public publication state.
publication.firstExecutionRunId;
// @ts-expect-error Temporal task queues are not public publication state.
publication.taskQueue;
// @ts-expect-error Memo is not public publication state.
publication.memo;
// @ts-expect-error Private command identity is not public publication state.
publication.commandId;
// @ts-expect-error Semantic programs are not public publication state.
publication.semanticProcessProgram;

if (publication.status === "accepted") {
  // @ts-expect-error Accepted Process-instance identity is immutable.
  publication.instance.processInstanceId = "replacement";
  // @ts-expect-error Accepted exact definition identity is deeply immutable.
  publication.instance.definition.startCapabilities.messageStarts[0]!.startEventId =
    "replacement";
} else {
  const noInstance: null = publication.instance;
  void noInstance;
}
