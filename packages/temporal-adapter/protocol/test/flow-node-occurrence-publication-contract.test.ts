import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FlowNodeOccurrencePublicationResultKind,
  bpmnFlowNodeOccurrencesQueryName,
  requireFlowNodeOccurrencePublicationRequest,
  requireFlowNodeOccurrencePublicationResult,
  requireFlowNodeOccurrencePublicationTransportResult,
} from "../dist/index.js";
import {
  definition,
  program,
  publicationPage,
} from "./semantic-publication-fixture.ts";

const owner = {
  processInstanceId: "Instance_1",
  definitionScopeId: "Scope_Process_1",
  activation: 1,
} as const;

function occurrencePage() {
  return {
    definition,
    processId: "Process_1",
    processInstanceId: "Instance_1",
    requestedAfterRevision: 0,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [{
      commandId: "command-start",
      fromRevision: 0,
      throughRevision: 2,
      committedAtEpochMs: 1_000,
      transitions: [{
        revision: 1,
        lifecycle: { started: [], ended: [] },
      }, {
        revision: 2,
        lifecycle: {
          started: [{
            id: {
              processInstanceId: "Instance_1",
              startRevision: 2,
              startIndex: 0,
            },
            processId: "Process_1",
            elementId: "StartEvent_1",
            owner,
          }],
          ended: [{
            id: {
              processInstanceId: "Instance_1",
              startRevision: 2,
              startIndex: 0,
            },
            terminal: "completed",
          }],
        },
      }],
    }],
    currentOpen: [],
  } as const;
}

const programContext = {
  program,
  processInstanceId: "Instance_1",
  executionPublication: publicationPage(),
  afterRevision: 0,
  limit: 1,
} as const;

const transportContext = {
  definition,
  processId: "Process_1",
  processInstanceId: "Instance_1",
  afterRevision: 0,
  limit: 1,
} as const;

test("defines the strict flow-node occurrence Query request and closed result", () => {
  assert.equal(bpmnFlowNodeOccurrencesQueryName, "bpmn-flow-node-occurrences");
  for (const value of [
    { afterRevision: 0 },
    { afterRevision: Number.MAX_SAFE_INTEGER, limit: 100 },
  ]) {
    assert.deepEqual(requireFlowNodeOccurrencePublicationRequest(value), value);
  }
  for (const value of [
    {},
    { afterRevision: -1 },
    { afterRevision: 0, limit: 0 },
    { afterRevision: 0, limit: 101 },
    { afterRevision: 0, limit: undefined },
    { afterRevision: 0, extra: true },
  ]) {
    assert.throws(
      () => requireFlowNodeOccurrencePublicationRequest(value),
      /malformed flow-node occurrence publication request/u,
    );
  }
  assert.deepEqual(
    requireFlowNodeOccurrencePublicationResult(
      { kind: FlowNodeOccurrencePublicationResultKind.Available, page: occurrencePage() },
      programContext,
    ),
    { kind: "available", page: occurrencePage() },
  );
});

test("rejects occurrence command, range, and revision drift from otherwise valid E1 alignment", () => {
  const mutations: Array<(page: ReturnType<typeof occurrencePage>) => void> = [
    (page) => { page.batches[0].commandId = "drifted-command"; },
    (page) => { page.batches[0].throughRevision = 1; },
    (page) => { page.batches[0].transitions[1].revision = 1; },
    (page) => { page.headRevision = 3; },
  ];
  for (const mutate of mutations) {
    const page = structuredClone(occurrencePage());
    mutate(page);
    assert.throws(
      () => requireFlowNodeOccurrencePublicationResult(
        { kind: "available", page },
        programContext,
      ),
      /malformed flow-node occurrence publication result/u,
    );
  }
});

test("keeps shapes, enums, safe integers, and Program correspondence strict", () => {
  const mutations: Array<(page: ReturnType<typeof occurrencePage>) => void> = [
    (page) => { Object.assign(page, { privateAnchor: "forbidden" }); },
    (page) => { page.batches[0].committedAtEpochMs = -1; },
    (page) => {
      page.batches[0].committedAtEpochMs = Number.MAX_SAFE_INTEGER + 1;
    },
    (page) => {
      page.batches[0].transitions[1].lifecycle.started[0].id.startIndex = 1;
    },
    (page) => {
      page.batches[0].transitions[1].lifecycle.ended[0].terminal = "failed";
    },
    (page) => {
      page.batches[0].transitions[1].lifecycle.started[0].owner.activation = 0;
    },
    (page) => { page.currentOpen = null; },
  ];
  for (const mutate of mutations) {
    const page = structuredClone(occurrencePage());
    mutate(page);
    assert.throws(
      () => requireFlowNodeOccurrencePublicationTransportResult(
        { kind: "available", page },
        transportContext,
      ),
      /malformed flow-node occurrence publication transport result/u,
    );
  }

  for (const mutate of [
    (page: ReturnType<typeof occurrencePage>) => {
      page.batches[0].transitions[1].lifecycle.started[0].processId =
        "Other_Process";
    },
    (page: ReturnType<typeof occurrencePage>) => {
      page.batches[0].transitions[1].lifecycle.started[0].elementId =
        "Unknown_Element";
    },
    (page: ReturnType<typeof occurrencePage>) => {
      page.batches[0].transitions[1].lifecycle.started[0].owner
        .definitionScopeId = "Unknown_Scope";
    },
  ]) {
    const page = structuredClone(occurrencePage());
    mutate(page);
    assert.deepEqual(
      requireFlowNodeOccurrencePublicationTransportResult(
        { kind: "available", page },
        transportContext,
      ),
      { kind: "available", page },
    );
    assert.throws(
      () => requireFlowNodeOccurrencePublicationResult(
        { kind: "available", page },
        programContext,
      ),
      /malformed flow-node occurrence publication result/u,
    );
  }

  const nestedProgram = structuredClone(program) as any;
  nestedProgram.operations.push({
    id: "Operation_Bounded_Task",
    kind: "awaitBoundedUserTask",
    origin: { kind: "bpmnElement", elementId: "Task_Bounded" },
    input: "Place_Flow_1",
    task: {
      elementId: "Task_Bounded",
      name: null,
      output: "Place_Flow_1",
    },
    boundaryTimer: {
      elementId: "Boundary_Timer",
      durationMs: 1_000,
      output: "Place_Flow_1",
      origin: { kind: "bpmnSequenceFlow", elementId: "Flow_1" },
    },
  });
  nestedProgram.operationScopes.push({
    operationId: "Operation_Bounded_Task",
    scopeId: "Scope_Process_1",
  });
  const crossOperationPage = structuredClone(occurrencePage());
  crossOperationPage.batches[0].transitions[1].lifecycle.started[0].elementId =
    "Task_Bounded";
  assert.throws(
    () => requireFlowNodeOccurrencePublicationResult(
      { kind: "available", page: crossOperationPage },
      { ...programContext, program: nestedProgram },
    ),
    /malformed flow-node occurrence publication result/u,
  );

  const nestedPage = structuredClone(crossOperationPage);
  const nestedExecution = structuredClone(publicationPage());
  Object.assign(nestedExecution.batches[0].transitions[1].transition, {
    operationId: "Operation_Bounded_Task",
    operationKind: "awaitBoundedUserTask",
    origin: { kind: "bpmnElement", elementId: "Task_Bounded" },
  });
  assert.deepEqual(
    requireFlowNodeOccurrencePublicationResult(
      { kind: "available", page: nestedPage },
      {
        ...programContext,
        program: nestedProgram,
        executionPublication: nestedExecution,
      },
    ),
    { kind: "available", page: nestedPage },
  );

  nestedProgram.definitionScopes.push({
    id: "Scope_Child",
    parentScopeId: "Scope_Process_1",
    originElementId: "SubProcess_1",
  });
  nestedProgram.operations.push({
    id: "Operation_Throw_Error",
    kind: "throwError",
    origin: { kind: "bpmnElement", elementId: "ErrorEnd_1" },
    input: "Place_Flow_1",
    error: { code: "ERR", errorDefinitionId: "Error_1" },
    handler: {
      attachedScopeId: "Scope_Child",
      code: "ERR",
      output: "Place_Flow_1",
      origin: {
        kind: "bpmnElement",
        boundaryEventId: "Boundary_Error",
        errorDefinitionId: "Error_1",
        errorElementId: "Error_1",
        sequenceFlowId: "Flow_1",
      },
    },
  });
  nestedProgram.operationScopes.push({
    operationId: "Operation_Throw_Error",
    scopeId: "Scope_Child",
  });
  nestedProgram.controlPlaces.push({
    id: "Place_Child",
    origin: { kind: "bpmnSequenceFlow", elementId: "Flow_Child" },
  });
  nestedProgram.controlPlaceScopes.push({
    controlPlaceId: "Place_Child",
    scopeId: "Scope_Child",
  });
  const propagatedBoundaryPage = structuredClone(occurrencePage());
  propagatedBoundaryPage.batches[0].transitions[1].lifecycle.started[0]
    .elementId = "Boundary_Error";
  const propagatedBoundaryExecution = structuredClone(publicationPage());
  Object.assign(
    propagatedBoundaryExecution.batches[0].transitions[1].transition,
    {
      operationId: "Operation_Throw_Error",
      operationKind: "throwError",
      origin: { kind: "bpmnElement", elementId: "ErrorEnd_1" },
      owner: {
        processInstanceId: "Instance_1",
        definitionScopeId: "Scope_Child",
        activation: 1,
      },
    },
  );
  const childOwner = propagatedBoundaryExecution.batches[0].transitions[1]
    .transition.owner;
  const childScope = {
    id: childOwner,
    parent: owner,
    bpmnElementId: "SubProcess_1",
  };
  propagatedBoundaryExecution.batches[0].transitions[1].positionDelta
    .producedTokens.push({
      sequenceFlowId: "Flow_Child",
      owner: childOwner,
      multiplicity: 1,
    });
  propagatedBoundaryExecution.batches[0].transitions[1].positionDelta
    .enteredScopes.unshift(childScope);
  propagatedBoundaryExecution.current.controlTokens.push({
    sequenceFlowId: "Flow_Child",
    owner: childOwner,
    multiplicity: 1,
  });
  propagatedBoundaryExecution.current.scopes.unshift(childScope);
  assert.deepEqual(
    requireFlowNodeOccurrencePublicationResult(
      { kind: "available", page: propagatedBoundaryPage },
      {
        ...programContext,
        program: nestedProgram,
        executionPublication: propagatedBoundaryExecution,
      },
    ),
    { kind: "available", page: propagatedBoundaryPage },
  );
});

test("folds revision zero and rejects terminal, duplicate, ordering, and time corruption", () => {
  const unknownTerminal = structuredClone(occurrencePage());
  unknownTerminal.batches[0].transitions[0].lifecycle.ended.push({
    id: {
      processInstanceId: "Instance_1",
      startRevision: 1,
      startIndex: 0,
    },
    terminal: "completed",
  });
  const duplicateStart = structuredClone(occurrencePage());
  duplicateStart.batches[0].transitions[1].lifecycle.started.push(
    structuredClone(duplicateStart.batches[0].transitions[1].lifecycle.started[0]!),
  );
  const duplicateTerminal = structuredClone(occurrencePage());
  duplicateTerminal.batches[0].transitions[1].lifecycle.ended.push(
    structuredClone(duplicateTerminal.batches[0].transitions[1].lifecycle.ended[0]!),
  );
  const decreasingTime = structuredClone(occurrencePage());
  decreasingTime.batches.push({
    commandId: "command-second",
    fromRevision: 2,
    throughRevision: 3,
    committedAtEpochMs: 999,
    transitions: [{
      revision: 3,
      lifecycle: { started: [], ended: [] },
    }],
  });
  decreasingTime.pageThroughRevision = 3;
  decreasingTime.headRevision = 3;

  for (const page of [
    unknownTerminal,
    duplicateStart,
    duplicateTerminal,
    decreasingTime,
  ]) {
    assert.throws(
      () => requireFlowNodeOccurrencePublicationTransportResult(
        { kind: "available", page },
        transportContext,
      ),
      /malformed flow-node occurrence publication transport result/u,
    );
  }
});

test("keeps positive-cursor transport representation-free and private anchors off the public type surface", async () => {
  const page = occurrencePage();
  const positive = {
    ...page,
    requestedAfterRevision: 2,
    pageThroughRevision: 2,
    batches: [],
    currentOpen: [{
      id: {
        processInstanceId: "Instance_1",
        startRevision: 1,
        startIndex: 9,
      },
      processId: "Process_1",
      elementId: "Unseen_Prefix_Element",
      owner,
      startedAtEpochMs: 10,
    }],
  } as const;
  assert.deepEqual(
    requireFlowNodeOccurrencePublicationTransportResult(
      { kind: "available", page: positive },
      { ...transportContext, afterRevision: 2 },
    ),
    { kind: "available", page: positive },
  );

  const [e1Source, occurrenceTypes] = await Promise.all([
    readFile(
      new URL("../src/semantic-publication.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../dist/flow-node-occurrence-publication.d.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.doesNotMatch(e1Source, /FlowNodeOccurrence|flow-node-occurrence/u);
  assert.doesNotMatch(
    occurrenceTypes,
    /SemanticFlowNodeOccurrenceAnchor|transitionIndex|localIndex/u,
  );
});
