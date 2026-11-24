/**
 * The order a clearing cancels the occurrences of one scope occurrence in: by issue, each occurrence's order position
 * (DC25), never the order a container holds them in ([publication](../../../docs/kernel/semantics/PUBLICATION-AND-OBSERVATION-SEMANTICS-SPEC.md)).
 * The fork issues the User Tasks `Z` and then `M`, the reverse of their keys' element order, so a clearing that read the
 * occurrences in key order would journal `M` first.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, end, flow, gateway, replace, terminateThrow, userWork, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

function forked(schedule: string): Program {
  const json = withFlows(
    append(replace(base(), "T", gateway("P", "parallel", { outgoing: ["p1", "p2", "p3"] })),
      activity("Z", userWork()), activity("M", userWork()), end("ME"), activity("W", userWork()), end("WE", terminateThrow)),
    flow("p0", "S", "P"), flow("p1", "P", "Z"), flow("p2", "P", "M"), flow("p3", "P", "W"),
    flow("z1", "Z", "E"), flow("m1", "M", "ME"), flow("w1", "W", "WE"));
  const decoded = decodeProgram(wired(withOptions(json, { branchSchedule: schedule })));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

function run(program: Program, state: State | null, json: Json): State {
  const input = stimulusFromJson(json);
  assert.ok(input.ok, input.ok ? "" : input.refusal);
  const outcome = step(program, state, input.value[1]);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

const forkedTasks = new Set(["Z", "M"]);

for (const schedule of ["declarationDepthFirst", "orderInvariant"]) {
  test(`under ${schedule} a Terminate End cancels the waiting tasks of its scope occurrence in the order they were issued`, () => {
    const program = forked(schedule);
    const started = run(program, null, { kind: "start", commandId: "start", instanceId: "I", variables: [] });
    const begun = started.journal.flatMap((transition) => transition.started.map((fact) => fact.occurrence.element))
      .filter((element) => forkedTasks.has(element));
    assert.deepEqual(begun, ["Z", "M"], "the fork issues Z before M");
    const completed = run(program, started, {
      kind: "command", commandId: "complete-W", occurrence: { processInstanceId: "I", elementId: "W", activation: 1 },
      action: { kind: "completeUserTask", values: [] },
    });
    const cancelled = completed.journal.flatMap((transition) => transition.ended)
      .flatMap(([key, terminal]) => terminal === "cancelled" && forkedTasks.has(key.element) ? [key.element] : []);
    assert.deepEqual(cancelled, ["Z", "M"]);
  });
}
