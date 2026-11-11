/**
 * A Receive Task's wait is uncorrelated, since admission refuses a Receive Task correlation (`work.receive.correlation`),
 * and this program reads the modeled key (`messageCorrelation = modeledKey`). A criterion delivered to a wait that
 * models no key is an API criterion, which that reading does not select, so the delivery is `unsupported` with the
 * profile's code and changes nothing, rather than a correlation mismatch; one naming none completes the task.
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

test("a criterion delivered where the profile reads only modeled keys is unsupported; a delivery naming none completes the task", () => {
  const decoded = decodeProgram(wired(task(activity("T", receiveWork()))(base())));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const started = step(hooks, decoded.value, null, stimulus({
    kind: "start", instanceId: "I", variables: [{ name: "orderId", value: { kind: "string", value: "O-1" } }],
  }));
  assert.ok(started.ok, JSON.stringify(started));
  const criterion = { target: { kind: "processVariable", name: "orderId" }, expected: { kind: "string", value: "O-1" } };
  const refused = step(hooks, decoded.value, started.value, deliver([criterion]));
  assert.deepEqual(refused, { ok: false, failure: { tag: "unsupported", code: "profile-message-correlation-api-criteria" } });
  const completed = step(hooks, decoded.value, started.value, deliver([]));
  assert.ok(completed.ok, JSON.stringify(completed));
  assert.equal((completed.value as State).status, "completed");
});
