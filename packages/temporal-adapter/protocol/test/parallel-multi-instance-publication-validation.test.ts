import assert from "node:assert/strict";
import test from "node:test";

import { requireExecutionPublicationPage } from "../dist/index.js";
import { program, publicationPage } from "./semantic-publication-fixture.ts";

const parallelProgram = {
  ...program,
  operations: [...program.operations, {
    id: "Operation_Review",
    kind: "awaitParallelMultiInstanceUserTask",
    origin: { kind: "bpmnElement", elementId: "Review" },
  }, {
    id: "Operation_Review_Complete",
    kind: "completeParallelMultiInstanceUserTask",
    origin: { kind: "bpmnElement", elementId: "Review" },
  }],
} as any;

test("admits parallel progress with sparse live loop counters", () => {
  const page = parallelProgressPage();
  assert.deepEqual(requireExecutionPublicationPage(page, {
    program: parallelProgram,
    processInstanceId: "Instance_1",
    limit: 1,
  }), page);
});

test("rejects completion-order projection and inconsistent live siblings", () => {
  const mutations: Array<readonly [string, (page: any) => void]> = [
    ["completion-order loop counter", (page) => {
      page.current.state.openMultiInstances[0].activeIterations[0].loopCounter = 1;
    }],
    ["missing sibling", (page) => {
      page.current.state.openMultiInstances[0].activeIterations.pop();
    }],
    ["wrong active count", (page) => {
      page.current.state.openMultiInstances[0].numberOfActiveInstances = 1;
    }],
    ["nonzero pending items", (page) => {
      page.current.state.openMultiInstances[0].pendingItemCount = 1;
    }],
    ["duplicate task", (page) => {
      page.current.state.openMultiInstances[0].activeIterations[1].taskId =
        page.current.state.openMultiInstances[0].activeIterations[0].taskId;
    }],
  ];
  for (const [label, mutate] of mutations) {
    const page = parallelProgressPage();
    mutate(page);
    assert.throws(() => requireExecutionPublicationPage(page, {
      program: parallelProgram,
      processInstanceId: "Instance_1",
      limit: 1,
    }), /malformed execution publication page/u, label);
  }
});

function parallelProgressPage(): any {
  const page = structuredClone(publicationPage()) as any;
  const taskIds = [1, 3].map((activation) => ({
    processInstanceId: "Instance_1",
    elementId: "Review",
    activation,
  }));
  page.current.state.activeWaits = [{
    elementId: "Review",
    kind: "userTask",
    multiplicity: 2,
  }];
  page.current.state.openUserTasks = taskIds.map((id) => ({
    id,
    name: "Review item",
    state: "active",
  }));
  page.current.state.enabledInteractions = taskIds.map((taskId) => ({
    kind: "completeUserTaskInstance",
    taskId,
  }));
  page.current.state.openMultiInstances = [{
    id: {
      processInstanceId: "Instance_1",
      activityElementId: "Review",
      activation: 1,
    },
    mode: "parallel",
    plannedInstanceCount: 3,
    pendingItemCount: 0,
    numberOfInstances: 3,
    numberOfActiveInstances: 2,
    numberOfCompletedInstances: 1,
    numberOfTerminatedInstances: 0,
    activeIterations: taskIds.map((taskId, index) => ({
      loopCounter: index === 0 ? 0 : 2,
      taskId,
      taskInput: {
        name: "Review_Item_Input",
        value: { kind: "string", value: index === 0 ? "alpha" : "gamma" },
      },
      completionBindingName: "Review_Item_Output",
    })),
  }];
  return page;
}
