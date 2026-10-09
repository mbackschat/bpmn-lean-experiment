import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  DeployedDefinitionVersion,
} from "@bpmn-lean/platform-contracts";

import {
  sameExactDefinition,
  snapshotExactDefinition,
} from "../src/exact-definition.ts";

type Mutable<Value> = Value extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: Mutable<Value[Key]> }
    : Value;

const definition: DeployedDefinitionVersion = createMutableDefinition();

function createMutableDefinition(): Mutable<DeployedDefinitionVersion> {
  return {
    processId: "Process_Message_Timer",
    version: 2,
    source: {
      kind: "bpmnSource",
      id: "message-timer.bpmn",
      sha256: "d".repeat(64),
      byteLength: 2048,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "message-and-timer-start-draft",
    startCapabilities: {
      messageStarts: [{
        startEventId: "MessageStart_OrderReceived",
        channel: {
          kind: "operationMessage",
          interfaceId: "Orders",
          interfaceOperationId: "receiveOrder",
          messageId: "OrderReceived",
        },
      }],
      timerStarts: [{ startEventId: "TimerStart_PT1S", durationMs: 1_000 }],
    },
    sourceOverlay: null,
  };
}

test("snapshots both exact start-capability arrays without retaining caller aliases", () => {
  const mutable = createMutableDefinition();
  const snapshot = snapshotExactDefinition(mutable);

  mutable.source.sha256 = "e".repeat(64);
  mutable.startCapabilities.messageStarts[0]!.channel.interfaceOperationId =
    "changedOperation";
  mutable.startCapabilities.timerStarts[0]!.durationMs = 2_000;

  assert.deepEqual(snapshot, definition);
});

test("distinguishes Message Start operation drift when every other identity fact agrees", () => {
  const drifted = createMutableDefinition();
  drifted.startCapabilities.messageStarts[0]!.channel.interfaceOperationId =
    "receiveChangedOrder";

  assert.equal(sameExactDefinition(definition, createMutableDefinition()), true);
  assert.equal(sameExactDefinition(definition, drifted), false);
});

test("captures both overlay identity fields without retaining a caller alias", () => {
  const mutable = createMutableDefinition();
  mutable.sourceOverlay = { id: "business-policy", sha256: "a".repeat(64) };
  const expected = structuredClone(mutable);
  const snapshot = snapshotExactDefinition(mutable);

  mutable.sourceOverlay.id = "changed-policy";
  mutable.sourceOverlay.sha256 = "b".repeat(64);

  assert.deepEqual(snapshot, expected);
  assert.equal(sameExactDefinition(snapshot, expected), true);
  assert.equal(sameExactDefinition(snapshot, mutable), false);
});

test("rejects overlay ID, digest and presence drift in either comparison direction", () => {
  const selected = createMutableDefinition();
  selected.sourceOverlay = { id: "business-policy", sha256: "a".repeat(64) };
  for (const sourceOverlay of [
    null,
    { id: "another-policy", sha256: "a".repeat(64) },
    { id: "business-policy", sha256: "b".repeat(64) },
  ]) {
    const drifted = { ...selected, sourceOverlay };
    assert.equal(sameExactDefinition(selected, drifted), false);
    assert.equal(sameExactDefinition(drifted, selected), false);
  }
  assert.equal(sameExactDefinition(selected, structuredClone(selected)), true);
});
