import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createPlatformServer,
} from "@bpmn-lean/platform-server";

test("composes the definition route and closes its HTTP and SQLite owners idempotently", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bpmn-lean-server-"));
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  const runtime = await createPlatformServer({
    host: "127.0.0.1",
    port,
    publicOrigin: origin,
    dataDirectory,
    maxSourceBytes: 1024,
    parserDeadlineMs: 1000,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "default",
    temporalTaskQueue: "bpmn-semantic",
    temporalConnectTimeoutMs: 5000,
  });
  try {
    assert.equal(await runtime.listen(), origin);
    const response = await fetch(`${origin}/api/v1/definitions`, {
      signal: AbortSignal.timeout(1_000),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { definitions: [] });
    const processInstances = await fetch(
      `${origin}/api/v1/process-instances`,
      { signal: AbortSignal.timeout(1_000) },
    );
    assert.equal(processInstances.status, 200);
    assert.deepEqual(await processInstances.json(), {
      instances: [],
      nextCursor: null,
    });
    const schedules = await fetch(
      `${origin}/api/v1/definitions/missing/versions/1/schedules`,
      { signal: AbortSignal.timeout(1_000) },
    );
    assert.equal(schedules.status, 404);
    assert.deepEqual(await schedules.json(), {
      error: {
        code: "notFound",
        message: "The definition version was not found.",
      },
    });
    const publication = await fetch(
      `${origin}/api/v1/message-start-publications/missing`,
      { signal: AbortSignal.timeout(1_000) },
    );
    assert.equal(publication.status, 404);
    assert.deepEqual(await publication.json(), {
      error: {
        code: "notFound",
        message: "The Message Start publication was not found.",
      },
    });

    await Promise.all([runtime.close(), runtime.close()]);
    await runtime.close();
    const database = await readFile(join(dataDirectory, "definitions.sqlite"));
    assert.ok(database.byteLength > 0);
    const processInstanceDatabase = await readFile(
      join(dataDirectory, "process-instances.sqlite"),
    );
    assert.ok(processInstanceDatabase.byteLength > 0);
    const workDatabase = await readFile(join(dataDirectory, "work.sqlite"));
    assert.ok(workDatabase.byteLength > 0);
    await assert.rejects(runtime.listen(), /runtime is closed/u);
  } finally {
    await runtime.close();
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("validates all configuration before creating its data directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-server-config-"));
  const dataDirectory = join(root, "must-not-exist");
  try {
    await assert.rejects(createPlatformServer({
      host: "127.0.0.1",
      port: 3000,
      publicOrigin: "http://user:secret@public.example",
      dataDirectory,
      maxSourceBytes: 1024,
      parserDeadlineMs: 1000,
      temporalAddress: "127.0.0.1:7233",
      temporalNamespace: "default",
      temporalTaskQueue: "bpmn-semantic",
      temporalConnectTimeoutMs: 5000,
    }), /publicOrigin/u);
    await assert.rejects(stat(dataDirectory), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function allocatePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("ephemeral listener did not expose a TCP address");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
  return address.port;
}
