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
