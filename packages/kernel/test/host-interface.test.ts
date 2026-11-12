/**
 * The host interface a platform builds on: a Timer start offers its resolved schedule, a Message start its channel and
 * literal name, a correlated catch publishes its
 * channel, element and criteria, `matching` finds the open waits a correlated delivery reaches in one instance, and an
 * incident command names the generation it resolves.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  admit,
  decodeProgram,
  definitionCapabilities,
  hostRequirements,
  hostViewJson,
  refusesSignalVariables,
  rootStarts,
  matching,
  step,
  stimulusFromJson,
} from "./lean-paired.ts";

import {
  activity,
  append,
  base,
  callWork,
  catchEvent,
  channel,
  computed,
  condition,
  criterion,
  cycle,
  date,
  definitionRef,
  duration,
  end,
  message,
  receiveWork,
  replace,
  serviceWork,
  signal,
  start,
  userWork,
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
  return step(program, state, input.value[1]);
}

function committed(outcome: Outcome): State {
  assert.ok(outcome.ok, outcome.ok ? "" : outcome.failure.code);
  return outcome.value;
}

const string = (value: string): Json => ({ kind: "string", value });
const begin = (variables: Json[] = []): Json => ({ kind: "start", commandId: "start", instanceId: "Instance_1", variables });

type Requirements = ReturnType<typeof hostRequirements>;

const serves = (served: Partial<Requirements>, maxConcurrentWaits: number | null): Requirements =>
  ({ timers: false, messages: false, effects: false, userTasks: false, calls: false, ...served, maxConcurrentWaits });

test("a program without a subscription or waiting work opens no wait, and one whose waits are Signal or Conditional bounds none", () => {
  assert.deepEqual(hostRequirements(admitted(base())), serves({}, 0));
  for (const trigger of [signal(), condition()]) {
    const waiting = admitted(replace(base(), "T", catchEvent("T", trigger)));
    assert.deepEqual(hostRequirements(waiting), serves({}, null));
    const started = withOptions(replace(base(), "S", start("S", trigger)), { conditionalStart: "submittedContext" });
    assert.deepEqual(hostRequirements(admitted(started)), serves({}, null));
  }
});

test("each waiting kind asks the host for exactly the service that serves it and leaves concurrent waits unbounded", () => {
  const waitingOn = (element: Json, carried: Json = base()): Requirements => hostRequirements(admitted(replace(carried, "T", element)));
  // The called process `Called` carries one Manual Task, so the call is the program's only wait.
  const called = { ...append(base(), activity("CT", "manual", { incoming: [], outgoing: [] })),
    processes: [{ definition: definitionRef("Called"), children: ["CT"], variables: [], executable: true }] };
  assert.deepEqual(waitingOn(catchEvent("T", duration("PT1M"))), serves({ timers: true }, null));
  assert.deepEqual(waitingOn(catchEvent("T", message(channel()))), serves({ messages: true }, null));
  assert.deepEqual(waitingOn(activity("T", receiveWork(channel()))), serves({ messages: true }, null));
  assert.deepEqual(waitingOn(activity("T", serviceWork())), serves({ effects: true }, null));
  assert.deepEqual(waitingOn(activity("T", userWork())), serves({ userTasks: true }, null));
  assert.deepEqual(waitingOn(activity("T", callWork()), called), serves({ calls: true }, null));
});

test("a bound Message throw needs the host to serve effects, as a Service Task does, and an unbound one does not", () => {
  const throwing = (binding: Json | null): Program => admitted(withOptions(
    replace(base(), "E", end("E", { message: { payload: { binding, handlerKey: null, payload: [] } } })),
    { messageThrowForms: "cibForms" }));
  assert.deepEqual(hostRequirements(throwing({ protocol: "urn:p", operation: "urn:send" })), serves({ effects: true }, null));
  assert.deepEqual(hostRequirements(throwing(null)), serves({}, 0));
});

test("a Timer start offers the duration the kernel resolves from its schedule", () => {
  const program = admitted(replace(base(), "S", start("S", duration("PT1M30S"))));
  assert.deepEqual(definitionCapabilities(program), {
    starts: [{ startEventId: "S", trigger: { kind: "timer" }, schedule: { durationMs: 90_000 } }],
    correlatedChannels: [],
    relations: program.options.relations,
  });
});

/** The capabilities of the base program with its start replaced by `trigger`, which admission refuses with `refusal`. */
function refusedStarts(trigger: Json, refusal: string): Json {
  const decoded = decodeProgram(wired(replace(base(), "S", start("S", trigger))));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), refusal, "admission refuses the form first");
  return definitionCapabilities(decoded.value) as Json;
}

test("a Timer start offers the instant of a literal date, the period of a cycle and the text of a literal Cron expression", () => {
  const offered = (trigger: Json): Json =>
    (definitionCapabilities(admitted(replace(base(), "S", start("S", trigger)))) as Json).starts as Json;
  const timer = (schedule: Json): Json[] => [{ startEventId: "S", trigger: { kind: "timer" }, schedule }];
  assert.deepEqual(offered(date("2026-11-09T10:00:00Z")), timer({ instantMs: Date.parse("2026-11-09T10:00:00Z") }));
  assert.deepEqual(offered(cycle("R3/PT1H")), timer({ cycle: { periodMs: 3_600_000, repetitions: 3 } }));
  assert.deepEqual(offered(cycle("0 0 12 * * ?", "cron")), timer({ cron: "0 0 12 * * ?" }));
});

test("a Timer start whose schedule is an expression is not offered", () => {
  const dynamic = { timer: { payload: { schedule: { duration: { value: computed(variable("delay")) } } } } };
  assert.deepEqual(refusedStarts(dynamic, "timer.duration").starts, []);
});

test("a Message start offers its channel and its literal Message name", () => {
  const program = admitted(replace(base(), "S", start("S", message(channel()))));
  assert.deepEqual((definitionCapabilities(program) as Json).starts, [{
    startEventId: "S",
    trigger: {
      kind: "message",
      channel: { kind: "operationMessage", interfaceId: "I", interfaceOperationId: "O", messageId: "M" },
      messageName: "M",
    },
  }]);
});

test("a Signal and a Conditional start offer their trigger kind, a none start the kind none", () => {
  const offered = (trigger: Json | null): Json => (definitionCapabilities(admitted(withOptions(
    replace(base(), "S", start("S", trigger)), { conditionalStart: "submittedContext" }))) as Json).starts as Json;
  assert.deepEqual(offered(signal()), [{ startEventId: "S", trigger: { kind: "signal" } }]);
  assert.deepEqual(offered(condition()), [{ startEventId: "S", trigger: { kind: "condition" } }]);
  assert.deepEqual(offered(null), [{ startEventId: "S", trigger: { kind: "none" } }]);
});

const correlatedCatch = catchEvent("T", message({ ...channel(), correlation: [criterion("OrderKey", variable("orderId"))] }));
const correlatedProgram = (): Program => admitted({ ...replace(base(), "T", correlatedCatch), variables: ["orderId"] });

test("a correlated catch publishes its channel, its element and the criteria the kernel evaluates", () => {
  const program = correlatedProgram();
  assert.deepEqual(definitionCapabilities(program), {
    starts: [{ startEventId: "S", trigger: { kind: "none" } }],
    correlatedChannels: [{
      channel: { kind: "operationMessage", interfaceId: "I", interfaceOperationId: "O", messageId: "M" },
      catches: [{ elementId: "T", criteria: [{ key: "OrderKey", value: { variable: { name: "orderId" } } }] }],
    }],
    relations: program.options.relations,
  });
});

/** The channel and correlation of a delivery on `operationRef` carrying `key`, in the stimulus codec's wire form. */
const delivery = (key: string, operationRef = "O") => [
  { kind: "operationMessage", messageId: "M", interfaceId: "I", interfaceOperationId: operationRef },
  [{ target: { kind: "processVariable", name: "OrderKey" }, expected: string(key) }],
] as const;

test("matching finds the open wait whose criteria the waiting instance's current values satisfy", () => {
  const program = correlatedProgram();
  const state = committed(run(program, null, begin([{ name: "orderId", value: string("o-7") }])));
  assert.deepEqual(matching(program, state, ...delivery("o-7")), [{ processInstanceId: "Instance_1", elementId: "T", activation: 1 }]);
  assert.deepEqual(matching(program, state, ...delivery("o-8")), []);
  assert.deepEqual(matching(program, state, ...delivery("o-7", "Other")), []);
});

test("the host view names each open Message and Signal wait's address, which the population ingress registers", () => {
  const signalProgram = admitted(replace(base(), "T", catchEvent("T", signal())));
  const signalState = committed(run(signalProgram, null, begin()));
  assert.deepEqual((hostViewJson(signalProgram, signalState) as Json).addresses, [{
    occurrence: { processInstanceId: "Instance_1", elementId: "T", activation: 1 },
    signal: { signalRef: { id: "Sig" } },
  }]);
  const messageProgram = admitted(replace(base(), "T", catchEvent("T", message(channel()))));
  const messageState = committed(run(messageProgram, null, begin()));
  assert.deepEqual((hostViewJson(messageProgram, messageState) as Json).addresses, [{
    occurrence: { processInstanceId: "Instance_1", elementId: "T", activation: 1 },
    message: { channel: { kind: "operationMessage", interfaceId: "I", interfaceOperationId: "O", messageId: "M" } },
  }]);
  const plain = admitted(base());
  assert.equal((hostViewJson(plain, committed(run(plain, null, begin()))) as Json).addresses, undefined);
});

test("rootStarts pairs each root start's public identifier with its own, which a population start input names", () => {
  const program = admitted(replace(base(), "S", start("S", signal())));
  assert.deepEqual(rootStarts(program), [["S", "S"]]);
  assert.deepEqual(rootStarts(admitted(base())), [["S", "S"]]);
});

test("an instance refuses Signal variables exactly when its program carries no Signal payload", () => {
  assert.equal(refusesSignalVariables(admitted(withOptions(base(), { signalPayload: "none" }))), true);
  assert.equal(refusesSignalVariables(admitted(withOptions(base(), { signalPayload: "variables", evaluator: "juel" }))), false);
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
