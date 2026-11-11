/**
 * Engine deployment of a definition version: the version's admitted program registers with the deployment's population,
 * which numbers it and versions its keys as the kernel deploys (`Kernel.Population.deploy`). Every engine start of the
 * version runs under the deployment the registration answered, and a publication reaches only registered deployments'
 * instances. The registration is keyed by the version's definition identity and its program's digest, so a repeated
 * registration answers as the first and another program under the same identity is refused.
 */
import { assembleProgram, type KernelJson } from "@bpmn-lean/bpmn-source";
import { admit, decodeProgram } from "@bpmn-lean/kernel";
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
  type JsonValue,
} from "./common.js";
import {
  admitDefinition,
  atVersion,
  compileProgram,
  readDefinition,
  rejected,
  type CompiledDefinition,
  type EngineDefinitionCompilationRequest,
  type EngineDefinitionCompilationResult,
} from "./definition.js";
import { engineDeploymentRequestId, type EngineHost } from "./host.js";

/** A start or publication naming a definition version no registration holds (the kernel's selector refusal). */
export const engineDefinitionNotDeployedCode = "definition-not-deployed";

/**
 * The refusal of a deploying document one of whose Calls only another registered deployment's process answers. The
 * kernel's population binds such a Call (PC-SCOPE-03), but the host compiles each deployment's own document and never
 * assembles another deployment's processes into its program
 * ([#94](https://github.com/mbackschat/bpmn-lean-experiment/issues/94)): a host restriction, not a missing process.
 */
export const engineCrossDeploymentCallCode = "host.call.crossDeployment";

/** The kernel's refusal of a Call no carried process answers: the one refusal assembly with other deployments can lift. */
const calledProcessMissingCode = "work.call.calledProcessMissing";

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

/**
 * Compiles a document for deployment to `host`'s population, as `compileBpmnDefinition` does, except that a document
 * kernel admission refuses as `work.call.calledProcessMissing` is refused as `host.call.crossDeployment` when admission
 * accepts it assembled with the registered deployments' processes (`assembleProgram`). Only an admitted assembly shows
 * that the missing assembly is the one obstacle, so any other answer keeps the kernel's refusal. The assembled program
 * only classifies the refusal: it is never registered or run, and kernel admission stays the one owner of Call resolution.
 */
export async function compileDefinitionForDeployment(
  request: EngineDefinitionCompilationRequest & Readonly<{ host: EngineHost }>,
): Promise<EngineDefinitionCompilationResult> {
  const read = await readDefinition(request);
  if (!("decoded" in read)) return read;
  const admitted = admitDefinition(read);
  if ("program" in admitted) return admitted.compilation;
  if (admitted.diagnostics[0].code !== calledProcessMissingCode || !await admittedWithRegistered(request.host, read.program)) {
    return admitted;
  }
  return rejected(read.source, engineCrossDeploymentCallCode, null,
    "A Call names a process only another registered deployment carries, and the host does not assemble cross-deployment callees.");
}

/**
 * Whether kernel admission accepts `program` assembled, as the population's next deployment, with every registered
 * deployment's processes. A registered program does not carry its root's version tag (the reader returns it beside the
 * program), so a copy of another deployment's root has none, and a Call binding a root by version tag stays refused.
 */
async function admittedWithRegistered(host: EngineHost, program: JsonValue): Promise<boolean> {
  const registered = await host.population.deployments();
  if (registered.length === 0) return false;
  const deploymentId = Math.max(...registered.map((deployment) => deployment.deploymentId)) + 1;
  const assembled = assembleProgram([...registered, { deploymentId, program }].map((deployment) =>
    ({ deploymentId: deployment.deploymentId, program: deployment.program as KernelJson, versionTag: null })), deploymentId);
  const decoded = decodeProgram(JSON.parse(JSON.stringify(assembled)) as JsonValue);
  return decoded.ok && admit(decoded.value) === null;
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
