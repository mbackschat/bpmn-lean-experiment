import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  StimulusKind,
  UserTaskLifecycleState,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  OccurrenceId,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import { ProcessCommandResultKind } from "@bpmn-lean/temporal-testkit";
import type { HostInteractionPort } from "@bpmn-lean/temporal-testkit";

import {
  AlphaJourney,
  MuePreviewAlphaActor,
} from "../src/automated-actor.ts";
import {
  completionBindingName,
  currentItemBindingName,
  escalationElementId,
  exactInputItems,
  exactNaturalResults,
  exactSequentialMultiInstanceSource,
  exactSourceSha256,
  lifetimeTimerElementId,
  outputBindingName,
  processId,
  reviewElementId,
  semanticProfile,
  sha256,
} from "./fixture.ts";

test("binds the Alpha preview to the exact retained BPMN source bytes", async () => {
  assert.equal(sha256(await exactSequentialMultiInstanceSource()), exactSourceSha256);
});

test("drives the exact three current iterations into the ordered natural result", async () => {
  const harness = naturalPort();
  const actor = new MuePreviewAlphaActor(async () => undefined);

  assert.deepEqual(await actor.runNatural(publicInstance("Instance_Natural"), harness.port), {
    journey: AlphaJourney.Natural,
    submitted: 3,
  });
  assert.deepEqual(harness.submitted.map(({ taskId, submittedValues }) => ({
    activation: taskId.activation,
    submittedValues,
  })), exactNaturalResults.map((value, index) => ({
    activation: index + 1,
    submittedValues: [{
      name: completionBindingName,
      value: { kind: VariableValueKind.String, value },
    }],
  })));
});

test("waits at the observed escalation occurrence and submits its exact empty patch", async () => {
  const harness = interruptedPort();
  const actor = new MuePreviewAlphaActor(async () => undefined);
  let ready = 0;
  let released = 0;

  assert.deepEqual(await actor.runInterrupted(
    publicInstance("Instance_Interrupted"),
    harness.port,
    {
      onEscalationReady: () => { ready += 1; },
      waitForEscalationRelease: async () => { released += 1; },
    },
  ), {
    journey: AlphaJourney.Interrupted,
    submitted: 2,
  });
  assert.equal(ready, 1);
  assert.equal(released, 1);
  assert.deepEqual(harness.submitted.map(({ taskId, submittedValues }) => ({
    elementId: taskId.elementId,
    submittedValues,
  })), [{
    elementId: reviewElementId,
    submittedValues: [{
      name: completionBindingName,
      value: { kind: VariableValueKind.String, value: exactNaturalResults[0] },
    }],
  }, {
    elementId: escalationElementId,
    submittedValues: [],
  }]);
});

test("refuses a cached task identity even when the advertised element still matches", async () => {
  const processInstanceId = "Instance_Cached";
  const valid = alphaReviewState(processInstanceId, 1);
  const wrong: StateObservation = {
    ...valid,
    enabledInteractions: [{
      kind: StimulusKind.CompleteUserTaskInstance,
      taskId: { ...valid.openUserTasks[0]!.id, activation: 1 },
    }],
  };
  let submissions = 0;

  await assert.rejects(
    new MuePreviewAlphaActor(async () => undefined).runNatural(
      publicInstance(processInstanceId),
      staticPort(wrong, () => { submissions += 1; }),
    ),
    /task, iteration, and completion publication identities disagree/u,
  );
  assert.equal(submissions, 0);
});

test("refuses a result bound to the wrong current business item", async () => {
  const processInstanceId = "Instance_WrongItem";
  const valid = alphaReviewState(processInstanceId, 1);
  const controller = valid.openMultiInstances![0]!;
  const iteration = controller.activeIterations[0]!;
  const wrong: StateObservation = {
    ...valid,
    openMultiInstances: [{
      ...controller,
      activeIterations: [{
        ...iteration,
        taskInput: {
          name: currentItemBindingName,
          value: { kind: VariableValueKind.String, value: exactInputItems[0] },
        },
      }],
    }],
  };
  let submissions = 0;

  await assert.rejects(
    new MuePreviewAlphaActor(async () => undefined).runNatural(
      publicInstance(processInstanceId),
      staticPort(wrong, () => { submissions += 1; }),
    ),
    /invalid current Sequential Multi-Instance iteration/u,
  );
  assert.equal(submissions, 0);
});

test("refuses a Parallel Multi-Instance controller at the Alpha boundary", async () => {
  const processInstanceId = "Instance_Parallel";
  const valid = alphaReviewState(processInstanceId, 1);
  const controller = valid.openMultiInstances![0]!;
  const wrong: StateObservation = {
    ...valid,
    openMultiInstances: [{
      ...controller,
      mode: "parallel",
      pendingItemCount: 0,
      numberOfInstances: controller.plannedInstanceCount,
      numberOfActiveInstances:
        controller.plannedInstanceCount - controller.numberOfCompletedInstances,
      numberOfTerminatedInstances: 0,
    }],
  };
  let submissions = 0;

  await assert.rejects(
    new MuePreviewAlphaActor(async () => undefined).runNatural(
      publicInstance(processInstanceId),
      staticPort(wrong, () => { submissions += 1; }),
    ),
    /non-Sequential Multi-Instance controller/u,
  );
  assert.equal(submissions, 0);
});

test("refuses escalation without the committed Timer state", async () => {
  const processInstanceId = "Instance_EarlyEscalation";
  const wrong: StateObservation = {
    ...alphaEscalationState(processInstanceId),
    logicalTimeMs: 0,
  };
  let submissions = 0;

  await assert.rejects(
    new MuePreviewAlphaActor(async () => undefined).runInterrupted(
      publicInstance(processInstanceId),
      staticPort(wrong, () => { submissions += 1; }),
      {
        onEscalationReady: () => undefined,
        waitForEscalationRelease: async () => undefined,
      },
    ),
    /outside its exact preview contract/u,
  );
  assert.equal(submissions, 0);
});

function naturalPort() {
  const processInstanceId = "Instance_Natural";
  return sequencedPort([
    alphaReviewState(processInstanceId, 0),
    alphaReviewState(processInstanceId, 1),
    alphaReviewState(processInstanceId, 2),
    alphaTerminalState(processInstanceId, AlphaJourney.Natural),
  ]);
}

function interruptedPort() {
  const processInstanceId = "Instance_Interrupted";
  return sequencedPort([
    alphaReviewState(processInstanceId, 0),
    alphaReviewState(processInstanceId, 1),
    alphaEscalationState(processInstanceId),
    alphaTerminalState(processInstanceId, AlphaJourney.Interrupted),
  ], true);
}

function sequencedPort(states: StateObservation[], advanceHostWait = false) {
  let index = 0;
  let readsAtIndex = 0;
  const submitted: CompleteUserTaskInstanceStimulus[] = [];
  const port: HostInteractionPort = {
    readState: async () => {
      if (advanceHostWait && index === 1 && readsAtIndex > 0) index += 1;
      readsAtIndex += 1;
      return states[index]!;
    },
    readUserTaskDetail: async () => ({
      task: states[index]!.openUserTasks[0]!,
      inputVariables: [],
    }),
    submitCompletion: async (stimulus) => {
      submitted.push(stimulus);
      index += 1;
      readsAtIndex = 0;
      return {
        kind: ProcessCommandResultKind.Semantic,
        commandId: stimulus.commandId,
        outcome: CommandOutcome.Committed,
      };
    },
    submitMessage: async () => { throw new Error("Alpha actor must not submit Message stimuli"); },
    submitCancellation: async () => { throw new Error("Alpha actor must not submit cancellation stimuli"); },
  };
  return { port, submitted };
}

function staticPort(state: StateObservation, onSubmit: () => void): HostInteractionPort {
  return {
    readState: async () => state,
    readUserTaskDetail: async () => ({ task: state.openUserTasks[0]!, inputVariables: [] }),
    submitCompletion: async (stimulus) => {
      onSubmit();
      return {
        kind: ProcessCommandResultKind.Semantic,
        commandId: stimulus.commandId,
        outcome: CommandOutcome.Committed,
      };
    },
    submitMessage: async () => { throw new Error("unexpected Message submission"); },
    submitCancellation: async () => { throw new Error("unexpected cancellation submission"); },
  };
}

function alphaReviewState(processInstanceId: string, loopCounter: number): StateObservation {
  const taskId = occurrence(processInstanceId, reviewElementId, loopCounter + 1);
  return baseState(processInstanceId, {
    openUserTasks: [{
      id: taskId,
      name: "Review item",
      state: UserTaskLifecycleState.Active,
    }],
    openTimers: [{
      id: occurrence(processInstanceId, lifetimeTimerElementId, 1),
      deadlineMs: 5_000,
    }],
    openMultiInstances: [{
      id: {
        processInstanceId,
        activityElementId: reviewElementId,
        activation: 1,
      },
      mode: "sequential",
      plannedInstanceCount: exactInputItems.length,
      pendingItemCount: exactInputItems.length - loopCounter - 1,
      numberOfInstances: loopCounter + 1,
      numberOfActiveInstances: 1,
      numberOfCompletedInstances: loopCounter,
      numberOfTerminatedInstances: 0,
      activeIterations: [{
        loopCounter,
        taskId,
        taskInput: {
          name: currentItemBindingName,
          value: { kind: VariableValueKind.String, value: exactInputItems[loopCounter]! },
        },
        completionBindingName,
      }],
    }],
    enabledInteractions: [{ kind: StimulusKind.CompleteUserTaskInstance, taskId }],
  });
}

function alphaEscalationState(processInstanceId: string): StateObservation {
  const taskId = occurrence(processInstanceId, escalationElementId, 1);
  return baseState(processInstanceId, {
    logicalTimeMs: 5_000,
    openUserTasks: [{
      id: taskId,
      name: "Escalate review",
      state: UserTaskLifecycleState.Active,
    }],
    enabledInteractions: [{ kind: StimulusKind.CompleteUserTaskInstance, taskId }],
  });
}

function alphaTerminalState(
  processInstanceId: string,
  journey: AlphaJourney,
): StateObservation {
  return baseState(processInstanceId, {
    status: ProcessStatus.Completed,
    logicalTimeMs: journey === AlphaJourney.Interrupted ? 5_000 : 0,
    variables: journey === AlphaJourney.Natural ? [{
      name: outputBindingName,
      value: { kind: VariableValueKind.StringList, value: [...exactNaturalResults] },
    }] : [],
  });
}

function baseState(
  processInstanceId: string,
  overrides: Partial<StateObservation>,
): StateObservation {
  return {
    kind: CanonicalObservationKind.State,
    instanceId: processInstanceId,
    status: ProcessStatus.Running,
    activeWaits: [],
    openUserTasks: [],
    openMessageSubscriptions: [],
    openTimers: [],
    openEffects: [],
    openIncidents: [],
    openMultiInstances: [],
    variables: [],
    enabledInteractions: [],
    logicalTimeMs: 0,
    ...overrides,
  };
}

function occurrence(
  processInstanceId: string,
  elementId: string,
  activation: number,
): OccurrenceId {
  return { processInstanceId, elementId, activation };
}

function publicInstance(processInstanceId: string) {
  return {
    processInstanceId,
    definition: {
      processId,
      version: 1,
      source: {
        kind: "bpmnSource",
        id: "sequential-multi-instance-review.bpmn",
        sha256: exactSourceSha256,
        byteLength: 4096,
        declaredEncoding: "UTF-8",
        decodedAs: "UTF-8",
      },
      semanticProfile,
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  } as const;
}
