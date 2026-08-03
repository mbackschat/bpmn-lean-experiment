/**
 * Locks the product host-interaction driver against the canonical enabled-interaction contract.
 *
 * The oracle is the published `enabledInteractions` set plus the open timer and effect waits of
 * each committed state: the driver may answer only what the semantic core already enables, must
 * take occurrence identity from that publication, and must never resolve an ambiguity itself.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  MessageChannelKind,
  ProcessStatus,
  StimulusKind,
  UserTaskLifecycleState,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  DeliverMessageStimulus,
  CompleteUserTaskInstanceStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";

import {
  HostInteractionRefusalCode,
  HostInteractionResultKind,
  ProcessCommandResultKind,
  driveHostInteractions,
} from "@bpmn-lean/temporal-adapter";
import type {
  HostInteractionPort,
  HostInteractionResponse,
  ProcessCommandResult,
} from "@bpmn-lean/temporal-adapter";

const instanceId = "Driver_Test_1";

const committed: ProcessCommandResult = {
  kind: ProcessCommandResultKind.Semantic,
  commandId: "driver-test-command",
  outcome: CommandOutcome.Committed,
};

function openTask(elementId: string, activation = 1) {
  return {
    id: { processInstanceId: instanceId, elementId, activation },
    name: null,
    state: UserTaskLifecycleState.Active,
  } as const;
}

function directChannel(messageId: string) {
  return {
    kind: MessageChannelKind.DirectMessage,
    messageId,
  } as const;
}

function state(
  overrides: Partial<Omit<StateObservation, "kind" | "instanceId">>,
): StateObservation {
  return {
    kind: CanonicalObservationKind.State,
    instanceId,
    status: ProcessStatus.Running,
    activeWaits: [],
    openUserTasks: [],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    variables: [],
    enabledInteractions: [],
    logicalTimeMs: 0,
    ...overrides,
  } as StateObservation;
}

function taskInteraction(elementId: string, activation = 1) {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    taskId: { processInstanceId: instanceId, elementId, activation },
  } as const;
}

function messageInteraction(messageId: string, activation = 1) {
  return {
    kind: StimulusKind.DeliverMessage,
    subscriptionId: {
      processInstanceId: instanceId,
      elementId: `Catch_${messageId}`,
      activation,
    },
    channel: directChannel(messageId),
  } as const;
}

function completeResponse(
  elementId: string,
): HostInteractionResponse {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    elementId,
    delayMs: 1,
    inputVariableNames: [],
    submittedValues: [
      {
        name: "decision",
        value: { kind: VariableValueKind.String, value: elementId },
      },
    ],
  };
}

function deliverResponse(messageId: string): HostInteractionResponse {
  return {
    kind: StimulusKind.DeliverMessage,
    channel: directChannel(messageId),
    delayMs: 1,
  };
}

/** Scripts one committed state per read so a test fixes the exact observation sequence. */
function scriptedPort(
  states: ReadonlyArray<StateObservation>,
): {
  readonly port: HostInteractionPort;
  readonly completions: CompleteUserTaskInstanceStimulus[];
  readonly deliveries: DeliverMessageStimulus[];
} {
  const completions: CompleteUserTaskInstanceStimulus[] = [];
  const deliveries: DeliverMessageStimulus[] = [];
  let index = 0;
  return {
    completions,
    deliveries,
    port: {
      readState: async () => {
        const next = states[Math.min(index, states.length - 1)];
        index += 1;
        if (next === undefined) {
          throw new TypeError("scripted state sequence is empty");
        }
        return next;
      },
      readUserTaskDetail: async (request) => ({
        task: openTask(request.taskId.elementId, request.taskId.activation),
        inputVariables: [],
      }),
      submitCompletion: async (stimulus) => {
        completions.push(stimulus);
        return committed;
      },
      submitMessage: async (stimulus) => {
        deliveries.push(stimulus);
        return committed;
      },
    },
  };
}

const noWait = async (): Promise<void> => undefined;

test("completes two concurrent User Tasks in declared plan order", async () => {
  const both = state({
    openUserTasks: [openTask("UserTask_B"), openTask("UserTask_A")],
    enabledInteractions: [
      taskInteraction("UserTask_B"),
      taskInteraction("UserTask_A"),
    ],
  });
  const onlyB = state({
    openUserTasks: [openTask("UserTask_B")],
    enabledInteractions: [taskInteraction("UserTask_B")],
  });
  const { port, completions } = scriptedPort([
    both,
    onlyB,
    state({ status: ProcessStatus.Completed }),
  ]);

  const result = await driveHostInteractions(
    [completeResponse("UserTask_A"), completeResponse("UserTask_B")],
    port,
    noWait,
  );

  assert.equal(result.kind, HostInteractionResultKind.Driven);
  assert.deepEqual(
    completions.map((stimulus) => stimulus.taskId.elementId),
    ["UserTask_A", "UserTask_B"],
  );
});

test("takes occurrence identity from the published interaction", async () => {
  const { port, completions } = scriptedPort([
    state({
      openUserTasks: [openTask("UserTask_A", 7)],
      enabledInteractions: [taskInteraction("UserTask_A", 7)],
    }),
    state({ status: ProcessStatus.Completed }),
  ]);

  await driveHostInteractions([completeResponse("UserTask_A")], port, noWait);

  assert.equal(completions[0]?.taskId.activation, 7);
});

test("waits for a host-resolved timer while a losing Message stays enabled", async () => {
  const armed = state({
    openTimers: [
      {
        id: {
          processInstanceId: instanceId,
          elementId: "Timer_Race",
          activation: 1,
        },
        deadlineMs: 1_000,
      },
    ],
    enabledInteractions: [messageInteraction("raceMessage")],
  });
  const { port, completions, deliveries } = scriptedPort([
    armed,
    armed,
    state({ status: ProcessStatus.Completed }),
  ]);

  const result = await driveHostInteractions([], port, noWait);

  assert.equal(result.kind, HostInteractionResultKind.Driven);
  assert.deepEqual(completions, []);
  assert.deepEqual(deliveries, []);
});

test("delivers a Message through the published subscription identity", async () => {
  const { port, deliveries } = scriptedPort([
    state({
      openMessageSubscriptions: [
        {
          id: {
            processInstanceId: instanceId,
            elementId: "Catch_invoice",
            activation: 1,
          },
          channel: directChannel("invoice"),
        },
      ],
      enabledInteractions: [messageInteraction("invoice")],
    }),
    state({ status: ProcessStatus.Completed }),
  ]);

  const result = await driveHostInteractions(
    [deliverResponse("invoice")],
    port,
    noWait,
  );

  assert.equal(result.kind, HostInteractionResultKind.Driven);
  assert.equal(deliveries[0]?.subscriptionId.elementId, "Catch_invoice");
  assert.equal(deliveries[0]?.channel.kind, MessageChannelKind.DirectMessage);
});

test("refuses an ambiguous response instead of choosing an occurrence", async () => {
  const { port, completions } = scriptedPort([
    state({
      openUserTasks: [openTask("UserTask_A", 1), openTask("UserTask_A", 2)],
      enabledInteractions: [
        taskInteraction("UserTask_A", 1),
        taskInteraction("UserTask_A", 2),
      ],
    }),
  ]);

  const result = await driveHostInteractions(
    [completeResponse("UserTask_A")],
    port,
    noWait,
  );

  assert.equal(result.kind, HostInteractionResultKind.Refused);
  assert.equal(
    result.kind === HostInteractionResultKind.Refused ? result.code : null,
    HostInteractionRefusalCode.AmbiguousResponse,
  );
  assert.deepEqual(completions, []);
});

test("refuses an enabled interaction that no unconsumed response answers", async () => {
  const { port } = scriptedPort([
    state({
      openUserTasks: [openTask("UserTask_Other")],
      enabledInteractions: [taskInteraction("UserTask_Other")],
    }),
  ]);

  const result = await driveHostInteractions(
    [completeResponse("UserTask_A")],
    port,
    noWait,
  );

  assert.equal(
    result.kind === HostInteractionResultKind.Refused ? result.code : null,
    HostInteractionRefusalCode.UnmatchedEnabledInteraction,
  );
});

test("refuses a terminal Process that left responses unconsumed", async () => {
  const { port } = scriptedPort([state({ status: ProcessStatus.Completed })]);

  const result = await driveHostInteractions(
    [completeResponse("UserTask_A")],
    port,
    noWait,
  );

  assert.equal(
    result.kind === HostInteractionResultKind.Refused ? result.code : null,
    HostInteractionRefusalCode.UnconsumedResponses,
  );
});

test("refuses a running Process with neither an enabled interaction nor a host wait", async () => {
  const { port } = scriptedPort([state({})]);

  const result = await driveHostInteractions([], port, noWait);

  assert.equal(
    result.kind === HostInteractionResultKind.Refused ? result.code : null,
    HostInteractionRefusalCode.StalledProcess,
  );
});
