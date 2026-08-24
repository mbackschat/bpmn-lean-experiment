import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  ConfirmedProcessInstanceIntegrityError,
  ConfirmedProcessInstanceState,
  ConfirmedProcessInstanceStoredValueError,
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
    const reserved = await repository.confirm(publication);
    assert.equal(reserved.inserted, true);
    assert.equal(reserved.record.state, ConfirmedProcessInstanceState.Confirmed);
    assert.equal(reserved.record.operatePending, true);
    assert.equal(reserved.record.workPending, true);

    const afterOperate = await repository.acknowledge(
      publication.instance.processInstanceId,
      "operate",
    );
    assert.equal(afterOperate?.operatePending, false);
    assert.equal(afterOperate?.workPending, true);
    repository.close();

    const reopened = new SqliteConfirmedProcessInstanceRepository(databaseFile);
    assert.deepEqual(
      await reopened.get(publication.instance.processInstanceId),
      afterOperate,
    );
    const fullyAcknowledged = await reopened.acknowledge(
      publication.instance.processInstanceId,
      "work",
    );
    assert.deepEqual(await reopened.listForReconciliation(), []);
    assert.deepEqual(await reopened.listConfirmed(), [fullyAcknowledged]);
    const equivalent = await reopened.confirm(structuredClone(publication));
    assert.equal(equivalent.inserted, false);
    assert.deepEqual(equivalent.record, fullyAcknowledged);
    await assert.rejects(
      reopened.confirm({ ...publication, locator: "bpmn-process-work-v1:other" }),
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
    const reservation = await repository.reserveDirect({
      ...publication,
      intent: {
        protocol: "bpmn-direct-start-v1",
        intentSha256: "2".repeat(64),
      },
      startCommandBytes: new TextEncoder().encode('{"initialVariables":[]}'),
    });
    assert.equal(reservation.record.state, ConfirmedProcessInstanceState.Reserved);
    assert.equal(reservation.record.operatePending, false);
    assert.equal(reservation.record.workPending, false);
    assert.deepEqual(await repository.listConfirmed(), []);
    repository.close();

    const reopened = new SqliteConfirmedProcessInstanceRepository(databaseFile);
    assert.deepEqual(await reopened.listForReconciliation(), [reservation.record]);

    const starting = await reopened.compareAndSetState(
      publication.instance.processInstanceId,
      ConfirmedProcessInstanceState.Reserved,
      ConfirmedProcessInstanceState.Starting,
    );
    assert.equal(starting?.state, ConfirmedProcessInstanceState.Starting);
    assert.deepEqual(await reopened.listConfirmed(), []);
    assert.equal(
      await reopened.compareAndSetState(
        publication.instance.processInstanceId,
        ConfirmedProcessInstanceState.Reserved,
        ConfirmedProcessInstanceState.Starting,
      ),
      null,
    );
    const indeterminate = await reopened.compareAndSetState(
      publication.instance.processInstanceId,
      ConfirmedProcessInstanceState.Starting,
      ConfirmedProcessInstanceState.Indeterminate,
    );
    assert.equal(indeterminate?.state, ConfirmedProcessInstanceState.Indeterminate);
    assert.deepEqual(await reopened.listConfirmed(), []);
    const confirmed = await reopened.compareAndSetState(
      publication.instance.processInstanceId,
      ConfirmedProcessInstanceState.Indeterminate,
      ConfirmedProcessInstanceState.Confirmed,
    );
    assert.equal(confirmed?.operatePending, true);
    assert.equal(confirmed?.workPending, true);
    assert.deepEqual(await reopened.listForReconciliation(), [confirmed]);
    assert.deepEqual(await reopened.listConfirmed(), [confirmed]);
    reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses missing and noncanonical command bytes in post-migration direct rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-direct-command-corruption-"));
  const exactBytes = new TextEncoder().encode('{"initialVariables":[]}');
  try {
    for (const [name, corrupt] of [
      ["missing", null],
      ["noncanonical", new TextEncoder().encode('{ "initialVariables": [] }')],
    ] as const) {
      const databaseFile = join(root, `${name}.sqlite`);
      const repository = new SqliteConfirmedProcessInstanceRepository(databaseFile);
      const reservation = {
        ...publication,
        instance: {
          ...publication.instance,
          processInstanceId: `instance-${name}`,
        },
        intent: {
          protocol: "bpmn-direct-start-v1",
          intentSha256: "8".repeat(64),
        },
        startCommandBytes: Uint8Array.from(exactBytes),
      };
      await repository.reserveDirect(reservation);
      repository.close();

      const database = new DatabaseSync(databaseFile);
      database.exec("PRAGMA ignore_check_constraints = ON");
      database.prepare(`
        UPDATE confirmed_process_instances SET direct_start_command = ?
      `).run(corrupt);
      database.close();

      const reopened = new SqliteConfirmedProcessInstanceRepository(databaseFile);
      await assert.rejects(
        reopened.get(`instance-${name}`),
        (error: unknown) => error instanceof ConfirmedProcessInstanceStoredValueError,
      );
      reopened.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
