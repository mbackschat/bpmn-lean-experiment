/**
 * A boundary publishes the identifier its author wrote (`Boundary.sourceId`), not its program-unique `id`, as an element
 * publishes `ElementOrigin.sourceId`: a callee copied into another deployment's program renames its boundaries to keep
 * them unique (PC-SCOPE-03), and its waits must still publish the callee's own identifiers.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hostView, step, stimulusFromJson } from "./lean-paired.ts";

import { activity, base, boundary, duration, flow, task, userWork, withFlows } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const handlerEnd: Json = {
  event: {
    header: { id: "EB", origin: { definition: null, sourceId: "EB" }, sourceType: "endEvent", parent: null },
    payload: { role: { throw: { record: "none" } }, placement: "finish", incoming: ["fb"], outgoing: [], alternativeThrows: [] },
  },
};

test("a renamed boundary's wait publishes the identifier its author wrote", () => {
  const renamed = boundary("Late@2", duration("PT1M"), { sourceId: "Late", outgoing: ["fb"] });
  const host = task(activity("T", userWork(), { boundaries: [renamed] }))(base());
  const decoded = decodeProgram(withFlows({ ...host, elements: [...(host.elements as Json[]), handlerEnd] }, flow("fb", "Late@2", "EB")));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const start = stimulusFromJson({ kind: "start", commandId: "start", instanceId: "I", variables: [] });
  assert.ok(start.ok);
  const started = step(decoded.value, null, start.value[1]);
  assert.ok(started.ok, started.ok ? "" : started.failure.code);
  const elements = hostView(decoded.value, started.value).openWaits.map((wait) => wait.id.element);
  assert.ok(elements.includes("Late"), JSON.stringify(elements));
  assert.ok(!elements.includes("Late@2"), JSON.stringify(elements));
});
