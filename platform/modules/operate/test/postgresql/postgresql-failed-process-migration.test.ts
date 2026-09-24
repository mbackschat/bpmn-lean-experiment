import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";

import { PostgresqlExecutionPublicationRepository, PostgresqlProcessInstanceRepository } from "@bpmn-lean/platform-operate";
import { firstPage, registration } from "../execution-publication-fixture.ts";
import { createOperateTestRuntime, migrateOperateDatabase, resetOperateDatabase } from "./postgresql-operate-test-support.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;
const migrationUrl = new URL(
  "../../migrations/0012_failed-process-publication__b0668bf6f541e5dd02f76021c9ffa63861e937ed430cb216e5f9fb7865c35a9a.sql",
  import.meta.url,
);

if (baseUrl === undefined) {
  test("failed Process migration requires the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createOperateTestRuntime(baseUrl, "failed-process-migration");
  before(async () => await migrateOperateDatabase(baseUrl));
  after(async () => await runtime.close());

  test("migration 0012 widens only the status constraint and preserves retained publication bytes", async () => {
    await resetOperateDatabase(runtime);
    const ordinal = await new PostgresqlProcessInstanceRepository(runtime).recordConfirmed({
      instance: registration.instance, locator: registration.locator,
    });
    await new PostgresqlExecutionPublicationRepository(runtime).applyPage({ ...registration, ordinal }, firstPage());
    const sql = await readFile(migrationUrl, "utf8");
    await runtime.withDedicatedSession(async (session) => {
      await session.query({ text: "BEGIN" });
      try {
        await session.query({ text: `
          ALTER TABLE bpmn_platform.operate_execution_publications
            DROP CONSTRAINT operate_execution_publications_current_process_status_check,
            ADD CONSTRAINT operate_execution_publications_current_process_status_check
              CHECK (current_process_status IN ('running', 'completed', 'cancelled'));
          ALTER TABLE bpmn_platform_meta.schema_epoch DROP CONSTRAINT schema_epoch_epoch_check;
          UPDATE bpmn_platform_meta.schema_epoch SET epoch = 11 WHERE singleton = true;
          ALTER TABLE bpmn_platform_meta.schema_epoch ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch = 11)
        ` });
        const before = await session.query({ text: "SELECT * FROM bpmn_platform.operate_execution_publications ORDER BY process_instance_id" });
        const batches = await session.query({ text: "SELECT * FROM bpmn_platform.operate_execution_publication_batches ORDER BY process_instance_id, from_revision" });
        const records = await session.query({ text: "SELECT * FROM bpmn_platform.operate_execution_publication_records ORDER BY process_instance_id, revision" });
        await session.query({ text: sql });
        assert.deepEqual((await session.query({ text: "SELECT * FROM bpmn_platform.operate_execution_publications ORDER BY process_instance_id" })).rows, before.rows);
        assert.deepEqual((await session.query({ text: "SELECT * FROM bpmn_platform.operate_execution_publication_batches ORDER BY process_instance_id, from_revision" })).rows, batches.rows);
        assert.deepEqual((await session.query({ text: "SELECT * FROM bpmn_platform.operate_execution_publication_records ORDER BY process_instance_id, revision" })).rows, records.rows);
        assert.deepEqual((await session.query({ text: "SELECT epoch FROM bpmn_platform_meta.schema_epoch" })).rows, [{ epoch: 12 }]);
        for (const status of ["running", "completed", "cancelled", "failed"]) {
          await session.query({ text: "UPDATE bpmn_platform.operate_execution_publications SET current_process_status = $1", values: [status] });
        }
        await session.query({ text: "SAVEPOINT invalid_status" });
        await assert.rejects(session.query({
          text: "UPDATE bpmn_platform.operate_execution_publications SET current_process_status = 'unknown'",
        }), { code: "23514" });
        await session.query({ text: "ROLLBACK TO SAVEPOINT invalid_status" });
      } finally {
        await session.query({ text: "ROLLBACK" });
      }
    });
  });

  test("migration 0012 refuses a schema epoch other than eleven atomically", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    await assert.rejects(runtime.transaction(async (session) => {
      await session.query({ text: sql });
    }), /unexpected schema epoch before migration 0012/u);
    assert.deepEqual((await runtime.query({ text: "SELECT epoch FROM bpmn_platform_meta.schema_epoch" })).rows, [{ epoch: 12 }]);
  });
}
