/** Exact checked-node multisets admitted by reviewed semantic profiles. */
import {
  BoundaryInterruption,
  CheckedNodeKind,
} from "./checked-process-contract.js";
import {
  SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID,
  SemanticProfileId,
} from "./semantic-profile-catalog.js";

/** One profile's exact checked-graph capability. */
export type RequiredCheckedProcessShape = Readonly<{
  definitionScopeCount: number;
  nodeKinds: ReadonlyArray<CheckedNodeKind>;
  boundaryInterruption: BoundaryInterruption | undefined;
}>;

/** Returns the complete checked-node multiset selected by one reviewed profile. */
export function requiredCheckedProcessShape(
  semanticProfile: string,
): RequiredCheckedProcessShape | undefined {
  const start = CheckedNodeKind.NoneStartEvent;
  const end = CheckedNodeKind.NoneEndEvent;
  switch (semanticProfile) {
    // Preserved notation never enters the checked graph, so both profiles have the same shape.
    case SemanticProfileId.UserTask:
    case SemanticProfileId.UserTaskPreservedNotation:
    case SemanticProfileId.UserTaskBooleanCompletionData:
    case SemanticProfileId.UserTaskAssignmentFormMetadata:
      return rootChecked([start, CheckedNodeKind.UserTask, end]);
    case SemanticProfileId.MessageStart:
      return rootChecked([
        CheckedNodeKind.MessageStartEvent,
        CheckedNodeKind.UserTask,
        end,
      ]);
    case SemanticProfileId.TimerStart:
      return rootChecked([
        CheckedNodeKind.TimerStartEvent,
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
    case SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID:
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
    case SemanticProfileId.ConfiguredTask:
      return rootChecked([
        start,
        CheckedNodeKind.ConfiguredTask,
        CheckedNodeKind.UserTask,
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
    // The interruption disposition separates the two otherwise identical boundary-Timer shapes.
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
    case SemanticProfileId.TerminateEnd:
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
        CheckedNodeKind.TerminateEndEvent,
      ]);
    default:
      return undefined;
  }
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
