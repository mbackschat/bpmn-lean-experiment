import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import { NodePlatformServerRuntime } from "../src/runtime.ts";

test("closes every composed owner once and does not connect merely to close", async () => {
  const closed: string[] = [];
  const runtime = new NodePlatformServerRuntime(
    createServer(),
    [
      { close: async () => { closed.push("temporal"); } },
      { close: () => { closed.push("definitions"); } },
    ],
    {
      host: "127.0.0.1",
      port: 3000,
      publicOrigin: "http://127.0.0.1:3000",
    },
  );

  await Promise.all([runtime.close(), runtime.close()]);
  await runtime.close();

  assert.deepEqual(closed, ["definitions", "temporal"]);
});

test("attempts every composed close after one owner fails", async () => {
  const closed: string[] = [];
  const runtime = new NodePlatformServerRuntime(
    createServer(),
    [
      { close: () => { closed.push("temporal"); } },
      {
        close: () => {
          closed.push("definitions");
          throw new Error("definitions close failed");
        },
      },
    ],
    {
      host: "127.0.0.1",
      port: 3000,
      publicOrigin: "http://127.0.0.1:3000",
    },
  );

  await assert.rejects(runtime.close(), /definitions close failed/u);
  assert.deepEqual(closed, ["definitions", "temporal"]);
});
