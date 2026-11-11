/**
 * The host interface a platform builds on: a Timer start offers its resolved schedule, a Message start its channel and
 * literal name, a correlated catch publishes its
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
  hostRequirements,
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
  computed,
  condition,
  criterion,
  cycle,
  date,
  duration,
  message,
  replace,
  serviceWork,
  signal,
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

test("a program without a subscription or waiting work opens no wait, and one whose waits are Signal or Conditional bounds none", () => {
  assert.equal(hostRequirements(admitted(base())).maxConcurrentWaits, 0);
  for (const trigger of [signal(), condition()]) {
    const waiting = admitted(replace(base(), "T", catchEvent("T", trigger)));
    assert.equal(hostRequirements(waiting).maxConcurrentWaits, null);
    const started = withOptions(replace(base(), "S", start("S", trigger)), { conditionalStart: "submittedContext" });
    assert.equal(hostRequirements(admitted(started)).maxConcurrentWaits, null);
  }
});

test("a Timer start offers the duration the kernel resolves from its schedule", () => {
  const program = admitted(replace(base(), "S", start("S", duration("PT1M30S"))));
  assert.deepEqual(capabilitiesJson(definitionCapabilities(program)), {
    starts: [{ startEventId: "S", timer: { durationMs: 90_000 } }],
    correlatedChannels: [],
    relations: program.options.relations,
  });
});

/** The capabilities of the base program with its start replaced by `trigger`, which admission refuses with `refusal`. */
function refusedStarts(trigger: Json, refusal: string): Json {
  const decoded = decodeProgram(wired(replace(base(), "S", start("S", trigger))));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), refusal, "admission refuses the form first");
  return capabilitiesJson(definitionCapabilities(decoded.value)) as Json;
}

test("a Timer start offers the instant of a literal date, the period of a cycle and the text of a literal Cron expression", () => {
  const offered = (trigger: Json): Json =>
    (capabilitiesJson(definitionCapabilities(admitted(replace(base(), "S", start("S", trigger))))) as Json).starts as Json;
  assert.deepEqual(offered(date("2026-11-09T10:00:00Z")), [{ startEventId: "S", timer: { instantMs: Date.parse("2026-11-09T10:00:00Z") } }]);
  assert.deepEqual(offered(cycle("R3/PT1H")), [{ startEventId: "S", timer: { cycle: { periodMs: 3_600_000, repetitions: 3 } } }]);
  assert.deepEqual(offered(cycle("0 0 12 * * ?", "cron")), [{ startEventId: "S", timer: { cron: "0 0 12 * * ?" } }]);
});

test("a Timer start whose schedule is an expression is not offered", () => {
  const dynamic = { timer: { payload: { schedule: { duration: { value: computed(variable("delay")) } } } } };
  assert.deepEqual(refusedStarts(dynamic, "timer.duration").starts, []);
});

test("a Message start offers its channel and its literal Message name", () => {
  const program = admitted(replace(base(), "S", start("S", message(channel()))));
  assert.deepEqual((capabilitiesJson(definitionCapabilities(program)) as Json).starts, [{
    startEventId: "S",
    channel: { kind: "operationMessage", interfaceId: "I", interfaceOperationId: "O", messageId: "M" },
    messageName: "M",
  }]);
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
