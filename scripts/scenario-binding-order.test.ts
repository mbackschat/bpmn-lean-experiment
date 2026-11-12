import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyCanonicalBindingOrder } from "./scenario-binding-order.ts";

const value = { kind: "string", value: "x" };
const bind = (...names: string[]) => names.map((name) => ({ name, value }));
const scenario = (stimulus: Readonly<Record<string, unknown>>) => ({ stimuli: [stimulus] });
const start = (variables: unknown) => scenario({ kind: "start", commandId: "start", instanceId: "I", variables });
const command = (kind: string, values: unknown) => scenario({ kind: "command", commandId: "c", action: { kind, values } });
const effect = (outcome: Readonly<Record<string, unknown>>) => scenario({ kind: "effectResult", commandId: "e", outcome });

// The binding lists the CIB runner's protocol checks with `ScenarioVariableBindings.requireCanonical`: a scenario the
// kernel runs must be one CIB can run, or its evidence silently becomes a harness failure.
test("accepts binding lists in strict ascending Unicode scalar order", () => {
  for (const document of [
    start(bind("a", "b", "é", "😀")),
    start([]),
    command("completeUserTask", bind("a", "z")),
    command("setVariables", bind("x")),
    effect({ kind: "success", outputs: bind("a", "b") }),
    effect({ kind: "businessFailure", code: "E", outputs: bind("a", "b") }),
  ]) verifyCanonicalBindingOrder(document);
});

test("refuses a binding list out of order or with a repeated name, wherever the runner checks one", () => {
  for (const document of [
    start(bind("outcome", "flight")),
    start(bind("a", "a")),
    // U+FFFF precedes U+1F600 by scalar value although UTF-16 code units order them the other way.
    start(bind("😀", "￿")),
    command("completeUserTask", bind("b", "a")),
    command("setVariables", bind("b", "a")),
    effect({ kind: "success", outputs: bind("b", "a") }),
    effect({ kind: "businessFailure", code: "E", outputs: bind("b", "a") }),
  ]) assert.throws(() => verifyCanonicalBindingOrder(document), /names must be unique and canonically ordered/u);
});

// The lists above once were a hand-kept mirror of the runner's checks; it missed the delivery and population variables
// added later (P5 `receive-delivery-scopes-variables-per-scope` reached CIB out of order in run 43271426944), so every
// name-value list of a stimulus, at any depth, is checked.
test("refuses an out-of-order name-value list in any stimulus at any depth", () => {
  const map = (...names: string[]) => ({ kind: "map", value: names.map((name) => ({ name, value: { kind: "boolean", value: true } })) });
  for (const document of [
    scenario({ kind: "deliver", commandId: "d", variables: bind("note", "freshEmbedded") }),
    scenario({ kind: "publish", commandId: "p", variables: bind("b", "a") }),
    start([{ name: "m", value: map("b", "a") }]),
  ]) assert.throws(() => verifyCanonicalBindingOrder(document), /names must be unique and canonically ordered/u);
  verifyCanonicalBindingOrder(scenario({ kind: "deliver", commandId: "d", variables: bind("freshEmbedded", "note") }));
  verifyCanonicalBindingOrder(start([{ name: "m", value: map("a", "b") }]));
});

test("refuses an out-of-order name-value list in a population scenario's steps", () => {
  const population = { steps: [{ kind: "publish", commandId: "p", variables: bind("b", "a") }] };
  assert.throws(() => verifyCanonicalBindingOrder(population), /names must be unique and canonically ordered/u);
});
