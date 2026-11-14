/**
 * A population ingress's refusal before acceptance is an answer of the population port, never an error: the client
 * answers it as `{ refused }`, any other failure propagates as the infrastructure's, and the Timer firing Activity
 * retries only a full queue. The Temporal client here is a stub of the one Update-with-Start a call makes, so this runs
 * without a server.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ApplicationFailure, WorkflowUpdateFailedError, type Client } from "@temporalio/client";
import { MockActivityEnvironment } from "@temporalio/testing";

const { PopulationClient } = await import(new URL("../dist/population-client.js", import.meta.url).href) as
  typeof import("../src/population-client.ts");
const { createPopulationActivities } = await import(new URL("../dist/population-activities.js", import.meta.url).href) as
  typeof import("../src/population-activities.ts");
const { Scheduling, rejectionType } = await import(new URL("../dist/protocol.js", import.meta.url).href) as
  typeof import("../src/protocol.ts");

const config = { scheduling: Scheduling.Durable, effectStartToCloseMs: 1_000, historyEventBudget: null };

/** A Temporal client whose every Update-with-Start fails with `failure`; an Activity scopes its calls under its signal. */
function failingClient(failure: Error): Client {
  return {
    withAbortSignal: <R>(_signal: AbortSignal, fn: () => Promise<R>): Promise<R> => fn(),
    workflow: { executeUpdateWithStart: () => Promise.reject(failure) },
  } as unknown as Client;
}

const rejected = (code: string): Error =>
  new WorkflowUpdateFailedError("Workflow Update failed", ApplicationFailure.create({ message: code, type: rejectionType, nonRetryable: true }));

test("a command or registration the ingress refuses before acceptance answers the refusal", async () => {
  const population = new PopulationClient(failingClient(rejected("host.population.queueFull")), "queue", "P", config);
  assert.deepEqual(await population.command("broadcast", { commandId: "b" }), { refused: "host.population.queueFull" });
  const registering = new PopulationClient(failingClient(rejected("host.population.configurationConflict")), "queue", "P", config);
  assert.deepEqual(await registering.registerDeployment({ deploymentRequestId: "d", digest: "d", program: {} }),
    { refused: "host.population.configurationConflict" });
});

test("any other failure of the Update propagates, never as a refusal", async () => {
  const transport = new Error("connection lost");
  await assert.rejects(new PopulationClient(failingClient(transport), "queue", "P", config).command("broadcast", { commandId: "b" }),
    (error: unknown) => error === transport);
  const otherFailure = new WorkflowUpdateFailedError("Workflow Update failed", ApplicationFailure.create({ message: "boom", type: "Other" }));
  await assert.rejects(new PopulationClient(failingClient(otherFailure), "queue", "P", config).command("broadcast", { commandId: "b" }),
    (error: unknown) => error === otherFailure);
});

test("a Timer firing retries a full queue's refusal and fails for good on any other", async () => {
  const firing = { population: "P", config, deploymentId: 1, startEvent: "Start", dueMs: 0, commandId: "firing" };
  const fire = (code: string) => new MockActivityEnvironment(undefined, { client: failingClient(rejected(code)) })
    .run(createPopulationActivities().fireTimerStart, firing);
  for (const [code, nonRetryable] of [["host.population.queueFull", false], ["host.population.configurationConflict", true]] as const) {
    await assert.rejects(fire(code), (error: unknown) => {
      assert.ok(error instanceof ApplicationFailure, `${code}: ${String(error)}`);
      assert.deepEqual([error.message, error.type, error.nonRetryable], [code, "PopulationRefused", nonRetryable]);
      return true;
    });
  }
});
