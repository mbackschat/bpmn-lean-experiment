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
