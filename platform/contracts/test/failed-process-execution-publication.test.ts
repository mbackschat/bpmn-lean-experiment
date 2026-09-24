import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeCanonicalExecutionPublicationExport,
  decodeExecutionPublicationPage,
  ProcessStatus,
  serializeExecutionPublicationExport,
} from "@bpmn-lean/platform-contracts";

import { executionPublicationPage, publicationIdentity } from "./execution-publication-fixture.ts";

const context = { ...publicationIdentity, afterRevision: 0, limit: 2 };
const occurrence = (elementId: string) => ({
  processInstanceId: publicationIdentity.processInstanceId,
  elementId,
  activation: 1,
});

function failedPage(message: string | null = null) {
  const initial = executionPublicationPage();
  const failure = {
    kind: "compensationHandlerFailure" as const,
    triggerId: occurrence("ThrowCompensation"),
    handlerId: occurrence("UndoCharge"),
    effectId: occurrence("Effect_UndoCharge"),
    code: "compensation-rejected",
    message,
  };
  return {
    ...initial,
    pageThroughRevision: 2,
    headRevision: 2,
    batches: [...initial.batches, {
      commandId: "fail-handler",
      fromRevision: 1,
      throughRevision: 2,
      transitions: [{
        revision: 2,
        logicalTimeMs: 0,
        transition: {
          kind: "externalStimulus" as const,
          stimulus: {
            kind: "completeEffect" as const,
            commandId: "fail-handler",
            effectId: failure.effectId,
            result: { kind: "bpmnError" as const, code: failure.code, message, localPatch: [] },
          },
        },
        positionDelta: {
          consumedTokens: [], producedTokens: [], enteredScopes: [],
          exitedScopes: initial.current!.scopes,
        },
      }],
    }],
    current: {
      revision: 2,
      state: { ...initial.current!.state, status: "failed" as const, failure },
      controlTokens: [],
      scopes: [],
    },
  };
}

test("accepts exactly the four committed statuses and preserves failed-state message values", () => {
  assert.deepEqual(Object.values(ProcessStatus), ["running", "completed", "cancelled", "failed"]);
  for (const message of [null, "", "Refund <declined> 🚀\n"] as const) {
    const page = failedPage(message);
    assert.deepEqual(decodeExecutionPublicationPage(page, context), page);
    assert.deepEqual(decodeExecutionPublicationPage({
      ...page,
      current: { ...page.current, state: { ...page.current.state, openMultiInstances: [] } },
    }, context).current!.state.openMultiInstances, []);
  }
});

test("rejects missing, misplaced, and unknown failure values", () => {
  const page = failedPage();
  const { failure, ...withoutFailure } = page.current.state;
  for (const state of [
    withoutFailure,
    { ...page.current.state, failure: null },
    ...["running", "completed", "cancelled", "notStarted", "future"].map((status) => ({
      ...page.current.state, status,
    })),
  ]) {
    assert.throws(() => decodeExecutionPublicationPage({ ...page, current: { ...page.current, state } }, context));
  }
  for (const key of Object.keys(failure)) {
    const missing = { ...failure } as Record<string, unknown>;
    delete missing[key];
    rejectFailure(missing);
  }
  rejectFailure({ ...failure, kind: "hostFailure" });
  rejectFailure({ ...failure, stack: "private" });
  for (const code of ["", "\ud800", null, 7]) rejectFailure({ ...failure, code });
  for (const message of [undefined, "\ud800", 7, {}]) rejectFailure({ ...failure, message });
});

test("requires each complete failure occurrence to belong to the published Process", () => {
  const failure = failedPage().current.state.failure;
  for (const key of ["triggerId", "handlerId", "effectId"] as const) {
    for (const identity of [
      null,
      { ...failure[key], processInstanceId: "another-process" },
      { ...failure[key], processInstanceId: "" },
      { ...failure[key], elementId: "" },
      { ...failure[key], elementId: "\ud800" },
      { ...failure[key], activation: 0 },
      { ...failure[key], activation: 1.5 },
      { ...failure[key], activation: Number.MAX_SAFE_INTEGER + 1 },
      { ...failure[key], runId: "private" },
      { processInstanceId: publicationIdentity.processInstanceId, activation: 1 },
    ]) rejectFailure({ ...failure, [key]: identity });
  }
});

test("rejects valid surviving waits and effects in a failed Process", () => {
  const page = failedPage();
  const id = occurrence("Survivor");
  for (const patch of [
    { activeWaits: [{ elementId: id.elementId, kind: "timer", multiplicity: 1 }] },
    { openTimers: [{ id, deadlineMs: 10 }] },
    { openEffects: [{ id, descriptor: { protocol: "test", operation: "test" }, arguments: [] }] },
    {
      openUserTasks: [{ id, name: null, state: "active" }],
      enabledInteractions: [{ kind: "completeUserTaskInstance", taskId: id }],
      openMultiInstances: [{
        id: { processInstanceId: id.processInstanceId, activityElementId: id.elementId, activation: 1 },
        mode: "sequential", plannedInstanceCount: 1, pendingItemCount: 0,
        numberOfInstances: 1, numberOfActiveInstances: 1,
        numberOfCompletedInstances: 0, numberOfTerminatedInstances: 0,
        activeIterations: [{
          loopCounter: 0, taskId: id,
          taskInput: { name: "item", value: { kind: "string", value: "one" } },
          completionBindingName: "answer",
        }],
      }],
    },
    {
      openMessageSubscriptions: [{ id, channel: { kind: "directMessage", messageId: "message" } }],
      enabledInteractions: [{ kind: "deliverMessage", subscriptionId: id, channel: { kind: "directMessage", messageId: "message" } }],
    },
    {
      openIncidents: [{
        kind: "effectExecutionFailed", id: { effectId: id, generation: 1 },
        effect: { id, descriptor: { protocol: "test", operation: "test" }, arguments: [] },
      }],
      enabledInteractions: [{ kind: "retryIncident", incidentId: { effectId: id, generation: 1 } }],
    },
  ]) {
    assert.throws(() => decodeExecutionPublicationPage({
      ...page, current: { ...page.current, state: { ...page.current.state, ...patch } },
    }, context), /terminal.*no open work/u);
  }
});

test("rejects retained failed control positions even on a positive-cursor page", () => {
  const initial = executionPublicationPage();
  const page = { ...failedPage(), requestedAfterRevision: 2, batches: [] };
  const scopes = initial.current!.scopes;
  for (const controlTokens of [[], [{ sequenceFlowId: "flow", owner: scopes[0]!.id, multiplicity: 1 }]]) {
    assert.throws(() => decodeExecutionPublicationPage({
      ...page, current: { ...page.current, scopes, controlTokens },
    }, { ...context, afterRevision: 2 }), /failed.*positions/u);
  }
});

test("preserves exact failure bytes in canonical exports", () => {
  const page = failedPage("");
  const { requestedAfterRevision: _requested, pageThroughRevision: _through, ...body } = page;
  const publication = { ...body, format: "bpmn-lean.execution-publication.v1" as const };
  const bytes = serializeExecutionPublicationExport(publication, publicationIdentity);
  const text = new TextDecoder().decode(bytes);
  const exactFailure = '"failure":{"code":"compensation-rejected","effectId":{"activation":1,"elementId":"Effect_UndoCharge","processInstanceId":"process-instance-1"},"handlerId":{"activation":1,"elementId":"UndoCharge","processInstanceId":"process-instance-1"},"kind":"compensationHandlerFailure","message":"","triggerId":{"activation":1,"elementId":"ThrowCompensation","processInstanceId":"process-instance-1"}}';
  assert.ok(text.includes(exactFailure));
  assert.deepEqual(decodeCanonicalExecutionPublicationExport(bytes, publicationIdentity), publication);
});

test("accepts an empty error message independently of terminal failure", () => {
  const page = failedPage("");
  const { failure: _failure, ...state } = page.current.state;
  const running = { ...page, current: { ...page.current, state: { ...state, status: "running" as const } } };
  assert.deepEqual(decodeExecutionPublicationPage(running, context), running);
});

function rejectFailure(failure: unknown): void {
  const page = failedPage();
  assert.throws(() => decodeExecutionPublicationPage({
    ...page, current: { ...page.current, state: { ...page.current.state, failure } },
  }, context));
}
