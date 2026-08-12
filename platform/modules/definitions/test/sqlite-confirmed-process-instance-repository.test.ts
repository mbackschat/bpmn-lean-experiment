import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ConfirmedProcessInstanceIntegrityError,
  ConfirmedProcessInstanceState,
  SqliteConfirmedProcessInstanceRepository,
} from "@bpmn-lean/platform-definitions";

const publication = {
  instance: {
    processInstanceId: "instance-1",
    definition: {
      processId: "Review_Process",
      version: 2,
      source: {
        kind: "bpmnSource" as const,
        id: "review.bpmn",
        sha256: "1".repeat(64),
        byteLength: 42,
        declaredEncoding: "UTF-8",
        decodedAs: "UTF-8" as const,
      },
      semanticProfile: "profile-1",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  },
  locator: "bpmn-process-work-v1:private-address",
};

test("persists one exact confirmed publication and independent delivery acknowledgements", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-confirmed-publication-"));
  const databaseFile = join(root, "definitions.sqlite");
  try {
    const repository = new SqliteConfirmedProcessInstanceRepository(databaseFile);
    const reserved = repository.confirm(publication);
    assert.equal(reserved.inserted, true);
    assert.equal(reserved.record.state, ConfirmedProcessInstanceState.Confirmed);
    assert.equal(reserved.record.operatePending, true);
    assert.equal(reserved.record.workPending, true);

    const afterOperate = repository.acknowledge(
      publication.instance.processInstanceId,
      "operate",
    );
    assert.equal(afterOperate?.operatePending, false);
    assert.equal(afterOperate?.workPending, true);
    repository.close();

    const reopened = new SqliteConfirmedProcessInstanceRepository(databaseFile);
    assert.deepEqual(reopened.get(publication.instance.processInstanceId), afterOperate);
    const equivalent = reopened.confirm(structuredClone(publication));
    assert.equal(equivalent.inserted, false);
    assert.deepEqual(equivalent.record, afterOperate);
    assert.throws(
      () => reopened.confirm({ ...publication, locator: "bpmn-process-work-v1:other" }),
      (error: unknown) => error instanceof ConfirmedProcessInstanceIntegrityError,
    );
    reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("serializes the closed direct-start state graph and refuses stale transitions", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-direct-publication-"));
  const databaseFile = join(root, "definitions.sqlite");
  try {
    const repository = new SqliteConfirmedProcessInstanceRepository(databaseFile);
    const reservation = repository.reserveDirect({
      ...publication,
      intent: {
        protocol: "bpmn-direct-start-v1",
        intentSha256: "2".repeat(64),
      },
    });
    assert.equal(reservation.record.state, ConfirmedProcessInstanceState.Reserved);
    assert.equal(reservation.record.operatePending, false);
    assert.equal(reservation.record.workPending, false);
    repository.close();

    const reopened = new SqliteConfirmedProcessInstanceRepository(databaseFile);
    assert.deepEqual(reopened.listForReconciliation(), [reservation.record]);

    const starting = reopened.compareAndSetState(
      publication.instance.processInstanceId,
      ConfirmedProcessInstanceState.Reserved,
      ConfirmedProcessInstanceState.Starting,
    );
    assert.equal(starting?.state, ConfirmedProcessInstanceState.Starting);
    assert.equal(
      reopened.compareAndSetState(
        publication.instance.processInstanceId,
        ConfirmedProcessInstanceState.Reserved,
        ConfirmedProcessInstanceState.Starting,
      ),
      null,
    );
    const indeterminate = reopened.compareAndSetState(
      publication.instance.processInstanceId,
      ConfirmedProcessInstanceState.Starting,
      ConfirmedProcessInstanceState.Indeterminate,
    );
    assert.equal(indeterminate?.state, ConfirmedProcessInstanceState.Indeterminate);
    const confirmed = reopened.compareAndSetState(
      publication.instance.processInstanceId,
      ConfirmedProcessInstanceState.Indeterminate,
      ConfirmedProcessInstanceState.Confirmed,
    );
    assert.equal(confirmed?.operatePending, true);
    assert.equal(confirmed?.workPending, true);
    assert.deepEqual(reopened.listForReconciliation(), [confirmed]);
    reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
