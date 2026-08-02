import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  SemanticOperationKind,
  applyInternalOperation,
  applyStimulus,
  callOperationsArePaired,
  deriveCalledProcessInstanceId,
  initialState,
  isStableStateResumable,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "@bpmn-lean/semantic-core";

import {
  callActivityCompletion as completion,
  callActivityProgram as program,
  callActivityStart as start,
  callElementId,
  calledProcessId,
  expectedCalledInstanceId,
  instanceId,
} from "./call-activity-fixture.ts";

test("counts all called-definition identities before validating the selected root", () => {
  const operationScopes = new Map(
    program.operationScopes.map(({ operationId, scopeId }) => [operationId, scopeId]),
  );
  const placeScopes = new Map(
    program.controlPlaceScopes.map(({ controlPlaceId, scopeId }) => [
      controlPlaceId,
      scopeId,
    ]),
  );
  assert.equal(
    callOperationsArePaired(
      program.processId,
      [
        ...program.definitionScopes,
        {
          id: "scope:CalledProcess_Duplicate",
          parentScopeId: null,
          originElementId: calledProcessId,
        },
      ],
      program.operations,
      operationScopes,
      placeScopes,
    ),
    false,
  );
});

test("derives discriminating UTF-8-length called-instance identities", () => {
  assert.equal(
    deriveCalledProcessInstanceId(instanceId, callElementId, 1),
    expectedCalledInstanceId,
  );
  assert.notEqual(expectedCalledInstanceId, "call:9:Caller:😀:6:Call:é:1");
  const independentlyChangedIdentities = [
    expectedCalledInstanceId,
    deriveCalledProcessInstanceId("Caller::😀", callElementId, 1),
    deriveCalledProcessInstanceId(instanceId, "Call::é", 1),
    deriveCalledProcessInstanceId(instanceId, callElementId, 2),
  ];
  assert.equal(
    new Set(independentlyChangedIdentities).size,
    independentlyChangedIdentities.length,
  );
});

test("requires single-token invocation and a quiescent called Process", () => {
  const started = applyStimulus(program, initialState, start());
  const invokeOperation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.InvokeProcess,
  );
  const returnOperation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.ReturnProcess,
  );
  assert.ok(invokeOperation?.kind === SemanticOperationKind.InvokeProcess);
  assert.ok(returnOperation?.kind === SemanticOperationKind.ReturnProcess);
  assert.equal(applyInternalOperation(returnOperation, started.state), null);

  const beforeInvoke = applyStimulus(program, initialState, start(), 1).state;
  assert.equal(
    applyInternalOperation(invokeOperation, {
      ...beforeInvoke,
      controlTokens: beforeInvoke.controlTokens.map((token) => ({
        ...token,
        multiplicity: 2,
      })),
    }),
    null,
  );
});

test("rejects malformed call records and called roots", () => {
  const { beforeReturn, calledRoot, record, returnOperation } =
    returnReadyContext();
  const wrongCalledInstanceId = "call:wrong-derived-identity";
  const malformedStates: ReadonlyArray<RuntimeState> = [
    { ...beforeReturn, calledProcessOccurrences: [] },
    { ...beforeReturn, calledProcessOccurrences: [record, record] },
    {
      ...beforeReturn,
      calledProcessOccurrences: [
        record,
        { ...record, calledProcessId: "Other_Process" },
      ],
    },
    {
      ...beforeReturn,
      calledProcessOccurrences: [{
        ...record,
        calledRoot: {
          ...record.calledRoot,
          processInstanceId: wrongCalledInstanceId,
        },
      }],
      scopeOccurrences: beforeReturn.scopeOccurrences.map((occurrence) =>
        occurrence.id.processInstanceId === record.calledRoot.processInstanceId
          ? {
              ...occurrence,
              id: {
                ...occurrence.id,
                processInstanceId: wrongCalledInstanceId,
              },
            }
          : occurrence
      ),
    },
    {
      ...beforeReturn,
      calledProcessOccurrences: [{
        ...record,
        id: { ...record.id, activation: 0 },
      }],
    },
    {
      ...beforeReturn,
      scopeOccurrences: [...beforeReturn.scopeOccurrences, calledRoot],
    },
  ];
  for (const state of malformedStates) {
    assert.equal(applyInternalOperation(returnOperation, state), null);
  }
});

test("binds a call record caller to the exact hosting root occurrence", () => {
  const { activeWait, beforeReturn, hostingRoot, record, returnOperation } =
    returnReadyContext();
  const childCaller = {
    processInstanceId: instanceId,
    definitionScopeId: "scope:Caller_Child",
    activation: 1,
  };
  const childCallerState: RuntimeState = {
    ...beforeReturn,
    scopeOccurrences: [
      ...beforeReturn.scopeOccurrences,
      { id: childCaller, parent: hostingRoot.id },
    ],
    userTaskWaits: [callerWait(activeWait, childCaller)],
    calledProcessOccurrences: [{ ...record, caller: childCaller }],
  };
  assert.equal(applyInternalOperation(returnOperation, childCallerState), null);
  assert.equal(isStableStateResumable(childCallerState), false);
});

test("requires exactly one parentless hosting root occurrence", () => {
  const { activeWait, beforeReturn, hostingRoot, returnOperation } =
    returnReadyContext();
  const duplicateHostingRootState: RuntimeState = {
    ...beforeReturn,
    scopeOccurrences: [
      ...beforeReturn.scopeOccurrences,
      {
        id: {
          processInstanceId: instanceId,
          definitionScopeId: "scope:Duplicate_Hosting_Root",
          activation: 1,
        },
        parent: null,
      },
    ],
    userTaskWaits: [callerWait(activeWait, hostingRoot.id)],
  };
  assert.equal(
    applyInternalOperation(returnOperation, duplicateHostingRootState),
    null,
  );
  assert.equal(isStableStateResumable(duplicateHostingRootState), false);
});

test("commits task completion before a malformed association strands closure", () => {
  const { record, started } = returnReadyContext();
  const malformed = {
    ...started.state,
    calledProcessOccurrences: [
      ...started.state.calledProcessOccurrences,
      record,
    ],
  };
  const committed = applyStimulus(
    program,
    malformed,
    completion(expectedCalledInstanceId, "Task_Called", "commit-before-strand"),
  );
  assert.equal(committed.outcome, CommandOutcome.Committed);
  assert.equal(committed.state.userTaskWaits.length, 0);
  assert.equal(isStableStateResumable(committed.state), false);
  assert.equal(
    isStableStateResumable({
      ...started.state,
      calledProcessOccurrences: [],
    }),
    false,
  );
});

test("rejects a called root aliased to the hosting instance", () => {
  const { hostingRoot, record, started } = returnReadyContext();
  const aliasedCalledRoot = {
    ...record.calledRoot,
    processInstanceId: instanceId,
  };
  assert.equal(
    isStableStateResumable({
      ...started.state,
      scopeOccurrences: [
        hostingRoot,
        { id: aliasedCalledRoot, parent: null },
      ],
      userTaskWaits: started.state.userTaskWaits.map((wait) => ({
        ...wait,
        owner: aliasedCalledRoot,
      })),
      calledProcessOccurrences: [{
        ...record,
        calledRoot: aliasedCalledRoot,
      }],
    }),
    false,
  );
});

function returnReadyContext() {
  const started = applyStimulus(program, initialState, start());
  const beforeReturn = applyStimulus(
    program,
    started.state,
    completion(expectedCalledInstanceId, "Task_Called", "one-step"),
    1,
  ).state;
  const returnOperation = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.ReturnProcess,
  );
  const record = beforeReturn.calledProcessOccurrences[0];
  const calledRoot = beforeReturn.scopeOccurrences.find(
    ({ id }) => id.processInstanceId === expectedCalledInstanceId,
  );
  const hostingRoot = beforeReturn.scopeOccurrences.find(
    ({ id }) => id.processInstanceId === instanceId,
  );
  const activeWait = started.state.userTaskWaits[0];
  assert.ok(returnOperation?.kind === SemanticOperationKind.ReturnProcess);
  assert.ok(
    record !== undefined &&
      calledRoot !== undefined &&
      hostingRoot !== undefined &&
      activeWait !== undefined,
  );
  return {
    activeWait,
    beforeReturn,
    calledRoot,
    hostingRoot,
    record,
    returnOperation,
    started,
  };
}

function callerWait(
  source: RuntimeState["userTaskWaits"][number],
  owner: ScopeOccurrenceId,
): RuntimeState["userTaskWaits"][number] {
  return {
    ...source,
    id: {
      processInstanceId: instanceId,
      elementId: "Synthetic_Caller_Wait",
      activation: 1,
    },
    owner,
  };
}
