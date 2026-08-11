/** Exact Semantic Process operation multisets admitted by reviewed semantic profiles. */
import { SemanticOperationKind } from "./semantic-process-contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";

export type RequiredProgramShape = Readonly<{
  definitionScopeCount: number;
  operationKinds: ReadonlyArray<SemanticOperationKind>;
}>;

/** Returns the complete Semantic Process operation multiset selected by one reviewed profile. */
export function requiredProgramShape(
  semanticProfile: string,
): RequiredProgramShape | undefined {
  switch (semanticProfile) {
    case SemanticProfileId.TimerStart:
      return rootProgram([
        SemanticOperationKind.InitiateTimer,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
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
    case SemanticProfileId.ConfiguredTask:
      return rootProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitEffect,
        SemanticOperationKind.AwaitUserTask,
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
      return nestedProgram([
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
      ]);
    case SemanticProfileId.SubProcessBoundaryTimer:
      return nestedProgram([
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
      ]);
    case SemanticProfileId.SubProcessErrorPropagation:
      return nestedProgram([
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
      ]);
    case SemanticProfileId.CalledProcessCallActivity:
      return nestedProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.InvokeProcess,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.ReturnProcess,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
      ]);
    case SemanticProfileId.TerminateEnd:
      return nestedProgram([
        SemanticOperationKind.Initiate,
        SemanticOperationKind.EnterScope,
        SemanticOperationKind.Duplicate,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.TerminateScope,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.ReachNoneEnd,
        SemanticOperationKind.CompleteScope,
        SemanticOperationKind.CompleteScope,
      ]);
    default:
      return undefined;
  }
}

function rootProgram(
  operationKinds: ReadonlyArray<SemanticOperationKind>,
): RequiredProgramShape {
  return { definitionScopeCount: 1, operationKinds };
}

function nestedProgram(
  operationKinds: ReadonlyArray<SemanticOperationKind>,
): RequiredProgramShape {
  return { definitionScopeCount: 2, operationKinds };
}
