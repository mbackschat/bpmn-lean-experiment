/**
 * Outcomes the caller's input decides and no admission can see (`dynamic-only`), under the standards profile of
 * `base()`: API correlation criteria delivered to a Message catch that models no key, which `MessageCorrelation.ModeledKey`
 * does not claim, and a technical failure of a Service Task's effect, which `TechnicalFailure.HostFailure` leaves to the
 * host. Each runs through lean-paired.ts, so the Lean kernel answers it too.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { runScenario } from "./lean-paired.ts";

import { activity, base, catchEvent, channel, message, serviceWork, task, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const occurrence = { processInstanceId: "I", elementId: "T", activation: 1 };
const start: Json = { kind: "start", commandId: "start", instanceId: "I", variables: [] };

/** Each command's outcome and code. */
function outcomes(program: Json, stimulus: Json): unknown[] {
  const scenario = { kind: "scenario", id: "caller", profile: "p", stimuli: [start, stimulus] };
  const { trace } = runScenario(wired(program), scenario) as { trace: Json[] };
  return trace.filter((entry) => entry["kind"] === "command").map((entry) => [entry["outcome"], entry["code"] ?? null]);
}

test("API criteria delivered to a Message catch that models no key are unsupported under the modeled-key reading", () => {
  const delivery: Json = {
    kind: "deliver", commandId: "deliver", occurrence,
    trigger: { kind: "message", channel: { kind: "operationMessage", messageId: "M", interfaceId: "I", interfaceOperationId: "O" } },
    correlation: [{ target: { kind: "processVariable", name: "k" }, expected: { kind: "string", value: "v" } }], variables: [],
  };
  assert.deepEqual(outcomes(task(catchEvent("T", message(channel())))(base()), delivery),
    [["committed", null], ["unsupported", "profile-message-correlation-api-criteria"]]);
});

test("a Service Task's technical failure is unsupported when the profile leaves it to the host", () => {
  const failure: Json = { kind: "effectResult", commandId: "fail", occurrence, outcome: { kind: "technicalFailure" } };
  assert.deepEqual(outcomes(task(activity("T", serviceWork()))(base()), failure),
    [["committed", null], ["unsupported", "effect-technical-failure"]]);
});
