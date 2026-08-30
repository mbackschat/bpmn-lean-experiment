import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  ActivityHandlerKind,
  CommandOutcome,
  ControlStateKind,
  MessageChannelKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  applyStimulus,
  enabledInternalOperationCount,
  initialState,
  isStableStateResumable,
  isWellFormedSemanticProcessProgram,
  runtimeStateDefects,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  DeliverMessageStimulus,
  RuntimeState,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

const messageProfile =
  "bpmn-2.0.2-intermediate-catch-message-draft";

const channel = Object.freeze({
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_ProcessMessages",
  interfaceOperationId: "Operation_ReceiveApprovalRequest",
  messageId: "Message_ApprovalRequest",
});

const program = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: messageProfile,
    sourceId: "intermediate-catch-message-process",
    sourceOverlay: null,
    sourceSha256:
      "2222222222222222222222222222222222222222222222222222222222222222",
  },
  processId: "Process_IntermediateCatchMessage",
  controlPlaces: [
    controlPlace("Flow_MessageToTask"),
    controlPlace("Flow_StartToMessage"),
    controlPlace("Flow_TaskToEnd"),
  ],
  operations: [
    {
      ...operationBase("EndEvent_1"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_TaskToEnd",
    },
    {
      ...operationBase("MessageCatch_ApprovalRequest"),
      kind: SemanticOperationKind.AwaitMessage,
      input: "place:Flow_StartToMessage",
      output: "place:Flow_MessageToTask",
      message: {
        elementId: "MessageCatch_ApprovalRequest",
        channel,
      },
    },
    {
      ...operationBase("StartEvent_1"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToMessage",
    },
    {
      ...operationBase("UserTask_Approve"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_MessageToTask",
      output: "place:Flow_TaskToEnd",
      task: {
        elementId: "UserTask_Approve",
        name: "Approve",
      },
    },
  ],
});

const reverseProgram = rootScopedProgram({
  ...program,
  controlPlaces: [
    controlPlace("Flow_MessageToEnd"),
    controlPlace("Flow_StartToTask"),
    controlPlace("Flow_TaskToMessage"),
  ],
  operations: program.operations.map((operation) => {
    switch (operation.kind) {
      case SemanticOperationKind.Initiate:
        return { ...operation, output: "place:Flow_StartToTask" };
      case SemanticOperationKind.AwaitUserTask:
        return {
          ...operation,
          input: "place:Flow_StartToTask",
          output: "place:Flow_TaskToMessage",
        };
      case SemanticOperationKind.AwaitMessage:
        return {
          ...operation,
          input: "place:Flow_TaskToMessage",
          output: "place:Flow_MessageToEnd",
        };
      case SemanticOperationKind.ReachNoneEnd:
        return { ...operation, input: "place:Flow_MessageToEnd" };
      default:
        return operation;
    }
  }),
});

const start = Object.freeze({
  kind: StimulusKind.StartProcess,
  commandId: "start-message-process",
  processId: program.processId,
  instanceId: "MessageInstance_1",
  initialVariables: [],
});

const subscriptionId = Object.freeze({
  processInstanceId: "MessageInstance_1",
  elementId: "MessageCatch_ApprovalRequest",
  activation: 1,
});

const delivery = Object.freeze({
  kind: StimulusKind.DeliverMessage,
  commandId: "deliver-message",
  subscriptionId,
  channel,
}) satisfies DeliverMessageStimulus;

const completion = Object.freeze({
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-message-user-task",
  taskId: {
    processInstanceId: "MessageInstance_1",
    elementId: "UserTask_Approve",
    activation: 1,
  },
  submittedValues: [],
});

test("activates one exact Message subscription and delivers it once", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(supportsSemanticProcessExecution(start, program), true);

  const waiting = applyStimulus(program, initialState, start);
  assert.equal(waiting.outcome, CommandOutcome.Committed);
  assert.deepEqual(waiting.state.messageWaits, [
    {
      id: subscriptionId,
      owner: rootScopeOccurrence(program.processId, start.instanceId),
      channel,
      output: "place:Flow_MessageToTask",
    },
  ]);
  assert.equal(enabledInternalOperationCount(program, waiting.state), 0);
  assert.equal(isStableStateResumable(waiting.state), true);

  const delivered = applyStimulus(program, waiting.state, delivery);
  assert.equal(delivered.outcome, CommandOutcome.Committed);
  assert.deepEqual(delivered.state.messageWaits, []);
  assert.deepEqual(delivered.state.userTaskWaits.map(({ id }) => id), [
    completion.taskId,
  ]);

  const stale = applyStimulus(program, delivered.state, {
    ...delivery,
    commandId: "deliver-message-stale",
  });
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, delivered.state);
});

test("direct delivery refuses a Message wait claimed by an Activity occurrence", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const ordinarySuccessor = applyStimulus(program, waiting, delivery).state;
  const owner = rootScopeOccurrence(program.processId, start.instanceId);
  const attached: RuntimeState = {
    ...waiting,
    userTaskWaits: ordinarySuccessor.userTaskWaits,
    taskActivations: ordinarySuccessor.taskActivations,
    activityOccurrences: [{
      id: {
        processInstanceId: start.instanceId,
        activityElementId: completion.taskId.elementId,
        activation: 1,
      },
      owner,
      operationId: "operation:UserTask_Approve",
      body: { kind: ActivityBodyKind.UserTask, task: completion.taskId },
      attachedHandlers: [{
        kind: ActivityHandlerKind.Message,
        occurrence: subscriptionId,
      }],
    }],
    activityActivations: [{ elementId: completion.taskId.elementId, count: 1 }],
  };
  assert.deepEqual(runtimeStateDefects(program, start.instanceId, attached), []);

  const rejected = applyStimulus(program, attached, delivery);
  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.deepEqual(rejected.state, attached);
});

test("rejects every subscription or channel mismatch with exact state preservation", () => {
  const waiting = applyStimulus(program, initialState, start).state;
  const mutations: ReadonlyArray<Partial<DeliverMessageStimulus>> = [
    {
      subscriptionId: {
        ...subscriptionId,
        processInstanceId: "OtherInstance",
      },
    },
    {
      subscriptionId: {
        ...subscriptionId,
        elementId: "OtherCatch",
      },
    },
    {
      subscriptionId: {
        ...subscriptionId,
        activation: 2,
      },
    },
    { channel: { ...channel, interfaceId: "OtherInterface" } },
    {
      channel: {
        ...channel,
        interfaceOperationId: "OtherOperation",
      },
    },
    { channel: { ...channel, messageId: "OtherMessage" } },
  ];

  for (const [index, mutation] of mutations.entries()) {
    const rejected = applyStimulus(program, waiting, {
      ...delivery,
      ...mutation,
      commandId: `reject-message-${index}`,
    });
    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, waiting);
  }
});

test("admits the reverse mechanism order and refuses pre-activation delivery", () => {
  assert.equal(isWellFormedSemanticProcessProgram(reverseProgram), true);
  assert.equal(supportsSemanticProcessExecution(start, reverseProgram), true);

  const taskWait = applyStimulus(reverseProgram, initialState, start);
  const premature = applyStimulus(reverseProgram, taskWait.state, delivery);
  assert.equal(premature.outcome, CommandOutcome.Rejected);
  assert.deepEqual(premature.state, taskWait.state);

  const messageWait = applyStimulus(
    reverseProgram,
    taskWait.state,
    completion,
  );
  assert.deepEqual(messageWait.state.messageWaits.map(({ id }) => id), [
    subscriptionId,
  ]);

  const completed = applyStimulus(
    reverseProgram,
    messageWait.state,
    delivery,
  );
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(completed.state.control, {
    kind: ControlStateKind.Completed,
    instanceId: "MessageInstance_1",
  });
});

test("rejects Message capability drift without a topology predicate", () => {
  for (const semanticProfile of [
    "cibseven-2.2.0-user-task-process-data-draft",
    "bpmn-2.0.2-timer-user-task-composition-draft",
    "unknown-profile",
  ]) {
    assert.equal(
      supportsSemanticProcessExecution(start, {
        ...program,
        identity: { ...program.identity, semanticProfile },
      }),
      false,
    );
  }
});
