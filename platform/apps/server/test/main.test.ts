import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import {
  runPlatformServer,
} from "@bpmn-lean/platform-server";
import type {
  PlatformServerLifecycle,
} from "@bpmn-lean/platform-server";

test("closes once and unregisters both signal listeners", async () => {
  const lifecycle = new EventEmitter();
  let closeCalls = 0;
  let resolveClose: (() => void) | null = null;
  const close = new Promise<void>((resolve) => {
    resolveClose = resolve;
  });
  let listening: (() => void) | null = null;
  const started = new Promise<void>((resolve) => {
    listening = resolve;
  });
  const origins: string[] = [];
  const running = runPlatformServer({}, {
    createServer: async () => ({
      listen: async () => {
        listening!();
        return "http://127.0.0.1:3000";
      },
      close: () => {
        closeCalls += 1;
        return close;
      },
    }),
    lifecycle: lifecycle as PlatformServerLifecycle,
    writeOrigin: (origin) => origins.push(origin),
  });

  await started;
  await new Promise((resolve) => setImmediate(resolve));
  lifecycle.emit("SIGTERM");
  lifecycle.emit("SIGINT");
  assert.equal(closeCalls, 1);
  resolveClose!();
  await running;

  assert.deepEqual(origins, ["http://127.0.0.1:3000"]);
  assert.equal(lifecycle.listenerCount("SIGINT"), 0);
  assert.equal(lifecycle.listenerCount("SIGTERM"), 0);
});

test("closes once when listen fails", async () => {
  const lifecycle = new EventEmitter();
  let closeCalls = 0;
  await assert.rejects(runPlatformServer({}, {
    createServer: async () => ({
      listen: async () => {
        throw new Error("listen failed");
      },
      close: async () => {
        closeCalls += 1;
      },
    }),
    lifecycle: lifecycle as PlatformServerLifecycle,
    writeOrigin: () => assert.fail("failed server must not publish an origin"),
  }), /listen failed/u);
  assert.equal(closeCalls, 1);
  assert.equal(lifecycle.listenerCount("SIGINT"), 0);
  assert.equal(lifecycle.listenerCount("SIGTERM"), 0);
});

test("closes when publishing the origin fails", async () => {
  const lifecycle = new EventEmitter();
  let closeCalls = 0;
  await assert.rejects(runPlatformServer({}, {
    createServer: async () => ({
      listen: async () => "http://127.0.0.1:3000",
      close: async () => {
        closeCalls += 1;
      },
    }),
    lifecycle: lifecycle as PlatformServerLifecycle,
    writeOrigin: () => {
      throw new Error("output failed");
    },
  }), /output failed/u);
  assert.equal(closeCalls, 1);
  assert.equal(lifecycle.listenerCount("SIGINT"), 0);
  assert.equal(lifecycle.listenerCount("SIGTERM"), 0);
});
