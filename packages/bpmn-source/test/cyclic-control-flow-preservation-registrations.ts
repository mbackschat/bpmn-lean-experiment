import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DeepReadonly } from "@bpmn-lean/semantic-core";

import {
  artifactCases,
  normativeArtifactCases,
} from "../../../scripts/contract-artifact-cases.ts";

/** Resolves current files for registrations that the immutable M2 baseline must continue to cover. */
const projectRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));

export type RegistrationKind =
  | "artifactCase"
  | "normativeArtifactCase"
  | "productExample";

export type PreservationRegistrationBinding = DeepReadonly<{
  kind: RegistrationKind;
  relativePath: string;
  sha256: string;
  sourceRelativePath: string;
  sourceId: string;
  semanticProfile: string;
  profileRelativePath: string;
  sourceSha256: string;
  profileSha256: string;
  catalogKey: string;
}>;

/** Enumerates current registrations without deciding which post-baseline additions are preserved. */
export async function resolveCurrentPreservationRegistrations(): Promise<
  ReadonlyArray<PreservationRegistrationBinding>
> {
  const exampleNames = (await readdir(resolveInside("examples/temporal-mvp")))
    .filter((name) => name.endsWith(".json") && name !== "unsupported.json")
    .sort(compareCodeUnits);
  const registrations = await Promise.all([
    ...artifactCases.map(({ scenarioRelativePath }) =>
      resolveScenarioRegistration("artifactCase", scenarioRelativePath)
    ),
    ...normativeArtifactCases.map(({ scenarioRelativePath }) =>
      resolveScenarioRegistration("normativeArtifactCase", scenarioRelativePath)
    ),
    ...exampleNames.map((name) =>
      resolveProductExampleRegistration(`examples/temporal-mvp/${name}`)
    ),
  ]);
  return registrations.sort((left, right) =>
    compareCodeUnits(
      `${left.kind}:${left.relativePath}`,
      `${right.kind}:${right.relativePath}`,
    )
  );
}

async function resolveScenarioRegistration(
  kind: "artifactCase" | "normativeArtifactCase",
  relativePath: string,
): Promise<PreservationRegistrationBinding> {
  const registrationBytes = await readFile(resolveInside(relativePath));
  const scenario = jsonObject(registrationBytes, relativePath);
  const bpmn = objectValue(scenario.bpmn, `${relativePath}.bpmn`);
  return resolveBinding(
    kind,
    relativePath,
    registrationBytes,
    safeRelativePath(bpmn.relativePath, `${relativePath}.bpmn.relativePath`),
    nonemptyString(bpmn.id, `${relativePath}.bpmn.id`),
    nonemptyString(scenario.profile, `${relativePath}.profile`),
  );
}

async function resolveProductExampleRegistration(
  relativePath: string,
): Promise<PreservationRegistrationBinding> {
  const absolutePath = resolveInside(relativePath);
  const registrationBytes = await readFile(absolutePath);
  const config = jsonObject(registrationBytes, relativePath);
  const bpmn = objectValue(config.bpmn, `${relativePath}.bpmn`);
  const file = nonemptyString(bpmn.file, `${relativePath}.bpmn.file`);
  const sourceAbsolutePath = path.resolve(path.dirname(absolutePath), file);
  return resolveBinding(
    "productExample",
    relativePath,
    registrationBytes,
    relativeInside(sourceAbsolutePath),
    nonemptyString(bpmn.sourceId, `${relativePath}.bpmn.sourceId`),
    nonemptyString(bpmn.semanticProfile, `${relativePath}.bpmn.semanticProfile`),
  );
}

async function resolveBinding(
  kind: RegistrationKind,
  relativePath: string,
  registrationBytes: Uint8Array,
  sourceRelativePath: string,
  sourceId: string,
  semanticProfile: string,
): Promise<PreservationRegistrationBinding> {
  const profileRelativePath = `profiles/${semanticProfile}/profile.json`;
  const [sourceBytes, profileBytes] = await Promise.all([
    readFile(resolveInside(sourceRelativePath)),
    readFile(resolveInside(profileRelativePath)),
  ]);
  return {
    kind,
    relativePath,
    sha256: sha256(registrationBytes),
    sourceRelativePath,
    sourceId,
    semanticProfile,
    profileRelativePath,
    sourceSha256: sha256(sourceBytes),
    profileSha256: sha256(profileBytes),
    catalogKey: keyFor(sourceRelativePath, sourceId, semanticProfile),
  };
}

function jsonObject(bytes: Uint8Array, label: string): Readonly<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return objectValue(parsed, label);
}

function objectValue(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function safeRelativePath(value: unknown, label: string): string {
  const relativePath = nonemptyString(value, label);
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath === ".." ||
    relativePath.startsWith("../")
  ) {
    throw new Error(`${label} must be a normalized project-relative POSIX path`);
  }
  return relativePath;
}

function resolveInside(relativePath: string): string {
  safeRelativePath(relativePath, "relative path");
  const absolutePath = path.resolve(projectRoot, relativePath);
  if (absolutePath !== projectRoot && !absolutePath.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error(`path escapes project root: ${relativePath}`);
  }
  return absolutePath;
}

function relativeInside(absolutePath: string): string {
  const relativePath = path.relative(projectRoot, absolutePath).split(path.sep).join("/");
  safeRelativePath(relativePath, "resolved relative path");
  return relativePath;
}

function keyFor(sourceRelativePath: string, sourceId: string, semanticProfile: string): string {
  return `${sourceRelativePath}::${sourceId}::${semanticProfile}`;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
