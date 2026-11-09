import assert from "node:assert/strict";
import { test } from "node:test";

import type { EngineOccurrenceId, EngineOpenWait } from "@bpmn-lean/engine-api";

import {
  AlphaJourney,
  MuePreviewAlphaActor,
} from "../src/automated-actor.ts";
import type { AlphaState } from "../src/automated-actor.ts";
import type { InteractionPort } from "../src/host-interactions.ts";
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

type SubmittedCommand = Readonly<{
  occurrence: EngineOccurrenceId;
  action: Readonly<{ kind: string; values: readonly unknown[] }>;
}>;

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
  assert.deepEqual(harness.submitted.map(({ occurrence, action }) => ({
    activation: occurrence.activation,
    action,
  })), exactNaturalResults.map((value, index) => ({
    activation: index + 1,
    action: {
      kind: "completeUserTask",
      values: [{ name: completionBindingName, value: { kind: "string", value } }],
    },
  })));
});

test("accepts the host's Workflow epoch time with the Timer due five seconds after the observed start", async () => {
  const startMs = 1_800_000_000_000;
  const processInstanceId = "Instance_Natural";
  const harness = sequencedPort([
    alphaReviewState(processInstanceId, 0, startMs),
    alphaReviewState(processInstanceId, 1, startMs, startMs + 1_000),
    alphaReviewState(processInstanceId, 2, startMs, startMs + 2_000),
    alphaTerminalState(processInstanceId, AlphaJourney.Natural),
  ]);

  assert.deepEqual(
    await new MuePreviewAlphaActor(async () => undefined).runNatural(publicInstance(processInstanceId), harness.port),
    { journey: AlphaJourney.Natural, submitted: 3 },
  );
});

test("refuses a lifetime Timer that is not due five seconds after the observed start", async () => {
  const processInstanceId = "Instance_LateTimer";
  const valid = alphaReviewState(processInstanceId, 0);
  const wrong: AlphaState = {
    ...valid,
    openWaits: valid.openWaits.map((wait) => wait.detail.kind === "timer"
      ? { ...wait, detail: { ...wait.detail, deadlineMs: 6_000 } }
      : wait),
  };
  let submissions = 0;

  await assert.rejects(
    new MuePreviewAlphaActor(async () => undefined).runNatural(
      publicInstance(processInstanceId),
      staticPort(wrong, () => { submissions += 1; }),
    ),
    /invalid Sequential Multi-Instance lifetime Timer/u,
  );
  assert.equal(submissions, 0);
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
  assert.deepEqual(harness.submitted.map(({ occurrence, action }) => ({
    elementId: occurrence.elementId,
    values: action.values,
  })), [{
    elementId: reviewElementId,
    values: [{ name: completionBindingName, value: { kind: "string", value: exactNaturalResults[0] } }],
  }, {
    elementId: escalationElementId,
    values: [],
  }]);
});

test("refuses a cached task identity even when the advertised element still matches", async () => {
  const processInstanceId = "Instance_Cached";
  const valid = alphaReviewState(processInstanceId, 1);
  const wrong: AlphaState = {
    ...valid,
    openWaits: valid.openWaits.map((wait) => wait.detail.kind === "userTask"
      ? { ...wait, id: { ...wait.id, activation: 1 } }
      : wait),
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

for (const sourceOverlay of [
  { id: "overlay-a", sha256: "a".repeat(64) },
  { id: "overlay-b", sha256: "a".repeat(64) },
  { id: "overlay-a", sha256: "b".repeat(64) },
]) {
  for (const journey of Object.values(AlphaJourney)) {
    test(`refuses matching Alpha source/profile ${journey} actor with overlay ${sourceOverlay.id}/${sourceOverlay.sha256.slice(0, 8)}`, async () => {
      const harness = journey === AlphaJourney.Natural ? naturalPort() : interruptedPort();
      const exact = publicInstance(journey === AlphaJourney.Natural ? "Instance_Natural" : "Instance_Interrupted");
      const overlaid = { ...exact, definition: { ...exact.definition, sourceOverlay } };
      const actor = new MuePreviewAlphaActor(async () => undefined);
      let observations = 0;
      const port = { ...harness.port, readState: async () => { observations++; return harness.port.readState(); } };
      let escalationReady = 0;
      await assert.rejects(journey === AlphaJourney.Natural
        ? actor.runNatural(overlaid, port)
        : actor.runInterrupted(overlaid, port, {
            onEscalationReady: () => { escalationReady++; },
            waitForEscalationRelease: async () => undefined,
          }), /exact registered definition/u);
      assert.equal(observations, 0);
      assert.equal(harness.submitted.length, 0);
      assert.equal(escalationReady, 0);
    });
  }
}

test("refuses a result bound to the wrong current business item", async () => {
  const processInstanceId = "Instance_WrongItem";
  const valid = alphaReviewState(processInstanceId, 1);
  const wrong: AlphaState = {
    ...valid,
    scopes: [iterationScope(processInstanceId, reviewElementId, 2, exactInputItems[0])],
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
  const wrong: AlphaState = {
    ...valid,
    scopes: [
      iterationScope(processInstanceId, reviewElementId, 2, exactInputItems[1]),
      iterationScope(processInstanceId, reviewElementId, 3, exactInputItems[2]),
    ],
    openWaits: [
      ...valid.openWaits,
      userTaskWait(occurrence(processInstanceId, reviewElementId, 3), "Review item"),
    ],
  };
  let submissions = 0;

  await assert.rejects(
    new MuePreviewAlphaActor(async () => undefined).runNatural(
      publicInstance(processInstanceId),
      staticPort(wrong, () => { submissions += 1; }),
    ),
    /requires a Sequential Multi-Instance User Task controller/u,
  );
  assert.equal(submissions, 0);
});

test("refuses a Sub-Process iteration before submitting a User Task command", async () => {
  const processInstanceId = "Instance_SubProcess";
  const valid = alphaReviewState(processInstanceId, 1);
  const wrong: AlphaState = {
    ...valid,
    scopes: [iterationScope(processInstanceId, "SubProcess_Body", 2, exactInputItems[1])],
  };
  let submissions = 0;
  await assert.rejects(
    new MuePreviewAlphaActor(async () => undefined).runNatural(
      publicInstance(processInstanceId),
      staticPort(wrong, () => { submissions += 1; }),
    ),
    /requires a Sequential Multi-Instance User Task controller/u,
  );
  assert.equal(submissions, 0);
});

test("refuses escalation without the committed Timer state", async () => {
  const processInstanceId = "Instance_EarlyEscalation";
  const wrong: AlphaState = {
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

test("refuses escalation published before the Timer's deadline", async () => {
  const processInstanceId = "Instance_EarlyDeadline";
  const harness = sequencedPort([
    alphaReviewState(processInstanceId, 0),
    alphaReviewState(processInstanceId, 1),
    { ...alphaEscalationState(processInstanceId), logicalTimeMs: 4_999 },
  ], true);

  await assert.rejects(
    new MuePreviewAlphaActor(async () => undefined).runInterrupted(publicInstance(processInstanceId), harness.port, {
      onEscalationReady: () => undefined,
      waitForEscalationRelease: async () => undefined,
    }),
    /outside its exact preview contract/u,
  );
  assert.equal(harness.submitted.length, 1);
});

for (const journey of Object.values(AlphaJourney)) {
  test(`refuses failed ${journey} termination after all configured responses are consumed`, async () => {
    const processInstanceId = `Instance_${journey}_Failed`;
    const failed: AlphaState = {
      ...alphaTerminalState(processInstanceId, journey),
      status: "failed",
      failure: {
        code: "unexpectedFailure",
        message: null,
        occurrence: occurrence(processInstanceId, "Effect_Compensation", 1),
        related: [
          { name: "trigger", occurrence: occurrence(processInstanceId, "Throw_Compensation", 1) },
          { name: "handler", occurrence: occurrence(processInstanceId, "Handler_Compensation", 1) },
        ],
      },
    } as AlphaState;
    const prefix = journey === AlphaJourney.Natural
      ? [0, 1, 2].map((index) => alphaReviewState(processInstanceId, index))
      : [
          alphaReviewState(processInstanceId, 0),
          alphaReviewState(processInstanceId, 1),
          alphaEscalationState(processInstanceId),
        ];
    const harness = sequencedPort([...prefix, failed], journey === AlphaJourney.Interrupted);
    const actor = new MuePreviewAlphaActor(async () => undefined);
    await assert.rejects(
      journey === AlphaJourney.Natural
        ? actor.runNatural(publicInstance(processInstanceId), harness.port)
        : actor.runInterrupted(publicInstance(processInstanceId), harness.port, {
            onEscalationReady: () => undefined,
            waitForEscalationRelease: async () => undefined,
          }),
      /journey reached unexpected status failed/u,
    );
    assert.equal(harness.submitted.length, journey === AlphaJourney.Natural ? 3 : 2);
  });
}

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

/** Advances one state per committed command; `advanceHostWait` lets the Timer fire while the second review is open. */
function sequencedPort(states: AlphaState[], advanceHostWait = false) {
  let index = 0;
  let readsAtIndex = 0;
  const submitted: SubmittedCommand[] = [];
  const port: InteractionPort = {
    readState: async () => {
      if (advanceHostWait && index === 1 && readsAtIndex > 0) index += 1;
      readsAtIndex += 1;
      return states[index]!;
    },
    command: async (stimulus) => {
      submitted.push(stimulus as unknown as SubmittedCommand);
      index += 1;
      readsAtIndex = 0;
      return { outcome: "committed", code: null, revision: index };
    },
    deliver: async () => { throw new Error("Alpha actor must not deliver Messages"); },
  };
  return { port, submitted };
}

function staticPort(state: AlphaState, onSubmit: () => void): InteractionPort {
  return {
    readState: async () => state,
    command: async () => {
      onSubmit();
      return { outcome: "committed", code: null, revision: 1 };
    },
    deliver: async () => { throw new Error("unexpected Message delivery"); },
  };
}

/** The review state as `Kernel.Run.observationJson` publishes it (`scenarios/sequential-multi-instance`). */
function alphaReviewState(processInstanceId: string, loopCounter: number, startMs = 0, logicalTimeMs = startMs): AlphaState {
  return baseState(processInstanceId, {
    logicalTimeMs,
    scopes: [iterationScope(processInstanceId, reviewElementId, loopCounter + 1, exactInputItems[loopCounter]!)],
    openWaits: [
      {
        id: occurrence(processInstanceId, lifetimeTimerElementId, 1),
        definition: null,
        input: "timerFire",
        detail: { kind: "timer", deadlineMs: startMs + 5_000, recurrence: null },
      },
      userTaskWait(occurrence(processInstanceId, reviewElementId, loopCounter + 1), "Review item"),
    ],
  });
}

function alphaEscalationState(processInstanceId: string): AlphaState {
  return baseState(processInstanceId, {
    logicalTimeMs: 5_000,
    openWaits: [userTaskWait(occurrence(processInstanceId, escalationElementId, 1), "Handle interrupted review")],
  });
}

function alphaTerminalState(processInstanceId: string, journey: AlphaJourney): AlphaState {
  return baseState(processInstanceId, {
    status: "completed",
    logicalTimeMs: journey === AlphaJourney.Interrupted ? 5_000 : 0,
    variables: journey === AlphaJourney.Natural
      ? [{ name: outputBindingName, value: { kind: "stringList", value: [...exactNaturalResults] } }]
      : [],
  });
}

function baseState(processInstanceId: string, overrides: Partial<AlphaState>): AlphaState {
  return {
    instanceId: processInstanceId,
    status: "running",
    logicalTimeMs: 0,
    variables: [],
    scopes: [],
    openWaits: [],
    ...overrides,
  };
}

function iterationScope(processInstanceId: string, elementId: string, activation: number, item: string) {
  return {
    scope: { processInstanceId, role: "multiInstanceInstance", elementId, activation },
    variables: [{ name: currentItemBindingName, value: { kind: "string" as const, value: item } }],
  };
}

function userTaskWait(id: EngineOccurrenceId, name: string): EngineOpenWait {
  return {
    id,
    definition: null,
    input: "command",
    detail: {
      kind: "userTask", name, assignee: null, candidateUsers: [], candidateGroups: [], formKey: null, formFields: [],
      dueDate: null, followUpDate: null, priority: null, inputs: [],
    },
  };
}

function occurrence(processInstanceId: string, elementId: string, activation: number): EngineOccurrenceId {
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
      sourceOverlay: null,
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  } as const;
}
