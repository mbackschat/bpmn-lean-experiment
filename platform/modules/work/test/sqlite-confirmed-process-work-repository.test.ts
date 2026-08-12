import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ConfirmedProcessWorkIntegrityError,
  SqliteConfirmedProcessWorkRepository,
} from "@bpmn-lean/platform-work";

const publication = {
  instance: {
    processInstanceId: "work-instance-1",
    definition: {
      processId: "Review_Process",
      version: 1,
      source: {
        kind: "bpmnSource" as const,
        id: "review.bpmn",
        sha256: "a".repeat(64),
        byteLength: 42,
        declaredEncoding: null,
        decodedAs: "UTF-8" as const,
      },
      semanticProfile: "profile-1",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  },
  locator: "bpmn-process-work-v1:private-workflow-address",
};

test("persists one exact confirmed Work registration across reopen", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-work-confirmed-"));
  const databaseFile = join(root, "work.sqlite");
  try {
    const first = new SqliteConfirmedProcessWorkRepository(databaseFile);
    await first.recordConfirmedProcessInstance(publication);
    await first.recordConfirmedProcessInstance(structuredClone(publication));
    assert.deepEqual(first.listConfirmedProcessInstances(), [publication]);
    first.close();

    const reopened = new SqliteConfirmedProcessWorkRepository(databaseFile);
    assert.deepEqual(reopened.listConfirmedProcessInstances(), [publication]);
    await assert.rejects(
      reopened.recordConfirmedProcessInstance({
        ...publication,
        locator: "bpmn-process-work-v1:different-address",
      }),
      (error: unknown) => error instanceof ConfirmedProcessWorkIntegrityError,
    );
    reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("snapshots inputs and keeps the private locator outside the public identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-work-snapshot-"));
  const databaseFile = join(root, "work.sqlite");
  try {
    const repository = new SqliteConfirmedProcessWorkRepository(databaseFile);
    const mutable = structuredClone(publication);
    await repository.recordConfirmedProcessInstance(mutable);
    Object.assign(mutable.instance.definition.source, { id: "mutated.bpmn" });
    Object.assign(mutable, { locator: "bpmn-process-work-v1:mutated" });

    const stored = repository.listConfirmedProcessInstances()[0];
    assert.deepEqual(stored, publication);
    assert.equal("locator" in stored!.instance, false);
    assert.doesNotMatch(
      JSON.stringify(stored!.instance),
      /workflow|taskQueue|memo|runId/iu,
    );
    repository.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
