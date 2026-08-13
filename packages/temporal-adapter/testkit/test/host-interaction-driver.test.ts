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
  CancelIncidentProcessStimulus,
  DeliverMessageStimulus,
  CompleteUserTaskInstanceStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";

import {
  HostInteractionRefusalCode,
  HostInteractionResultKind,
  ProcessCommandResultKind,
  driveHostInteractions,
} from "@bpmn-lean/temporal-testkit";
import type {
  HostInteractionPort,
  HostInteractionResponse,
  ProcessCommandResult,
} from "@bpmn-lean/temporal-testkit";

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
    openIncidents: [],
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

function cancellationInteraction(activation = 7) {
  return {
    kind: StimulusKind.CancelIncidentProcess,
    processInstanceId: instanceId,
    incidentId: {
      effectId: {
        processInstanceId: instanceId,
        elementId: "ServiceTask_Record",
        activation,
      },
      generation: 1,
    },
  } as const;
}

function cancelResponse(): HostInteractionResponse {
  return { kind: StimulusKind.CancelIncidentProcess, delayMs: 1 };
}

/** Scripts one committed state per read so a test fixes the exact observation sequence. */
function scriptedPort(
  states: ReadonlyArray<StateObservation>,
): {
  readonly port: HostInteractionPort;
  readonly completions: CompleteUserTaskInstanceStimulus[];
  readonly deliveries: DeliverMessageStimulus[];
  readonly cancellations: CancelIncidentProcessStimulus[];
} {
  const completions: CompleteUserTaskInstanceStimulus[] = [];
  const deliveries: DeliverMessageStimulus[] = [];
  const cancellations: CancelIncidentProcessStimulus[] = [];
  let index = 0;
  return {
    completions,
    deliveries,
    cancellations,
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
      submitCancellation: async (stimulus) => {
        cancellations.push(stimulus);
        return committed;
      },
    },
  };
}

test("cancels only the exact incident identity published by the committed state", async () => {
  const published = cancellationInteraction();
  const { port, cancellations } = scriptedPort([
    state({ enabledInteractions: [published] }),
    state({ status: ProcessStatus.Cancelled }),
  ]);

  const result = await driveHostInteractions([cancelResponse()], port, noWait);

  assert.equal(result.kind, HostInteractionResultKind.Driven);
  assert.deepEqual(cancellations, [{
    kind: StimulusKind.CancelIncidentProcess,
    commandId: "mvp-cancel-incident-process:ServiceTask_Record:7:1",
    processInstanceId: instanceId,
    incidentId: published.incidentId,
  }]);
});

test("refuses two published cancellation identities instead of choosing one", async () => {
  const { port, cancellations } = scriptedPort([
    state({
      enabledInteractions: [
        cancellationInteraction(1),
        cancellationInteraction(2),
      ],
    }),
  ]);

  const result = await driveHostInteractions([cancelResponse()], port, noWait);

  assert.equal(
    result.kind === HostInteractionResultKind.Refused ? result.code : null,
    HostInteractionRefusalCode.AmbiguousResponse,
  );
  assert.deepEqual(cancellations, []);
});

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

test("refuses a host wait that never resolves at the exact observation bound", async () => {
  // The scripted port repeats its last state, so an open timer with no answerable interaction
  // exercises the keep-waiting branch until the bound rather than reaching any earlier refusal.
  const stuck = state({
    openTimers: [
      {
        id: {
          processInstanceId: instanceId,
          elementId: "Timer_Never",
          activation: 1,
        },
        deadlineMs: 1_000,
      },
    ],
  });
  const { port } = scriptedPort([stuck]);
  let reads = 0;
  const countingPort: HostInteractionPort = {
    ...port,
    readState: async () => {
      reads += 1;
      return port.readState();
    },
  };

  const result = await driveHostInteractions([], countingPort, noWait);

  assert.equal(result.kind, HostInteractionResultKind.Refused);
  if (result.kind !== HostInteractionResultKind.Refused) {
    return;
  }
  assert.equal(
    result.code,
    HostInteractionRefusalCode.ObservationLimitExceeded,
  );
  // Asserting the exact count discriminates the bound itself, not merely that some refusal arrives.
  assert.equal(reads, 600);
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

test("reports an uncommitted interaction with its typed result unchanged", async () => {
  const rejected: ProcessCommandResult = {
    kind: ProcessCommandResultKind.Semantic,
    commandId: "driver-test-command",
    outcome: CommandOutcome.Rejected,
  };
  const states = [
    state({
      openUserTasks: [openTask("UserTask_A")],
      enabledInteractions: [taskInteraction("UserTask_A")],
    }),
  ];
  let index = 0;
  const port: HostInteractionPort = {
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
    submitCompletion: async () => rejected,
    submitMessage: async () => rejected,
    submitCancellation: async () => rejected,
  };

  const result = await driveHostInteractions(
    [completeResponse("UserTask_A")],
    port,
    noWait,
  );

  assert.equal(result.kind, HostInteractionResultKind.Refused);
  if (result.kind !== HostInteractionResultKind.Refused) {
    return;
  }
  assert.equal(
    result.code,
    HostInteractionRefusalCode.InteractionNotCommitted,
  );
  assert.deepEqual(result.result, rejected);
});

test("refuses when the published task has no readable detail", async () => {
  const { port } = scriptedPort([
    state({
      openUserTasks: [openTask("UserTask_A")],
      enabledInteractions: [taskInteraction("UserTask_A")],
    }),
  ]);
  const withoutDetail: HostInteractionPort = {
    ...port,
    readUserTaskDetail: async () => null,
  };

  const result = await driveHostInteractions(
    [completeResponse("UserTask_A")],
    withoutDetail,
    noWait,
  );

  assert.equal(
    result.kind === HostInteractionResultKind.Refused ? result.code : null,
    HostInteractionRefusalCode.TaskDetailUnavailable,
  );
});

test("refuses a stale repeat instead of answering one interaction twice", async () => {
  // The task stays enabled after its single response is consumed, so a driver that re-answered
  // would submit a second command for the same occurrence.
  const stillOpen = state({
    openUserTasks: [openTask("UserTask_A")],
    enabledInteractions: [taskInteraction("UserTask_A")],
  });
  const { port, completions } = scriptedPort([stillOpen, stillOpen]);

  const result = await driveHostInteractions(
    [completeResponse("UserTask_A")],
    port,
    noWait,
  );

  assert.equal(
    result.kind === HostInteractionResultKind.Refused ? result.code : null,
    HostInteractionRefusalCode.UnmatchedEnabledInteraction,
  );
  assert.equal(completions.length, 1);
});

test("refuses a running Process with neither an enabled interaction nor a host wait", async () => {
  const { port } = scriptedPort([state({})]);

  const result = await driveHostInteractions([], port, noWait);

  assert.equal(
    result.kind === HostInteractionResultKind.Refused ? result.code : null,
    HostInteractionRefusalCode.StalledProcess,
  );
});
