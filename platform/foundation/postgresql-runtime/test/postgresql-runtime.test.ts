import assert from "node:assert/strict";
import { test } from "node:test";

import { createPostgresqlRuntimeWithPool } from "../dist/postgresql-runtime.js";

test("rolls back a failed READ COMMITTED transaction and always releases its session", async () => {
  const events: string[] = [];
  const runtime = createPostgresqlRuntimeWithPool({
    query: async () => ({ rows: [], rowCount: null }),
    connect: async () => ({
      query: async (text) => {
        events.push(text);
        return { rows: [], rowCount: null };
      },
      release: () => events.push("RELEASE"),
    }),
    end: async () => undefined,
  });

  await assert.rejects(
    runtime.transaction(async (session) => {
      await session.query({ text: "SELECT work" });
      throw new Error("work failed");
    }),
    /work failed/u,
  );
  assert.deepEqual(events, [
    "BEGIN ISOLATION LEVEL READ COMMITTED",
    "SELECT work",
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("rejects a database clock value that is not an exact safe integer", async () => {
  const runtime = createPostgresqlRuntimeWithPool({
    query: async () => ({
      rows: [{ epoch_ms: "123-invalid" }],
      rowCount: 1,
    }),
    connect: async () => {
      throw new Error("unused");
    },
    end: async () => undefined,
  });

  await assert.rejects(
    runtime.databaseClockEpochMs(),
    /did not return a safe epoch millisecond/u,
  );
});
