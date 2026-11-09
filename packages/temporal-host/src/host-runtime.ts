/**
 * The client side of one deployment: the process and Schedule ports over one lazily opened Temporal connection.
 * Its declarations name only the ports, so a caller composes a deployment without type-checking the SDK.
 */
import { Client, Connection } from "@temporalio/client";

import { ProcessClient } from "./client.js";
import type { ProcessHost } from "./process-port.js";
import { ScheduleClient } from "./schedule-client.js";
import type { ScheduleHost } from "./schedules.js";

export interface HostClientOptions {
  readonly address: string;
  readonly namespace: string;
  readonly taskQueue: string;
  readonly connectTimeoutMs: number;
}

/** Nothing connects until the first call or `ensureConnected`; `close` is idempotent. */
export interface HostClientRuntime {
  readonly processes: ProcessHost;
  readonly schedules: ScheduleHost;
  ensureConnected(): Promise<void>;
  close(): Promise<void>;
}

export function createHostClientRuntime(options: HostClientOptions): HostClientRuntime {
  const connection = Connection.lazy({ address: options.address, connectTimeout: options.connectTimeoutMs });
  const client = new Client({ connection, namespace: options.namespace });
  let closing: Promise<void> | undefined;
  return {
    processes: new ProcessClient(client, options.taskQueue),
    schedules: new ScheduleClient(client, options.taskQueue),
    ensureConnected: () => connection.ensureConnected(),
    close: () => (closing ??= connection.close()),
  };
}
