/**
 * The population Activities' cancellation contract: their Temporal calls wait for Workflow tasks a draining Worker no
 * longer polls, so each settles when the Worker cancels it instead of holding the Worker's drain open.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { CancelledFailure } from "@temporalio/activity";
import type { Client } from "@temporalio/client";
import { MockActivityEnvironment } from "@temporalio/testing";

import type { PopulationActivities } from "../src/population-contract.ts";

const { createPopulationActivities } = await import(new URL("../dist/population-activities.js", import.meta.url).href) as
  typeof import("../src/population-activities.ts");

/**
 * A Temporal client whose every service call stays unanswered, as one does while no Worker takes a Workflow task. Like
 * the Worker's native connection (`@temporalio/worker` 1.21.0 `NativeConnection.sendRequest`), it ignores the abort
 * signal the Worker scopes each Activity's calls under.
 */
function unansweredClient(): Client {
  const unanswered: object = new Proxy(function unansweredCall() {}, {
    get: (_target, property) => property === "then" ? (): void => undefined : unanswered,
    apply: () => unanswered,
  });
  return {
    withAbortSignal: <R>(_signal: AbortSignal, fn: () => Promise<R>): Promise<R> => fn(),
    workflow: unanswered,
  } as unknown as Client;
}

const requests: { readonly [Name in keyof PopulationActivities]: Parameters<PopulationActivities[Name]>[0] } = {
  scanPopulation: { population: "p", action: { kind: "scanConditionalStarts", deployments: [1] } } as never,
  deliverPopulation: { workflowId: "chain", deliveryId: "delivery", delivery: {} } as never,
  startPopulation: { population: "p", config: {}, deploymentId: 1, instanceId: "instance", request: {} } as never,
  readPopulationIntents: { workflowId: "chain", commandId: "command" },
  settlePopulationEmit: { workflowId: "chain", commandId: "command" },
  registerPopulation: { population: "p", registration: {} } as never,
  emitPopulation: { population: "p", reference: {}, handedBack: null } as never,
  wakePopulationEmit: { workflowId: "chain", wake: { run: "run", commandIds: ["command"] } },
  startDeployment: { population: "p", deploymentId: 1, program: {} },
  fireTimerStart: { population: "p", config: {}, deploymentId: 1, startEvent: "Start", dueMs: 0, commandId: "firing" } as never,
};

/** The test's oracle bound on "settles": an Activity that ignores cancellation never does. */
const settleWithinMs = 1_000;

for (const name of Object.keys(requests) as (keyof PopulationActivities)[]) {
  test(`${name} settles as cancelled when its Worker cancels it while its Temporal call is unanswered`, async () => {
    const environment = new MockActivityEnvironment(undefined, { client: unansweredClient() });
    const activity = createPopulationActivities()[name] as (request: unknown) => Promise<unknown>;
    const running = environment.run(activity, requests[name]);
    await new Promise((resolve) => setImmediate(resolve));
    environment.cancel();
    let timer: NodeJS.Timeout | undefined;
    const outcome = await Promise.race([
      running.then(() => "completed", (error: unknown) => error),
      new Promise((resolve) => { timer = setTimeout(() => resolve("unsettled"), settleWithinMs); }),
    ]);
    clearTimeout(timer);
    assert.ok(outcome instanceof CancelledFailure, `${name} answered ${String(outcome)}`);
  });
}
