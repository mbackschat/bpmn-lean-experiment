/**
 * Test support for Product 2's compositions: an engine host runtime whose processes, population and Schedules run
 * in-process on the kernel (`@bpmn-lean/engine-api/testing`), so a composition deploys and starts definitions without a
 * Temporal server.
 */
import { createMemoryEngineHost, type MemoryEngineHostOptions } from "@bpmn-lean/engine-api/testing";

import type { EngineHostRuntime } from "@bpmn-lean/engine-api";

/** An in-process engine host runtime; it opens no connection, so `ensureConnected` and `close` do nothing. */
export function createMemoryEngineHostRuntime(options: MemoryEngineHostOptions = {}): EngineHostRuntime {
  return {
    host: createMemoryEngineHost(options),
    ensureConnected: async () => undefined,
    close: async () => undefined,
  };
}
