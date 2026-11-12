/**
 * No Link Event, throw or catch, publishes an occurrence (the observation contract's Link exception, CIB-AGR-0018): the
 * published journal names neither the Link pair a token jumps through nor a catching Link a Sequence Flow reaches, while
 * the elements around them publish as before.
 *
 * `S -> P`, a Parallel fork into `LT` (Link `go`) and `LC`, the catch of `go`; `LC -> U`, a User Task, so `U` begins
 * twice, once through the pair and once through the flow into `LC`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, hostView, step, stimulusFromJson } from "@bpmn-lean/kernel";

import { activity, base, end, flow, gateway, link, start, userWork, wired } from "./admission-refusal-support.ts";

const decoded = decodeProgram(wired({
  ...base(),
  elements: [start("S"), gateway("P", "parallel"), link("LT", "linkThrow", "go"), link("LC", "linkCatch", "go"),
    activity("U", userWork()), end("E")],
  flows: [flow("sp", "S", "P"), flow("pt", "P", "LT"), flow("pc", "P", "LC"), flow("cu", "LC", "U"), flow("ue", "U", "E")],
}));

test("a Link pair and a flow-reached catching Link publish no occurrence and act in no published transition", () => {
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const start_ = stimulusFromJson({ kind: "start", commandId: "start", instanceId: "I", variables: [] });
  assert.ok(start_.ok);
  const started = step(hooks, decoded.value, null, start_.value[1]);
  assert.ok(started.ok, started.ok ? "" : started.failure.code);
  const journal = hostView(decoded.value, started.value).journal;
  const acted = journal.flatMap((transition) => (transition.element === null ? [] : [transition.element]));
  const begun = journal.flatMap((transition) => transition.started.map((fact) => fact.occurrence.element));
  const ended = journal.flatMap((transition) => transition.ended.map(([key]) => key.element));
  for (const links of [acted, begun, ended]) assert.deepEqual(links.filter((id) => id === "LT" || id === "LC"), [], JSON.stringify(journal));
  assert.deepEqual(begun.filter((id) => id === "U").length, 2, JSON.stringify(begun));
  assert.ok(begun.includes("P") && begun.includes("S"), JSON.stringify(begun));
});
