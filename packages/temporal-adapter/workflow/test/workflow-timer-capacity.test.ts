import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { initialState } from "@bpmn-lean/semantic-core";
import type { RuntimeState } from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import {
  WorkflowTimerCapacityPreflightKind,
  legacyEffectActivityPolicy,
  preflightPendingWorkflowTimers,
} from "../dist/index.js";
import { waitForHostReadiness } from "../dist/workflow-host-readiness.js";
import type {
  EventRaceReadinessScheduler,
} from "../dist/event-race-readiness-scheduler.js";

import { publicationProgram } from "./execution-publication-fixture.ts";

const pendingTimerLimit = workflowChainProductionLimit(
  WorkflowChainBudgetKind.PendingTimers,
);

test("admits the exact pending-Timer boundary and refuses a sixty-fifth Timer", () => {
  assert.deepEqual(preflightPendingWorkflowTimers(pendingTimerLimit), {
    kind: WorkflowTimerCapacityPreflightKind.Ready,
  });
  assert.deepEqual(preflightPendingWorkflowTimers(pendingTimerLimit + 1), {
    kind: WorkflowTimerCapacityPreflightKind.CapacityExceeded,
    failure: {
      budget: WorkflowChainBudgetKind.PendingTimers,
      configuredBound: pendingTimerLimit,
      observedValue: pendingTimerLimit + 1,
    },
  });
});

test("checks all committed Timers before entering any scheduler", async () => {
  const source = await readFile(
    new URL("../src/workflow-host-readiness.ts", import.meta.url),
    "utf8",
  );
  const projection = source.indexOf("const timers = projectOpenTimers(state)");
  const preflight = source.indexOf(
    "preflightPendingWorkflowTimers(timers.length)",
    projection,
  );
  const eventRace = source.indexOf(
    "eventRaceScheduler.waitForReadiness(state)",
    projection,
  );
  const boundary = source.indexOf(
    "boundedDeadlineScheduler.waitForReadiness(state)",
    projection,
  );
  const durableTimer = source.indexOf("await waitForTimer(remainingMs)", projection);

  assert.ok(
    projection >= 0 &&
      preflight > projection &&
      eventRace > preflight &&
      boundary > preflight &&
      durableTimer > preflight,
  );
});

test("fails a malformed sixty-five-Timer state before a managed Timer is armed", async () => {
  const owner = {
    processInstanceId: "TimerCapacityInstance_1",
    definitionScopeId: publicationProgram.processId,
    activation: 1,
  } as const;
  const timerWaits = Array.from({ length: pendingTimerLimit + 1 }, (_, index) => ({
    id: {
      processInstanceId: owner.processInstanceId,
      elementId: `Timer_${String(index + 1)}`,
      activation: 1,
    },
    owner,
    deadlineMs: 1_000,
    output: "place:timer-output",
  }));
  const firstTimer = timerWaits[0];
  assert.ok(firstTimer !== undefined);
  const state: RuntimeState = {
    ...initialState,
    timerWaits,
    eventRaces: [{
      id: {
        processInstanceId: owner.processInstanceId,
        elementId: "Race_1",
        activation: 1,
      },
      owner,
      messageSubscriptionId: {
        processInstanceId: owner.processInstanceId,
        elementId: "Message_1",
        activation: 1,
      },
      timerOccurrenceId: firstTimer.id,
    }],
  };
  let schedulerCalls = 0;
  let timerCalls = 0;
  let observedFailure: unknown;
  const eventRaceScheduler = {
    recordMessageCallback: () => false,
    waitForReadiness: async () => {
      schedulerCalls += 1;
      return [];
    },
    reconcileCommittedState: () => undefined,
  } satisfies EventRaceReadinessScheduler;

  await assert.rejects(
    waitForHostReadiness(
      state,
      publicationProgram,
      [],
      [],
      eventRaceScheduler,
      [],
      async () => {
        timerCalls += 1;
      },
      async () => {
        throw new Error("effect must not execute");
      },
      legacyEffectActivityPolicy,
      (failure) => {
        observedFailure = failure;
        throw new Error("pending Timer capacity exceeded");
      },
      () => true,
      () => false,
    ),
    /pending Timer capacity exceeded/u,
  );
  assert.deepEqual(observedFailure, {
    budget: WorkflowChainBudgetKind.PendingTimers,
    configuredBound: pendingTimerLimit,
    observedValue: pendingTimerLimit + 1,
  });
  assert.equal(schedulerCalls, 0);
  assert.equal(timerCalls, 0);
});
