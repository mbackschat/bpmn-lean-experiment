/**
 * The instance-identity bound at a Call (OD14, `Bounds.instanceIdentityBytes`): a called instance's identifier embeds
 * its caller's, so the Call refuses to start one whose identifier would take more UTF-8 bytes than the program's bound,
 * and starts one that fits exactly. `T` calls `Called`, whose none start `CS` reaches `CE`; started as `I`, the called
 * instance is `call:1:I:1:T:1`, 14 bytes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";

import { activity, append, base, callWork, definitionRef, end, flow, start, task, withFlows, withOptions, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const bounds = (instanceIdentityBytes: number): Json => ({
  bounds: { containerLevels: 4, containerMembers: 32, valueNodes: 256, canonicalBytes: 16384, textBytes: 1024, instanceIdentityBytes },
});

function started(instanceIdentityBytes: number) {
  const caller = append(task(activity("T", callWork()))(base()), start("CS"), end("CE"));
  const program = withFlows({ ...caller, processes: [{ definition: definitionRef("Called"), children: ["CS", "CE"], variables: [],
    executable: true }] }, flow("cf", "CS", "CE"));
  const decoded = decodeProgram(wired(withOptions(program, bounds(instanceIdentityBytes))));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const stimulus = stimulusFromJson({ commandId: "c", kind: "start", instanceId: "I", variables: [] });
  assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
  return step(decoded.value, null, stimulus.value[1]);
}

test("a Call whose called instance's identifier exceeds the bound is refused as instance-identity-bound", () => {
  assert.deepEqual(started(13), { ok: false, failure: { tag: "unsupported", code: "instance-identity-bound" } });
});

test("a Call whose called instance's identifier takes exactly the bound starts it", () => {
  assert.equal(started(14).ok, true);
});
