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
  await withRepositories(async (_, publications, registered) => {
    await publications.applyPage(registered, firstPage());
    const before = await publications.get("Instance_1");
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

    await assert.rejects(
      () => publications.applyPage(registered, page),
      ExecutionPublicationIntegrityError,
    );
    assert.deepEqual(await publications.get("Instance_1"), before);
  });
});

test("retains exact duplicates and rejects changed overlapping batch content", async () => {
  await withRepositories(async (_, publications, registered) => {
    const first = await publications.applyPage(registered, firstPage());
    assert.deepEqual(await publications.applyPage(registered, firstPage()), first);
    const source = firstPage();
    const changed = {
      ...source,
      batches: [{ ...source.batches[0]!, commandId: "changed-command" }],
    };

    await assert.rejects(
      () => publications.applyPage(
        registered,
        changed as unknown as ExecutionPublicationPage,
      ),
      ExecutionPublicationIntegrityError,
    );
    assert.deepEqual(await publications.get("Instance_1"), first);
  });
});

test("resumes a partial prefix after reopen and rebuilds byte-identically from zero", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-execution-publication-"));
  const databaseFile = join(root, "operate.sqlite");
  try {
    const instances = new SqliteProcessInstanceRepository(databaseFile);
    await instances.recordConfirmed({
      instance: registration.instance,
      locator: registration.locator,
    });
    const registered = await instances.getRegistration("Instance_1");
    assert.ok(registered);
    const first = new SqliteExecutionPublicationRepository(databaseFile);
    await first.applyPage(registered, firstPage(3));
    first.close();

    const reopened = new SqliteExecutionPublicationRepository(databaseFile);
    await reopened.applyPage(registered, secondPage());
    const uninterruptedExport = await reopened.export("Instance_1");
    assert.ok(uninterruptedExport);
    const page = await reopened.page("Instance_1", { afterRevision: 0, limit: 2 });
    assert.equal(page?.batches.length, 2);
    assert.equal(page?.current?.revision, 3);

    const rebuilt = await reopened.replaceFromPages(
      registered,
      [firstPage(3), secondPage()],
    );
    const rebuiltExport = await reopened.export("Instance_1");
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
  await withRepositories(async (_, publications, registered) => {
    await publications.applyPage(registered, firstPage());
    for (const status of [
      ExecutionPublicationProjectionStatus.Gap,
      ExecutionPublicationProjectionStatus.Unavailable,
    ] as const) {
      await publications.mark(registered, status);
      assert.equal((await publications.get("Instance_1"))?.status, status);
      assert.equal(await publications.page("Instance_1", { afterRevision: 0 }), null);
      assert.equal(await publications.export("Instance_1"), null);
    }
  });
});

test("appends and marks without deleting accepted publication rows", async () => {
  await withRepositories(async (databaseFile, publications, registered) => {
    await publications.applyPage(registered, firstPage());
    const prefix = publicationChildRows(databaseFile);
    installDeleteGuards(databaseFile, [
      "execution_publication_batches",
      "execution_publication_records",
    ]);

    const outcomes = await Promise.allSettled([
      publications.applyPage(registered, secondPage()),
      publications.mark(registered, ExecutionPublicationProjectionStatus.Gap),
    ]);

    assert.deepEqual(outcomes.map(({ status }) => status), ["fulfilled", "fulfilled"]);
    const retained = publicationChildRows(databaseFile);
    assert.deepEqual(retained[0].slice(0, prefix[0].length), prefix[0]);
    assert.deepEqual(retained[1].slice(0, prefix[1].length), prefix[1]);
    const image = await publications.get("Instance_1");
    assert.equal(image?.headRevision, 3);
    assert.equal(image?.status, ExecutionPublicationProjectionStatus.Gap);
  });
});

test("fails closed when a retained record changes independently from its batch", async () => {
  await withRepositories(async (databaseFile, publications, registered) => {
    await publications.applyPage(registered, firstPage());
    const database = new DatabaseSync(databaseFile);
    database.prepare(`
      UPDATE execution_publication_records SET record_json = ?
      WHERE process_instance_id = ? AND revision = 1
    `).run('{"changed":true}', "Instance_1");
    database.close();

    await assert.rejects(
      () => publications.get("Instance_1"),
      ExecutionPublicationStoredValueError,
    );
  });
});

async function withRepositories(
  run: (
    databaseFile: string,
    publications: SqliteExecutionPublicationRepository,
    registered: NonNullable<Awaited<ReturnType<SqliteProcessInstanceRepository["getRegistration"]>>>,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-execution-publication-"));
  const databaseFile = join(root, "operate.sqlite");
  const instances = new SqliteProcessInstanceRepository(databaseFile);
  const publications = new SqliteExecutionPublicationRepository(databaseFile);
  try {
    await instances.recordConfirmed({
      instance: registration.instance,
      locator: registration.locator,
    });
    const registered = await instances.getRegistration("Instance_1");
    assert.ok(registered);
    await run(databaseFile, publications, registered);
  } finally {
    publications.close();
    instances.close();
    await rm(root, { recursive: true, force: true });
  }
}

function publicationChildRows(databaseFile: string): readonly [unknown[], unknown[]] {
  const database = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    return [
      database.prepare(`
        SELECT * FROM execution_publication_batches
        ORDER BY process_instance_id, from_revision
      `).all(),
      database.prepare(`
        SELECT * FROM execution_publication_records
        ORDER BY process_instance_id, revision
      `).all(),
    ];
  } finally {
    database.close();
  }
}

function installDeleteGuards(databaseFile: string, tables: readonly string[]): void {
  const database = new DatabaseSync(databaseFile);
  try {
    for (const table of tables) {
      database.exec(`
        CREATE TRIGGER reject_delete_${table}
        BEFORE DELETE ON ${table}
        BEGIN
          SELECT RAISE(ABORT, 'accepted publication prefix was deleted');
        END
      `);
    }
  } finally {
    database.close();
  }
}
