import assert from "node:assert/strict";
import test from "node:test";

import {
  requireExecutionPublicationPage,
} from "../dist/index.js";
import {
  program,
  publicationContext,
  publicationPage,
} from "./semantic-publication-fixture.ts";

const multiInstanceProgram = {
  ...program,
  operations: [...program.operations, {
    id: "Operation_Review",
    kind: "awaitSequentialMultiInstanceUserTask",
    origin: { kind: "bpmnElement", elementId: "Review" },
  }],
} as any;
const multiInstanceContext = {
  program: multiInstanceProgram,
  processInstanceId: "Instance_1",
} as const;

test("admits recursively validated sequential Multi-Instance progress", () => {
  const page = pageWithMultiInstanceProgress();
  assert.deepEqual(
    requireExecutionPublicationPage(page, { ...multiInstanceContext, limit: 1 }),
    page,
  );
});

test("keeps the optional field absent for existing publication bytes", () => {
  const page = publicationPage();
  assert.equal(Object.hasOwn(page.current!.state, "openMultiInstances"), false);
  assert.deepEqual(
    requireExecutionPublicationPage(page, { ...publicationContext, limit: 1 }),
    page,
  );
  assert.throws(
    () => requireExecutionPublicationPage(
      page,
      { ...multiInstanceContext, limit: 1 },
    ),
    /malformed execution publication page/u,
  );
});

test("rejects malformed progress, broken count identities, and inconsistent task identity", () => {
  const mutations: Array<readonly [string, (page: any) => void]> = [
    ["omitted count", (page) => {
      delete page.current.state.openMultiInstances[0].pendingItemCount;
    }],
    ["private snapshot", (page) => {
      page.current.state.openMultiInstances[0].privateSnapshot = [];
    }],
    ["wrong mode", (page) => {
      page.current.state.openMultiInstances[0].mode = "parallel";
    }],
    ["planned identity", (page) => {
      page.current.state.openMultiInstances[0].plannedInstanceCount = 4;
    }],
    ["generated identity", (page) => {
      page.current.state.openMultiInstances[0].numberOfInstances = 2;
    }],
    ["active count", (page) => {
      page.current.state.openMultiInstances[0].numberOfActiveInstances = 0;
    }],
    ["terminated count", (page) => {
      page.current.state.openMultiInstances[0].numberOfTerminatedInstances = 1;
    }],
    ["loop counter", (page) => {
      page.current.state.openMultiInstances[0].activeIterations[0].loopCounter = 1;
    }],
    ["task identity", (page) => {
      page.current.state.openMultiInstances[0].activeIterations[0].taskId = {
        ...page.current.state.openMultiInstances[0].activeIterations[0].taskId,
        activation: 2,
      };
    }],
    ["task value kind", (page) => {
      page.current.state.openMultiInstances[0].activeIterations[0].taskInput.value = {
        kind: "stringList",
        value: ["alpha"],
      };
    }],
    ["duplicate controller", (page) => {
      page.current.state.openMultiInstances.push(
        structuredClone(page.current.state.openMultiInstances[0]),
      );
    }],
    ["terminal progress", (page) => { page.current.state.status = "completed"; }],
  ];
  for (const [label, mutate] of mutations) {
    const malformed = pageWithMultiInstanceProgress();
    mutate(malformed);
    assert.throws(
      () => requireExecutionPublicationPage(
        malformed,
        { ...multiInstanceContext, limit: 1 },
      ),
      /malformed execution publication page/u,
      label,
    );
  }
});

function pageWithMultiInstanceProgress(): any {
  const page = structuredClone(publicationPage()) as any;
  const taskId = {
    processInstanceId: "Instance_1",
    elementId: "Review",
    activation: 1,
  };
  page.current.state.activeWaits = [{
    elementId: "Review",
    kind: "userTask",
    multiplicity: 1,
  }];
  page.current.state.openUserTasks = [{
    id: taskId,
    name: "Review item",
    state: "active",
  }];
  page.current.state.enabledInteractions = [{
    kind: "completeUserTaskInstance",
    taskId,
  }];
  page.current.state.openMultiInstances = [{
    id: {
      processInstanceId: "Instance_1",
      activityElementId: "Review",
      activation: 1,
    },
    mode: "sequential",
    plannedInstanceCount: 3,
    pendingItemCount: 2,
    numberOfInstances: 1,
    numberOfActiveInstances: 1,
    numberOfCompletedInstances: 0,
    numberOfTerminatedInstances: 0,
    activeIterations: [{
      loopCounter: 0,
      taskId,
      taskInput: {
        name: "Review_Item_Input",
        value: { kind: "string", value: "alpha" },
      },
      completionBindingName: "Review_Item_Output",
    }],
  }];
  return page;
}
