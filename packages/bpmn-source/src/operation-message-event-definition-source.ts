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
  const definitions = asElementArray(element.eventDefinitions);
  const definition = definitions?.[0];
  const matches = artifacts?.filter(isOperationMessageRootArtifacts).filter(
    (candidate) => definition?.messageRef === candidate.message &&
      definition?.operationRef === candidate.operation,
  );
  const matched = matches?.length === 1 ? matches[0] : undefined;
  if (
    matched === undefined ||
    definitions?.length !== 1 ||
    definition === undefined ||
    definition.$type !== bpmnTypes.messageEventDefinitionType ||
    !hasOnlyModelledKeys(definition, ["$type", "id"]) ||
    readId(definition) === undefined ||
    definition.eventDefinitionRef !== undefined ||
    definition.dataOutputs !== undefined ||
    definition.outputSet !== undefined ||
    definition.dataOutputAssociations !== undefined
  ) {
    return undefined;
  }
  return matched.channel;
}
