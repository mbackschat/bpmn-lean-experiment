import {
  CommandOutcome,
  SemanticOperationKind,
  StimulusKind,
  applyInternalOperation,
  applyStimulus,
  deployProcess,
  initialState,
  isWellFormedStimulus,
  projectOpenUserTasks,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  RuntimeScopeOccurrence,
  RuntimeState,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  condition,
  setHandler,
} from "@temporalio/workflow";

import {
  bpmnCompleteUserTaskUpdate,
  bpmnOpenUserTasksQuery,
} from "@bpmn-lean/temporal-workflow";

/**
 * Intentional mutation: the Workflow forges the caller continuation while the called
 * Process remains live. The public Query exposes both tasks rather than hiding
 * the disagreement behind the ordinary one-task projection.
 */
export async function runBpmnProcessCallActivityEarlyReturnMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<never> {
  const started = requireStartedCall(start, semanticProcess);
  const callerRoot = requireCallerRoot(start, semanticProcess, started.state);
  const callerTask = requireCallerTask(semanticProcess, callerRoot);
  const bypassed = applyInternalOperation(semanticProcess, callerTask, {
    ...started.state,
    controlTokens: [
      ...started.state.controlTokens,
      {
        placeId: callerTask.input,
        owner: callerRoot.id,
        multiplicity: 1,
      },
    ],
  });
  if (bypassed === null) {
    throw new TypeError("Call early-return mutation could not forge the caller wait");
  }

  setHandler(bpmnOpenUserTasksQuery, () => projectOpenUserTasks(bypassed));

  await condition(() => false);
  throw new TypeError("Call early-return mutation resumed unexpectedly");
}

/**
 * Intentional mutation: the called wait is relabeled with the hosting caller identity.
 * The mutation therefore inverts which otherwise identical completion commits.
 */
export async function runBpmnProcessCallActivityIdentityErasureMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<never> {
  const started = requireStartedCall(start, semanticProcess);
  if (
    started.state.userTaskWaits.length !== 1 ||
    started.state.userTaskWaits[0]?.id.processInstanceId === start.instanceId
  ) {
    throw new TypeError("Call identity-erasure mutation requires one called wait");
  }
  let state: RuntimeState = {
    ...started.state,
    userTaskWaits: started.state.userTaskWaits.map((wait) => ({
      ...wait,
      id: {
        ...wait.id,
        processInstanceId: start.instanceId,
      },
    })),
  };

  setHandler(bpmnOpenUserTasksQuery, () => projectOpenUserTasks(state));
  setHandler(
    bpmnCompleteUserTaskUpdate,
    (stimulus) => {
      requireCompletion(stimulus);
      const result = applyStimulus(semanticProcess, state, stimulus);
      state = result.state;
      return result.outcome;
    },
    { validator: requireCompletion },
  );

  await condition(() => false);
  throw new TypeError("Call identity-erasure mutation resumed unexpectedly");
}

type StartedCall = Readonly<{
  state: RuntimeState;
}>;

function requireStartedCall(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): StartedCall {
  const deployment = deployProcess(start, semanticProcess);
  if (deployment.outcome !== CommandOutcome.Committed) {
    throw new TypeError("Call mutation requires an admitted Process");
  }
  const started = applyStimulus(semanticProcess, initialState, start);
  if (
    started.outcome !== CommandOutcome.Committed ||
    started.state.calledProcessOccurrences.length !== 1 ||
    started.state.userTaskWaits.length !== 1
  ) {
    throw new TypeError("Call mutation requires one live called Process wait");
  }
  return {
    state: started.state,
  };
}

function requireCallerRoot(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
  state: RuntimeState,
): RuntimeScopeOccurrence {
  const definition = semanticProcess.definitionScopes.filter(
    ({ parentScopeId, originElementId }) =>
      parentScopeId === null && originElementId === semanticProcess.processId,
  );
  const roots = state.scopeOccurrences.filter(
    ({ id, parent }) =>
      parent === null &&
      id.processInstanceId === start.instanceId &&
      id.definitionScopeId === definition[0]?.id,
  );
  if (definition.length !== 1 || roots.length !== 1 || roots[0] === undefined) {
    throw new TypeError("Call early-return mutation requires one caller root");
  }
  return roots[0];
}

function requireCallerTask(
  semanticProcess: SemanticProcessProgram,
  callerRoot: RuntimeScopeOccurrence,
): Extract<
  SemanticProcessProgram["operations"][number],
  { kind: typeof SemanticOperationKind.AwaitUserTask }
> {
  const callerOperations = new Set(
    semanticProcess.operationScopes
      .filter(({ scopeId }) => scopeId === callerRoot.id.definitionScopeId)
      .map(({ operationId }) => operationId),
  );
  const tasks = semanticProcess.operations.filter(
    (operation): operation is Extract<
      SemanticProcessProgram["operations"][number],
      { kind: typeof SemanticOperationKind.AwaitUserTask }
    > =>
      operation.kind === SemanticOperationKind.AwaitUserTask &&
      callerOperations.has(operation.id),
  );
  if (tasks.length !== 1 || tasks[0] === undefined) {
    throw new TypeError("Call early-return mutation requires one caller User Task");
  }
  return tasks[0];
}

function requireCompletion(
  stimulus: CompleteUserTaskInstanceStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isWellFormedStimulus(value) ||
    value.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError("Call mutation requires a well-formed User Task completion");
  }
}
