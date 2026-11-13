/**
 * A host refusal raised inside an effect Activity, and the halt the Workflow derives from it. The Activity half runs as
 * plain functions; the Workflow half receives the failure in the form Temporal delivers it, an `ActivityFailure` whose
 * cause is the Activity's own `ApplicationFailure`. The hosted witness of the whole path is the effect-result test in
 * `host-capacity.temporal-test.ts`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ActivityFailure, ApplicationFailure } from "@temporalio/workflow";

import type { EffectResult, JsonValue } from "../src/port.ts";
import * as fx from "./fixtures/capacity-journey.ts";

const { createHostActivities } = await import(new URL("../dist/activities.js", import.meta.url).href) as
  typeof import("../src/activities.ts");
const { effectFailureHalt } = await import(new URL("../dist/workflow-host.js", import.meta.url).href) as
  typeof import("../src/workflow-host.ts");

const request = {
  key: "effect-key",
  occurrence: { processInstanceId: fx.instanceId, elementId: "Send", activation: 1 },
  protocol: "urn:bpmn-lean:effect:probe-v1",
  operation: "",
  arguments: [],
  failures: 0,
};
const answering = (outcome: JsonValue) =>
  createHostActivities({ effects: async () => outcome as EffectResult, scriptTimeoutMs: 1_000 });

/** The failure as the Workflow receives it: the server names the wrapper "Activity task failed". */
const delivered = (cause: Error): ActivityFailure =>
  new ActivityFailure("Activity task failed", "executeEffect", "1", "NON_RETRYABLE_FAILURE", "worker", cause);

test("an effect result of exactly the bound returns, and one byte more fails the Activity for good with the bound's code", async () => {
  assert.deepEqual(await answering(fx.effectOutcomeAtBound(0)).executeEffect(request), fx.effectOutcomeAtBound(0));
  await assert.rejects(answering(fx.effectOutcomeAtBound(1)).executeEffect(request), (error: unknown) => {
    assert.ok(error instanceof ApplicationFailure);
    assert.deepEqual([error.type, error.nonRetryable], ["host.capacity.effectResult", true]);
    return true;
  });
});

test("an effect result over its bound halts the chain unsupported with the bound's code, as the arrival loop does", async () => {
  const refusal = await answering(fx.effectOutcomeAtBound(1)).executeEffect(request).then(() => null, (error: unknown) => error);
  assert.ok(refusal instanceof ApplicationFailure);
  assert.deepEqual(effectFailureHalt(request.key, delivered(refusal)),
    { commandId: "host:effect-key", outcome: "unsupported", code: "host.capacity.effectResult" });
});

test("any other non-retryable Activity refusal halts as a host failure carrying the refusal's own message", () => {
  const refusal = ApplicationFailure.nonRetryable("Script format groovy is not run by this host", "UnsupportedScriptFormat");
  assert.deepEqual(effectFailureHalt(request.key, delivered(refusal)),
    { commandId: "host:effect-key", outcome: "hostFailure", code: "Script format groovy is not run by this host" });
});
