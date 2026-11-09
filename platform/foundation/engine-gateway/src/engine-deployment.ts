/**
 * What one deployment's engine is: its profile catalog, the capabilities its Workers serve, and the transport bound of
 * one effect Activity attempt. None of these has a safe default, so the value is required and decoded exactly; the
 * server and the recovery worker read the same environment variable and therefore agree on it.
 */
import { engineHostRefusalCodes, type EngineHostCapability, type EngineServedRequirements } from "@bpmn-lean/engine-api";

import type { ProfileRelations } from "./gateway-context.js";

export type EngineDeployment = Readonly<{
  /** Profile identifier to the relation identifiers it selects; `[]` is the standards reading. */
  profiles: Readonly<Record<string, readonly string[]>>;
  servedRequirements: EngineServedRequirements;
  effectStartToCloseMs: number;
}>;

export const engineDeploymentEnvironmentVariable = "PLATFORM_ENGINE_DEPLOYMENT_JSON";

const capabilities = Object.keys(engineHostRefusalCodes) as EngineHostCapability[];

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function requireKeys(value: Record<string, unknown>, label: string, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} must have exactly the members ${JSON.stringify(expected)}`);
  }
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be a nonempty well-formed string`);
  }
  return value;
}

export function decodeEngineDeployment(value: unknown): EngineDeployment {
  const record = requireRecord(value, "engine deployment");
  requireKeys(record, "engine deployment", ["profiles", "servedRequirements", "effectStartToCloseMs"]);
  const profiles = requireRecord(record.profiles, "engine deployment.profiles");
  const catalog: Record<string, readonly string[]> = {};
  for (const [profileId, relations] of Object.entries(profiles)) {
    requireIdentifier(profileId, "engine deployment profile identifier");
    if (!Array.isArray(relations)) throw new TypeError(`profile ${profileId} relations must be an array`);
    const ids = relations.map((relation) => requireIdentifier(relation, `profile ${profileId} relation`));
    if (new Set(ids).size !== ids.length) throw new TypeError(`profile ${profileId} repeats a relation`);
    catalog[profileId] = ids;
  }
  const served = requireRecord(record.servedRequirements, "engine deployment.servedRequirements");
  requireKeys(served, "engine deployment.servedRequirements", capabilities);
  for (const capability of capabilities) {
    if (typeof served[capability] !== "boolean") {
      throw new TypeError(`engine deployment.servedRequirements.${capability} must be a boolean`);
    }
  }
  const bound = record.effectStartToCloseMs;
  if (typeof bound !== "number" || !Number.isSafeInteger(bound) || bound <= 0) {
    throw new TypeError("engine deployment.effectStartToCloseMs must be a positive safe integer");
  }
  return {
    profiles: catalog,
    servedRequirements: Object.fromEntries(capabilities.map((capability) => [capability, served[capability]])) as
      EngineServedRequirements,
    effectStartToCloseMs: bound,
  };
}

export function readEngineDeploymentEnvironment(environment: Readonly<Record<string, string | undefined>>): EngineDeployment {
  const encoded = environment[engineDeploymentEnvironmentVariable];
  if (encoded === undefined) throw new TypeError(`${engineDeploymentEnvironmentVariable} is required`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    throw new TypeError(`${engineDeploymentEnvironmentVariable} must be strict JSON`);
  }
  return decodeEngineDeployment(parsed);
}

/** The gateway runtime options a deployment determines. */
export function engineDeploymentRuntimeOptions(deployment: EngineDeployment): Readonly<{
  profileRelations: ProfileRelations;
  servedRequirements: EngineServedRequirements;
  effectStartToCloseMs: number;
}> {
  const catalog = new Map(Object.entries(deployment.profiles));
  return {
    profileRelations: (profileId) => catalog.get(profileId) ?? null,
    servedRequirements: { ...deployment.servedRequirements },
    effectStartToCloseMs: deployment.effectStartToCloseMs,
  };
}
