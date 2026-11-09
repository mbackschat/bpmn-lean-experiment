/**
 * Refusal tests of `admission-registry.ts`: the codes it owns (a compensation handler's origin, a called process's
 * binding) and the order in which it reports the first refusal: profile options, called processes, flows, then
 * elements in program order.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, append, base, conditionOn, definitionRef, foreign, mapping, receiveWork, refusalOf, refusalTests, replace, scriptWork,
  sendWork, task, userWork, variable, withOptions,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `T` is a User Task whose compensation handler is `H`, an unconnected Activity appended to the program. */
const handledBy = (handler: Json) => (program: Json): Json =>
  append(task(activity("T", userWork(), { compensationHandler: "H" }))(program), handler);

const handler = (work: Json | string, env: Json = {}): Json => activity("H", work, { incoming: [], outgoing: [], ...env });

const calledProcess = (over: Json = {}) => (program: Json): Json =>
  ({ ...program, processes: [{ definition: definitionRef("Q", over), children: [], variables: [] }] });

export const rows: readonly Row[] = [
  {
    code: "activity.compensationHandler.input",
    description: "a compensation handler with an input mapping",
    mutate: handledBy(handler(userWork(), { inputs: [mapping("x", variable("y"))] })),
    control: handledBy(handler(userWork())),
  },
  {
    code: "compensation.handlerWork",
    description: "a compensation handler that waits for a Message",
    mutate: handledBy(handler(receiveWork())),
    control: handledBy(handler("manual")),
  },
  {
    code: "process.definition.binding",
    description: "a called process bound to a version",
    mutate: calledProcess({ version: 2 }),
    control: calledProcess(),
  },
  {
    code: "process.definition.binding",
    description: "a called process bound to a tenant",
    mutate: calledProcess({ tenant: "tenant" }),
    control: calledProcess(),
  },
];

refusalTests("registry", rows);

/** A program refused at every level: a profile option, a called-process binding, a flow condition and an element. */
function refusedEverywhere(): Json {
  const program = calledProcess({ version: 2 })(conditionOn(task(activity("T", sendWork()))(base()), "f2", foreign()));
  return withOptions(program, { evaluator: "juel" });
}

test("registry: profile options are refused before called processes, flows and elements", () => {
  assert.equal(refusalOf(refusedEverywhere()), "profile.evaluator.juel");
});

test("registry: a called-process binding is refused before flows and elements", () => {
  assert.equal(refusalOf(withOptions(refusedEverywhere(), { evaluator: "simpleBoolean" })), "process.definition.binding");
});

test("registry: a flow is refused before elements", () => {
  const program = withOptions(refusedEverywhere(), { evaluator: "simpleBoolean" });
  assert.equal(refusalOf({ ...program, processes: [] }), "flow.condition.foreign");
});

test("registry: the first refused element in program order is reported", () => {
  const send = activity("T", sendWork());
  const script = activity("X", scriptWork(), { incoming: [], outgoing: [] });
  assert.equal(refusalOf(append(task(send)(base()), script)), "work.send");
  assert.equal(refusalOf(append(replace(base(), "T", script), activity("Y", sendWork(), { incoming: [], outgoing: [] }))), "work.script");
});
