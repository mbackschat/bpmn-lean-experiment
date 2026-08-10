import {
  MessageChannelKind,
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
  isOperationMessageRootArtifacts,
} from "./root-definition-selection.js";
import type {
  MessageRootArtifacts,
} from "./root-definition-selection.js";

const bpmnTypes = metamodelManifest.compilerProjection;

/** Resolves one inline, payload-free Message Event Definition to its exact operation channel. */
export function resolveOperationMessageEventDefinition(
  element: ElementRecord,
  artifacts: MessageRootArtifacts | undefined,
): Extract<
  MessageChannel,
  { kind: typeof MessageChannelKind.OperationMessage }
> | undefined {
  if (!isOperationMessageRootArtifacts(artifacts)) {
    return undefined;
  }
  const definitions = asElementArray(element.eventDefinitions);
  const definition = definitions?.[0];
  if (
    definitions?.length !== 1 ||
    definition === undefined ||
    definition.$type !== bpmnTypes.messageEventDefinitionType ||
    !hasOnlyModelledKeys(definition, ["$type", "id"]) ||
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
  return artifacts.channel;
}
