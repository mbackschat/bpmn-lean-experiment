/**
 * Engine deployment of a definition version: the version's admitted program registers with the deployment's population,
 * which numbers it and versions its keys as the kernel deploys (`Kernel.Population.deploy`). Every engine start of the
 * version runs under the deployment the registration answered, and a publication reaches only registered deployments'
 * instances. The registration is keyed by the version's definition identity and its program's digest, so a repeated
 * registration answers as the first and another program under the same identity is refused.
 */
import { canonicalJson, type DeploymentAnswer, type PopulationScope } from "@bpmn-lean/temporal-host/host";

import {
  requireWireString,
  sha256Hex,
  snapshotOverlay,
  snapshotProfile,
  type EngineDefinitionIdentity,
  type EngineFailure,
  type EngineLimits,
  type EngineProfile,
  type EngineSourceOverlaySelection,
} from "./common.js";
import { atVersion, compileProgram, type CompiledDefinition } from "./definition.js";
import { engineDeploymentRequestId, type EngineHost } from "./host.js";

/** A start or publication naming a definition version no registration holds (the kernel's selector refusal). */
export const engineDefinitionNotDeployedCode = "definition-not-deployed";

export enum EngineDeploymentStatus {
  Registered = "registered",
  /** The population refused the registration with the kernel's code (`deployment.messageStartName`) or its own. */
  Refused = "refused",
  IntegrityFailure = "integrityFailure",
}

export enum EngineDeploymentIntegrityCode {
  CompilationRejected = "definitionCompilationRejected",
  IdentityDrift = "definitionIdentityDrift",
}

export type EngineDeploymentRequest = Readonly<{
  host: EngineHost;
  bytes: Uint8Array;
  sourceOverlay?: EngineSourceOverlaySelection | null;
  sourceId: string;
  expectedSha256: string;
  profile: EngineProfile;
  expectedProcessId: string;
  /** The deployed version the platform stored the definition under. */
  version: number;
  limits: EngineLimits;
}>;

/** `deploymentId` is the population's deploy ordinal, `versions` each key's kernel version, `deployedAtMs` its time. */
export type EngineDeploymentResult =
  | Readonly<{
      status: EngineDeploymentStatus.Registered;
      deploymentId: number;
      versions: readonly (readonly [string, number])[];
      deployedAtMs: number;
    }>
  | Readonly<{ status: EngineDeploymentStatus.Refused | EngineDeploymentStatus.IntegrityFailure; failure: EngineFailure }>;

/** Recompiles the stored version, checks it is what the platform stored, and registers it with the population. */
export async function registerEngineDeployment(request: EngineDeploymentRequest): Promise<EngineDeploymentResult> {
  const compiled = await compileStored(request);
  if ("status" in compiled) return compiled;
  const answer = await request.host.population.registerDeployment({
    deploymentRequestId: engineDeploymentRequestId(compiled.compilation.definition),
    digest: sha256Hex(canonicalJson(compiled.program)),
    program: compiled.program,
  });
  if ("refused" in answer) {
    return {
      status: EngineDeploymentStatus.Refused,
      failure: { code: answer.refused, evidence: `The population refused the deployment (${answer.refused}).` },
    };
  }
  return {
    status: EngineDeploymentStatus.Registered,
    deploymentId: answer.deploymentId,
    versions: answer.versions,
    deployedAtMs: answer.deployedAtMs,
  };
}

/** The registered deployment of `definition`, `null` when no registration holds it or the population refused it. */
export async function engineDeployment(host: EngineHost, definition: EngineDefinitionIdentity):
  Promise<Extract<DeploymentAnswer, { readonly deploymentId: number }> | null> {
  const answer = await host.population.deployment(engineDeploymentRequestId(definition));
  return answer === null || "refused" in answer ? null : answer;
}

/** The population scope every start of `definition` runs under, or `definition-not-deployed`. */
export async function engineDeploymentScope(host: EngineHost, definition: EngineDefinitionIdentity):
  Promise<PopulationScope | EngineFailure> {
  const deployment = await engineDeployment(host, definition);
  return deployment === null
    ? { code: engineDefinitionNotDeployedCode, evidence: "No population registration holds the definition version." }
    : { population: host.population.population, deploymentId: deployment.deploymentId };
}

type Failed = Extract<EngineDeploymentResult, { readonly failure: EngineFailure }>;

async function compileStored(request: EngineDeploymentRequest): Promise<CompiledDefinition | Failed> {
  if (!(request.bytes instanceof Uint8Array)) throw new TypeError("bytes must be a Uint8Array");
  const sourceId = requireWireString(request.sourceId, "sourceId");
  const expectedSha256 = requireWireString(request.expectedSha256, "expectedSha256");
  const profile = snapshotProfile(request.profile);
  const expectedProcessId = requireWireString(request.expectedProcessId, "expectedProcessId");
  const read = await compileProgram({
    bytes: Uint8Array.from(request.bytes), sourceId, expectedSha256, profile, sourceOverlay: snapshotOverlay(request.sourceOverlay),
    limits: { maxBytes: request.limits.maxBytes, parserDeadlineMs: request.limits.parserDeadlineMs },
  });
  if (!("program" in read)) {
    return integrityFailure(EngineDeploymentIntegrityCode.CompilationRejected, read.diagnostics[0].evidence);
  }
  const compiled = atVersion(read, request.version);
  const { source, definition } = compiled.compilation;
  if (source.id !== sourceId || source.sha256 !== expectedSha256 || definition.ref.definitionKey !== expectedProcessId ||
      definition.profile !== profile.id) {
    return integrityFailure(EngineDeploymentIntegrityCode.IdentityDrift,
      "Compiled source and definition identity did not match the stored definition version.");
  }
  return compiled;
}

function integrityFailure(code: EngineDeploymentIntegrityCode, evidence: string): Failed {
  return { status: EngineDeploymentStatus.IntegrityFailure, failure: { code, evidence } };
}
