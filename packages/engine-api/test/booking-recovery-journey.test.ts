/**
 * PC-JOURNEY-07 through the engine API: a trip booking reserves a flight, a hotel room and a rental car inside one
 * Transaction, and an agent cancels it or a called car reservation fails. The expected answers are the compensation
 * semantics' (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md), fixed here because CIB answers none of the
 * decisive points: it cannot observe a running handler (CIB-LIM-0048), runs a Service Task handler inside the cancelling
 * command (CIB-LIM-0042) and runs a removed task's output parameter (CIB-LIM-0057). The same model and schedules run
 * against the kernel in `scenarios/open-rows/journey-booking-recovery`. Effect results and the variable command are the
 * memory host's own inputs, as a Workflow's Activity and a client deliver them; everything else goes through the API.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionStartStatus,
  EngineOpenWorkStatus,
  EnginePublicationStatus,
  compileBpmnDefinition,
  completeWork,
  engineProcessLocatorForCanonicalProcess,
  observeEngineProcessExecution,
  observeOpenWork,
  startBpmnDefinitionVersion,
  type EngineBinding,
  type EngineDefinitionIdentity,
  type EngineOpenWait,
  type EngineSourceOverlaySelection,
} from "@bpmn-lean/engine-api";

import { cibProfile, deployed, limits, scenarioBytes, sha256, testHost, testPopulation, type TestHost } from "./support.ts";

const profile = await cibProfile();
const modelPath = "open-rows/journey-booking-recovery/booking.bpmn";
const overlayPath = "open-rows/journey-booking-recovery/booking-overlay.json";
const sourceId = "booking-recovery";
const processId = "Process_Booking";
const instance = "Booking_1";
const carInstance = "call:9:Booking_1:10:ReserveCar:1";
const locator = engineProcessLocatorForCanonicalProcess(testPopulation, instance);
const workflowId = decodeURIComponent(locator.slice("bpmn-process:".length));

const text = (value: string) => ({ kind: "string", value }) as const;
const binding = (name: string, value: string): EngineBinding => ({ name, value: text(value) });

async function overlay(): Promise<EngineSourceOverlaySelection> {
  const bytes = await scenarioBytes(overlayPath);
  return { id: "booking-handlers", sha256: await sha256(bytes), bytes };
}

async function identity(): Promise<EngineDefinitionIdentity> {
  const compiled = await compileBpmnDefinition({
    bytes: await scenarioBytes(modelPath), sourceId, profile, limits, sourceOverlay: await overlay(),
  });
  if (compiled.status !== EngineDefinitionCompilationStatus.Accepted) throw new Error(`not admitted: ${compiled.diagnostics[0].code}`);
  return { ...compiled.definition, ref: { ...compiled.definition.ref, version: 1 } };
}

/** One booking as the schedules start it: placeholder references, a `double` room preference and the traveler. */
async function booking(): Promise<TestHost> {
  const host = testHost();
  const bytes = await scenarioBytes(modelPath);
  const request = await deployed({
    host, bytes, sourceId, expectedSha256: await sha256(bytes), profile, expectedProcessId: processId, version: 1, limits,
    sourceOverlay: await overlay(),
  });
  const started = await startBpmnDefinitionVersion({
    ...request,
    processInstanceId: instance,
    initialVariables: [
      binding("bookingId", "BK-7731"), binding("carRef", "none"), binding("flightRef", "none"),
      { name: "nights", value: { kind: "integer", value: 3 } }, binding("roomPreference", "double"),
      binding("roomRef", "none"), binding("roomType", "unset"),
      { name: "route", value: { kind: "map", value: [binding("date", "2026-12-01"), binding("from", "FRA"), binding("to", "LIS")] } },
      { name: "traveler", value: { kind: "map", value: [binding("email", "lena.marsh@example.org"), binding("name", "Lena Marsh")] } },
    ],
  });
  assert.equal(started.status, EngineDefinitionStartStatus.Started);
  return host;
}

let commands = 0;
const nextCommand = (label: string): string => `${label}-${String(++commands)}`;
const at = (elementId: string, processInstanceId = instance) => ({ processInstanceId, elementId, activation: 1 });

/** An effect's result as its Activity reports it; the kernel's verdict. */
async function effect(host: TestHost, elementId: string, outputs: readonly EngineBinding[] = []): Promise<string> {
  const answer = await host.processes.arrive(workflowId, {
    kind: "effectResult", commandId: nextCommand(elementId), occurrence: at(elementId), outcome: { kind: "success", outputs },
  });
  return answer.outcome;
}

/** Completes a User Task of the booking or of its called car reservation; the kernel's verdict. */
async function complete(host: TestHost, elementId: string, values: readonly EngineBinding[] = [], processInstanceId = instance):
  Promise<string> {
  const result = await completeWork({
    host, locator, hostingProcessInstanceId: instance,
    completion: { commandId: nextCommand(elementId), taskId: at(elementId, processInstanceId), values },
  });
  return result.kind === "semantic" ? result.outcome : result.kind;
}

async function waits(host: TestHost): Promise<readonly EngineOpenWait[]> {
  const page = await observeEngineProcessExecution({
    host, locator, definition: await identity(), processInstanceId: instance, afterRevision: 0,
  });
  if (page.status !== EnginePublicationStatus.Available || page.current === null) throw new Error("no committed state");
  return page.current.state.openWaits;
}

/** Every open wait of the booking and its called instance as `Element#activation`, sorted. */
async function open(host: TestHost): Promise<readonly string[]> {
  return (await waits(host)).map((wait) => `${wait.id.elementId}#${String(wait.id.activation)}`).sort();
}

/** The arguments the open effect `elementId` was invoked with, by name. */
async function argumentsOf(host: TestHost, elementId: string): Promise<Readonly<Record<string, unknown>>> {
  const wait = (await waits(host)).find((candidate) => candidate.id.elementId === elementId && candidate.detail.kind === "effect");
  if (wait === undefined) throw new Error(`${elementId} is not an open effect`);
  const args = wait.detail["arguments"] as unknown as readonly EngineBinding[];
  return Object.fromEntries(args.map(({ name, value }) => [name, value]));
}

async function closed(host: TestHost): Promise<boolean> {
  return (await observeOpenWork({ host, locator, hostingProcessInstanceId: instance })).status === EngineOpenWorkStatus.Closed;
}

/** The flight, the room (confirmed as `RM-204-UPG`) and the car complete; the decision task stays open. */
async function reserved(host: TestHost): Promise<void> {
  assert.equal(await effect(host, "ReserveFlight", [binding("flightReference", "FL-4471")]), "committed");
  assert.equal(await effect(host, "ReserveRoom", [binding("roomReference", "RM-204")]), "committed");
  assert.equal(await effect(host, "ConfirmRoom", [binding("confirmedReference", "RM-204-UPG")]), "committed");
  assert.equal(await complete(host, "ConfirmCar", [binding("carRef", "CR-889"), binding("carStatus", "confirmed")], carInstance),
    "committed");
}

const cancel = (host: TestHost) => complete(host, "DecideBooking", [binding("decision", "cancel")]);

// Spec :23: handlers with no dependency between their subjects start at once; :36: the Cancel boundary is taken only
// once the last handler has completed. The three subjects share no Sequence Flow path and no name.
const allHandlersOpen = ["CancelCar#1", "CancelFlight#1", "ReleaseRoom#1"];

test("a cancellation starts the three handlers together and tells the traveler only after the last one", async () => {
  const host = await booking();
  await reserved(host);
  assert.equal(await cancel(host), "committed");
  assert.deepEqual(await open(host), allHandlersOpen);
  assert.equal(await complete(host, "NotifyTraveler"), "rejected");

  assert.equal(await complete(host, "CancelCar"), "committed");
  assert.equal(await complete(host, "NotifyTraveler"), "rejected");
  assert.equal(await effect(host, "ReleaseRoom"), "committed");
  assert.deepEqual(await open(host), ["CancelFlight#1"]);
  assert.equal(await complete(host, "NotifyTraveler"), "rejected");
  assert.equal(await effect(host, "CancelFlight"), "committed");
  assert.deepEqual(await open(host), ["NotifyTraveler#1"]);
  assert.equal(await complete(host, "NotifyTraveler"), "committed");
  assert.equal(await closed(host), true);
});

test("the traveler waits for the last handler when the handlers are answered in the other order", async () => {
  const host = await booking();
  await reserved(host);
  assert.equal(await cancel(host), "committed");
  assert.deepEqual(await open(host), allHandlersOpen);

  assert.equal(await effect(host, "CancelFlight"), "committed");
  assert.equal(await complete(host, "NotifyTraveler"), "rejected");
  assert.equal(await complete(host, "CancelCar"), "committed");
  assert.deepEqual(await open(host), ["ReleaseRoom#1"]);
  assert.equal(await complete(host, "NotifyTraveler"), "rejected");
  assert.equal(await effect(host, "ReleaseRoom"), "committed");
  assert.deepEqual(await open(host), ["NotifyTraveler#1"]);
});

// Spec :16: a boundary handler restores no context and reads live; a Compensation Event Sub-Process restores its
// parent's own variables as they were when the parent completed and reads every other name live.
test("the room's handler reads the hotel's completed context while the flight's reads the rebooked reference", async () => {
  const host = await booking();
  await reserved(host);
  const rebooked = await host.processes.command(workflowId, {
    kind: "command", commandId: nextCommand("rebook"), occurrence: at("DecideBooking"),
    action: {
      kind: "setVariables",
      values: [binding("flightRef", "FL-4471-REBOOKED"), binding("roomRef", "RM-LATE"), binding("roomType", "late")],
    },
  });
  assert.equal(rebooked.outcome, "committed");
  assert.equal(await cancel(host), "committed");
  assert.deepEqual(await open(host), allHandlersOpen);

  assert.deepEqual(await argumentsOf(host, "ReleaseRoom"), { reference: text("RM-204-UPG"), roomType: text("double") });
  assert.deepEqual(await argumentsOf(host, "CancelFlight"), { reference: text("FL-4471-REBOOKED"), bookingId: text("BK-7731") });
});

// Spec :15: failed or interrupted work completes nothing and retains nothing, so the car that raised `NO_CAR` has no
// record and its handler never starts.
test("after the NO_CAR recovery a cancellation compensates the flight and the room but never the car", async () => {
  const host = await booking();
  assert.equal(await effect(host, "ReserveFlight", [binding("flightReference", "FL-4471")]), "committed");
  assert.equal(await complete(host, "ConfirmCar", [binding("carRef", "none"), binding("carStatus", "unavailable")], carInstance),
    "committed");
  assert.deepEqual(await open(host), ["DecideBooking#1", "OfferOtherCar#1", "ReserveRoom#1"]);
  assert.equal(await effect(host, "ReserveRoom", [binding("roomReference", "RM-204")]), "committed");
  assert.equal(await effect(host, "ConfirmRoom", [binding("confirmedReference", "RM-204-UPG")]), "committed");
  assert.equal(await complete(host, "OfferOtherCar"), "committed");

  assert.equal(await cancel(host), "committed");
  assert.deepEqual(await open(host), ["CancelFlight#1", "ReleaseRoom#1"]);
  assert.equal(await complete(host, "CancelCar"), "rejected");
  assert.equal(await complete(host, "NotifyTraveler"), "rejected");
  assert.equal(await effect(host, "ReleaseRoom"), "committed");
  assert.equal(await complete(host, "NotifyTraveler"), "rejected");
  assert.equal(await effect(host, "CancelFlight"), "committed");
  assert.deepEqual(await open(host), ["NotifyTraveler#1"]);
});

// Spec :18 and I6 (:87-:93): an Error that leaves the Transaction is no cancellation; the interior is removed with
// its records, uncompensated.
test("CARD_DECLINED reaches the Transaction's boundary, removes the interior and starts no handler", async () => {
  const host = await booking();
  assert.equal(await effect(host, "ReserveFlight", [binding("flightReference", "FL-4471")]), "committed");
  assert.equal(await effect(host, "ReserveRoom", [binding("roomReference", "RM-204")]), "committed");
  assert.equal(await complete(host, "ConfirmCar", [binding("carRef", "none"), binding("carStatus", "declined")], carInstance),
    "committed");

  assert.deepEqual(await open(host), ["HandlePaymentFailure#1"]);
  assert.equal(await effect(host, "CancelFlight"), "rejected");
  assert.equal(await effect(host, "ConfirmRoom", [binding("confirmedReference", "RM-204-UPG")]), "rejected");
  assert.equal(await cancel(host), "rejected");
  assert.equal(await complete(host, "OfferOtherCar"), "rejected");
  assert.equal(await complete(host, "NotifyTraveler"), "rejected");
  assert.deepEqual(await open(host), ["HandlePaymentFailure#1"]);
  assert.equal(await complete(host, "HandlePaymentFailure"), "committed");
  assert.equal(await closed(host), true);
});
