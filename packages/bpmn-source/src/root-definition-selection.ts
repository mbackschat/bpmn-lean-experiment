import {
  MessageChannelKind,
  SemanticProfileId,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  MessageChannel,
} from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import {
  asElementArray,
  hasOnlyOwnKeys,
  readId,
} from "./moddle-graph.js";
import type {
  ElementRecord,
} from "./moddle-graph.js";

const bpmnTypes = metamodelManifest.compilerProjection;

type OperationMessageRootArtifacts = Readonly<{
  message: ElementRecord;
  interface: ElementRecord;
  operation: ElementRecord;
  channel: Extract<
    MessageChannel,
    { kind: typeof MessageChannelKind.OperationMessage }
  >;
}>;

type DirectMessageRootArtifacts = Readonly<{
  message: ElementRecord;
  channel: Extract<
    MessageChannel,
    { kind: typeof MessageChannelKind.DirectMessage }
  >;
}>;

export type MessageRootArtifacts =
  | OperationMessageRootArtifacts
  | DirectMessageRootArtifacts;

export function isOperationMessageRootArtifacts(
  artifacts: MessageRootArtifacts | undefined,
): artifacts is OperationMessageRootArtifacts {
  return artifacts?.channel.kind === MessageChannelKind.OperationMessage;
}

export function isDirectMessageRootArtifacts(
  artifacts: MessageRootArtifacts | undefined,
): artifacts is DirectMessageRootArtifacts {
  return artifacts?.channel.kind === MessageChannelKind.DirectMessage;
}

export type RootDefinitionSelection = Readonly<{
  process: ElementRecord;
  messageArtifacts: MessageRootArtifacts | undefined;
  errorArtifact: ElementRecord | undefined;
}>;

/** Selects the exact root-definition multiset owned by one reviewed profile. */
export function selectRootDefinitions(
  rootElements: ReadonlyArray<ElementRecord>,
  semanticProfile: string,
): RootDefinitionSelection | undefined {
  const processes = elementsOfType(rootElements, bpmnTypes.processType);
  const process = processes[0];
  if (process === undefined || processes.length !== 1) {
    return undefined;
  }
  switch (semanticProfile) {
    case SemanticProfileId.IntermediateCatchMessage:
      return selectMessageRoots(rootElements, process);
    case SemanticProfileId.MessageAddressedReceiveTask:
      return selectDirectMessageRoots(rootElements, process);
    case SemanticProfileId.SubProcessErrorPropagation:
      return selectErrorRoots(rootElements, process);
    default:
      return rootElements.length === 1
        ? {
            process,
            messageArtifacts: undefined,
            errorArtifact: undefined,
          }
        : undefined;
  }
}

function selectMessageRoots(
  rootElements: ReadonlyArray<ElementRecord>,
  process: ElementRecord,
): RootDefinitionSelection | undefined {
  const messages = elementsOfType(rootElements, bpmnTypes.messageType);
  const interfaces = elementsOfType(rootElements, bpmnTypes.interfaceType);
  const message = messages[0];
  const interface_ = interfaces[0];
  if (
    rootElements.length !== 3 ||
    messages.length !== 1 ||
    interfaces.length !== 1 ||
    message === undefined ||
    interface_ === undefined ||
    !hasOnlyOwnKeys(message, ["$type", "id", "name"]) ||
    message.itemRef !== undefined ||
    !hasOnlyOwnKeys(interface_, ["$type", "id", "name", "operations"])
  ) {
    return undefined;
  }
  const operations = asElementArray(interface_.operations);
  const operation = operations?.[0];
  const messageId = readId(message);
  const interfaceId = readId(interface_);
  const interfaceOperationId =
    operation === undefined ? undefined : readId(operation);
  if (
    operations?.length !== 1 ||
    operation === undefined ||
    operation.$type !== bpmnTypes.operationType ||
    !hasOnlyOwnKeys(operation, ["$type", "id", "name"]) ||
    operation.inMessageRef !== message ||
    operation.outMessageRef !== undefined ||
    operation.errorRefs !== undefined ||
    operation.implementationRef !== undefined ||
    messageId === undefined ||
    interfaceId === undefined ||
    interfaceOperationId === undefined
  ) {
    return undefined;
  }
  return {
    process,
    messageArtifacts: {
      message,
      interface: interface_,
      operation,
      channel: {
        kind: MessageChannelKind.OperationMessage,
        interfaceId,
        interfaceOperationId,
        messageId,
      },
    },
    errorArtifact: undefined,
  };
}

function selectDirectMessageRoots(
  rootElements: ReadonlyArray<ElementRecord>,
  process: ElementRecord,
): RootDefinitionSelection | undefined {
  const messages = elementsOfType(rootElements, bpmnTypes.messageType);
  const message = messages[0];
  if (
    rootElements.length !== 2 ||
    messages.length !== 1 ||
    message === undefined ||
    !hasOnlyOwnKeys(message, ["$type", "id", "name"]) ||
    typeof message.name !== "string" ||
    message.name.length === 0 ||
    !isWellFormedWireString(message.name)
  ) {
    return undefined;
  }
  const messageId = readId(message);
  if (messageId === undefined) {
    return undefined;
  }
  return {
    process,
    messageArtifacts: {
      message,
      channel: {
        kind: MessageChannelKind.DirectMessage,
        messageId,
      },
    },
    errorArtifact: undefined,
  };
}

function selectErrorRoots(
  rootElements: ReadonlyArray<ElementRecord>,
  process: ElementRecord,
): RootDefinitionSelection | undefined {
  const errors = elementsOfType(rootElements, bpmnTypes.errorType);
  const errorArtifact = errors[0];
  return rootElements.length === 2 &&
      errors.length === 1 &&
      errorArtifact !== undefined
    ? { process, messageArtifacts: undefined, errorArtifact }
    : undefined;
}

function elementsOfType(
  elements: ReadonlyArray<ElementRecord>,
  type: string,
): ReadonlyArray<ElementRecord> {
  return elements.filter((element) => element.$type === type);
}
