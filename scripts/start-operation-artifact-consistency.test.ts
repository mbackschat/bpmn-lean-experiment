/** Locks exact checked-to-IL bindings for all Process-start families. */
import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  CheckedProcessKind,
  CheckedNodeKind,
  CheckedProcess,
  SemanticOriginKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticProcessProgram,
} from "../packages/semantic-core/src/index.ts";

import {
  verifyCanonicalStartOperationOrder,
  verifyStartOperationBindings,
} from "./start-operation-artifact-consistency.ts";

const timerStartKind =
  "timerStartEvent" as CheckedNodeKind.TimerStartEvent;
const initiateTimerKind =
  "initiateTimer" as SemanticOperationKind.InitiateTimer;
const checkedProcessKind =
  "checkedProcess" as CheckedProcessKind.CheckedProcess;
const semanticProcessKind =
  "semanticProcess" as SemanticProcessKind.SemanticProcess;
const compilerKind =
  "bpmn-source-semantic-process" as SemanticProcessCompilerId.BpmnSourceSemanticProcess;
const bpmnElementOriginKind =
  "bpmnElement" as SemanticOriginKind.BpmnElement;
const bpmnSequenceFlowOriginKind =
  "bpmnSequenceFlow" as SemanticOriginKind.BpmnSequenceFlow;

function timerArtifacts(): Readonly<{
  checkedProcess: CheckedProcess;
  semanticProcess: SemanticProcessProgram;
}> {
  const sourceIdentity = {
    semanticProfile: "bpmn-2.0.2-timer-start-event-draft",
    sourceId: "timer-start-event",
    sourceSha256:
      "16ede7a6d5090be3a481ce7a4af97745bba96375272a59da66384091dd2c02b0",
    sourceOverlay: null,
  } as const;
  return {
    checkedProcess: {
      kind: checkedProcessKind,
      identity: sourceIdentity,
      processId: "Process_TimerStart",
      definitionScopes: [{
        id: "scope:Process_TimerStart",
        parentScopeId: null,
        originElementId: "Process_TimerStart",
      }],
      nodeScopes: [{
        nodeId: "TimerStart_PT1S",
        scopeId: "scope:Process_TimerStart",
      }],
      sequenceFlowScopes: [{
        sequenceFlowId: "Flow_TimerStartToTask",
        scopeId: "scope:Process_TimerStart",
      }],
      nodes: [{
        kind: timerStartKind,
        id: "TimerStart_PT1S",
        durationLiteral: "PT1S",
      }],
      sequenceFlows: [{
        id: "Flow_TimerStartToTask",
        sourceId: "TimerStart_PT1S",
        targetId: "UserTask_AfterTimer",
        condition: null,
      }],
    },
    semanticProcess: {
      kind: semanticProcessKind,
      identity: {
        compiler: compilerKind,
        ...sourceIdentity,
      },
      processId: "Process_TimerStart",
      definitionScopes: [{
        id: "scope:Process_TimerStart",
        parentScopeId: null,
        originElementId: "Process_TimerStart",
      }],
      operationScopes: [{
        operationId: "operation:TimerStart_PT1S",
        scopeId: "scope:Process_TimerStart",
      }],
      controlPlaceScopes: [{
        controlPlaceId: "place:Flow_TimerStartToTask",
        scopeId: "scope:Process_TimerStart",
      }],
      controlPlaces: [{
        id: "place:Flow_TimerStartToTask",
        origin: {
          kind: bpmnSequenceFlowOriginKind,
          elementId: "Flow_TimerStartToTask",
        },
      }],
      operations: [{
        id: "operation:TimerStart_PT1S",
        kind: initiateTimerKind,
        origin: {
          kind: bpmnElementOriginKind,
          elementId: "TimerStart_PT1S",
        },
        timer: { durationMs: 1_000 },
        outputs: ["place:Flow_TimerStartToTask"],
      }],
    },
  };
}

test("binds Timer Start origin, duration, and endpoint-derived outputs", () => {
  const exact = timerArtifacts();
  assert.doesNotThrow(() =>
    verifyStartOperationBindings(
      exact.checkedProcess,
      exact.semanticProcess,
      (left, right) => left.localeCompare(right),
    )
  );

  const operation = exact.semanticProcess.operations[0];
  assert.equal(operation?.kind, initiateTimerKind);
  if (operation?.kind !== initiateTimerKind) {
    throw new TypeError("expected Timer Start operation");
  }
  const mutations: ReadonlyArray<
    (candidate: SemanticProcessProgram) => void
  > = [
    (candidate) => {
      const candidateOperation = candidate.operations[0];
      if (candidateOperation?.kind !== initiateTimerKind) {
        throw new TypeError("expected Timer Start operation");
      }
      Reflect.set(candidateOperation.origin, "elementId", "Other_Start");
    },
    (candidate) => {
      const candidateOperation = candidate.operations[0];
      if (candidateOperation?.kind !== initiateTimerKind) {
        throw new TypeError("expected Timer Start operation");
      }
      Reflect.set(candidateOperation.timer, "durationMs", 999);
    },
    (candidate) => {
      const candidateOperation = candidate.operations[0];
      if (candidateOperation?.kind !== initiateTimerKind) {
        throw new TypeError("expected Timer Start operation");
      }
      Reflect.set(candidateOperation, "outputs", ["place:Other_Flow"]);
    },
  ];
  for (const mutate of mutations) {
    const mutation = structuredClone(exact.semanticProcess);
    mutate(mutation);
    assert.throws(
      () =>
        verifyStartOperationBindings(
          exact.checkedProcess,
          mutation,
          (left, right) => left.localeCompare(right),
        ),
      /Timer Start|cardinality/u,
    );
  }
});

test("checks canonical Timer Start fan-out independently of selected profile cardinality", () => {
  assert.doesNotThrow(() =>
    verifyCanonicalStartOperationOrder({
      id: "operation:TimerStart",
      kind: initiateTimerKind,
      origin: { kind: bpmnElementOriginKind, elementId: "TimerStart" },
      timer: { durationMs: 1_000 },
      outputs: ["place:A", "place:B"],
    }, (left, right) => left.localeCompare(right))
  );
  assert.throws(
    () =>
      verifyCanonicalStartOperationOrder({
        id: "operation:TimerStart",
        kind: initiateTimerKind,
        origin: { kind: bpmnElementOriginKind, elementId: "TimerStart" },
        timer: { durationMs: 1_000 },
        outputs: ["place:B", "place:A"],
      }, (left, right) => left.localeCompare(right)),
    /outputs must be sorted/u,
  );
});
