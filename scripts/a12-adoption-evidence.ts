import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import type {
  AcceptedBpmnCompilation,
  BpmnCompilationResult,
} from "../packages/bpmn-source/src/index.ts";
import type {
  Scenario,
} from "../packages/semantic-core/src/index.ts";

import { parseStrictJson } from "./strict-json.ts";
import { verifyA12LegacyManifest } from "./a12-preservation.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const legacyExportRoot = process.argv[2];
if (legacyExportRoot === undefined) {
  throw new TypeError(
    "usage: node scripts/a12-adoption-evidence.ts <isolated-legacy-export-root>",
  );
}

const legacyTarget = "02330ad0f980a5fc282cc0aa93600a9632b86c3e";
const limits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

const adoptionCases = [
  {
    name: "create-document",
    legacyScenario:
      "adoption/a12/legacy/source-tree/scenarios/create-document-data/scenario.json",
    legacyEvidence:
      "adoption/a12/legacy/source-tree/scenarios/create-document-data/cibseven-evidence.json",
    currentScenario: "adoption/a12/current/create-document/scenario.json",
    currentEvidence:
      "adoption/a12/current/create-document/cibseven-evidence.json",
    currentOverlay: "adoption/a12/current/create-document.overlay.json",
    currentProfile:
      "profiles/cibseven-2.0.0-mapped-success-service-task-draft/profile.json",
  },
  {
    name: "boundary-error",
    legacyScenario:
      "adoption/a12/legacy/source-tree/scenarios/boundary-error/scenario.json",
    legacyEvidence:
      "adoption/a12/legacy/source-tree/scenarios/boundary-error/cibseven-evidence.json",
    currentScenario: "adoption/a12/current/boundary-error/scenario.json",
    currentEvidence:
      "adoption/a12/current/boundary-error/cibseven-evidence.json",
    currentOverlay: "adoption/a12/current/boundary-error.overlay.json",
    currentProfile:
      "profiles/cibseven-2.0.0-mapped-boundary-error-service-task-draft/profile.json",
  },
] as const;

await verifyA12LegacyManifest(projectRoot);
await verifyGeneratedCurrentEvidence();
const validate = await currentValidators();
const currentCompiler = await loadCompiler(projectRoot);
const currentRuntime = await loadRuntime(projectRoot);
const legacyCompiler = await loadCompiler(legacyExportRoot);
const legacyRuntime = await loadRuntime(legacyExportRoot);

for (const adoptionCase of adoptionCases) {
  const [
    legacyScenarioDocument,
    legacyEvidenceDocument,
    currentScenarioDocument,
    currentEvidenceDocument,
    overlayDocument,
    profileDocument,
  ] = await Promise.all([
    readJson<Scenario>(adoptionCase.legacyScenario),
    readJson<Record<string, unknown>>(adoptionCase.legacyEvidence),
    readJson<Scenario>(adoptionCase.currentScenario),
    readJson<Record<string, unknown>>(adoptionCase.currentEvidence),
    readJson<OverlayArtifact>(adoptionCase.currentOverlay),
    readJson<ProfileArtifact>(adoptionCase.currentProfile),
  ]);
  validate("scenario", currentScenarioDocument.value);
  validate("evidence", currentEvidenceDocument.value);
  validate("overlay", overlayDocument.value);
  validate("profile", profileDocument.value);

  const legacyScenario = legacyScenarioDocument.value;
  const currentScenario = currentScenarioDocument.value;
  const overlayIdentity = currentScenario.bpmn.sourceOverlay;
  if (overlayIdentity === null) {
    throw new Error(`${adoptionCase.name}: current scenario omitted its overlay identity`);
  }
  assert.equal(currentScenario.profile, profileDocument.value.id);
  assert.equal(overlayDocument.value.id, overlayIdentity.id);
  assert.equal(overlayDocument.value.semanticProfile, currentScenario.profile);
  assert.equal(sha256(overlayDocument.bytes), overlayIdentity.sha256);

  const [legacySourceBytes, currentSourceBytes] = await Promise.all([
    readRelative(
      `adoption/a12/legacy/source-tree/${legacyScenario.bpmn.relativePath}`,
    ),
    readRelative(currentScenario.bpmn.relativePath),
  ]);
  assert.ok(
    legacySourceBytes.equals(currentSourceBytes),
    `${adoptionCase.name}: frozen and current project-authored BPMN bytes differ`,
  );

  const [legacyCompilation, currentCompilation] = await Promise.all([
    legacyCompiler.compileBpmnToSemanticProcess({
      bytes: legacySourceBytes,
      sourceId: legacyScenario.bpmn.id,
      expectedSha256: legacyScenario.bpmn.sha256,
      semanticProfile: legacyScenario.profile,
      limits,
    }),
    currentCompiler.compileBpmnToSemanticProcess({
      bytes: currentSourceBytes,
      sourceId: currentScenario.bpmn.id,
      expectedSha256: currentScenario.bpmn.sha256,
      semanticProfile: currentScenario.profile,
      sourceOverlay: {
        id: overlayIdentity.id,
        sha256: overlayIdentity.sha256,
        bytes: overlayDocument.bytes,
      },
      limits,
    }),
  ]);
  const legacyAccepted = requireAccepted(
    legacyCompilation,
    `${adoptionCase.name} legacy compilation`,
  );
  const currentAccepted = requireAccepted(
    currentCompilation,
    `${adoptionCase.name} current compilation`,
  );
  const identityTranslation = {
    semanticProfile: currentScenario.profile,
    sourceOverlay: overlayIdentity,
  };
  assert.deepEqual(
    currentAccepted.checkedProcess,
    translateLegacyIdentity(
      legacyAccepted.checkedProcess,
      identityTranslation,
    ),
    `${adoptionCase.name}: checked graph changed outside the declared identity translation`,
  );
  assert.deepEqual(
    currentAccepted.semanticProcess,
    translateLegacyIdentity(
      legacyAccepted.semanticProcess,
      identityTranslation,
    ),
    `${adoptionCase.name}: Semantic Process changed outside the declared identity translation`,
  );

  assertEvidenceEnvelope(
    currentEvidenceDocument.value,
    currentScenario,
    currentScenarioDocument.bytes,
    profileDocument.value,
    profileDocument.bytes,
  );
  assert.deepEqual(
    withoutIdentityEnvelope(currentEvidenceDocument.value),
    withoutIdentityEnvelope(legacyEvidenceDocument.value),
    `${adoptionCase.name}: CIB host evidence changed outside the declared identity translation`,
  );
  const runtimeResult = currentRuntime.runScenario(
    currentScenario,
    currentAccepted.semanticProcess,
  );
  const legacyRuntimeResult = legacyRuntime.runScenario(
    legacyScenario,
    legacyAccepted.semanticProcess,
  );
  assert.deepEqual(
    runtimeResult,
    legacyRuntimeResult,
    `${adoptionCase.name}: semantic-core observations changed outside the declared identity translation`,
  );
}

console.log(
  `A12_ADOPTION_EVIDENCE_OK target=${legacyTarget} cases=${adoptionCases.length}`,
);

type JsonDocument<Value> = Readonly<{
  bytes: Buffer;
  value: Value;
}>;

type OverlayArtifact = Readonly<{
  id: string;
  semanticProfile: string;
}>;

type ProfileArtifact = Readonly<{
  id: string;
}>;

type LegacyCompiler = Readonly<{
  compileBpmnToSemanticProcess: (
    request: Readonly<{
      bytes: Uint8Array;
      sourceId: string;
      expectedSha256: string | undefined;
      semanticProfile: string;
      sourceOverlay?: Readonly<{
        id: string;
        sha256: string;
        bytes: Uint8Array;
      }> | null;
      limits: Readonly<{ maxBytes: number; parserDeadlineMs: number }>;
    }>,
  ) => Promise<BpmnCompilationResult>;
}>;

type LegacyRuntime = Readonly<{
  runScenario: (
    scenario: Scenario,
    semanticProcess: unknown,
  ) => unknown;
}>;

type IdentityTranslation = Readonly<{
  semanticProfile: string;
  sourceOverlay: Exclude<Scenario["bpmn"]["sourceOverlay"], null>;
}>;

async function verifyGeneratedCurrentEvidence(): Promise<void> {
  execFileSync(
    process.execPath,
    ["scripts/replace-a12-adoption-evidence.ts"],
    { cwd: projectRoot, stdio: "inherit" },
  );
}

async function currentValidators(): Promise<(
  kind: "scenario" | "evidence" | "overlay" | "profile",
  value: unknown,
) => void> {
  const schemaNames = [
    "scenario.schema.json",
    "canonical-result.schema.json",
    "semantic-profile.schema.json",
    "bpmn-source-overlay.schema.json",
    "cibseven-evidence.schema.json",
  ] as const;
  const validator = new Ajv2020({
    allErrors: true,
    strict: true,
    strictTuples: false,
  });
  for (const schemaName of schemaNames) {
    validator.addSchema(
      (await readJson<Record<string, unknown>>(
        `contracts/schemas/${schemaName}`,
      )).value,
    );
  }
  const schemaIds = {
    scenario: "https://bpmn-lean.local/schemas/scenario.schema.json",
    evidence: "https://bpmn-lean.local/schemas/cibseven-evidence.schema.json",
    overlay: "https://bpmn-lean.local/schemas/bpmn-source-overlay.schema.json",
    profile: "https://bpmn-lean.local/schemas/semantic-profile.schema.json",
  } as const;
  return (kind, value) => {
    const validate = validator.getSchema(schemaIds[kind]);
    assert.notEqual(validate, undefined);
    if (validate?.(value) !== true) {
      throw new Error(
        `${kind} schema validation failed: ${JSON.stringify(validate?.errors)}`,
      );
    }
  };
}

async function loadCompiler(root: string): Promise<LegacyCompiler> {
  const modulePath = path.join(root, "packages/bpmn-source/dist/index.js");
  const loaded = await import(pathToFileURL(modulePath).href) as Partial<LegacyCompiler>;
  if (typeof loaded.compileBpmnToSemanticProcess !== "function") {
    throw new TypeError(`legacy compiler export is absent at ${modulePath}`);
  }
  return loaded as LegacyCompiler;
}

async function loadRuntime(root: string): Promise<LegacyRuntime> {
  const modulePath = path.join(root, "packages/semantic-core/dist/index.js");
  const loaded = await import(pathToFileURL(modulePath).href) as Partial<LegacyRuntime>;
  if (typeof loaded.runScenario !== "function") {
    throw new TypeError(`legacy semantic-core export is absent at ${modulePath}`);
  }
  return loaded as LegacyRuntime;
}

function requireAccepted(
  compilation: BpmnCompilationResult,
  label: string,
): AcceptedBpmnCompilation {
  if (compilation.status !== "accepted") {
    throw new Error(`${label} rejected: ${JSON.stringify(compilation.diagnostics)}`);
  }
  return compilation;
}

function translateLegacyIdentity<T extends { readonly identity: object }>(
  value: T,
  translation: IdentityTranslation,
): T {
  return {
    ...structuredClone(value),
    identity: {
      ...value.identity,
      semanticProfile: translation.semanticProfile,
      sourceOverlay: translation.sourceOverlay,
    },
  } as T;
}

function assertEvidenceEnvelope(
  evidence: Record<string, unknown>,
  scenario: Scenario,
  scenarioBytes: Uint8Array,
  profile: ProfileArtifact,
  profileBytes: Uint8Array,
): void {
  assert.deepEqual(evidence["scenario"], {
    id: scenario.id,
    sha256: sha256(scenarioBytes),
  });
  assert.deepEqual(evidence["profile"], {
    id: profile.id,
    sha256: sha256(profileBytes),
  });
}

function withoutIdentityEnvelope(
  evidence: Record<string, unknown>,
): Record<string, unknown> {
  const copy = structuredClone(evidence);
  delete copy["scenario"];
  delete copy["profile"];
  return copy;
}

async function readJson<Value>(relativePath: string): Promise<JsonDocument<Value>> {
  const bytes = await readRelative(relativePath);
  return {
    bytes,
    value: parseStrictJson<Value>(bytes.toString("utf8"), relativePath),
  };
}

function readRelative(relativePath: string): Promise<Buffer> {
  return readFile(path.join(projectRoot, relativePath));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
