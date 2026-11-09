/**
 * The host interface a platform builds on: a Timer start offers its resolved schedule, a correlated catch publishes its
 * channel, element and criteria, `matching` finds the open waits a correlated delivery reaches in one instance, and an
 * incident command names the generation it resolves.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  admit,
  capabilitiesJson,
  decodeProgram,
  definitionCapabilities,
  InputTag,
  hooks,
  matching,
  step,
  stimulusFromJson,
  type Outcome,
  type Program,
  type State,
} from "@bpmn-lean/kernel";

import {
  activity,
  base,
  catchEvent,
  channel,
  criterion,
  date,
  duration,
  message,
  replace,
  serviceWork,
  start,
  variable,
  withOptions,
  wired,
  type Json,
} from "./admission-refusal-support.ts";

function admitted(json: Json): Program {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

function run(program: Program, state: State | null, stimulus: Json): Outcome {
  const input = stimulusFromJson(stimulus);
  assert.ok(input.ok, input.ok ? "" : input.refusal);
  return step(hooks, program, state, input.value[1]);
}

function committed(outcome: Outcome): State {
  assert.ok(outcome.ok, outcome.ok ? "" : outcome.failure.code);
  return outcome.value;
}

const string = (value: string): Json => ({ kind: "string", value });
const begin = (variables: Json[] = []): Json => ({ kind: "start", commandId: "start", instanceId: "Instance_1", variables });

test("a Timer start offers the duration the kernel resolves from its schedule", () => {
  const program = admitted(replace(base(), "S", start("S", duration("PT1M30S"))));
  assert.deepEqual(capabilitiesJson(definitionCapabilities(program)), {
    starts: [{ startEventId: "S", timer: { durationMs: 90_000 } }],
    correlatedChannels: [],
    relations: program.options.relations,
  });
});

test("a Timer start whose schedule does not resolve is not offered", () => {
  const decoded = decodeProgram(wired(replace(base(), "S", start("S", date("2026-11-09T10:00:00Z")))));
  assert.ok(decoded.ok);
  assert.equal(admit(decoded.value), "timer.date", "admission refuses the form first");
  assert.deepEqual(definitionCapabilities(decoded.value).starts, []);
});

const correlatedCatch = catchEvent("T", message({ ...channel(), correlation: [criterion("OrderKey", variable("orderId"))] }));
const correlatedProgram = (): Program => admitted({ ...replace(base(), "T", correlatedCatch), variables: ["orderId"] });

test("a correlated catch publishes its channel, its element and the criteria the kernel evaluates", () => {
  const program = correlatedProgram();
  assert.deepEqual(capabilitiesJson(definitionCapabilities(program)), {
    starts: [{ startEventId: "S" }],
    correlatedChannels: [{
      channel: { kind: "operationMessage", interfaceId: "I", interfaceOperationId: "O", messageId: "M" },
      catches: [{ elementId: "T", criteria: [{ key: "OrderKey", value: { variable: { name: "orderId" } } }] }],
    }],
    relations: program.options.relations,
  });
});

/** The channel and correlation of a delivery on `operationRef` carrying `key`, as the stimulus codec reads them. */
function delivery(key: string, operationRef = "O") {
  const decoded = stimulusFromJson({
    kind: "deliver", commandId: "deliver", occurrence: { processInstanceId: "Instance_1", elementId: "T", activation: 1 },
    trigger: { kind: "message", channel: { kind: "operationMessage", messageId: "M", interfaceId: "I", interfaceOperationId: operationRef } },
    correlation: [{ target: { kind: "processVariable", name: "OrderKey" }, expected: string(key) }],
  });
  assert.ok(decoded.ok && decoded.value[1].tag === InputTag.Deliver);
  const { trigger, correlation } = decoded.value[1].payload;
  assert.ok("channel" in trigger);
  return [trigger.channel, correlation] as const;
}

test("matching finds the open wait whose criteria the waiting instance's current values satisfy", () => {
  const program = correlatedProgram();
  const state = committed(run(program, null, begin([{ name: "orderId", value: string("o-7") }])));
  assert.deepEqual(matching(hooks, program, state, ...delivery("o-7")), [{ processInstanceId: "Instance_1", element: "T", activation: 1 }]);
  assert.deepEqual(matching(hooks, program, state, ...delivery("o-8")), []);
  assert.deepEqual(matching(hooks, program, state, ...delivery("o-7", "Other")), []);
});

test("an incident command naming another generation than the open incident's is rejected as stale", () => {
  const program = admitted(withOptions(replace(base(), "T", activity("T", serviceWork())),
    { technicalFailure: "incident", incidentProcessCancellation: true }));
  const occurrence = { processInstanceId: "Instance_1", elementId: "T", activation: 1 };
  const failed = committed(run(program, committed(run(program, null, begin())),
    { kind: "effectResult", commandId: "fail", occurrence, outcome: { kind: "technicalFailure" } }));
  const command = (kind: string, generation: number): Json => ({ kind: "command", commandId: kind, occurrence, action: { kind, generation } });
  for (const kind of ["retryIncident", "cancelIncidentProcess"]) {
    const stale = run(program, failed, command(kind, 2));
    assert.ok(!stale.ok);
    assert.deepEqual([stale.failure.tag, stale.failure.code], ["rejected", "incident-generation-stale"]);
  }
  committed(run(program, failed, command("retryIncident", 1)));
  committed(run(program, failed, command("cancelIncidentProcess", 1)));
});
