import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { test } from "node:test";

import { createPlatformServer, createSharedPlatformServer, PlatformStorageMode, readPlatformServerConfig } from "@bpmn-lean/platform-server";
import { DefinitionApiClient, DefinitionApiError } from "../../../platform/apps/web/src/definitions-api.ts";

const source = new TextEncoder().encode("<bpmn/>");

function selectedOverlay(id: string) {
  const bytes = new TextEncoder().encode(JSON.stringify({
    kind: "bpmnSourceOverlay", id, semanticProfile: "profile", effectBindings: [], inertAttributes: [],
  }));
  return { id, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

for (const [name, id] of [["bare LF", "literal\nID"], ["bare CR", "literal\rID"], ["paired CRLF", "literal\r\nID"], ["BOM and NUL", "\uFEFFliteral\u0000ID"], ["maximum length with LF", "🚀".repeat(255) + "\n"], ["maximum UTF-8 bytes", "🚀".repeat(256)]] as const) {
  test(`browser client forwards literal overlay ID ${name} through the deployment route`, async (context) => {
    const sourceOverlay = selectedOverlay(id);
    const calls: unknown[] = [];
    const refuseServiceEntry = async (): Promise<never> => { assert.fail("transport witness must stop at compiler entry"); };
    const listener = createServer();
    await new Promise<void>((resolve, reject) => {
      listener.once("error", reject);
      listener.listen(0, "127.0.0.1", () => {
        listener.off("error", reject);
        resolve();
      });
    });
    const address = listener.address();
    assert.ok(address !== null && typeof address !== "string");
    await new Promise<void>((resolve, reject) => {
      listener.close((error) => error === undefined ? resolve() : reject(error));
    });
    const port = address.port;
    const origin = `http://127.0.0.1:${port}`;
    const runtime = await createPlatformServer({
      ...readPlatformServerConfig({}), host: "127.0.0.1", port, publicOrigin: origin,
      storageMode: PlatformStorageMode.Shared, postgresqlRuntimeUrl: "postgresql://unused/platform",
      projectionMaxAgeMs: 5_000, maxSourceBytes: 64,
    }, {
      createSharedServer: (config) => createSharedPlatformServer(config, {
        createPostgresqlRuntime: () => ({
          query: refuseServiceEntry, transaction: refuseServiceEntry, withDedicatedSession: refuseServiceEntry,
          databaseClockEpochMs: refuseServiceEntry, close: async () => undefined,
        }),
        // This transport witness stops at compiler entry, before either PostgreSQL or Temporal I/O.
        checkReadiness: async ({ engineRuntime }) => {
          assert.ok("gateway" in engineRuntime);
          const gateway = engineRuntime.gateway;
          assert.ok(gateway !== null && typeof gateway === "object");
          assert.ok("compileDefinition" in gateway && typeof gateway.compileDefinition === "function");
          context.mock.method(gateway, "compileDefinition", async (request: unknown) => {
            calls.push(request);
            throw new Error("compiler witness stops before storage");
          }, {});
        },
      }),
    });
    try {
      assert.equal(await runtime.listen(), origin);
      const client = new DefinitionApiClient(origin, (url, init) => fetch(url, {
        ...init, signal: AbortSignal.timeout(1_000),
      }));
      await assert.rejects(client.deploy({
        bytes: source, sourceId: "source", semanticProfile: "profile",
        sourceOverlay,
      }), DefinitionApiError);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], {
        bytes: source, sourceId: "source", semanticProfile: "profile", expectedSha256: undefined,
        sourceOverlay,
      });
    } finally {
      await runtime.close();
    }
  });
}
