import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  readAndVerifyArtifactSets,
  verifyArtifactSet,
} from "./contract-artifacts.ts";
import {
  cloneArtifactSet,
  required,
  requiredAt,
} from "./contract-artifact-test-fixtures.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

type MutableMessageSnapshot = {
  subscriptions: Array<{
    messageId: string;
  }>;
};

async function receiveTaskArtifacts() {
  const artifactSets = await readAndVerifyArtifactSets(projectRoot);
  return required(
    artifactSets.find(
      ({ scenario }) =>
        scenario.id === "message-addressed-receive-task",
    ),
    "Message-addressed Receive Task artifact set",
  );
}

function messageSnapshots(
  artifactSet: ReturnType<typeof cloneArtifactSet>,
): Array<MutableMessageSnapshot> {
  const observations = artifactSet.evidence.producerObservations as unknown as {
    messageSubscriptions?: Array<MutableMessageSnapshot>;
  };
  return required(
    observations.messageSubscriptions,
    "raw Message-subscription snapshots",
  );
}

test("binds the canonical direct channel to retained CIB subscription evidence", async () => {
  const mutated = cloneArtifactSet(await receiveTaskArtifacts());
  const waiting = requiredAt(
    messageSnapshots(mutated),
    0,
    "waiting Message snapshot",
  );
  requiredAt(waiting.subscriptions, 0, "live Message subscription").messageId =
    "Message_Other";

  assert.throws(
    () => verifyArtifactSet(mutated),
    /producer observation projection does not match canonical openMessageSubscriptions/,
  );
});

test("detects removal of the retained live CIB subscription", async () => {
  const mutated = cloneArtifactSet(await receiveTaskArtifacts());
  requiredAt(
    messageSnapshots(mutated),
    0,
    "waiting Message snapshot",
  ).subscriptions = [];

  assert.throws(
    () => verifyArtifactSet(mutated),
    /producer observation projection does not match canonical activeWaits/,
  );
});
