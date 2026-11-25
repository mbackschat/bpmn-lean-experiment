/**
 * PC-CF-04: an Inclusive join waits while a suspended occurrence upstream of its empty incoming flow may still continue
 * (BPMN 2.0.2 §13.4.3, Table 13.3; CIB-INT-0016). A suspended occurrence is no open item and no token: a waiting
 * Compensation throw resumes from `FeatureSlots.compensation` once its handlers end, and a held occurrence sits in
 * `FeatureSlots.held` while its InputSet is unavailable (§10.4.2). The held case has no CIB counterpart, since CIB never
 * holds (CIB-LIM-0013); the Compensation case's CIB witness is `inclusive-join-activation/compensation-path`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { activity, base, end, flow, gateway, mapping, start, userWork, variable, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { compensateAll, complete, drive, handlerTask, throwing, userTask } from "./compensation-support.ts";
import { admit, decodeProgram } from "./lean-paired.ts";

/** `S -> P`, a Parallel fork whose `p1` enters `upstream` and whose `p2` goes straight to the Inclusive join `J`. */
function forkedJoin(upstream: Json[], upstreamFlows: Json[]): Json {
  const program = base();
  return wired({
    ...program,
    elements: [
      start("S"), gateway("P", "parallel"), ...upstream,
      gateway("J", { inclusive: { candidates: [], default: null } }), activity("Done", userWork()), end("E"),
    ],
    flows: [flow("f", "S", "P"), flow("p2", "P", "J"), ...upstreamFlows, flow("j", "J", "Done"), flow("e", "Done", "E")],
  });
}

/** The elements of the open items after starting `json` and applying `stimuli`, sorted. */
function open(json: Json, ...stimuli: Json[]): readonly string[] {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  const outcome = drive(json, ...stimuli);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value.openItems.map((item) => item.element).sort();
}

test("an Inclusive join waits while a Compensation throw upstream of its empty flow waits for its handler", () => {
  // `p1` enters `A`, compensable by `H`; `A` leads to the waiting throw `C`, which enters `J`.
  const program = forkedJoin(
    [userTask("A", "H"), handlerTask("H"), throwing("C", compensateAll)],
    [flow("p1", "P", "A"), flow("a", "A", "C"), flow("c", "C", "J")],
  );
  assert.deepEqual(open(program, complete("A")), ["H"]);
  assert.deepEqual(open(program, complete("A"), complete("H")), ["Done"]);
});

test("an Inclusive join waits while a held occurrence upstream of its empty flow may still begin", () => {
  // `p1` enters the User Task `T`, whose Data Input reads the unset `missing`, so `T` is held; `T` enters `J`.
  const held = activity("T", userWork(), { inputs: [mapping("context", variable("missing"), "dataAssociation")] });
  const program = forkedJoin([held], [flow("p1", "P", "T"), flow("t", "T", "J")]);
  assert.deepEqual(open(program), []);
});
