/**
 * PD2 (T13): the host view's journal publishes only public fields. A transition names its cause, the element it acted
 * on and the occurrences it began and ended; a begun occurrence its key and source type; an idle cause nothing more. The
 * kernel's scope-occurrence ordinals (`owner`, `idle.scope`) are internal identities, so a consumer that stored them
 * would bind to numbering the kernel may change. It runs through lean-paired.ts, so the Lean kernel answers it too.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { runHostView } from "./lean-paired.ts";

import { activity, base, end, envelope, flow, start, userWork } from "./admission-refusal-support.ts";

type Json = Record<string, any>;

/** `Start → Review` (a User Task) `→ End`: the completion ends the instance, so its journal holds an idle cause. */
function review(): Json {
  const begin = start("Start");
  (begin.start as Json).payload.outgoing = ["To_Review"];
  const finish = end("End");
  (finish.event as Json).payload.incoming = ["To_End"];
  return {
    ...base(),
    elements: [begin, activity("Review", userWork(), envelope({ incoming: ["To_Review"], outgoing: ["To_End"] })), finish],
    flows: [flow("To_Review", "Start", "Review"), flow("To_End", "Review", "End")],
  };
}

const scenario = {
  stimuli: [
    { kind: "start", commandId: "start", instanceId: "I", variables: [] },
    {
      kind: "command", commandId: "review", occurrence: { processInstanceId: "I", elementId: "Review", activation: 1 },
      action: { kind: "completeUserTask", values: [] },
    },
  ],
};

test("the journal publishes no internal scope-occurrence ordinal", () => {
  const run = runHostView(review(), scenario) as Json;
  const journal = (run.hostViews as Json[]).flatMap((view) => view.journal as Json[]);
  assert.ok(journal.some((transition) => transition.cause.kind === "idle"), "the run ends through an idle cause");
  for (const transition of journal) {
    assert.deepEqual(Object.keys(transition).sort(), ["cause", "element", "ended", "started"], JSON.stringify(transition));
    for (const fact of transition.started as Json[]) assert.deepEqual(Object.keys(fact).sort(), ["occurrence", "sourceType"]);
    if (transition.cause.kind === "idle") assert.deepEqual(transition.cause, { kind: "idle" });
  }
});
