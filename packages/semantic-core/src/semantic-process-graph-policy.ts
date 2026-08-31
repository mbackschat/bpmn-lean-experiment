/** Profile-owned graph policy shared by checked-source and Semantic Process admission. */
import { CheckedNodeKind } from "./checked-process-contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import {
  MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
  SemanticProfileId,
} from "./semantic-profile-catalog.js";
import {
  SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
} from "./sequential-multi-instance-contract.js";

export enum SemanticGraphPolicyKind {
  Acyclic = "acyclic",
  ResumptionBounded = "resumptionBounded",
}

export type SemanticGraphPolicy = DeepReadonly<
  | { kind: SemanticGraphPolicyKind.Acyclic }
  | {
      kind: SemanticGraphPolicyKind.ResumptionBounded;
      checkedResumptionNodeKinds: [CheckedNodeKind.UserTask];
      semanticResumptionOperationKinds: [SemanticOperationKind.AwaitUserTask];
    }
>;

const acyclicGraphPolicy: SemanticGraphPolicy = Object.freeze({
  kind: SemanticGraphPolicyKind.Acyclic,
});

const userTaskResumptionBoundedGraphPolicy: SemanticGraphPolicy = Object.freeze({
  kind: SemanticGraphPolicyKind.ResumptionBounded,
  checkedResumptionNodeKinds: Object.freeze([
    CheckedNodeKind.UserTask,
  ] as const),
  semanticResumptionOperationKinds: Object.freeze([
    SemanticOperationKind.AwaitUserTask,
  ] as const),
});

/** Selects the complete graph policy for one admitted semantic capability. */
export function semanticGraphPolicyForProfile(
  semanticProfile: string,
): SemanticGraphPolicy | undefined {
  switch (semanticProfile) {
    case SemanticProfileId.UserTaskCycle:
      return userTaskResumptionBoundedGraphPolicy;
    case SemanticProfileId.TimerStart:
    case SemanticProfileId.MessageStart:
    case SemanticProfileId.ActivityBoundaryTimer:
    case SemanticProfileId.ActivityBoundaryMessage:
    case SemanticProfileId.ActivityDataInputUserTask:
    case SemanticProfileId.ActivityDataOutputUserTask:
    case SemanticProfileId.MappedBoundaryErrorServiceTask:
    case SemanticProfileId.CalledProcessCallActivity:
    case SemanticProfileId.MappedSuccessServiceTask:
    case SemanticProfileId.EmbeddedSubProcessCompletion:
    case SemanticProfileId.SubProcessBoundaryTimer:
    case SemanticProfileId.SubProcessErrorPropagation:
    case SemanticProfileId.ExclusiveGatewaySimpleBoolean:
    case SemanticProfileId.InclusiveGatewaySelectedBranches:
    case SemanticProfileId.EventBasedGatewayMessageTimer:
    case SemanticProfileId.IntermediateCatchTimer:
    case SemanticProfileId.IntermediateCatchMessage:
    case SemanticProfileId.MessagePayloadCatch:
    case MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID:
    case SemanticProfileId.MessageAddressedReceiveTask:
    case SemanticProfileId.NonInterruptingBoundaryTimer:
    case SemanticProfileId.ParallelForkJoin:
    case SemanticProfileId.ParallelMultiInstanceUserTask:
    case SemanticProfileId.ParallelUserTaskAssignmentFormMetadata:
    case SemanticProfileId.ServiceTaskEffect:
    case SemanticProfileId.ServiceTaskIncident:
    case SemanticProfileId.ServiceTaskIncidentCancellation:
    case SemanticProfileId.TimerUserTaskComposition:
    case SemanticProfileId.UserTask:
    case SemanticProfileId.UserTaskProcessDataPreservedNotation:
    case SemanticProfileId.UserTaskPreservedNotation:
    case SemanticProfileId.UserTaskBooleanCompletionData:
    case SemanticProfileId.UserTaskAssignmentFormMetadata:
    case SemanticProfileId.StructuredHumanWork:
    case SemanticProfileId.TerminateEnd:
    case SemanticProfileId.ConfiguredTask:
    case SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID:
      return acyclicGraphPolicy;
    default:
      return undefined;
  }
}
