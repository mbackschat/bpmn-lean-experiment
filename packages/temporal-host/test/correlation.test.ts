/**
 * Correlated Message routing: the registrations a process owes its ingresses, the ingress's registration and ledger
 * rules, and, through the in-process host, a publication delivered to the one open correlated wait whose key the
 * kernel matches at delivery time, `message.notCorrelated` for none and `message.correlationAmbiguous` for several.
 * The model is the retained message-key-correlation process: an uncorrelated catch writes the settlement reference,
 * then a catch correlated on it waits.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";

import type { JsonValue } from "../src/port.ts";
import type { CorrelatedPublication, HostConfig } from "../src/protocol.ts";

const correlation = await import(new URL("../dist/correlation.js", import.meta.url).href) as typeof import("../src/correlation.ts");
const { createMemoryProcessHost } = await import(new URL("../dist/memory-host.js", import.meta.url).href) as
  typeof import("../src/memory-host.ts");
const { PublicationOutcome, Scheduling } = await import(new URL("../dist/protocol.js", import.meta.url).href) as
  typeof import("../src/protocol.ts");

const durable: HostConfig = { scheduling: Scheduling.Durable, effectStartToCloseMs: 1_000, historyEventBudget: null };
const channel = {
  kind: "operationMessage",
  interfaceId: "Interface_ClearingHouse",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_SettlementConfirmed",
};
const string = (value: string): JsonValue => ({ kind: "string", value });
const occurrence = (instance: string, elementId: string) => ({ processInstanceId: instance, elementId, activation: 1 });

async function correlatedProgram(): Promise<JsonValue> {
  const read = await readKernelProgram({
    bytes: await readFile(new URL("../../../scenarios/message-key-correlation/process.bpmn", import.meta.url)),
    overlay: null,
    profile: "bpmn-2.0.2",
    limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 },
  }, kernelProfileOptions(["CIB-AGR-0001", "CIB-OP-0001", "CIB-LIM-0002"]));
  if (read.kind !== "read") throw new Error(`reader refused ${read.code}`);
  return JSON.parse(JSON.stringify(read.program)) as JsonValue;
}

/** A host with one waiting instance per `references` entry, each correlated on that settlement reference. */
async function waiting(scope: string, references: readonly string[]) {
  const host = createMemoryProcessHost({ taskQueue: "queue", now: () => 5_000 });
  const program = await correlatedProgram();
  for (const [index, reference] of references.entries()) {
    const instance = `I${String(index)}`;
    const start = { kind: "start", commandId: `start-${instance}`, instanceId: instance, variables: [] };
    assert.equal((await host.start({ workflowId: `W${String(index)}`, program, config: durable, start, correlationScope: scope }))
      .outcome, "committed");
    const initialize = {
      kind: "deliver", commandId: `initialize-${instance}`, occurrence: occurrence(instance, "MessageCatch_InitialSettlement"),
      trigger: { kind: "message", channel }, payload: string(reference),
    };
    assert.equal((await host.deliver(`W${String(index)}`, initialize)).outcome, "committed");
  }
  return host;
}

const publication = (commandId: string, reference: string, scope = "definition-1"): CorrelatedPublication => ({
  correlationScope: scope,
  channel,
  commandId,
  correlation: [{ target: { kind: "processVariable", name: "CorrelationKey_SettlementReference" }, expected: string(reference) }],
  payload: null,
});

test("a publication reaches the one open correlated wait whose key matches now, and then no other", async () => {
  const host = await waiting("definition-1", ["settlement-42", "settlement-43"]);
  assert.deepEqual(await host.publish(publication("p-1", "settlement-42")), {
    kind: PublicationOutcome.Delivered, ordinal: 1, target: { workflowId: "W0", occurrence: occurrence("I0", "MessageCatch_CorrelatedSettlement") },
  });
  assert.ok(!(await host.hostView("W0")).view?.openWaits.some((wait) => wait.id.elementId === "MessageCatch_CorrelatedSettlement"));
  assert.deepEqual(await host.publish(publication("p-2", "settlement-42")),
    { kind: PublicationOutcome.NotCorrelated, ordinal: 2, code: "message.notCorrelated" });
});

test("several matching waits reject the publication and change no instance", async () => {
  const host = await waiting("definition-1", ["settlement-42", "settlement-42"]);
  const before = await host.hostView("W0");
  assert.deepEqual(await host.publish(publication("p-1", "settlement-42")),
    { kind: PublicationOutcome.Ambiguous, ordinal: 1, code: "message.correlationAmbiguous", matches: 2 });
  assert.deepEqual(await host.hostView("W0"), before);
});

test("a publication to another scope never reaches an instance of this one", async () => {
  const host = await waiting("definition-1", ["settlement-42"]);
  assert.equal((await host.publish(publication("p-1", "settlement-42", "definition-2"))).kind, PublicationOutcome.NotCorrelated);
});

test("a repeated command is answered from the ledger, and with other content is an identity conflict", async () => {
  const host = await waiting("definition-1", ["settlement-42"]);
  const first = await host.publish(publication("p-1", "settlement-42"));
  assert.equal(first.kind, PublicationOutcome.Delivered);
  assert.deepEqual(await host.publish(publication("p-1", "settlement-42")), first);
  assert.deepEqual(await host.publish(publication("p-1", "settlement-7")), { kind: PublicationOutcome.IdentityConflict });
});

test("a process owes a registration for each changed channel and the clearing of a channel it left", () => {
  const view = (status: string, criteria: readonly string[]) => ({
    status, journal: [],
    openWaits: [
      { id: occurrence("I", "Correlated"), channel, criteria },
      { id: occurrence("I", "Task"), userTask: {} },
    ],
  });
  const desired = correlation.correlatedWaits(view("running", ["CorrelationKey_SettlementReference"]));
  const owed = correlation.registrationsDue(desired, []);
  assert.deepEqual(owed.map((entry) => entry.waits), [[occurrence("I", "Correlated")]]);
  const registered = correlation.afterRegistration([], owed[0]!);
  assert.deepEqual(correlation.registrationsDue(desired, registered), [], "nothing is owed once registered");
  assert.deepEqual(correlation.correlatedWaits(view("running", [])).size, 0, "an uncorrelated wait is not registered");
  const cleared = correlation.registrationsDue(correlation.correlatedWaits(view("completed", ["K"])), registered);
  assert.deepEqual(cleared.map((entry) => entry.waits), [[]], "an ended instance clears what it registered");
  assert.deepEqual(correlation.afterRegistration(registered, cleared[0]!), []);
});

test("an ingress keeps the latest registration of each chain and forgets a chain that is gone", () => {
  const waits = [occurrence("I", "Correlated")];
  let state = correlation.register(correlation.emptyIngress, { workflowId: "W", revision: 3, waits });
  state = correlation.register(state, { workflowId: "W", revision: 2, waits: [] });
  assert.deepEqual(correlation.candidates(state), ["W"], "an older revision never overwrites a later one");
  state = correlation.register(state, { workflowId: "V", revision: 1, waits });
  state = correlation.forget(state, [{ workflowId: "W", occurrences: null }, { workflowId: "V", occurrences: [] }]);
  assert.deepEqual(correlation.candidates(state), ["V"]);
  assert.deepEqual(correlation.candidates(correlation.register(state, { workflowId: "V", revision: 1, waits: [] })), [],
    "an equal revision with no waits clears the chain");
});

test("a publication's Update ID carries its content, so a repeat with other content is not answered as the first", async () => {
  const { publicationUpdateId } = await import(new URL("../dist/correlation-address.js", import.meta.url).href) as
    typeof import("../src/correlation-address.ts");
  assert.equal(publicationUpdateId(publication("p-1", "settlement-42")), publicationUpdateId(publication("p-1", "settlement-42")));
  assert.notEqual(publicationUpdateId(publication("p-1", "settlement-42")), publicationUpdateId(publication("p-1", "settlement-99")));
});
