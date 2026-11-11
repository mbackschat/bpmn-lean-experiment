/** Fixtures for the gateway's tests: retained scenario models read as exact bytes, a profile catalog as data. */
import { readFile } from "node:fs/promises";

import { createMemoryEngineHost, type MemoryEngineHost } from "@bpmn-lean/engine-api/testing";
import {
  DefinitionRegistrationStatus,
  gatewayContext,
  type DefinitionVersionRegistrar,
  type DefinitionVersionRegistrationRequest,
  type GatewayContext,
  type ProfileRelations,
} from "@bpmn-lean/platform-engine-gateway";

export const limits = { maxSourceBytes: 1_048_576, parserDeadlineMs: 1_000 } as const;

export const standardProfile = "test-standard";
export const incidentProfile = "test-incident";
/** Modeled key correlation, executed under the standards reading (CIB-LIM-0002). */
export const correlationProfile = "test-correlation";

/**
 * The deployment's catalog: the standards reading, and one where a technical failure raises an incident that Retry or
 * Cancel resolves (CIB-EXT-0013, CIB-OP-0009).
 */
const catalog: ReadonlyMap<string, readonly string[]> = new Map([
  [standardProfile, []],
  [incidentProfile, ["CIB-EXT-0013", "CIB-OP-0009"]],
  [correlationProfile, ["CIB-AGR-0001", "CIB-OP-0001", "CIB-LIM-0002"]],
]);

export const profileRelations: ProfileRelations = (profileId) => catalog.get(profileId) ?? null;

export async function scenarioBytes(relativePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL(`../../../../scenarios/${relativePath}`, import.meta.url)));
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function testHost(): MemoryEngineHost {
  return createMemoryEngineHost({ taskQueue: "gateway-test", now: () => 1_000 });
}

export function testContext(host: MemoryEngineHost): GatewayContext {
  return gatewayContext(limits, host, profileRelations);
}

/** Registers a stored definition version with the engine, as Product 2 does when it deploys the version. */
export async function register(registrar: DefinitionVersionRegistrar, request: DefinitionVersionRegistrationRequest): Promise<void> {
  const result = await registrar.registerDefinitionVersion(request);
  if (result.status !== DefinitionRegistrationStatus.Registered) throw new Error(`registration refused: ${result.failure.code}`);
}
