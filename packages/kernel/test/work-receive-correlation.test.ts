/**
 * A Receive Task's wait is uncorrelated, since admission refuses a Receive Task correlation (`work.receive.correlation`)
 * and the API criteria (`profile.messageCorrelation.apiCriteria`). A delivery must carry exactly its wait's
 * correlation, as a Message subscription's must (`feature/subscriptions.ts` `admitFiring`), so a delivery naming a
 * criterion is refused unchanged and never completes the task (PC-HUM-03: wrong correlation refuses without consuming).
 * The oracle is that subscription rule; no retained CIB answer exists, because the runner realizes no `deliver`
 * correlation.
 *
 * `Start → T → End`, `T` a Receive Task on the unspecified Message channel.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { State } from "@bpmn-lean/kernel";

import { activity, base, receiveWork, task, wired } from "./admission-refusal-support.ts";

const stimulus = (raw: Record<string, unknown>) => {
  const decoded = stimulusFromJson({ commandId: "c", ...raw });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value[1];
};

const deliver = (correlation: unknown[]) => stimulus({
  kind: "deliver", occurrence: { processInstanceId: "I", elementId: "T", activation: 1 },
  trigger: { kind: "message", channel: { kind: "unspecifiedMessage" } }, correlation,
});

test("a delivery naming a correlation criterion is refused unchanged; one naming none completes the task", () => {
  const decoded = decodeProgram(wired(task(activity("T", receiveWork()))(base())));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const started = step(hooks, decoded.value, null, stimulus({
    kind: "start", instanceId: "I", variables: [{ name: "orderId", value: { kind: "string", value: "O-1" } }],
  }));
  assert.ok(started.ok, JSON.stringify(started));
  const criterion = { target: { kind: "processVariable", name: "orderId" }, expected: { kind: "string", value: "O-1" } };
  const refused = step(hooks, decoded.value, started.value, deliver([criterion]));
  assert.deepEqual(refused, { ok: false, failure: { tag: "rejected", code: "message-correlation-mismatch" } });
  const completed = step(hooks, decoded.value, started.value, deliver([]));
  assert.ok(completed.ok, JSON.stringify(completed));
  assert.equal((completed.value as State).status, "completed");
});
