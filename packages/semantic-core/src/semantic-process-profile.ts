import { serialBusinessProgramShape, serialBusinessCheckedShape } from "./serial-business-task-admission.js";
import { SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";
import { transactionCancellationProgramShape } from "./transaction-cancellation-admission.js";
import { CallDataKind } from "./call-data-contract.js";
import { structuredCompositionCheckedShape, structuredCompositionProgramShape } from "./structured-process-composition-admission.js";
import { CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID, STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";
import { repeatableSubscriptionCheckedShape, repeatableSubscriptionProgramShape } from "./repeatable-subscription-admission.js";
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
  TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID,
  REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
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
  SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID,
  INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID,
  CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID,
  STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID,
  TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID,
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
  SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
  SemanticProfileId,
} from "./semantic-profile-catalog.js";

/** Checks the exact operation capability selected by one reviewed profile. */
export function profileAllowsProgramShape(
  semanticProfile: string,
  actualOperations: ReadonlyArray<SemanticOperation>,
  definitionScopeCount: number,
): boolean {
  if (semanticProfile === SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID) return serialBusinessProgramShape(actualOperations, definitionScopeCount);
  if (semanticProfile === STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID) {
    return structuredCompositionProgramShape(actualOperations, definitionScopeCount);
  }
  if (semanticProfile === TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID) {
    return transactionCancellationProgramShape(actualOperations, definitionScopeCount);
  }
  if (semanticProfile === REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID) {
    return repeatableSubscriptionProgramShape(actualOperations, definitionScopeCount);
  }
  const required = requiredProgramShape(semanticProfile);
  const scalarCalls = semanticProfile === CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID;
  return required !== undefined &&
    definitionScopeCount === required.definitionScopeCount &&
    (scalarCalls || actualOperations.every(hasPropertyActivityOperationEndpoints)) &&
    actualOperations.every((operation) =>
      (operation.kind !== SemanticOperationKind.InvokeProcess && operation.kind !== SemanticOperationKind.ReturnProcess) ||
      operation.data.kind === (scalarCalls ? CallDataKind.Scalar : CallDataKind.Empty)) &&
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
  if (semanticProfile === SERIAL_BUSINESS_TASK_CHECKPOINT_PROFILE_ID) return serialBusinessCheckedShape(nodes, definitionScopeCount);
  if (semanticProfile === STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID) {
    return structuredCompositionCheckedShape(nodes, definitionScopeCount);
  }
  if (semanticProfile === REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID) {
    return repeatableSubscriptionCheckedShape(nodes, definitionScopeCount);
  }
  const required = requiredCheckedProcessShape(semanticProfile);
  const scalarCalls = semanticProfile === CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID;
  return required !== undefined &&
    definitionScopeCount === required.definitionScopeCount &&
    (scalarCalls || nodes.every(hasPropertyActivityNodeEndpoints)) &&
    nodes.every((node) => node.kind !== CheckedNodeKind.CallActivity ||
      node.data.kind === (scalarCalls ? CallDataKind.Scalar : CallDataKind.Empty)) &&
    sameCardinalities(nodes.map(({ kind }) => kind), required.nodeKinds) &&
    nodes.every((node) =>
      (node.kind !== CheckedNodeKind.TimerBoundaryEvent &&
        node.kind !== CheckedNodeKind.MessageBoundaryEvent) ||
      (node.interruption === required.boundaryInterruption &&
        (node.kind !== CheckedNodeKind.TimerBoundaryEvent ||
          (node.durationLiteral === "PT1S" && !Object.hasOwn(node, "cycleLiteral"))))
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

function hasPropertyActivityOperationEndpoints(operation: SemanticOperation): boolean {
  switch (operation.kind) {
    case SemanticOperationKind.AwaitDataInputUserTask:
      return operation.directInput.source.kind === "property";
    case SemanticOperationKind.AwaitDataOutputUserTask:
      return operation.directOutput.target.kind === "property";
    case SemanticOperationKind.AwaitDataInputOutputUserTask:
      return operation.directInput.source.kind === "property" && operation.directOutput.target.kind === "property";
    default:
      return true;
  }
}

function hasPropertyActivityNodeEndpoints(node: CheckedNode): boolean {
  switch (node.kind) {
    case CheckedNodeKind.DataInputUserTask:
      return node.directInput.source.kind === "property";
    case CheckedNodeKind.DataOutputUserTask:
      return node.directOutput.target.kind === "property";
    case CheckedNodeKind.DataInputOutputUserTask:
      return node.directInput.source.kind === "property" && node.directOutput.target.kind === "property";
    default:
      return true;
  }
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
