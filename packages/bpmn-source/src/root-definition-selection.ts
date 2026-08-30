import {
  ACTIVITY_BOUNDARY_MESSAGE_CHECKPOINT_PROFILE_ID,
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
  hasOnlyModelledKeys,
  readId,
} from "./moddle-graph.js";
import type {
  ElementRecord,
} from "./moddle-graph.js";
import {
  preservationCapability,
  preservedSubtreeRejections,
} from "./preserved-element-classification.js";
import {
  containedLocus,
} from "./admission-diagnostics.js";
import type {
  ElementLocus,
  ElementRejection,
} from "./admission-diagnostics.js";

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

/**
 * The selected root multiset, or the refusals that prevented one.
 *
 * `rejections` is empty on success and may also be empty on failure: a profile whose root multiset
 * is wrong in a way no single root explains has nothing per-element to report, and its caller states
 * the document-level refusal.
 */
export type RootDefinitionSelectionResult = Readonly<{
  selection: RootDefinitionSelection | undefined;
  rejections: ReadonlyArray<ElementRejection>;
}>;

/** Selects the exact root-definition multiset owned by one reviewed profile. */
export function selectRootDefinitions(
  rootElements: ReadonlyArray<ElementRecord>,
  semanticProfile: string,
  rootElementsLocus: ElementLocus,
): RootDefinitionSelectionResult {
  const processes = elementsOfType(rootElements, bpmnTypes.processType);
  const process = processes[0];
  if (process === undefined || processes.length !== 1) {
    return unselected([]);
  }
  switch (semanticProfile) {
    case SemanticProfileId.MessageStart:
    case SemanticProfileId.IntermediateCatchMessage:
    case SemanticProfileId.EventBasedGatewayMessageTimer:
    case ACTIVITY_BOUNDARY_MESSAGE_CHECKPOINT_PROFILE_ID:
      return selected(selectMessageRoots(rootElements, process));
    case SemanticProfileId.MessageAddressedReceiveTask:
      return selected(selectDirectMessageRoots(rootElements, process));
    case SemanticProfileId.SubProcessErrorPropagation:
      return selected(selectErrorRoots(rootElements, process));
    default:
      return selectEntryProcessRoot(
        rootElements,
        process,
        semanticProfile,
        rootElementsLocus,
      );
  }
}

/**
 * One executable entry Process, with every other root wholly preserved.
 *
 * A profile that preserves nothing admits no other root at all, which is the executed-only rule
 * unchanged. A second *executable* Process is never preserved, because `bpmn:Process` is absent from
 * every preserved type set; the profiles that genuinely need one bind it by QName and select their
 * roots elsewhere.
 */
function selectEntryProcessRoot(
  rootElements: ReadonlyArray<ElementRecord>,
  process: ElementRecord,
  semanticProfile: string,
  rootElementsLocus: ElementLocus,
): RootDefinitionSelectionResult {
  const capability = preservationCapability(semanticProfile);
  const rejections = rootElements.flatMap((element, index) =>
    element === process || capability === undefined
      ? []
      : preservedSubtreeRejections(
        element,
        containedLocus(rootElementsLocus, index),
        capability,
      )
  );
  const unpreservedRemainder = capability === undefined &&
    rootElements.some((element) => element !== process);
  return rejections.length > 0 || unpreservedRemainder
    ? unselected(rejections)
    : selected({
      process,
      messageArtifacts: undefined,
      errorArtifact: undefined,
    });
}

function selected(
  selection: RootDefinitionSelection | undefined,
): RootDefinitionSelectionResult {
  return { selection, rejections: [] };
}

function unselected(
  rejections: ReadonlyArray<ElementRejection>,
): RootDefinitionSelectionResult {
  return { selection: undefined, rejections };
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
    !hasOnlyModelledKeys(message, ["$type", "id", "name"]) ||
    message.itemRef !== undefined ||
    !hasOnlyModelledKeys(interface_, ["$type", "id", "name", "operations"]) ||
    typeof interface_.name !== "string"
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
    !hasOnlyModelledKeys(operation, ["$type", "id", "name"]) ||
    typeof operation.name !== "string" ||
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
    !hasOnlyModelledKeys(message, ["$type", "id", "name"]) ||
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
