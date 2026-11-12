/**
 * Message throws under `MessageThrowForms.cibForms` (PC-MESSAGE-09; CIB-EXT-0039, CIB-INT-0027): a bound throw opens one
 * effect item with no arguments and is answered like a Service Task's effect, an unbound one passes its token on. The
 * retry expectations are the project-owned contract of the propagation specification: CIB has no answer for a
 * technical failure of a throw without an asynchronous continuation, which rolls its command back.
 *
 * `Start -> T -> E`, `T` an Intermediate Message throw and `E` a Message End; the nested form puts `PS -> X -> PE`, `X`
 * the bound throw, inside the Sub-Process `T`, whose Error boundary `B` catches `REFUSED` and leads to the User Task `W`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome, Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, boundary, end, errorTrigger, flow, replace, scope, start, task, userWork, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const cib = { messageThrowForms: "cibForms", technicalFailure: "incident" };
const bound: Json = { message: { payload: { binding: { protocol: "urn:p", operation: "urn:send" }, handlerKey: null, payload: [] } } };
const unbound: Json = { message: { payload: { binding: null, handlerKey: null, payload: [] } } };

/** An Intermediate throw Event of `record`. */
const throwing = (id: string, record: Json, parent: string | null = null): Json => ({
  event: {
    header: { id, origin: { definition: null, sourceId: id }, sourceType: "intermediateThrowEvent", parent },
    payload: { role: { throw: { record } }, placement: "intermediate", incoming: [], outgoing: [], alternativeThrows: [] },
  },
});

function admitted(json: Json): Program {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

const flat = (record: Json): Program =>
  admitted(withOptions(replace(task(throwing("T", record))(base()), "E", end("E", record)), cib));

const nested = admitted(withOptions(withFlows(
  append(task(scope("T", "embedded", {}, { boundaries: [boundary("B", errorTrigger({ code: "REFUSED" }))] }))(base()),
    start("PS", null, [], "T"), throwing("X", bound, "T"), end("PE", "none", "T"), activity("W", userWork())),
  flow("p1", "PS", "X"), flow("p2", "X", "PE"), flow("fb", "B", "W"), flow("fw", "W", "E")), cib));

function apply(program: Program, state: State | null, raw: Json): Outcome {
  const stimulus = stimulusFromJson({ commandId: "c", ...raw });
  assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
  return step(program, state, stimulus.value[1]);
}

function run(program: Program, ...stimuli: Json[]): State {
  let state: State | null = null;
  for (const raw of [{ kind: "start", instanceId: "I", variables: [] }, ...stimuli]) {
    const outcome = apply(program, state, raw);
    assert.ok(outcome.ok, JSON.stringify(outcome));
    state = outcome.value;
  }
  return state!;
}

const at = (elementId: string) => ({ processInstanceId: "I", elementId, activation: 1 });
const answer = (elementId: string, outcome: Json): Json => ({ kind: "effectResult", occurrence: at(elementId), outcome });
const success = (elementId: string, outputs: Json[] = []): Json => answer(elementId, { kind: "success", outputs });

/** Each open item as its element and kind tag. */
const items = (state: State): string[] =>
  state.openItems.map((item) => `${item.element}:${(item.kind as unknown as { tag: string }).tag}`);

test("a bound throw waits for one effect with no arguments and a success passes the token on", () => {
  const program = flat(bound);
  const opened = run(program);
  assert.deepEqual(opened.openItems.map((item) => item.kind),
    [{ tag: "effect", detail: { protocol: "urn:p", operation: "urn:send", arguments: [], failures: 0, send: null } }]);
  assert.deepEqual(items(opened), ["T:effect"]);
  assert.deepEqual(items(run(program, success("T"))), ["E:effect"]);
  const ended = run(program, success("T"), success("E"));
  assert.deepEqual([ended.status, ended.openItems.length], ["completed", 0]);
});

test("a throw's success carrying a value is rejected, since a throw Event has no output mappings", () => {
  const outcome = apply(flat(bound), run(flat(bound)), success("T", [{ name: "receipt", value: { kind: "string", value: "R-1" } }]));
  assert.equal(outcome.ok, false);
});

test("a business failure raises from the throw's occurrence and the enclosing Sub-Process's boundary catches it", () => {
  const caught = run(nested, answer("X", { kind: "businessFailure", code: "REFUSED", outputs: [] }));
  assert.deepEqual(items(caught), ["W:userTask"]);
});

test("a technical failure opens an incident whose retry reopens the same send occurrence", () => {
  const program = flat(bound);
  const failed = run(program, answer("T", { kind: "technicalFailure" }));
  assert.deepEqual(items(failed), ["T:incident"]);
  const retried = run(program, answer("T", { kind: "technicalFailure" }),
    { kind: "command", occurrence: at("T"), action: { kind: "retryIncident", generation: 1 } });
  assert.deepEqual(retried.openItems.map((item) => [item.element, item.occurrence]), failed.openItems.map((item) => [item.element, item.occurrence]));
  assert.deepEqual(items(retried), ["T:effect"]);
  const ended = run(program, answer("T", { kind: "technicalFailure" }),
    { kind: "command", occurrence: at("T"), action: { kind: "retryIncident", generation: 1 } }, success("T"), success("E"));
  assert.equal(ended.status, "completed");
});

test("unbound throws pass the token on and open nothing", () => {
  const ended = run(flat(unbound));
  assert.deepEqual([ended.status, ended.openItems.length], ["completed", 0]);
});
