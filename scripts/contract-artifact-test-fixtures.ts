/**
 * Typed mutable fixtures and assertions shared by contract boundary tests.
 */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import type {
  ArtifactSet,
} from "./contract-artifacts.ts";

export type DeepMutable<Value> =
  Value extends (...args: never[]) => unknown
    ? Value
    : Value extends readonly [unknown, ...unknown[]]
      ? { -readonly [Key in keyof Value]: DeepMutable<Value[Key]> }
    : Value extends ReadonlyArray<infer Item>
      ? Array<DeepMutable<Item>>
      : Value extends object
        ? { -readonly [Key in keyof Value]: DeepMutable<Value[Key]> }
        : Value;

export type MutableArtifactSet =
  Pick<ArtifactSet, "validator" | "registeredRelationshipIds"> &
  DeepMutable<
    Omit<ArtifactSet, "validator" | "registeredRelationshipIds">
  >;

type IntegerSchemaLocation = Readonly<{
  path: string;
  schema: Readonly<{
    maximum?: unknown;
  }>;
}>;

export function cloneArtifactSet(
  artifactSet: ArtifactSet,
): MutableArtifactSet {
  return {
    ...artifactSet,
    profile: structuredClone(artifactSet.profile),
    profileBytes: Buffer.from(artifactSet.profileBytes),
    scenario: structuredClone(artifactSet.scenario),
    scenarioBytes: Buffer.from(artifactSet.scenarioBytes),
    evidence: structuredClone(artifactSet.evidence),
    bpmnBytes: Buffer.from(artifactSet.bpmnBytes),
  } as MutableArtifactSet;
}

export function bindScenarioBytes(
  artifactSet: MutableArtifactSet,
  scenarioBytes: string | Uint8Array,
): void {
  artifactSet.scenarioBytes = Buffer.from(scenarioBytes);
  artifactSet.evidence.scenario.sha256 = createHash("sha256")
    .update(artifactSet.scenarioBytes)
    .digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function collectIntegerSchemas(
  value: unknown,
  locations: Array<IntegerSchemaLocation> = [],
  path = "$",
): Array<IntegerSchemaLocation> {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectIntegerSchemas(item, locations, `${path}[${index}]`));
    return locations;
  }
  if (isRecord(value)) {
    if (value.type === "integer") {
      locations.push({ path, schema: value });
    }
    for (const [name, item] of Object.entries(value)) {
      collectIntegerSchemas(item, locations, `${path}.${name}`);
    }
  }
  return locations;
}

export function collectPropertyNames(
  value: unknown,
  names = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPropertyNames(item, names);
    }
    return names;
  }
  if (isRecord(value)) {
    for (const [name, item] of Object.entries(value)) {
      names.add(name);
      collectPropertyNames(item, names);
    }
  }
  return names;
}

export function required<Value>(
  value: Value | undefined,
  label: string,
): Value {
  if (value === undefined) {
    throw new Error(`${label} is required`);
  }
  return value;
}

export function requiredAt<Value>(
  values: ReadonlyArray<Value>,
  index: number,
  label: string,
): Value {
  return required(values[index], `${label}[${index}]`);
}

/** A stimulus that names the occurrence it addresses: every kind except `start`. */
export type MutableOccurrenceStimulus = {
  kind: string;
  commandId: string;
  occurrence: { processInstanceId: string; elementId: string; activation: number };
};

export function requireOccurrenceStimulus(
  stimulus: unknown,
): MutableOccurrenceStimulus {
  const candidate = stimulus as Partial<MutableOccurrenceStimulus> | undefined;
  if (candidate?.occurrence === undefined) {
    throw new Error("expected a stimulus that addresses an occurrence");
  }
  return candidate as MutableOccurrenceStimulus;
}

/**
 * The retained User Task discovery set. Mutation tests address it by path, never by position, because the artifact
 * sets are discovered in path order and its second stimulus is the occurrence-addressed completion they mutate.
 */
export const userTaskDiscoveryScenario = "scenarios/user-task-discovery-completion/scenario.json";

export function artifactSetAt(
  artifactSets: ReadonlyArray<ArtifactSet>,
  scenarioRelativePath: string,
): ArtifactSet {
  return required(
    artifactSets.find((artifactSet) => artifactSet.scenarioRelativePath === scenarioRelativePath),
    `artifact set ${scenarioRelativePath}`,
  );
}
