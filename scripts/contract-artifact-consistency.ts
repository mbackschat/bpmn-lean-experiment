/**
 * Cross-artifact reference and canonical-order consistency checks.
 */
import { isDeepStrictEqual } from "node:util";

import type {
  CheckedProcess,
  SemanticOperation,
  SemanticProcessProgram,
} from "../packages/semantic-core/src/index.ts";
import {
  requireUnicodeScalarString,
} from "./strict-json.ts";

function compareIds(
  left: Readonly<{ id: string }>,
  right: Readonly<{ id: string }>,
): number {
  return compareCanonicalStrings(left.id, right.id);
}

function requireSortedById<Value extends Readonly<{ id: string }>>(
  label: string,
  values: ReadonlyArray<Value>,
): void {
  const sorted = [...values].sort(compareIds);
  if (!isDeepStrictEqual(values, sorted)) {
    throw new Error(`${label} must be sorted by id`);
  }
}

function requireSortedStrings(
  label: string,
  values: ReadonlyArray<string>,
): void {
  const sorted = [...values].sort(compareCanonicalStrings);
  if (!isDeepStrictEqual(values, sorted)) {
    throw new Error(`${label} must be sorted`);
  }
}

function requireUniqueIds<Value extends Readonly<{ id: string }>>(
  label: string,
  values: ReadonlyArray<Value>,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) {
      throw new Error(`${label} contains duplicate id ${value.id}`);
    }
    ids.add(value.id);
  }
  return ids;
}

function referencedControlPlaces(
  operation: SemanticOperation,
): ReadonlyArray<string> {
  switch (operation.kind) {
    case "initiate":
      return [operation.output];
    case "awaitUserTask":
    case "awaitTimer":
    case "awaitEffect":
      return [operation.input, operation.output];
    case "duplicate":
      return [operation.input, ...operation.outputs];
    case "synchronize":
      return [...operation.inputs, operation.output];
    case "choose":
      return [
        operation.input,
        ...operation.candidates.map(({ output }) => output),
        operation.defaultOutput,
      ];
    case "terminate":
      return [operation.input];
    default:
      throw new Error("unsupported semantic operation");
  }
}

export function verifyCanonicalDefinitionOrder(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
): void {
  requireSortedById("checked process nodes", checkedProcess.nodes);
  requireSortedById(
    "checked process sequence flows",
    checkedProcess.sequenceFlows,
  );
  requireSortedById(
    "semantic process control places",
    semanticProcess.controlPlaces,
  );
  requireSortedById(
    "semantic process operations",
    semanticProcess.operations,
  );
  for (const operation of semanticProcess.operations) {
    switch (operation.kind) {
      case "duplicate":
        requireSortedStrings(
          `operation ${operation.id} outputs`,
          operation.outputs,
        );
        break;
      case "synchronize":
        requireSortedStrings(
          `operation ${operation.id} inputs`,
          operation.inputs,
        );
        break;
      case "choose":
        break;
      case "initiate":
      case "awaitUserTask":
      case "awaitTimer":
      case "awaitEffect":
      case "terminate":
        break;
      default:
        throw new Error("unsupported semantic operation");
    }
  }
}

export function verifyDefinitionReferences(
  checkedProcess: CheckedProcess,
  semanticProcess: SemanticProcessProgram,
): void {
  const nodeIds = requireUniqueIds(
    "checked process nodes",
    checkedProcess.nodes,
  );
  const flowIds = requireUniqueIds(
    "checked process sequence flows",
    checkedProcess.sequenceFlows,
  );
  for (const flow of checkedProcess.sequenceFlows) {
    if (!nodeIds.has(flow.sourceId)) {
      throw new Error(
        `checked process flow ${flow.id} references unknown source node ${flow.sourceId}`,
      );
    }
    if (!nodeIds.has(flow.targetId)) {
      throw new Error(
        `checked process flow ${flow.id} references unknown target node ${flow.targetId}`,
      );
    }
  }
  for (const node of checkedProcess.nodes) {
    if (node.kind !== "exclusiveGateway") {
      continue;
    }
    for (const flowId of [
      ...node.candidateFlowIds,
      node.defaultFlowId,
    ]) {
      if (!flowIds.has(flowId)) {
        throw new Error(
          `checked Exclusive Gateway ${node.id} references unknown Sequence Flow ${flowId}`,
        );
      }
    }
  }

  const placeIds = requireUniqueIds(
    "semantic process control places",
    semanticProcess.controlPlaces,
  );
  requireUniqueIds(
    "semantic process operations",
    semanticProcess.operations,
  );
  for (const place of semanticProcess.controlPlaces) {
    if (!flowIds.has(place.origin.elementId)) {
      throw new Error(
        `control place ${place.id} references unknown Sequence Flow origin ${place.origin.elementId}`,
      );
    }
  }
  for (const operation of semanticProcess.operations) {
    if (!nodeIds.has(operation.origin.elementId)) {
      throw new Error(
        `operation ${operation.id} references unknown BPMN element origin ${operation.origin.elementId}`,
      );
    }
    for (const placeId of referencedControlPlaces(operation)) {
      if (!placeIds.has(placeId)) {
        throw new Error(
          `operation ${operation.id} references unknown control place ${placeId}`,
        );
      }
    }
    if (
      operation.kind === "awaitUserTask" &&
      operation.task.elementId !== operation.origin.elementId
    ) {
      throw new Error(
        `operation ${operation.id} task identity differs from its BPMN origin`,
      );
    }
    if (
      operation.kind === "awaitTimer" &&
      operation.timer.elementId !== operation.origin.elementId
    ) {
      throw new Error(
        `operation ${operation.id} timer identity differs from its BPMN origin`,
      );
    }
    if (
      operation.kind === "awaitEffect" &&
      operation.effect.elementId !== operation.origin.elementId
    ) {
      throw new Error(
        `operation ${operation.id} effect identity differs from its BPMN origin`,
      );
    }
    if (operation.kind === "awaitEffect") {
      const checkedNode = checkedProcess.nodes.find(
        ({ id }) => id === operation.origin.elementId,
      );
      if (
        checkedNode?.kind !== "serviceTask" ||
        !isDeepStrictEqual(
          checkedNode.descriptor,
          operation.effect.descriptor,
        )
      ) {
        throw new Error(
          `operation ${operation.id} effect descriptor differs from its checked BPMN origin`,
        );
      }
    }
    if (operation.kind === "choose") {
      const origins = [
        ...operation.candidates.map(({ output, origin }) => ({
          output,
          origin,
        })),
        {
          output: operation.defaultOutput,
          origin: operation.defaultOrigin,
        },
      ];
      for (const { output, origin } of origins) {
        const place = semanticProcess.controlPlaces.find(
          ({ id }) => id === output,
        );
        if (place?.origin.elementId !== origin.elementId) {
          throw new Error(
            `operation ${operation.id} branch origin differs from its control place`,
          );
        }
      }
    }
  }
}

export function compareCanonicalStrings(
  left: string,
  right: string,
): number {
  requireUnicodeScalarString(left, "canonical string");
  requireUnicodeScalarString(right, "canonical string");
  const leftScalars = [...left];
  const rightScalars = [...right];
  const sharedLength = Math.min(
    leftScalars.length,
    rightScalars.length,
  );
  for (let index = 0; index < sharedLength; index += 1) {
    const leftValue = leftScalars[index];
    const rightValue = rightScalars[index];
    if (leftValue === undefined || rightValue === undefined) {
      throw new Error(
        "canonical scalar iteration lost an indexed value",
      );
    }
    const leftScalar = leftValue.codePointAt(0);
    const rightScalar = rightValue.codePointAt(0);
    if (leftScalar === undefined || rightScalar === undefined) {
      throw new Error("canonical scalar has no code point");
    }
    if (leftScalar !== rightScalar) {
      return leftScalar < rightScalar ? -1 : 1;
    }
  }
  return Math.sign(leftScalars.length - rightScalars.length);
}
