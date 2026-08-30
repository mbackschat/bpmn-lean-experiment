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
import { verifyMergeExclusiveBindings } from "./merge-exclusive-artifact-consistency.ts";
import { verifyTerminateScopeBindings } from "./end-operation-artifact-consistency.ts";
import { verifyEffectOperationBindings } from "./effect-operation-artifact-consistency.ts";
import { verifyPayloadMessageCatchBindings } from "./message-payload-catch-artifact-consistency.ts";
import {
  referencedStartControlPlaces,
  verifyCanonicalStartOperationOrder,
  verifyStartOperationBindings,
} from "./start-operation-artifact-consistency.ts";

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

function requireSortedByField(
  label: string,
  values: ReadonlyArray<Readonly<Record<string, string>>>,
  field: string,
): void {
  const sorted = [...values].sort((left, right) =>
    compareCanonicalStrings(left[field] ?? "", right[field] ?? "")
  );
  if (!isDeepStrictEqual(values, sorted)) {
    throw new Error(`${label} must be sorted by ${field}`);
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
  const startPlaces = referencedStartControlPlaces(operation);
  if (startPlaces !== undefined) {
    return startPlaces;
  }
  switch (operation.kind) {
    case "enterScope":
      return [operation.input, operation.childEntry];
    case "invokeProcess":
      return [operation.input, operation.calledEntry];
    case "returnProcess":
      return [operation.callerOutput];
    case "awaitUserTask":
    case "awaitTimer":
    case "awaitMessage":
    case "awaitPayloadMessage":
    case "awaitEffect":
      return [operation.input, operation.output];
    case "duplicate":
      return [operation.input, ...operation.outputs];
    case "synchronize":
      return [...operation.inputs, operation.output];
    case "mergeExclusive":
      return [...operation.inputs, operation.output];
    case "choose":
      return [
        operation.input,
        ...operation.candidates.map(({ output }) => output),
        operation.defaultOutput,
      ];
    case "selectMany":
      return [
        operation.input,
        ...operation.candidates.flatMap(({ output, expectedJoinInput }) => [
          output,
          expectedJoinInput,
        ]),
        operation.defaultBranch.output,
        operation.defaultBranch.expectedJoinInput,
      ];
    case "synchronizeSelected":
      return [...operation.inputs, operation.output];
    case "throwError":
      return [operation.input, operation.handler.output];
    case "reachNoneEnd":
    case "terminateScope":
      return [operation.input];
    case "completeScope":
      return operation.parentOutput === null ? [] : [operation.parentOutput];
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
    "checked process definition scopes",
    checkedProcess.definitionScopes,
  );
  requireSortedByField(
    "checked process node scopes",
    checkedProcess.nodeScopes,
    "nodeId",
  );
  requireSortedByField(
    "checked process Sequence Flow scopes",
    checkedProcess.sequenceFlowScopes,
    "sequenceFlowId",
  );
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
  requireSortedById(
    "semantic process definition scopes",
    semanticProcess.definitionScopes,
  );
  requireSortedByField(
    "semantic process operation scopes",
    semanticProcess.operationScopes,
    "operationId",
  );
  requireSortedByField(
    "semantic process control-place scopes",
    semanticProcess.controlPlaceScopes,
    "controlPlaceId",
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
      case "mergeExclusive":
        requireSortedStrings(
          `operation ${operation.id} inputs`,
          operation.inputs,
        );
        break;
      case "choose":
        break;
      case "selectMany":
        requireSortedStrings(
          `operation ${operation.id} candidate origins`,
          operation.candidates.map(({ origin }) => origin.elementId),
        );
        break;
      case "synchronizeSelected":
        requireSortedStrings(
          `operation ${operation.id} inputs`,
          operation.inputs,
        );
        break;
      case "initiateMessage":
      case "initiateTimer":
        verifyCanonicalStartOperationOrder(
          operation,
          compareCanonicalStrings,
        );
        break;
      case "initiate":
      case "enterScope":
      case "invokeProcess":
      case "returnProcess":
      case "awaitUserTask":
      case "awaitTimer":
      case "awaitMessage":
      case "awaitPayloadMessage":
      case "awaitEffect":
      case "throwError":
      case "reachNoneEnd":
      case "terminateScope":
      case "completeScope":
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
  verifyMergeExclusiveBindings(
    checkedProcess,
    semanticProcess,
    compareCanonicalStrings,
  );
  const nodeIds = requireUniqueIds(
    "checked process nodes",
    checkedProcess.nodes,
  );
  const flowIds = requireUniqueIds(
    "checked process sequence flows",
    checkedProcess.sequenceFlows,
  );
  const flowSourceIds = new Set(nodeIds);
  for (const node of checkedProcess.nodes) {
    if (node.kind === "serviceTask" && node.bpmnErrorRoute !== null) {
      flowSourceIds.add(node.bpmnErrorRoute.boundaryEventId);
    }
  }
  const definitionOriginIds = new Set(
    checkedProcess.definitionScopes.map(({ originElementId }) =>
      originElementId
    ),
  );
  for (const flow of checkedProcess.sequenceFlows) {
    if (!flowSourceIds.has(flow.sourceId)) {
      throw new Error(
        `checked process flow ${flow.id} references unknown source locus ${flow.sourceId}`,
      );
    }
    if (!nodeIds.has(flow.targetId)) {
      throw new Error(
        `checked process flow ${flow.id} references unknown target node ${flow.targetId}`,
      );
    }
  }
  for (const node of checkedProcess.nodes) {
    switch (node.kind) {
      case "exclusiveGateway":
      case "inclusiveGateway":
        if (node.direction === "diverging") {
          for (const flowId of [...node.candidateFlowIds, node.defaultFlowId]) {
            if (!flowIds.has(flowId)) {
              throw new Error(
                `checked ${node.kind} ${node.id} references unknown Sequence Flow ${flowId}`,
              );
            }
          }
        } else if (!nodeIds.has(node.pairedGatewayId)) {
          throw new Error(
            `checked Inclusive Gateway ${node.id} references unknown paired Gateway ${node.pairedGatewayId}`,
          );
        }
        break;
      case "callActivity":
        if (!definitionOriginIds.has(node.calledProcessId)) {
          throw new Error(
            `checked Call Activity ${node.id} references unknown called Process ${node.calledProcessId}`,
          );
        }
        break;
      case "serviceTask": {
        const route = node.bpmnErrorRoute;
        if (route !== null) {
          const outputFlow = checkedProcess.sequenceFlows.find(
            ({ id }) => id === route.outputFlowId,
          );
          if (
            route.attachedToRef !== node.id ||
            outputFlow?.sourceId !== route.boundaryEventId
          ) {
            throw new Error(
              `checked Service Task ${node.id} has an inconsistent BPMN Error route`,
            );
          }
        }
        break;
      }
      default:
        break;
    }
  }

  const inclusiveSelections = semanticProcess.operations.filter(
    (operation) => operation.kind === "selectMany",
  );
  const inclusiveJoins = semanticProcess.operations.filter(
    (operation) => operation.kind === "synchronizeSelected",
  );
  for (const selection of inclusiveSelections) {
    const split = checkedProcess.nodes.find(({ id }) => id === selection.origin.elementId);
    const joins = inclusiveJoins.filter(({ selectionKey }) => selectionKey === selection.selectionKey);
    const join = joins[0];
    const checkedJoin = join === undefined
      ? undefined
      : checkedProcess.nodes.find(({ id }) => id === join.origin.elementId);
    if (
      split?.kind !== "inclusiveGateway" ||
      split.direction !== "diverging" ||
      selection.selectionKey !== split.id ||
      joins.length !== 1 ||
      join === undefined ||
      checkedJoin?.kind !== "inclusiveGateway" ||
      checkedJoin.direction !== "converging" ||
      checkedJoin.pairedGatewayId !== split.id
    ) {
      throw new Error(`operation ${selection.id} has no exact paired Inclusive Gateway join`);
    }
    const branches = [...selection.candidates, selection.defaultBranch];
    for (const branch of branches) {
      const splitFlow = checkedProcess.sequenceFlows.find(({ id }) => id === branch.origin.elementId);
      const expectedPlace = semanticProcess.controlPlaces.find(({ id }) => id === branch.expectedJoinInput);
      const joinFlow = splitFlow === undefined
        ? undefined
        : checkedProcess.sequenceFlows.find(
            ({ sourceId, targetId }) =>
              sourceId === splitFlow.targetId && targetId === checkedJoin.id,
          );
      if (
        splitFlow?.sourceId !== split.id ||
        joinFlow === undefined ||
        expectedPlace?.origin.elementId !== joinFlow.id
      ) {
        throw new Error(
          `operation ${selection.id} branch ${branch.origin.elementId} differs from its paired join input`,
        );
      }
    }
  }

  const checkedCalls = checkedProcess.nodes.filter(
    (node) => node.kind === "callActivity",
  );
  const invokes = semanticProcess.operations.filter(
    (operation) => operation.kind === "invokeProcess",
  );
  const returns = semanticProcess.operations.filter(
    (operation) => operation.kind === "returnProcess",
  );
  for (const checkedCall of checkedCalls) {
    const matchingInvokes = invokes.filter(
      ({ origin }) => origin.elementId === checkedCall.id,
    );
    const invoke = matchingInvokes[0];
    const matchingReturns = invoke === undefined
      ? []
      : returns.filter(({ id }) => id === invoke.returnOperationId);
    const returned = matchingReturns[0];
    const calledRoot = checkedProcess.definitionScopes.find(
      ({ id, parentScopeId, originElementId }) =>
        id === invoke?.calledRootScopeId &&
        parentScopeId === null &&
        originElementId === checkedCall.calledProcessId,
    );
    const callerScopeId = checkedProcess.nodeScopes.find(
      ({ nodeId }) => nodeId === checkedCall.id,
    )?.scopeId;
    const operationOwner = (operationId: string): string | undefined =>
      semanticProcess.operationScopes.find(({ operationId: candidate }) =>
        candidate === operationId
      )?.scopeId;
    const placeOwner = (controlPlaceId: string): string | undefined =>
      semanticProcess.controlPlaceScopes.find(({ controlPlaceId: candidate }) =>
        candidate === controlPlaceId
      )?.scopeId;
    if (
      matchingInvokes.length !== 1 ||
      invoke === undefined ||
      matchingReturns.length !== 1 ||
      returned === undefined ||
      calledRoot === undefined ||
      invoke.calledProcessId !== checkedCall.calledProcessId ||
      returned.origin.elementId !== checkedCall.id ||
      returned.calledProcessId !== checkedCall.calledProcessId ||
      returned.calledRootScopeId !== calledRoot.id ||
      callerScopeId === undefined ||
      operationOwner(invoke.id) !== callerScopeId ||
      operationOwner(returned.id) !== calledRoot.id ||
      placeOwner(invoke.input) !== callerScopeId ||
      placeOwner(invoke.calledEntry) !== calledRoot.id ||
      placeOwner(returned.callerOutput) !== callerScopeId
    ) {
      throw new Error(
        `checked Call Activity ${checkedCall.id} has no exact invocation/return binding`,
      );
    }
  }
  if (invokes.length !== checkedCalls.length || returns.length !== checkedCalls.length) {
    throw new Error("Call Activity operation cardinality differs from checked source");
  }

  verifyStartOperationBindings(
    checkedProcess,
    semanticProcess,
    compareCanonicalStrings,
  );
  verifyTerminateScopeBindings(checkedProcess, semanticProcess);
  verifyEffectOperationBindings(checkedProcess, semanticProcess);
  verifyPayloadMessageCatchBindings(checkedProcess, semanticProcess);

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
    if (
      !nodeIds.has(operation.origin.elementId) &&
      !definitionOriginIds.has(operation.origin.elementId)
    ) {
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
      (operation.kind === "awaitMessage" ||
        operation.kind === "awaitPayloadMessage") &&
      operation.message.elementId !== operation.origin.elementId
    ) {
      throw new Error(
        `operation ${operation.id} Message identity differs from its BPMN origin`,
      );
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
    if (operation.kind === "selectMany") {
      const origins = [
        ...operation.candidates.map(({ output, origin }) => ({ output, origin })),
        { output: operation.defaultBranch.output, origin: operation.defaultBranch.origin },
      ];
      for (const { output, origin } of origins) {
        const place = semanticProcess.controlPlaces.find(({ id }) => id === output);
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
