import assert from "node:assert/strict";
import test from "node:test";

import { decodeExecutionPublicationPage } from "@bpmn-lean/platform-contracts";

import {
  executionPublicationPage,
  publicationIdentity,
} from "./execution-publication-fixture.ts";

type TaskId = {
  processInstanceId: string;
  elementId: string;
  activation: number;
};

type ParallelIteration = {
  loopCounter: number;
  taskId: TaskId;
  taskInput: { name: string; value: { kind: string; value: string } };
  completionBindingName: string;
};

type ParallelController = {
  id: {
    processInstanceId: string;
    activityElementId: string;
    activation: number;
  };
  mode: string;
  plannedInstanceCount: number;
  pendingItemCount: number;
  numberOfInstances: number;
  numberOfActiveInstances: number;
  numberOfCompletedInstances: number;
  numberOfTerminatedInstances: number;
  activeIterations: ParallelIteration[];
};

type ParallelState = {
  openUserTasks: Array<{ id: TaskId; name: string; state: string }>;
  openMultiInstances: ParallelController[];
  enabledInteractions: Array<{ kind: string; taskId: TaskId }>;
};

type ParallelPage = Record<string, unknown> & {
  current: Record<string, unknown> & { state: ParallelState };
};

test("accepts exact parallel Multi-Instance progress with every live indexed child", () => {
  const page = parallelMultiInstancePublicationPage();

  assert.deepEqual(decodeParallelPage(page), page);
});

test("rejects parallel count, iteration, and exact-task drift", () => {
  rejectParallelState((state) => {
    state.openMultiInstances[0]!.pendingItemCount = 1;
  }, /count identities/u);
  rejectParallelState((state) => {
    state.openMultiInstances[0]!.numberOfActiveInstances = 2;
  }, /count identities/u);
  rejectParallelState((state) => {
    state.openMultiInstances[0]!.activeIterations[1]!.loopCounter = 0;
  }, /loop counters/u);
  rejectParallelState((state) => {
    state.openMultiInstances[0]!.activeIterations.reverse();
  }, /loop counters/u);
  rejectParallelState((state) => {
    state.openUserTasks.pop();
  }, /exact open task/u);
});

test("rejects duplicate active tasks across sequential and parallel controllers", () => {
  rejectParallelState((state) => {
    const controller = state.openMultiInstances[0]!;
    state.openMultiInstances.push({
      ...structuredClone(controller),
      id: { ...controller.id, activation: 2 },
      activeIterations: [{
        ...structuredClone(controller.activeIterations[0]!),
        loopCounter: 0,
      }],
      plannedInstanceCount: 1,
      numberOfInstances: 1,
      numberOfActiveInstances: 1,
    });
  }, /duplicate active task/u);
});

function parallelMultiInstancePublicationPage(): ParallelPage {
  const page = executionPublicationPage();
  const owner = page.current!.scopes[0]!.id;
  const taskIds = [1, 2, 3].map((activation) => ({
    processInstanceId: publicationIdentity.processInstanceId,
    elementId: "UserTask_Review",
    activation,
  }));
  const controller: ParallelController = {
    id: {
      processInstanceId: publicationIdentity.processInstanceId,
      activityElementId: "UserTask_Review",
      activation: 1,
    },
    mode: "parallel",
    plannedInstanceCount: 3,
    pendingItemCount: 0,
    numberOfInstances: 3,
    numberOfActiveInstances: 3,
    numberOfCompletedInstances: 0,
    numberOfTerminatedInstances: 0,
    activeIterations: taskIds.map((taskId, loopCounter) => ({
      loopCounter,
      taskId,
      taskInput: {
        name: "DataInput_CurrentItem",
        value: { kind: "string", value: ["security", "privacy", "financial"][loopCounter]! },
      },
      completionBindingName: "DataOutput_CurrentResult",
    })),
  };
  const token = {
    sequenceFlowId: "Flow_Review",
    owner,
    multiplicity: 1,
  };
  const awaitChildren = {
    revision: 2,
    logicalTimeMs: 0,
    transition: {
      kind: "internalOperation",
      operationId: "await-parallel-review",
      operationKind: "awaitParallelMultiInstanceUserTask",
      origin: { kind: "bpmnElement", elementId: "UserTask_Review" },
      owner,
    },
    positionDelta: {
      consumedTokens: [],
      producedTokens: [token],
      enteredScopes: [],
      exitedScopes: [],
    },
  };
  return {
    ...page,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [{
      ...page.batches[0]!,
      throughRevision: 2,
      transitions: [page.batches[0]!.transitions[0]!, awaitChildren],
    }],
    current: {
      ...page.current!,
      revision: 2,
      controlTokens: [token],
      state: {
        ...page.current!.state,
        activeWaits: [{ elementId: "UserTask_Review", kind: "userTask", multiplicity: 3 }],
        openUserTasks: taskIds.map((id) => ({ id, name: "Review risk", state: "active" })),
        openMultiInstances: [controller],
        enabledInteractions: taskIds.map((taskId) => ({
          kind: "completeUserTaskInstance",
          taskId,
        })),
      },
    },
  } as ParallelPage;
}

function decodeParallelPage(page: ParallelPage) {
  return decodeExecutionPublicationPage(page, {
    ...publicationIdentity,
    afterRevision: 0,
    limit: 1,
  });
}

function rejectParallelState(
  mutate: (state: ParallelState) => unknown,
  expected: RegExp,
): void {
  const page = parallelMultiInstancePublicationPage();
  mutate(page.current.state);
  assert.throws(() => decodeParallelPage(page), expected);
}
