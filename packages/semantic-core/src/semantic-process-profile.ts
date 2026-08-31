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
import {
  SemanticProfileId,
} from "./semantic-profile-catalog.js";
import {
  EffectOperation,
  EffectProtocol,
  SimpleBooleanExpressionKind,
} from "./semantic-value-contract.js";
import {
  isAssignmentFormUserTaskMetadata,
  isAssignmentOnlyUserTaskMetadata,
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
    case SemanticProfileId.StructuredHumanWork:
      return hasExactStructuredHumanWorkProgram(operations);
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
    case SemanticProfileId.ActivityBoundaryMessage:
      return hasExactActivityBoundaryMessageProgram(operations);
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

function hasExactActivityBoundaryMessageProgram(
  operations: ReadonlyArray<SemanticOperation>,
): boolean {
  const starts = operations.filter(
    (operation): operation is Extract<SemanticOperation, { kind: SemanticOperationKind.Initiate }> =>
      operation.kind === SemanticOperationKind.Initiate,
  );
  const bounded = operations.filter(
    (operation): operation is Extract<SemanticOperation, { kind: SemanticOperationKind.AwaitMessageBoundedUserTask }> =>
      operation.kind === SemanticOperationKind.AwaitMessageBoundedUserTask,
  );
  const tasks = operations.filter(
    (operation): operation is Extract<SemanticOperation, { kind: SemanticOperationKind.AwaitUserTask }> =>
      operation.kind === SemanticOperationKind.AwaitUserTask,
  );
  const ends = operations.filter(
    (operation): operation is Extract<SemanticOperation, { kind: SemanticOperationKind.ReachNoneEnd }> =>
      operation.kind === SemanticOperationKind.ReachNoneEnd,
  );
  const start = starts[0];
  const host = bounded[0];
  if (
    starts.length !== 1 || start === undefined || bounded.length !== 1 ||
    host === undefined || tasks.length !== 2 || ends.length !== 2
  ) {
    return false;
  }
  const normalFollowUp = tasks.find(({ input }) => input === host.task.output);
  const boundaryFollowUp = tasks.find(
    ({ input }) => input === host.boundaryMessage.output,
  );
  return start.output === host.input && normalFollowUp !== undefined &&
    boundaryFollowUp !== undefined && normalFollowUp.id !== boundaryFollowUp.id &&
    ends.filter(({ input }) => input === normalFollowUp.output).length === 1 &&
    ends.filter(({ input }) => input === boundaryFollowUp.output).length === 1 &&
    normalFollowUp.output !== boundaryFollowUp.output;
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
      (node.kind !== CheckedNodeKind.TimerBoundaryEvent &&
        node.kind !== CheckedNodeKind.MessageBoundaryEvent) ||
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
        isAssignmentFormUserTaskMetadata(task.metadata);
    case SemanticProfileId.UserTaskAssignmentFormMetadata:
      return Object.hasOwn(task, "metadata") &&
        isAssignmentFormUserTaskMetadata(task.metadata);
    case SemanticProfileId.StructuredHumanWork:
      return Object.hasOwn(task, "metadata") &&
        isAssignmentOnlyUserTaskMetadata(task.metadata);
    default:
      return !Object.hasOwn(task, "metadata");
  }
}

function hasExactStructuredHumanWorkProgram(
  operations: ReadonlyArray<SemanticOperation>,
): boolean {
  const initiate = operations.find(
    ({ kind }) => kind === SemanticOperationKind.Initiate,
  );
  const task = operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
  );
  const choose = operations.find(
    ({ kind }) => kind === SemanticOperationKind.Choose,
  );
  const ends = operations.filter(
    ({ kind }) => kind === SemanticOperationKind.ReachNoneEnd,
  );
  if (
    initiate?.kind !== SemanticOperationKind.Initiate ||
    task?.kind !== SemanticOperationKind.AwaitUserTask ||
    choose?.kind !== SemanticOperationKind.Choose ||
    ends.length !== 3
  ) {
    return false;
  }
  const endInputs = new Set(ends.map((end) =>
    end.kind === SemanticOperationKind.ReachNoneEnd ? end.input : ""
  ));
  return initiate.output === task.input &&
    task.output === choose.input &&
    choose.candidates.length === 2 &&
    choose.candidates.every(
      ({ condition }) =>
        condition.kind === SimpleBooleanExpressionKind.StringEquals,
    ) &&
    endInputs.size === 3 &&
    choose.candidates.every(({ output }) => endInputs.has(output)) &&
    endInputs.has(choose.defaultOutput);
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
