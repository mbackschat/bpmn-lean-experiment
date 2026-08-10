import {
  BoundaryInterruption,
  CheckedNodeKind,
} from "./checked-process-contract.js";
import type { CheckedNode } from "./checked-process-contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation } from "./semantic-process-contract.js";

export const SemanticProfileId = Object.freeze({
  ActivityBoundaryTimer:
    "bpmn-2.0.2-activity-boundary-timer-draft",
  MappedBoundaryErrorServiceTask:
    "cibseven-2.0.0-mapped-boundary-error-service-task-draft",
  CalledProcessCallActivity:
    "bpmn-2.0.2-called-process-call-activity-draft",
  MappedSuccessServiceTask:
    "cibseven-2.0.0-mapped-success-service-task-draft",
  MessageStart: "bpmn-2.0.2-message-start-event-draft",
  EmbeddedSubProcessCompletion:
    "cibseven-2.2.0-embedded-subprocess-completion-draft",
  SubProcessBoundaryTimer:
    "bpmn-2.0.2-subprocess-boundary-timer-draft",
  SubProcessErrorPropagation:
    "cibseven-2.2.0-subprocess-error-propagation-draft",
  ExclusiveGatewaySimpleBoolean:
    "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft",
  InclusiveGatewaySelectedBranches:
    "bpmn-2.0.2-inclusive-gateway-selected-branches-draft",
  EventBasedGatewayMessageTimer:
    "bpmn-2.0.2-event-based-gateway-message-timer-draft",
  IntermediateCatchTimer:
    "cibseven-2.2.0-intermediate-catch-timer-draft",
  IntermediateCatchMessage:
    "bpmn-2.0.2-intermediate-catch-message-draft",
  MessageAddressedReceiveTask:
    "cibseven-2.2.0-message-addressed-receive-task-draft",
  NonInterruptingBoundaryTimer:
    "bpmn-2.0.2-non-interrupting-boundary-timer-draft",
  ParallelForkJoin: "parallel-fork-join-draft",
  ServiceTaskEffect: "cibseven-2.2.0-service-task-effect-draft",
  TimerUserTaskComposition:
    "bpmn-2.0.2-timer-user-task-composition-draft",
  UserTask: "cibseven-2.2.0-user-task-process-data-draft",
  UserTaskCycle: "bpmn-2.0.2-user-task-cycle-draft",
  UserTaskPreservedNotation:
    "bpmn-2.0.2-user-task-preserved-notation-draft",
} as const);

/**
 * Checks the exact operation capability selected by one reviewed profile.
 *
 * Kind cardinalities and profile-local payload restrictions live here. Graph structure remains the
 * responsibility of the profile-independent checked-source and Semantic Process graph validators.
 */
export function profileAllowsProgramShape(
  semanticProfile: string,
  actualOperations: ReadonlyArray<SemanticOperation>,
  definitionScopeCount: number,
): boolean {
  const required = requiredProgramShape(semanticProfile);
  return required !== undefined &&
    definitionScopeCount === required.definitionScopeCount &&
    sameOperationCardinalities(
      actualOperations.map(({ kind }) => kind),
      required.operationKinds,
    ) &&
    profileAllowsProgramOperationDetails(semanticProfile, actualOperations);
}

function profileAllowsProgramOperationDetails(
  semanticProfile: string,
  operations: ReadonlyArray<SemanticOperation>,
): boolean {
  switch (semanticProfile) {
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
    );
}

/**
 * One profile's exact checked-graph capability.
 *
 * `boundaryInterruption` is checked against every Timer Boundary Event the graph carries, so the
 * disposition separates two profiles that pin the same node kinds. Without it a source could compile
 * `Accepted` under the profile holding the opposite interruption semantics, and only a later
 * execution or scenario admission would notice — which is the wrong boundary for a fact the checked
 * graph already records.
 */
type RequiredCheckedProcessShape = Readonly<{
  definitionScopeCount: number;
  nodeKinds: ReadonlyArray<CheckedNodeKind>;
  boundaryInterruption: BoundaryInterruption | undefined;
}>;

function requiredCheckedProcessShape(
  semanticProfile: string,
): RequiredCheckedProcessShape | undefined {
  const start = CheckedNodeKind.NoneStartEvent;
  const end = CheckedNodeKind.NoneEndEvent;
  switch (semanticProfile) {
    // The preserve-enabled successor reaches the same checked shape by construction: preserved
    // notation never enters the checked graph, so a differing shape here would mean it had.
    case SemanticProfileId.UserTask:
    case SemanticProfileId.UserTaskPreservedNotation:
      return rootChecked([start, CheckedNodeKind.UserTask, end]);
    case SemanticProfileId.MessageStart:
      return rootChecked([
        CheckedNodeKind.MessageStartEvent,
        CheckedNodeKind.UserTask,
        end,
      ]);
    case SemanticProfileId.IntermediateCatchTimer:
      return rootChecked([
        start,
        CheckedNodeKind.IntermediateCatchTimerEvent,
        end,
      ]);
    case SemanticProfileId.IntermediateCatchMessage:
      return rootChecked([
        start,
        CheckedNodeKind.IntermediateCatchMessageEvent,
        CheckedNodeKind.UserTask,
        end,
      ]);
    case SemanticProfileId.MessageAddressedReceiveTask:
      return rootChecked([
        start,
        CheckedNodeKind.ReceiveTask,
        end,
      ]);
    case SemanticProfileId.ServiceTaskEffect:
    case SemanticProfileId.MappedSuccessServiceTask:
      return rootChecked([start, CheckedNodeKind.ServiceTask, end]);
    case SemanticProfileId.MappedBoundaryErrorServiceTask:
      return rootChecked([
        start,
        CheckedNodeKind.ServiceTask,
        CheckedNodeKind.UserTask,
        end,
        end,
      ]);
    case SemanticProfileId.ParallelForkJoin:
      return rootChecked([
        start,
        CheckedNodeKind.ParallelGateway,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.ParallelGateway,
        end,
      ]);
    case SemanticProfileId.ExclusiveGatewaySimpleBoolean:
      return rootChecked([
        start,
        CheckedNodeKind.ExclusiveGateway,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.UserTask,
        end,
        end,
        end,
      ]);
    case SemanticProfileId.UserTaskCycle:
      return rootChecked([
        start,
        CheckedNodeKind.ExclusiveMerge,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.ExclusiveGateway,
        end,
      ]);
    case SemanticProfileId.InclusiveGatewaySelectedBranches:
      return rootChecked([
        start,
        CheckedNodeKind.InclusiveGateway,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.InclusiveGateway,
        end,
      ]);
    // Both boundary-Timer-on-a-User-Task profiles pin the same node kinds, so the disposition is
    // what separates them and their admitted sets are disjoint by construction.
    case SemanticProfileId.ActivityBoundaryTimer:
      return rootChecked([
        start,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.TimerBoundaryEvent,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.UserTask,
        end,
        end,
      ], BoundaryInterruption.Interrupting);
    case SemanticProfileId.NonInterruptingBoundaryTimer:
      return rootChecked([
        start,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.TimerBoundaryEvent,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.UserTask,
        end,
        end,
      ], BoundaryInterruption.NonInterrupting);
    case SemanticProfileId.EventBasedGatewayMessageTimer:
      return rootChecked([
        start,
        CheckedNodeKind.EventBasedGateway,
        CheckedNodeKind.IntermediateCatchMessageEvent,
        CheckedNodeKind.IntermediateCatchTimerEvent,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.UserTask,
        end,
        end,
      ]);
    case SemanticProfileId.TimerUserTaskComposition:
      return rootChecked([
        start,
        CheckedNodeKind.IntermediateCatchTimerEvent,
        CheckedNodeKind.UserTask,
        end,
      ]);
    case SemanticProfileId.EmbeddedSubProcessCompletion:
      return nestedChecked([
        start,
        CheckedNodeKind.EmbeddedSubProcess,
        CheckedNodeKind.UserTask,
        end,
        start,
        CheckedNodeKind.ParallelGateway,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.UserTask,
        end,
        end,
      ]);
    case SemanticProfileId.SubProcessBoundaryTimer:
      return nestedChecked([
        start,
        CheckedNodeKind.EmbeddedSubProcess,
        CheckedNodeKind.TimerBoundaryEvent,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.UserTask,
        end,
        end,
        start,
        CheckedNodeKind.UserTask,
        end,
      ], BoundaryInterruption.Interrupting);
    case SemanticProfileId.SubProcessErrorPropagation:
      return nestedChecked([
        start,
        CheckedNodeKind.EmbeddedSubProcess,
        CheckedNodeKind.BoundaryErrorEvent,
        CheckedNodeKind.UserTask,
        end,
        end,
        start,
        CheckedNodeKind.ParallelGateway,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.UserTask,
        CheckedNodeKind.ErrorEndEvent,
        end,
      ]);
    case SemanticProfileId.CalledProcessCallActivity:
      return nestedChecked([
        start,
        CheckedNodeKind.CallActivity,
        CheckedNodeKind.UserTask,
        end,
        start,
        CheckedNodeKind.UserTask,
        end,
      ]);
    default:
      return undefined;
  }
}

type RequiredProgramShape = Readonly<{
  definitionScopeCount: number;
  operationKinds: ReadonlyArray<SemanticOperationKind>;
}>;

function requiredProgramShape(
  semanticProfile: string,
): RequiredProgramShape | undefined {
  switch (semanticProfile) {
    case SemanticProfileId.MessageStart:
      return rootProgram([
        SemanticOperationKind.InitiateMessage,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.UserTask:
    case SemanticProfileId.UserTaskPreservedNotation:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.IntermediateCatchTimer:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitTimer,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.IntermediateCatchMessage:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitMessage,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.MessageAddressedReceiveTask:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitMessage,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.ServiceTaskEffect:
    case SemanticProfileId.MappedSuccessServiceTask:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitEffect,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.MappedBoundaryErrorServiceTask:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitEffect,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.ParallelForkJoin:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.Duplicate,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.Synchronize,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.ExclusiveGatewaySimpleBoolean:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.Choose,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.UserTaskCycle:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.MergeExclusive,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.Choose,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.InclusiveGatewaySelectedBranches:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.SelectMany,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.SynchronizeSelected,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.ActivityBoundaryTimer:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitBoundedUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.NonInterruptingBoundaryTimer:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitMonitoredUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.EventBasedGatewayMessageTimer:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitEventRace,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.TimerUserTaskComposition:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitTimer,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.EmbeddedSubProcessCompletion:
      return {
        definitionScopeCount: 2,
        operationKinds: [
          SemanticOperationKind.Initiate,
          SemanticOperationKind.EnterScope,
          SemanticOperationKind.Duplicate,
          SemanticOperationKind.AwaitUserTask,
          SemanticOperationKind.AwaitUserTask,
          SemanticOperationKind.AwaitUserTask,
          SemanticOperationKind.ReachNoneEnd,
          SemanticOperationKind.ReachNoneEnd,
          SemanticOperationKind.ReachNoneEnd,
          SemanticOperationKind.CompleteScope,
          SemanticOperationKind.CompleteScope,
        ],
      };
    case SemanticProfileId.SubProcessBoundaryTimer:
      return {
        definitionScopeCount: 2,
        operationKinds: [
          SemanticOperationKind.Initiate,
          SemanticOperationKind.EnterBoundedScope,
          SemanticOperationKind.AwaitUserTask,
          SemanticOperationKind.AwaitUserTask,
          SemanticOperationKind.AwaitUserTask,
          SemanticOperationKind.ReachNoneEnd,
          SemanticOperationKind.ReachNoneEnd,
          SemanticOperationKind.ReachNoneEnd,
          SemanticOperationKind.CompleteScope,
          SemanticOperationKind.CompleteScope,
        ],
      };
    case SemanticProfileId.SubProcessErrorPropagation:
      return {
        definitionScopeCount: 2,
        operationKinds: [
          SemanticOperationKind.Initiate,
          SemanticOperationKind.EnterScope,
          SemanticOperationKind.Duplicate,
          SemanticOperationKind.AwaitUserTask,
          SemanticOperationKind.AwaitUserTask,
          SemanticOperationKind.AwaitUserTask,
          SemanticOperationKind.ThrowError,
          SemanticOperationKind.ReachNoneEnd,
          SemanticOperationKind.ReachNoneEnd,
          SemanticOperationKind.ReachNoneEnd,
          SemanticOperationKind.CompleteScope,
          SemanticOperationKind.CompleteScope,
        ],
      };
    case SemanticProfileId.CalledProcessCallActivity:
      return {
        definitionScopeCount: 2,
        operationKinds: [
          SemanticOperationKind.Initiate,
          SemanticOperationKind.InvokeProcess,
          SemanticOperationKind.AwaitUserTask,
          SemanticOperationKind.ReachNoneEnd,
          SemanticOperationKind.ReturnProcess,
          SemanticOperationKind.AwaitUserTask,
          SemanticOperationKind.ReachNoneEnd,
          SemanticOperationKind.CompleteScope,
        ],
      };
    default:
      return undefined;
  }
}

function rootProgram(
  operationKinds: ReadonlyArray<SemanticOperationKind>,
): RequiredProgramShape {
  return { definitionScopeCount: 1, operationKinds };
}

function rootChecked(
  nodeKinds: ReadonlyArray<CheckedNodeKind>,
  boundaryInterruption?: BoundaryInterruption,
): RequiredCheckedProcessShape {
  return { definitionScopeCount: 1, nodeKinds, boundaryInterruption };
}

function nestedChecked(
  nodeKinds: ReadonlyArray<CheckedNodeKind>,
  boundaryInterruption?: BoundaryInterruption,
): RequiredCheckedProcessShape {
  return { definitionScopeCount: 2, nodeKinds, boundaryInterruption };
}

function sameOperationCardinalities(
  actual: ReadonlyArray<SemanticOperationKind>,
  required: ReadonlyArray<SemanticOperationKind>,
): boolean {
  return sameCardinalities(actual, required);
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
