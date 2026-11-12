/**
 * Where a JUEL evaluation's result lands at the sites a Start command reaches through Sequence Flow and the Events level
 * (docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#failure-semantics): a `failure` rolls the command back with its
 * code, an `unsupported` result stays `unsupported` with its code, and a name or schedule value of the wrong type or a
 * blank name ends as each site's own code. Each row runs `Start → T → End` with one evaluation site through lean-paired.ts,
 * so the Lean kernel answers the same runs.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { runScenario } from "./lean-paired.ts";

import {
  base, catchEvent, channel, choice, computed, conditionOn, end, juel, message, qName, replace, task, text, wired, withOptions,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

/** `"é".toUpperCase()`: a case mapping of non-ASCII text, which the evaluator does not claim (`juel.nonAsciiText`). */
const unclaimed = juel({ stringLiteral: { value: "é" } }, { call: { payload: { receiver: 0, target: "toUpperCase", args: [] } } });
const read = (name: string): Json => juel({ identifier: { name } });

const str = (value: string): Json => ({ kind: "string", value });
const int = (value: number): Json => ({ kind: "integer", value });
const nil: Json = { kind: "null" };

const underJuel = (over: Json = {}) => (program: Json): Json => withOptions(program, { evaluator: "juel", ...over });
const addresses: Json = { signalNames: "addresses", signalPayload: "variables" };

const gateway = (condition: Json): Json => underJuel()(conditionOn(choice(["f2"])(base()), "f2", condition));
const signalThrow = (over: Json): Json => ({
  signal: { payload: { signalRef: qName("Sig"), name: text("S"), payload: [], propagateAll: null, localOnly: false, businessKey: null, asynchronous: false, ...over } },
});
const throwing = (over: Json): Json => underJuel(addresses)(replace(base(), "E", end("E", signalThrow(over))));
const catching = (trigger: Json, over: Json = {}): Json => underJuel(over)(task(catchEvent("T", trigger))(base()));
const signalCatch = (name: Json): Json => catching({ signal: { payload: { signalRef: qName("Sig"), name: computed(name) } } }, addresses);
const messageCatch = (name: Json): Json => catching(message(channel({ name: computed(name) })), { messageNames: "addresses" });
const timerCatch = (value: Json): Json => catching({ timer: { payload: { schedule: { duration: { value: computed(value) } } } } });
const conditionCatch = (condition: Json): Json => catching({ condition: { payload: { condition, variableName: null, variableEvents: [] } } });

type Row = Readonly<{ site: string; result: string; program: Json; variables?: Array<[string, Json]>; expect: readonly [string, string | null] }>;

const rows: readonly Row[] = [
  { site: "a Sequence Flow condition", result: "an unclaimed result", program: gateway(unclaimed), expect: ["unsupported", "juel.nonAsciiText"] },
  { site: "a Signal throw's name", result: "a null name", program: throwing({ name: computed(read("x")) }), variables: [["x", nil]], expect: ["unsupported", "signal-name-null"] },
  { site: "a Signal throw's name", result: "an Integer name", program: throwing({ name: computed(read("x")) }), variables: [["x", int(1)]], expect: ["rolledBack", "signal-name-type"] },
  { site: "a Signal throw's name", result: "an unclaimed result", program: throwing({ name: computed(unclaimed) }), expect: ["unsupported", "juel.nonAsciiText"] },
  { site: "a Signal throw's business key", result: "an unclaimed result", program: throwing({ businessKey: unclaimed }), expect: ["unsupported", "juel.nonAsciiText"] },
  { site: "a Signal throw's business key", result: "a failure", program: throwing({ businessKey: read("key") }), expect: ["rolledBack", "unknown-variable"] },
  { site: "a Signal catch's name", result: "a String name", program: signalCatch(read("x")), variables: [["x", str("S")]], expect: ["committed", null] },
  { site: "a Signal catch's name", result: "a blank name", program: signalCatch(read("x")), variables: [["x", str("")]], expect: ["unsupported", "signal-name-empty"] },
  { site: "a Signal catch's name", result: "an Integer name", program: signalCatch(read("x")), variables: [["x", int(1)]], expect: ["rolledBack", "signal-name-type"] },
  { site: "a Signal catch's name", result: "an unclaimed result", program: signalCatch(unclaimed), expect: ["unsupported", "juel.nonAsciiText"] },
  { site: "a Signal catch's name", result: "a failure", program: signalCatch(read("x")), expect: ["rolledBack", "unknown-variable"] },
  { site: "a Message catch's name", result: "a blank name", program: messageCatch(read("x")), variables: [["x", str("")]], expect: ["unsupported", "message-name-empty"] },
  { site: "a Message catch's name", result: "an Integer name", program: messageCatch(read("x")), variables: [["x", int(1)]], expect: ["rolledBack", "message-name-type"] },
  { site: "a Message catch's name", result: "an unclaimed result", program: messageCatch(unclaimed), expect: ["unsupported", "juel.nonAsciiText"] },
  { site: "a Message catch's name", result: "a failure", program: messageCatch(read("x")), expect: ["rolledBack", "unknown-variable"] },
  { site: "a Timer catch's duration", result: "an Integer value", program: timerCatch(read("x")), variables: [["x", int(1)]], expect: ["rolledBack", "timer-value-type"] },
  { site: "a Timer catch's duration", result: "an unclaimed result", program: timerCatch(unclaimed), expect: ["unsupported", "juel.nonAsciiText"] },
  { site: "a Timer catch's duration", result: "a failure", program: timerCatch(read("x")), expect: ["rolledBack", "unknown-variable"] },
  { site: "a Conditional catch's predicate", result: "an unclaimed result", program: conditionCatch(unclaimed), expect: ["unsupported", "juel.nonAsciiText"] },
];

/** The deployment's outcome, then the Start command's outcome and code. */
function startOutcome(program: Json, variables: ReadonlyArray<[string, Json]>): unknown[] {
  const stimuli = [{ kind: "start", commandId: "start", instanceId: "I", variables: variables.map(([name, value]) => ({ name, value })) }];
  const { trace } = runScenario(wired(program), { kind: "scenario", id: "site", profile: "p", stimuli }) as { trace: Json[] };
  return trace.filter((entry) => entry["kind"] === "deployment" || entry["kind"] === "command").map((entry) => [entry["outcome"], entry["code"] ?? null]);
}

for (const row of rows) {
  test(`${row.site}: ${row.result} under JUEL ends the Start as ${row.expect.filter((part) => part !== null).join(" ")}`, () => {
    assert.deepEqual(startOutcome(row.program, row.variables ?? []), [["committed", null], [...row.expect]]);
  });
}
