/** Fixtures for the engine API's tests: retained scenario models read as exact bytes, and profiles as data. */
import { readFile } from "node:fs/promises";

import {
  EngineDeploymentStatus,
  registerEngineDeployment,
  type EngineDeploymentRequest,
  type EngineProfile,
  type EngineServedRequirements,
} from "@bpmn-lean/engine-api";
import { createMemoryEngineHost, servesEverything, type MemoryEngineHost } from "@bpmn-lean/engine-api/testing";

export { pendingSchedule, servesEverything } from "@bpmn-lean/engine-api/testing";

export const limits = { maxBytes: 1_048_576, parserDeadlineMs: 1_000 } as const;

/** The standards reading: no CIB relation selected. */
export const standardProfile: EngineProfile = { id: "test-standard", relations: [] };

/** A technical failure raises an incident that Retry or Cancel resolves (CIB-EXT-0013, CIB-OP-0009). */
export const incidentProfile: EngineProfile = { id: "test-incident", relations: ["CIB-EXT-0013", "CIB-OP-0009"] };

export async function scenarioBytes(relativePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL(`../../../scenarios/${relativePath}`, import.meta.url)));
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type TestHost = MemoryEngineHost;

/** A memory host whose Workflow time is `now`, 1,000 ms unless a test moves it. */
export function testHost(served: EngineServedRequirements = servesEverything, now: () => number = () => 1_000): TestHost {
  return createMemoryEngineHost({ served, taskQueue: "engine-test", now });
}

/** `request` once the definition version it names is registered with its host's population, as Product 2 deploys. */
export async function deployed<R extends EngineDeploymentRequest>(request: R): Promise<R> {
  const result = await registerEngineDeployment(request);
  if (result.status !== EngineDeploymentStatus.Registered) throw new Error(`deployment refused: ${result.failure.code}`);
  return request;
}
