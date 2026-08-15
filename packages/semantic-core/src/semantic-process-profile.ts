import {
  CheckedNodeKind,
} from "./checked-process-contract.js";
import type { CheckedNode } from "./checked-process-contract.js";
import {
  requiredCheckedProcessShape,
} from "./checked-process-profile-shape.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation } from "./semantic-process-contract.js";
import {
  requiredProgramShape,
} from "./semantic-program-profile-shape.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import {
  EffectOperation,
  EffectProtocol,
} from "./semantic-value-contract.js";
import {
  hasExactOptionalUserTaskMetadata,
} from "./user-task-metadata.js";

export {
  SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
  SemanticProfileId,
} from "./semantic-profile-catalog.js";

/** Checks the exact operation capability selected by one reviewed profile. */
export function profileAllowsProgramShape(
  semanticProfile: string,
  actualOperations: ReadonlyArray<SemanticOperation>,
  definitionScopeCount: number,
): boolean {
  const required = requiredProgramShape(semanticProfile);
  return required !== undefined &&
    definitionScopeCount === required.definitionScopeCount &&
    sameCardinalities(
      actualOperations.map(({ kind }) => kind),
      required.operationKinds,
    ) &&
    profileAllowsProgramOperationDetails(semanticProfile, actualOperations);
}

function profileAllowsProgramOperationDetails(
  semanticProfile: string,
  operations: ReadonlyArray<SemanticOperation>,
): boolean {
  const userTaskMetadataMatchesProfile = operations.every((operation) =>
    operation.kind !== SemanticOperationKind.AwaitUserTask ||
    userTaskMetadataMatchesProfileSelection(semanticProfile, operation.task)
  );
  if (!userTaskMetadataMatchesProfile) {
    return false;
  }
  switch (semanticProfile) {
    case SemanticProfileId.UserTaskAssignmentFormMetadata:
    case SemanticProfileId.ParallelUserTaskAssignmentFormMetadata:
      return true;
    case SemanticProfileId.TimerStart:
      return operations.every(
        (operation) =>
          operation.kind !== SemanticOperationKind.InitiateTimer ||
          (operation.timer.durationMs === 1000 &&
            operation.outputs.length === 1),
      );
    case SemanticProfileId.MessageStart:
      return operations.every(
        (operation) =>
          operation.kind !== SemanticOperationKind.InitiateMessage ||
          operation.outputs.length === 1,
      );
    case SemanticProfileId.UserTaskCycle:
      return operations.every(
        (operation) =>
          operation.kind !== SemanticOperationKind.MergeExclusive ||
          operation.inputs.length === 3,
      );
    case SemanticProfileId.ConfiguredTask:
    case SemanticProfileId.ServiceTaskIncident:
    case SemanticProfileId.ServiceTaskIncidentCancellation:
      return operations.every(
        (operation) =>
          operation.kind !== SemanticOperationKind.AwaitEffect ||
          (hasProbeEffectDescriptor(operation.effect.descriptor) &&
            operation.effect.inputMappings.length === 0 &&
            operation.effect.outputMappings.length === 0 &&
            operation.bpmnErrorRoute === null),
      );
    default:
      return true;
  }
}

export function profileAllowsCheckedProcessShape(
  semanticProfile: string,
  nodes: ReadonlyArray<CheckedNode>,
  definitionScopeCount: number,
): boolean {
  const required = requiredCheckedProcessShape(semanticProfile);
  return required !== undefined &&
    definitionScopeCount === required.definitionScopeCount &&
    sameCardinalities(nodes.map(({ kind }) => kind), required.nodeKinds) &&
    nodes.every((node) =>
      node.kind !== CheckedNodeKind.TimerBoundaryEvent ||
      node.interruption === required.boundaryInterruption
    ) &&
    nodes.every((node) =>
      node.kind !== CheckedNodeKind.UserTask ||
      userTaskMetadataMatchesProfileSelection(semanticProfile, node)
    ) &&
    (semanticProfile !== SemanticProfileId.TimerStart ||
      nodes.every(
        (node) =>
          node.kind !== CheckedNodeKind.TimerStartEvent ||
          node.durationLiteral === "PT1S",
      )) &&
    (semanticProfile !== SemanticProfileId.ConfiguredTask ||
      nodes.every(
        (node) =>
          node.kind !== CheckedNodeKind.ConfiguredTask ||
          hasProbeEffectDescriptor(node.descriptor),
      )) &&
    ((semanticProfile !== SemanticProfileId.ServiceTaskIncident &&
        semanticProfile !==
          SemanticProfileId.ServiceTaskIncidentCancellation) ||
      nodes.every(
        (node) =>
          node.kind !== CheckedNodeKind.ServiceTask ||
          (hasProbeEffectDescriptor(node.descriptor) &&
            node.inputMappings.length === 0 &&
            node.outputMappings.length === 0 &&
            node.bpmnErrorRoute === null),
      ));
}

function userTaskMetadataMatchesProfileSelection(
  semanticProfile: string,
  task: Readonly<Record<string, unknown>>,
): boolean {
  switch (semanticProfile) {
    case SemanticProfileId.ParallelUserTaskAssignmentFormMetadata:
      return Object.hasOwn(task, "metadata") &&
        hasExactOptionalUserTaskMetadata(task);
    case SemanticProfileId.UserTaskAssignmentFormMetadata:
      return hasExactOptionalUserTaskMetadata(task);
    default:
      return !Object.hasOwn(task, "metadata");
  }
}

function hasProbeEffectDescriptor(
  descriptor: Readonly<{ protocol: string; operation: string }>,
): boolean {
  return descriptor.protocol === EffectProtocol.Activity &&
    descriptor.operation === EffectOperation.Probe;
}

function sameCardinalities<T>(
  actual: ReadonlyArray<T>,
  required: ReadonlyArray<T>,
): boolean {
  return actual.length === required.length &&
    required.every(
      (item) =>
        actual.filter((candidate) => candidate === item).length ===
          required.filter((candidate) => candidate === item).length,
    );
}
