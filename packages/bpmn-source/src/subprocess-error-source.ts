import {
  CheckedNodeKind,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
  ErrorReference,
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
const selectedErrorCode = "ScopedFailure";

export function projectErrorEndEvent(
  element: ElementRecord,
  id: string,
  errorArtifact: ElementRecord | undefined,
): Extract<CheckedNode, { kind: CheckedNodeKind.ErrorEndEvent }> | undefined {
  if (
    !hasOnlyOwnKeys(element, ["$type", "id", "name", "eventDefinitions"])
  ) {
    return undefined;
  }
  const error = projectErrorReference(element.eventDefinitions, errorArtifact);
  return error === undefined
    ? undefined
    : { kind: CheckedNodeKind.ErrorEndEvent, id, error };
}

export function projectBoundaryErrorEvent(
  element: ElementRecord,
  id: string,
  errorArtifact: ElementRecord | undefined,
  flows: ReadonlyArray<CheckedSequenceFlow>,
): Extract<
  CheckedNode,
  { kind: CheckedNodeKind.BoundaryErrorEvent }
> | undefined {
  if (
    element.cancelActivity !== true ||
    !hasOnlyOwnKeys(element, [
      "$type",
      "id",
      "name",
      "cancelActivity",
      "eventDefinitions",
    ])
  ) {
    return undefined;
  }
  const attached = asElement(element.attachedToRef);
  const attachedToRef = attached === undefined ? undefined : readId(attached);
  const error = projectErrorReference(element.eventDefinitions, errorArtifact);
  const outputs = flows.filter(({ sourceId }) => sourceId === id);
  const output = outputs[0];
  return attachedToRef === undefined ||
      error === undefined ||
      outputs.length !== 1 ||
      output === undefined
    ? undefined
    : {
        kind: CheckedNodeKind.BoundaryErrorEvent,
        id,
        attachedToRef,
        error,
        outputFlowId: output.id,
      };
}

export function hasDistinctErrorIdentity(
  nodes: ReadonlyArray<CheckedNode>,
  occupiedIds: ReadonlyArray<string>,
): boolean {
  const errorNodes = nodes.filter(isCheckedErrorNode);
  if (errorNodes.length === 0) {
    return true;
  }
  const errorElementIds = new Set(
    errorNodes.map(({ error }) => error.errorElementId),
  );
  const errorDefinitionIds = errorNodes.map(
    ({ error }) => error.errorDefinitionId,
  );
  const identities = [
    ...occupiedIds,
    ...errorElementIds,
    ...errorDefinitionIds,
  ];
  return errorElementIds.size === 1 &&
    new Set(errorDefinitionIds).size === errorDefinitionIds.length &&
    new Set(identities).size === identities.length;
}

function projectErrorReference(
  rawDefinitions: unknown,
  errorArtifact: ElementRecord | undefined,
): ErrorReference | undefined {
  const definitions = asElementArray(rawDefinitions);
  const definition = definitions?.[0];
  const referencedError = asElement(definition?.errorRef);
  const errorDefinitionId =
    definition === undefined ? undefined : readId(definition);
  const errorElementId =
    errorArtifact === undefined ? undefined : readId(errorArtifact);
  if (
    definitions?.length !== 1 ||
    definition?.$type !== bpmnTypes.errorEventDefinitionType ||
    !hasOnlyOwnKeys(definition, ["$type", "id"]) ||
    errorDefinitionId === undefined ||
    referencedError !== errorArtifact ||
    errorArtifact?.$type !== bpmnTypes.errorType ||
    !hasOnlyOwnKeys(errorArtifact, ["$type", "id", "name", "errorCode"]) ||
    errorElementId === undefined ||
    errorArtifact.errorCode !== selectedErrorCode ||
    (errorArtifact.name !== undefined && typeof errorArtifact.name !== "string")
  ) {
    return undefined;
  }
  return {
    errorDefinitionId,
    errorElementId,
    code: selectedErrorCode,
  };
}

function isCheckedErrorNode(
  node: CheckedNode,
): node is Extract<
  CheckedNode,
  {
    kind:
      | CheckedNodeKind.ErrorEndEvent
      | CheckedNodeKind.BoundaryErrorEvent;
  }
> {
  return node.kind === CheckedNodeKind.ErrorEndEvent ||
    node.kind === CheckedNodeKind.BoundaryErrorEvent;
}
