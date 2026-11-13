/**
 * The Temporal identifiers the population Activities derive stay within the server's identifier limit whatever the
 * identifiers they derive from, and a permanent service refusal fails the Activity for good instead of riding its
 * transport retry. Temporal refuses an Update ID, Workflow ID or Activity ID longer than `limit.maxIDLength` with
 * INVALID_ARGUMENT (default 1,000, [dynamic configuration](https://docs.temporal.io/references/dynamic-configuration);
 * the pinned CLI v1.8.1 embeds Server 1.31.2, whose frontend answers "UpdateId length exceeds limit."), which no retry
 * cures (Verify 43494317413: a delivery's Update ID made from a 20,000-character command identifier retried for good).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ApplicationFailure } from "@temporalio/activity";
import { ServiceError, type Client } from "@temporalio/client";
import { MockActivityEnvironment } from "@temporalio/testing";

import type { PopulationActivities } from "../src/population-contract.ts";

const { createPopulationActivities } = await import(new URL("../dist/population-activities.js", import.meta.url).href) as
  typeof import("../src/population-activities.ts");
const { canonicalJson } = await import(new URL("../dist/canonical-json.js", import.meta.url).href) as
  typeof import("../src/canonical-json.ts");
const { chainCapacity } = await import(new URL("../dist/capacity.js", import.meta.url).href) as typeof import("../src/capacity.ts");

/** The test's oracle: the server's default identifier limit, in bytes. */
const temporalIdLimit = 1_000;
/** The gRPC status INVALID_ARGUMENT ([status codes](https://grpc.github.io/grpc/core/md_doc_statuscodes.html)). */
const invalidArgument = 3;
const unavailable = 14;

/** An identifier at the stimulus bound, the longest a caller's command identifier can be. */
const longest = "x".repeat(chainCapacity.stimulusBytes);

/** The service refusal the Worker's native connection raises, wrapped as the client wraps it. */
function refusal(code: number): ServiceError {
  const cause = Object.assign(new Error("UpdateId length exceeds limit."), { code, details: "UpdateId length exceeds limit.", metadata: {} });
  return new ServiceError("Workflow Update failed", { cause });
}

/**
 * A Temporal client that records every identifier a call names (a handle's Workflow ID, an Update ID, a started
 * Workflow's ID) and answers every service call with `failure`.
 */
function recordingClient(failure: Error): { readonly client: Client; readonly identifiers: string[] } {
  const identifiers: string[] = [];
  const named = (value: unknown): void => {
    if (typeof value === "string") identifiers.push(value);
  };
  const handle = (workflowId: unknown) => {
    named(workflowId);
    return {
      executeUpdate: async (_update: unknown, options?: { readonly updateId?: string }) => { named(options?.updateId); throw failure; },
      query: async () => { throw failure; },
    };
  };
  const workflow = {
    getHandle: handle,
    start: async (_type: unknown, options: { readonly workflowId: string }) => { named(options.workflowId); throw failure; },
    executeUpdateWithStart: async (_update: unknown, options: { readonly updateId?: string; readonly startWorkflowOperation: { readonly options: { readonly workflowId: string } } }) => {
      named(options.updateId);
      named(options.startWorkflowOperation.options.workflowId);
      throw failure;
    },
  };
  return { client: { withAbortSignal: <R>(_signal: AbortSignal, fn: () => Promise<R>): Promise<R> => fn(), workflow } as unknown as Client, identifiers };
}

const requests: { readonly [Name in keyof PopulationActivities]: Parameters<PopulationActivities[Name]>[0] } = {
  scanPopulation: { population: longest, action: { kind: "scanMessage", chains: ["chain"], publication: {} } } as never,
  deliverPopulation: { workflowId: "chain", deliveryId: canonicalJson(["populationDelivery", "command", longest, 1]), delivery: {} } as never,
  startPopulation: { population: longest, config: {}, deploymentId: 1, instanceId: longest, request: {} } as never,
  readPopulationIntents: { workflowId: "chain", commandId: longest },
  settlePopulationEmit: { workflowId: "chain", commandId: longest },
  registerPopulation: { population: longest, registration: {} } as never,
  emitPopulation: { population: longest, reference: { workflowId: "chain", commandId: longest, count: 1, digest: "" }, handedBack: null } as never,
  wakePopulationEmit: { workflowId: "chain", wake: { run: "run", commandIds: ["command"] } },
  startDeployment: { population: longest, deploymentId: 1, program: {} },
  fireTimerStart: { population: longest, config: {}, deploymentId: 1, startEvent: longest, dueMs: 0, commandId: longest } as never,
};

async function outcome(name: keyof PopulationActivities, client: Client): Promise<unknown> {
  const environment = new MockActivityEnvironment(undefined, { client });
  const activity = createPopulationActivities()[name] as (request: unknown) => Promise<unknown>;
  return environment.run(activity, requests[name]).then(() => "completed", (error: unknown) => error);
}

for (const name of Object.keys(requests) as (keyof PopulationActivities)[]) {
  test(`${name} names only Temporal identifiers within the server's limit, from identifiers at the stimulus bound`, async () => {
    const { client, identifiers } = recordingClient(refusal(unavailable));
    await outcome(name, client);
    for (const identifier of identifiers) {
      assert.ok(Buffer.byteLength(identifier) <= temporalIdLimit, `${name} named a ${String(Buffer.byteLength(identifier))}-byte identifier`);
    }
  });

  test(`${name} fails for good on INVALID_ARGUMENT, and leaves any other service failure to its transport retry`, async () => {
    const permanent = await outcome(name, recordingClient(refusal(invalidArgument)).client);
    assert.ok(permanent instanceof ApplicationFailure && permanent.nonRetryable, `${name} answered ${String(permanent)}`);
    const transient = await outcome(name, recordingClient(refusal(unavailable)).client);
    assert.ok(transient instanceof ServiceError, `${name} answered ${String(transient)}`);
  });
}
