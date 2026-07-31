import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";

export const SemanticProfileId = Object.freeze({
  BoundaryError: "cibseven-2.0.0-a12-boundary-error-draft",
  CreateDocument: "cibseven-2.0.0-a12-create-document-draft",
  ExclusiveGatewaySimpleBoolean:
    "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft",
  IntermediateCatchTimer:
    "cibseven-2.2.0-intermediate-catch-timer-draft",
  ParallelForkJoin: "parallel-fork-join-draft",
  ServiceTaskEffect: "cibseven-2.2.0-service-task-effect-draft",
  TimerUserTaskComposition:
    "bpmn-2.0.2-timer-user-task-composition-draft",
  UserTask: "cibseven-2.2.0-user-task-draft",
} as const);

/**
 * Checks the exact operation cardinalities selected by one reviewed profile.
 *
 * Graph structure remains the responsibility of the profile-independent
 * checked-source and Semantic Process graph validators.
 */
export function profileAllowsOperationKinds(
  semanticProfile: string,
  actualKinds: ReadonlyArray<SemanticOperationKind>,
): boolean {
  const requiredKinds = requiredOperationKinds(semanticProfile);
  return requiredKinds !== undefined &&
    sameOperationCardinalities(actualKinds, requiredKinds);
}

function requiredOperationKinds(
  semanticProfile: string,
): ReadonlyArray<SemanticOperationKind> | undefined {
  switch (semanticProfile) {
    case SemanticProfileId.UserTask:
      return [
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.Terminate,
      ];
    case SemanticProfileId.IntermediateCatchTimer:
      return [
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitTimer,
        SemanticOperationKind.Terminate,
      ];
    case SemanticProfileId.ServiceTaskEffect:
    case SemanticProfileId.CreateDocument:
      return [
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitEffect,
        SemanticOperationKind.Terminate,
      ];
    case SemanticProfileId.BoundaryError:
      return [
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitEffect,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.Terminate,
        SemanticOperationKind.Terminate,
      ];
    case SemanticProfileId.ParallelForkJoin:
      return [
        SemanticOperationKind.Initiate,
        SemanticOperationKind.Duplicate,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.Synchronize,
        SemanticOperationKind.Terminate,
      ];
    case SemanticProfileId.ExclusiveGatewaySimpleBoolean:
      return [
        SemanticOperationKind.Initiate,
        SemanticOperationKind.Choose,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.Terminate,
        SemanticOperationKind.Terminate,
        SemanticOperationKind.Terminate,
      ];
    case SemanticProfileId.TimerUserTaskComposition:
      return [
        SemanticOperationKind.Initiate,
        SemanticOperationKind.AwaitTimer,
        SemanticOperationKind.AwaitUserTask,
        SemanticOperationKind.Terminate,
      ];
    default:
      return undefined;
  }
}

function sameOperationCardinalities(
  actual: ReadonlyArray<SemanticOperationKind>,
  required: ReadonlyArray<SemanticOperationKind>,
): boolean {
  return actual.length === required.length &&
    required.every(
      (kind) =>
        actual.filter((candidate) => candidate === kind).length ===
          required.filter((candidate) => candidate === kind).length,
    );
}
