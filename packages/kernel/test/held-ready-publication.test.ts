/**
 * PD2: a held occurrence is published as Ready, not Active. An Activity's start at token arrival is BPMN's Inactive →
 * Ready transition (BPMN 2.0.2 §13.3.2, Fig. 13.2); while its InputSet is unavailable it stays Ready (§10.4.2), so the
 * micro-step that holds it names it in its transition's `ready` list, written only through `hold`, and no transition
 * without a hold carries the field. With no re-evaluation ingress a Ready occurrence ends only by removal, published
 * `cancelled`. The cases cover both `hold` callers: `Work.arriveActivity` (User Tasks, a compensation handler) and
 * `MultiInstance.arriveMultiInstance` (the body). Each host view runs through lean-paired.ts, so Lean answers it too.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hostViewJson } from "./lean-paired.ts";

import { activity, boundary, duration, flow, loop, mapping, scope, start, userWork, variable } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, compensateAll, committedState, complete, driveFrom, instance, parts, userTask } from "./compensation-support.ts";

/** A Data Input whose association reads the unset `missing`, so the InputSet is unavailable. */
const unavailable = [mapping("context", variable("missing"), "dataAssociation")];

const key = (elementId: string, role = "element", activation = 1): Json =>
  ({ processInstanceId: instance, elementId, activation, role });

/** The journal of the last committed input of `program` driven by `stimuli`. */
function journal(program: Json, variables: Json[], ...stimuli: Json[]): Json[] {
  const decoded = decodeProgram(program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const view = hostViewJson(decoded.value, committedState(driveFrom(program, variables, ...stimuli))) as Json;
  return view.journal as Json[];
}

/** The `ready` lists the journal publishes, each with the keys its transition started. */
const readyFacts = (transitions: Json[]): Array<[Json[], Json[]]> =>
  transitions.flatMap((transition) => transition.ready === undefined ? [] :
    [[transition.ready as Json[], (transition.started as Json[]).map((fact) => fact.occurrence as Json)]]);

const present = [{ name: "missing", value: { kind: "string", value: "here" } }];

test("a User Task whose Data Input is unavailable is published Ready in the step that starts it", () => {
  const transitions = journal(chain([activity("T", userWork(), { inputs: unavailable })], "none"), []);
  assert.deepEqual(readyFacts(transitions), [[[key("T")], [key("T")]]]);
});

test("a User Task with a Data Input and a Data Output is published Ready while its input is unavailable", () => {
  const outputs = [mapping("reviewed", variable("context"), "dataAssociation")];
  const transitions = journal(chain([activity("T", userWork(), { inputs: unavailable, outputs })], "none"), []);
  assert.deepEqual(readyFacts(transitions), [[[key("T")], [key("T")]]]);
});

test("a run that holds nothing publishes no ready field", () => {
  const transitions = journal(chain([activity("T", userWork(), { inputs: unavailable })], "none"), present);
  assert.ok(transitions.some((transition) => (transition.started as Json[]).length > 0));
  for (const transition of transitions) assert.equal(Object.hasOwn(transition, "ready"), false, JSON.stringify(transition));
});

test("a compensation handler whose Data Input is unavailable is published Ready", () => {
  const handler = activity("HA", userWork(), { incoming: [], outgoing: [], forCompensation: true, inputs: unavailable });
  const program = chain([userTask("A", "HA")], compensateAll, parts({ elements: [handler], flows: [] }));
  assert.deepEqual(readyFacts(journal(program, [], complete("A"))), [[[key("HA")], [key("HA")]]]);
});

test("a Multi-Instance body whose collection is unavailable is published Ready under its body role", () => {
  const looping = loop({ mode: "parallel", count: { collection: { items: variable("items") } }, outputDataItem: null });
  const program = chain([activity("T", userWork(), { multiInstance: looping })], "none");
  const body = key("T", "multiInstanceBody");
  assert.deepEqual(readyFacts(journal(program, [])), [[[body], [body]]]);
});

test("a Ready occurrence is left only by removal, published cancelled", () => {
  // `P` holds `T` and is interrupted by its Timer boundary `D`, which leads to `Late`.
  const program = chain([scope("P", "embedded", {}, { boundaries: [boundary("D", duration("PT30S"))] })], "none", parts({
    elements: [start("PS", null, [], "P"), activity("T", userWork(), { incoming: ["p0"], outgoing: [], inputs: unavailable }, "P"), userTask("Late")],
    flows: [flow("p0", "PS", "T"), flow("d0", "D", "Late")],
  }));
  const fire = { kind: "timerFire", logicalTimeMs: 30_000, occurrence: { processInstanceId: instance, elementId: "D", activation: 1 } };
  const transitions = journal(program, [], fire);
  assert.deepEqual(readyFacts(transitions), []);
  const ended = transitions.flatMap((transition) => transition.ended as Json[]);
  assert.ok(ended.some((fact) => JSON.stringify(fact) === JSON.stringify({ occurrence: key("T"), terminal: "cancelled" })), JSON.stringify(ended));
});
