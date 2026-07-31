import {
  CheckedNodeKind,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  MessageChannel,
} from "@bpmn-lean/semantic-core";

import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import {
  asElement,
  asElementArray,
  hasOnlyOwnKeys,
  readId,
} from "./moddle-graph.js";
import type {
  ElementRecord,
} from "./moddle-graph.js";

const bpmnTypes = metamodelManifest.compilerProjection;

type MessageRootArtifacts = Readonly<{
  message: ElementRecord;
  interface: ElementRecord;
  operation: ElementRecord;
  channel: MessageChannel;
}>;

export type RootDefinitionSelection = Readonly<{
  process: ElementRecord;
  messageArtifacts: MessageRootArtifacts | undefined;
}>;

export function selectRootDefinitions(
  rootElements: ReadonlyArray<ElementRecord>,
  semanticProfile: string,
): RootDefinitionSelection | undefined {
  const processes = elementsOfType(rootElements, bpmnTypes.processType);
  const process = processes[0];
  if (process === undefined || processes.length !== 1) {
    return undefined;
  }
  if (semanticProfile !== SemanticProfileId.IntermediateCatchMessage) {
    return rootElements.length === 1
      ? { process, messageArtifacts: undefined }
      : undefined;
  }

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
      channel: { interfaceId, interfaceOperationId, messageId },
    },
  };
}

export function projectIntermediateCatchMessage(
  element: ElementRecord,
  id: string,
  artifacts: MessageRootArtifacts | undefined,
): Extract<
  CheckedNode,
  { kind: CheckedNodeKind.IntermediateCatchMessageEvent }
> | undefined {
  if (
    artifacts === undefined ||
    !hasOnlyOwnKeys(element, [
      "$type",
      "id",
      "name",
      "eventDefinitions",
    ])
  ) {
    return undefined;
  }
  const definitions = asElementArray(element.eventDefinitions);
  const definition = definitions?.[0];
  if (
    definitions?.length !== 1 ||
    definition === undefined ||
    definition.$type !== bpmnTypes.messageEventDefinitionType ||
    !hasOnlyOwnKeys(definition, ["$type", "id"]) ||
    readId(definition) === undefined ||
    definition.messageRef !== artifacts.message ||
    definition.operationRef !== artifacts.operation ||
    definition.eventDefinitionRef !== undefined ||
    definition.dataOutputs !== undefined ||
    definition.outputSet !== undefined ||
    definition.dataOutputAssociations !== undefined
  ) {
    return undefined;
  }
  return {
    kind: CheckedNodeKind.IntermediateCatchMessageEvent,
    id,
    channel: artifacts.channel,
  };
}

function elementsOfType(
  elements: ReadonlyArray<ElementRecord>,
  type: string,
): ReadonlyArray<ElementRecord> {
  return elements.filter((element) => element.$type === type);
}
