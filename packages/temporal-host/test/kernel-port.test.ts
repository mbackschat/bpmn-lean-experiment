/**
 * The kernel binding's time contract: a stimulus's `at` and the host's time for its own inputs reach the kernel as
 * `atMs`, and a timer firing keeps its deadline apart from the time it is applied at.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const { kernelPort } = await import(new URL("../dist/kernel-port.js", import.meta.url).href) as
  typeof import("../src/kernel-port.ts");

const { EffectResultKind } = await import(new URL("../dist/port.js", import.meta.url).href) as
  typeof import("../src/port.ts");

const occurrence = { processInstanceId: "I", elementId: "T", activation: 1 };

test("a stimulus's stated time reaches the kernel as its atMs", () => {
  const decoded = kernelPort.decodeStimulus({ kind: "startProcess", commandId: "start", instanceId: "I", initialVariables: [], at: 1_700_000_000_000 });
  assert.ok(decoded.input !== null);
  assert.equal(decoded.input.payload.atMs, 1_700_000_000_000);
});

test("a timer firing carries its deadline and the host's time; an effect result carries the host's time", () => {
  const timer = kernelPort.timerInput(occurrence, 1000, 1004);
  assert.deepEqual(timer.payload, { occurrence: { processInstanceId: "I", element: "T", activation: 1 }, logicalTimeMs: 1000, atMs: 1004 });
  const effect = kernelPort.effectInput(occurrence, { kind: EffectResultKind.TechnicalFailure }, 1500);
  assert.equal(effect.payload.atMs, 1500);
});
