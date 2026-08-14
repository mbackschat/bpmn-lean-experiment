import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  ExecutionPublicationIntegrityError,
  ExecutionPublicationProjectionStatus,
  ExecutionPublicationStoredValueError,
  SqliteExecutionPublicationRepository,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type { ExecutionPublicationPage } from "@bpmn-lean/platform-contracts";
import { serializeCanonicalExecutionPublicationValue } from "@bpmn-lean/platform-contracts";

import {
  firstPage,
  registration,
  secondPage,
} from "./execution-publication-fixture.ts";

test("rolls back a page after a valid prefix when its later batch skips a revision", async () => {
  await withRepositories((_, publications, registered) => {
    publications.applyPage(registered, firstPage());
    const before = publications.get("Instance_1");
    const valid = secondPage().batches[0];
    assert.ok(valid);
    const skipped = {
      ...valid,
      fromRevision: 4,
      throughRevision: 5,
      transitions: [{ ...valid.transitions[0]!, revision: 5 }],
    };
    const page = {
      ...secondPage(),
      pageThroughRevision: 5,
      headRevision: 5,
      batches: [valid, skipped],
      current: { ...secondPage().current, revision: 5 },
    } as unknown as ExecutionPublicationPage;

    assert.throws(
      () => publications.applyPage(registered, page),
      ExecutionPublicationIntegrityError,
    );
    assert.deepEqual(publications.get("Instance_1"), before);
  });
});

test("retains exact duplicates and rejects changed overlapping batch content", async () => {
  await withRepositories((_, publications, registered) => {
    const first = publications.applyPage(registered, firstPage());
    assert.deepEqual(publications.applyPage(registered, firstPage()), first);
    const source = firstPage();
    const changed = {
      ...source,
      batches: [{ ...source.batches[0]!, commandId: "changed-command" }],
    };

    assert.throws(
      () => publications.applyPage(
        registered,
        changed as unknown as ExecutionPublicationPage,
      ),
      ExecutionPublicationIntegrityError,
    );
    assert.deepEqual(publications.get("Instance_1"), first);
  });
});

test("resumes a partial prefix after reopen and rebuilds byte-identically from zero", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-execution-publication-"));
  const databaseFile = join(root, "operate.sqlite");
  try {
    const instances = new SqliteProcessInstanceRepository(databaseFile);
    instances.recordConfirmed({
      instance: registration.instance,
      locator: registration.locator,
    });
    const registered = instances.getRegistration("Instance_1");
    assert.ok(registered);
    const first = new SqliteExecutionPublicationRepository(databaseFile);
    first.applyPage(registered, firstPage(3));
    first.close();

    const reopened = new SqliteExecutionPublicationRepository(databaseFile);
    reopened.applyPage(registered, secondPage());
    const uninterruptedExport = reopened.export("Instance_1");
    assert.ok(uninterruptedExport);
    const page = reopened.page("Instance_1", { afterRevision: 0, limit: 2 });
    assert.equal(page?.batches.length, 2);
    assert.equal(page?.current?.revision, 3);

    const rebuilt = reopened.replaceFromPages(
      registered,
      [firstPage(3), secondPage()],
    );
    const rebuiltExport = reopened.export("Instance_1");
    assert.equal(rebuilt.headRevision, 3);
    assert.deepEqual(
      serializeCanonicalExecutionPublicationValue(rebuiltExport),
      serializeCanonicalExecutionPublicationValue(uninterruptedExport),
    );
    reopened.close();
    instances.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("suppresses every read after a durable gap or unavailable classification", async () => {
  await withRepositories((_, publications, registered) => {
    publications.applyPage(registered, firstPage());
    for (const status of [
      ExecutionPublicationProjectionStatus.Gap,
      ExecutionPublicationProjectionStatus.Unavailable,
    ] as const) {
      publications.mark(registered, status);
      assert.equal(publications.get("Instance_1")?.status, status);
      assert.equal(publications.page("Instance_1", { afterRevision: 0 }), null);
      assert.equal(publications.export("Instance_1"), null);
    }
  });
});

test("fails closed when a retained record changes independently from its batch", async () => {
  await withRepositories((databaseFile, publications, registered) => {
    publications.applyPage(registered, firstPage());
    const database = new DatabaseSync(databaseFile);
    database.prepare(`
      UPDATE execution_publication_records SET record_json = ?
      WHERE process_instance_id = ? AND revision = 1
    `).run('{"changed":true}', "Instance_1");
    database.close();

    assert.throws(
      () => publications.get("Instance_1"),
      ExecutionPublicationStoredValueError,
    );
  });
});

async function withRepositories(
  run: (
    databaseFile: string,
    publications: SqliteExecutionPublicationRepository,
    registered: NonNullable<ReturnType<SqliteProcessInstanceRepository["getRegistration"]>>,
  ) => void,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-execution-publication-"));
  const databaseFile = join(root, "operate.sqlite");
  const instances = new SqliteProcessInstanceRepository(databaseFile);
  const publications = new SqliteExecutionPublicationRepository(databaseFile);
  try {
    instances.recordConfirmed({
      instance: registration.instance,
      locator: registration.locator,
    });
    const registered = instances.getRegistration("Instance_1");
    assert.ok(registered);
    run(databaseFile, publications, registered);
  } finally {
    publications.close();
    instances.close();
    await rm(root, { recursive: true, force: true });
  }
}
