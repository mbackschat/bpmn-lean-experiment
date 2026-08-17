import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DefinitionsRecoveryFamily,
  decodeDefinitionsRecoveryCandidateKey,
  encodeDefinitionsRecoveryCandidateKey,
} from "@bpmn-lean/platform-definitions";

test("recovery candidate keys preserve full Unicode and composite Schedule identity", () => {
  const candidates = [
    {
      family: DefinitionsRecoveryFamily.ConfirmedRegistration,
      processInstanceId: "confirmed\u0000😀",
    },
    {
      family: DefinitionsRecoveryFamily.DirectStart,
      processInstanceId: "direct\u0000😀",
    },
    {
      family: DefinitionsRecoveryFamily.Schedule,
      reference: {
        processId: "process\u0000segment",
        version: 7,
        scheduleId: "schedule\u0000😀",
      },
    },
    {
      family: DefinitionsRecoveryFamily.MessageStart,
      publicationId: "publication\u0000😀",
    },
  ] as const;

  for (const candidate of candidates) {
    const encoded = encodeDefinitionsRecoveryCandidateKey(candidate);
    const detached = Uint8Array.from(encoded);
    assert.deepEqual(
      decodeDefinitionsRecoveryCandidateKey(candidate.family, detached),
      candidate,
    );
    detached.fill(0);
    assert.notDeepEqual(encoded, detached);
  }
});

test("recovery candidate keys reject noncanonical JSON and family-shape drift", () => {
  assert.throws(
    () => decodeDefinitionsRecoveryCandidateKey(
      DefinitionsRecoveryFamily.MessageStart,
      new TextEncoder().encode('["publication\\u002did"]'),
    ),
    /not canonical JSON/u,
  );
  assert.throws(
    () => decodeDefinitionsRecoveryCandidateKey(
      DefinitionsRecoveryFamily.Schedule,
      encodeDefinitionsRecoveryCandidateKey({
        family: DefinitionsRecoveryFamily.MessageStart,
        publicationId: "publication-id",
      }),
    ),
    /wrong shape/u,
  );
});
