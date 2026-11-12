/**
 * A rethrow from an Event Sub-Process (docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md, PC-ERROR-02): the search
 * passes the handler the raise originates in and goes on to the host's boundaries (BPMN 2.0.2 §13.5.4, CIB-INT-0022).
 * An Error passes it from any depth (`ErrorDeclarationForProcessInstanceFinder.java:41-58`), an Escalation only from
 * directly inside it (`EscalationEventDefinitionFinder.java:58-61`), and a deeper Escalation, which CIB would catch
 * with the same handler again, is refused; so is a raise from an interrupting handler that a sibling handler would
 * catch (§13.5.4: "new Event Handlers MUST NOT be started"; CIB-DEV-0003). The host is the Sub-Process `T`, whose
 * boundary `B` leads to the User Task `W`; each program runs to its first wait on `start`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";

import {
  activity, append, base, boundary, end, errorTrigger, escalationTrigger, eventSubProcess, flow, scope, start, task, userWork, withFlows,
  withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const raiseError = (code: string): Json => ({ error: { payload: { code, message: null } } });
const raiseEscalation = (code: string): Json => ({ escalation: { payload: { code } } });

/** An Intermediate throw Event `id` throwing `record`. */
const throwing = (id: string, record: Json, parent: string | null = null): Json => ({
  event: {
    header: { id, origin: { definition: null, sourceId: id }, sourceType: "intermediateThrowEvent", parent },
    payload: { role: { throw: { record } }, placement: "intermediate", incoming: [], outgoing: [], alternativeThrows: [] },
  },
});

/** An Event Sub-Process `id` of `T` started by `trigger`, with its start `<id>S`. */
const handler = (id: string, trigger: Json, interrupting: boolean): Json[] => [
  scope(id, eventSubProcess(trigger, interrupting), {}, {}, "T"),
  start(`${id}S`, trigger, [], id),
];

/**
 * `T` runs `PS -> body` and carries the boundary `B` on `caught`; `elements` and `flows` add its handlers. Interrupting
 * Event Sub-Processes are an abnormal scope end, which the profile completing normally admits.
 */
function hosted(caught: Json, body: Json, elements: Json[], flows: Json[]): Json {
  const host = scope("T", "embedded", {}, { boundaries: [boundary("B", caught)] });
  const json = append(task(host)(base()), start("PS", null, [], "T"), body, activity("W", userWork()), ...elements);
  return withOptions(withFlows(json, flow("fb", "B", "W"), flow("fw", "W", "E"), ...flows), { abnormalScopeEnd: "completesNormally" });
}

const stimulus = (json: Json) => {
  const decoded = stimulusFromJson({ commandId: "c", ...json });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value[1];
};

function run(json: Json) {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return step(decoded.value, null, stimulus({ kind: "start", instanceId: "I", variables: [] }));
}

function openAfter(json: Json): string[] {
  const outcome = run(json);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value.openItems.map((item) => item.element);
}

function refusedWith(json: Json): string {
  const outcome = run(json);
  assert.ok(!outcome.ok, JSON.stringify(outcome));
  return outcome.failure.code;
}

const raw = errorTrigger({ code: "RAW" });
const overrun = escalationTrigger({ code: "X" });

/** `T`'s body ends in the Error End `PE` raising `RAW`. */
const failing = end("PE", raiseError("RAW"), "T");
const intoFailing = flow("pf", "PS", "PE");

test("an Error rethrown from directly inside its handler reaches the host's boundary", () => {
  const elements = [...handler("H", raw, true), end("HE", raiseError("RAW"), "H")];
  assert.deepEqual(openAfter(hosted(raw, failing, elements, [intoFailing, flow("h1", "HS", "HE")])), ["W"]);
});

test("an Error rethrown from a Sub-Process nested in its handler also passes the handler", () => {
  const elements = [
    ...handler("H", raw, true), scope("HN", "embedded", {}, {}, "H"), end("HE", "none", "H"),
    start("HNS", null, [], "HN"), end("HNE", raiseError("RAW"), "HN"),
  ];
  const flows = [intoFailing, flow("h1", "HS", "HN"), flow("h2", "HN", "HE"), flow("hn1", "HNS", "HNE")];
  assert.deepEqual(openAfter(hosted(raw, failing, elements, flows)), ["W"]);
});

test("an Error an interrupting handler raises that a sibling handler would catch is refused", () => {
  const second = errorTrigger({ code: "SECOND" });
  const elements = [
    ...handler("H", raw, true), end("HE", raiseError("SECOND"), "H"),
    ...handler("H2", second, true), activity("H2W", userWork(), {}, "H2"), end("H2E", "none", "H2"),
  ];
  const flows = [intoFailing, flow("h1", "HS", "HE"), flow("h21", "H2S", "H2W"), flow("h22", "H2W", "H2E")];
  assert.equal(refusedWith(hosted(raw, failing, elements, flows)), "rethrow-caught-by-sibling-handler");
});

/** `T`'s body runs `PS -> PX -> PW -> PE`, the Intermediate throw `PX` raising the Escalation `X`. */
const escalating: [Json, ...Json[]] = [throwing("PX", raiseEscalation("X"), "T"), activity("PW", userWork(), {}, "T"), end("PE", "none", "T")];
const escalatingFlows = [flow("pf1", "PS", "PX"), flow("pf2", "PX", "PW"), flow("pf3", "PW", "PE")];

/** `hosted` with the escalating body; `append` cannot take the three body elements as one. */
function escalatingHost(elements: Json[], flows: Json[]): Json {
  const [first, ...rest] = escalating;
  return hosted(overrun, first, [...rest, ...elements], [...escalatingFlows, ...flows]);
}

test("an Escalation rethrown from directly inside its non-interrupting handler reaches the host's boundary", () => {
  const elements = [...handler("H", overrun, false), end("HE", raiseEscalation("X"), "H")];
  assert.deepEqual(openAfter(escalatingHost(elements, [flow("h1", "HS", "HE")])), ["W"]);
});

test("an Escalation raised deeper inside a handler that matches it is refused", () => {
  const elements = [
    ...handler("H", overrun, false), scope("HN", "embedded", {}, {}, "H"), end("HE", "none", "H"),
    start("HNS", null, [], "HN"), end("HNE", raiseEscalation("X"), "HN"),
  ];
  const flows = [flow("h1", "HS", "HN"), flow("h2", "HN", "HE"), flow("hn1", "HNS", "HNE")];
  assert.equal(refusedWith(escalatingHost(elements, flows)), "escalation-rethrow-reenters-handler");
});
