/**
 * An interrupting Message Event Sub-Process start reserved in its parent scope occurrence begins in the Event
 * Sub-Process's own scope occurrence and keeps the activation and role it was reserved with (BPMN 2.0.2 §13.5.4; DC26,
 * which re-keys it there). The witnesses reach the two positions no other fixture reached (probe P05): a Multi-Instance
 * body instance and a called instance. They cannot show the re-key itself: the start completes inside the delivery, so
 * no committed state holds it; that every occurrence's key leads with its own scope is the Lean law
 * `Kernel.Proofs.Frame.keyed_closure`, kept through every hook.
 *
 * The Event Sub-Process `H` (start `HS`, handler User Task `HU`) is declared inside a scope that is not the process
 * root: the Multi-Instance embedded Sub-Process `R` (one body instance per item, the delivery going to one instance),
 * or the process `Called` that the Call Activity `T` calls. `abnormalScopeEnd = completesNormally` admits an
 * interrupting Event Sub-Process.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, callWork, definitionRef, end, eventSubProcess, flow, loop, message, replace, scope, start, text, userWork,
  withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const options = { abnormalScopeEnd: "completesNormally" };
const cancel = message({ messageRef: "M", name: text("cancelOrder") });
const handler = (parent: string | null): Json[] => [
  scope("H", eventSubProcess(cancel, true), {}, {}, parent), start("HS", cancel, [], "H"), activity("HU", userWork(), {}, "H"), end("HE", "none", "H"),
];
const handlerFlows = [flow("h1", "HS", "HU"), flow("h2", "HU", "HE")];

function admitted(json: Json): Program {
  const decoded = decodeProgram(wired(withOptions({ ...json, variables: ["items"] }, options)));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

const inMultiInstanceBody = admitted(withFlows(
  append(replace(base(), "T", scope("R", "embedded", {}, { multiInstance: loop({ outputDataItem: null }) })),
    start("RS", null, [], "R"), activity("I", userWork(), {}, "R"), end("RE", "none", "R"), ...handler("R")),
  flow("f1", "S", "R"), flow("r1", "RS", "I"), flow("r2", "I", "RE"), flow("f2", "R", "E"), ...handlerFlows));

const inCalledInstance = admitted({
  ...withFlows(append(replace(base(), "T", activity("T", callWork())), start("CS"), activity("CU", userWork()), end("CE"), ...handler(null)),
    flow("cf1", "CS", "CU"), flow("cf2", "CU", "CE"), ...handlerFlows),
  processes: [{ definition: definitionRef("Called"), children: ["CS", "CU", "CE", "H"], variables: [], executable: true }],
});

const begin: Json = { kind: "start", instanceId: "I", variables: [{ name: "items", value: { kind: "stringList", value: ["a", "b"] } }] };

function run(program: Program, state: State | null, raw: Json, index: number): State {
  const input = stimulusFromJson({ commandId: `c${index}`, ...raw });
  assert.ok(input.ok, input.ok ? "" : input.refusal);
  const outcome = step(program, state, input.value[1]);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

/**
 * Delivers to the first reserved `HS`; returns the state before, the state after, and the delivered reservation. The
 * begun start completes inside the delivery, so its journal fact, not an occurrence, carries its begun key.
 */
function deliveredStart(program: Program, instance: string) {
  const before = run(program, null, begin, 0);
  const reserved = before.occurrences.filter((occurrence) => occurrence.element === "HS" && !occurrence.begun);
  assert.ok(reserved.length >= 1, "no reserved HS");
  const target = reserved[0]!;
  const after = run(program, before, {
    kind: "deliver", trigger: { kind: "message", channel: { kind: "directMessage", messageId: "M" } },
    occurrence: { processInstanceId: instance, elementId: "HS", activation: target.activation },
  }, 1);
  return { before, after, target };
}

function assertBegunInPlace(program: Program, instance: string): void {
  const { before, after, target } = deliveredStart(program, instance);
  const started = after.journal.flatMap((transition) => transition.started).filter((fact) => fact.occurrence.element === "HS");
  assert.equal(started.length, 1);
  assert.equal(started[0]!.occurrence.activation, target.activation);
  assert.equal(started[0]!.occurrence.role, target.role);
  assert.notEqual(started[0]!.owner, target.scope, "the start begins in the Event Sub-Process's own scope occurrence, not its reservation's");
}

test("an interrupting start in a Multi-Instance body instance begins in its own scope occurrence and keeps its activation", () => {
  assertBegunInPlace(inMultiInstanceBody, "I");
});

test("an interrupting start in a called process instance begins in its own scope occurrence and keeps its activation", () => {
  assertBegunInPlace(inCalledInstance, "call:1:I:1:T:1");
});
