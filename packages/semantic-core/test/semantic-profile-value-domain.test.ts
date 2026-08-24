import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  SemanticProfileId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type { VariableBinding } from "@bpmn-lean/semantic-core";

const surfaces = [
  "processStart",
  "userTaskCompletion",
  "effectCompletion",
] as const;

type VariableWriteSurface = typeof surfaces[number];

type CompiledValueDomain = Readonly<{
  VariableWriteSurface: Readonly<Record<string, string>>;
  profileAllowsVariableBindings: (
    semanticProfile: string,
    surface: VariableWriteSurface,
    bindings: ReadonlyArray<VariableBinding>,
  ) => boolean;
}>;

type SurfaceCapability = Readonly<{
  kinds: ReadonlyArray<VariableValueKind>;
  features: ReadonlyArray<string>;
}>;

type ProfileCapabilities = Partial<
  Readonly<Record<VariableWriteSurface, SurfaceCapability>>
>;

type LegacyValueDomainDeclaration = Readonly<{
  profile: string;
  surface: VariableWriteSurface;
  readmeLine: string;
}>;

/**
 * The value-domain selector is package-internal. Loading its built module keeps that boundary private
 * while this package-level guard audits every registered profile and external write surface.
 */
async function importCompiledValueDomain(): Promise<CompiledValueDomain> {
  const specifier = new URL(
    "../dist/semantic-profile-value-domain.js",
    import.meta.url,
  ).href;
  const loaded: unknown = await import(specifier);
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    !("VariableWriteSurface" in loaded) ||
    loaded.VariableWriteSurface === null ||
    typeof loaded.VariableWriteSurface !== "object" ||
    !("profileAllowsVariableBindings" in loaded) ||
    typeof loaded.profileAllowsVariableBindings !== "function"
  ) {
    throw new TypeError("the compiled value-domain owner is incomplete");
  }
  return loaded as CompiledValueDomain;
}

function capability(
  kinds: ReadonlyArray<VariableValueKind>,
  ...features: ReadonlyArray<string>
): SurfaceCapability {
  return { kinds, features };
}

const stringNull = [
  VariableValueKind.String,
  VariableValueKind.Null,
] as const;

const stringNullBoolean = [
  ...stringNull,
  VariableValueKind.Boolean,
] as const;

const expectedCapabilities = new Map<string, ProfileCapabilities>([
  [SemanticProfileId.SequentialMultiInstanceUserTask, {
    processStart: capability(
      [VariableValueKind.StringList],
      "process-start-ordered-string-list-data",
    ),
    userTaskCompletion: capability(
      [VariableValueKind.String],
      "user-task-string-completion-data",
    ),
  }],
  [SemanticProfileId.MappedSuccessServiceTask, {
    effectCompletion: capability(
      [VariableValueKind.String],
    ),
  }],
  [SemanticProfileId.MappedBoundaryErrorServiceTask, {
    effectCompletion: capability(
      stringNull,
    ),
  }],
  [SemanticProfileId.ExclusiveGatewaySimpleBoolean, {
    processStart: capability(stringNull),
  }],
  [SemanticProfileId.InclusiveGatewaySelectedBranches, {
    processStart: capability(stringNull),
  }],
  [SemanticProfileId.ServiceTaskIncidentCancellation, {
    processStart: capability(
      [VariableValueKind.String],
      "string-process-start-variable",
    ),
  }],
  [SemanticProfileId.UserTask, {
    processStart: capability(stringNull, "process-start-string-null-data"),
    userTaskCompletion: capability(
      stringNull,
      "user-task-string-null-completion-data",
    ),
  }],
  [SemanticProfileId.UserTaskProcessDataPreservedNotation, {
    processStart: capability(stringNull, "process-start-string-null-data"),
    userTaskCompletion: capability(
      stringNull,
      "user-task-string-null-completion-data",
    ),
  }],
  [SemanticProfileId.UserTaskCycle, {
    userTaskCompletion: capability(
      stringNull,
      "user-task-string-null-completion-data",
    ),
  }],
  [SemanticProfileId.UserTaskBooleanCompletionData, {
    processStart: capability(stringNull, "process-start-string-null-data"),
    userTaskCompletion: capability(
      stringNullBoolean,
      "user-task-string-null-boolean-completion-data",
    ),
  }],
  [SemanticProfileId.UserTaskAssignmentFormMetadata, {
    processStart: capability(stringNull, "process-start-string-null-data"),
    userTaskCompletion: capability(
      stringNullBoolean,
      "user-task-string-null-boolean-completion-data",
    ),
  }],
  [SemanticProfileId.ParallelUserTaskAssignmentFormMetadata, {
    userTaskCompletion: capability(
      stringNullBoolean,
      "user-task-string-null-boolean-completion-data",
    ),
  }],
  [SemanticProfileId.StructuredHumanWork, {
    processStart: capability(stringNull, "process-start-string-null-data"),
    userTaskCompletion: capability(
      Object.values(VariableValueKind),
      "user-task-string-null-boolean-completion-data",
      "user-task-integer-completion-data",
      "user-task-ordered-string-list-completion-data",
    ),
  }],
]);

const legacyValueDomainDeclarations: ReadonlyArray<LegacyValueDomainDeclaration> = [
  {
    profile: SemanticProfileId.MappedSuccessServiceTask,
    surface: "effectCompletion",
    readmeLine:
      "External value-domain declaration: `effectCompletion = String`.",
  },
  {
    profile: SemanticProfileId.MappedBoundaryErrorServiceTask,
    surface: "effectCompletion",
    readmeLine:
      "External value-domain declaration: `effectCompletion = String | Null`.",
  },
  {
    profile: SemanticProfileId.ExclusiveGatewaySimpleBoolean,
    surface: "processStart",
    readmeLine:
      "External value-domain declaration: `processStart = String | Null`.",
  },
  {
    profile: SemanticProfileId.InclusiveGatewaySelectedBranches,
    surface: "processStart",
    readmeLine:
      "External value-domain declaration: `processStart = String | Null`.",
  },
];

function declarationKey(
  declaration: Pick<LegacyValueDomainDeclaration, "profile" | "surface">,
): string {
  return `${declaration.profile}:${declaration.surface}`;
}

const legacyDeclarationKeys = new Set(
  legacyValueDomainDeclarations.map(declarationKey),
);

const bindings = new Map<VariableValueKind, VariableBinding>([
  [VariableValueKind.Boolean, {
    name: "candidate",
    value: { kind: VariableValueKind.Boolean, value: true },
  }],
  [VariableValueKind.Integer, {
    name: "candidate",
    value: { kind: VariableValueKind.Integer, value: 1 },
  }],
  [VariableValueKind.String, {
    name: "candidate",
    value: { kind: VariableValueKind.String, value: "value" },
  }],
  [VariableValueKind.StringList, {
    name: "candidate",
    value: { kind: VariableValueKind.StringList, value: ["value"] },
  }],
  [VariableValueKind.Null, {
    name: "candidate",
    value: { kind: VariableValueKind.Null },
  }],
]);

async function profileArtifactSource(profile: string): Promise<Buffer> {
  return readFile(
    new URL(`../../../profiles/${profile}/profile.json`, import.meta.url),
  );
}

async function profileFeatures(profile: string): Promise<ReadonlyArray<string>> {
  const source = await profileArtifactSource(profile);
  const artifact: unknown = JSON.parse(source.toString("utf8"));
  if (
    artifact === null ||
    typeof artifact !== "object" ||
    !("id" in artifact) ||
    artifact.id !== profile ||
    !("bpmn" in artifact) ||
    artifact.bpmn === null ||
    typeof artifact.bpmn !== "object" ||
    !("features" in artifact.bpmn) ||
    !Array.isArray(artifact.bpmn.features) ||
    !artifact.bpmn.features.every((feature) => typeof feature === "string")
  ) {
    throw new TypeError(`invalid semantic-profile artifact ${profile}`);
  }
  return artifact.bpmn.features;
}

async function frozenProfileDigests(): Promise<ReadonlyMap<string, string>> {
  const source = await readFile(
    new URL(
      "../../bpmn-source/test/fixtures/cyclic-control-flow-baseline.json",
      import.meta.url,
    ),
    "utf8",
  );
  const parsed: unknown = JSON.parse(source);
  assert.ok(
    parsed !== null &&
      typeof parsed === "object" &&
      "registrations" in parsed &&
      Array.isArray(parsed.registrations),
  );
  const digests = new Map<string, string>();
  for (const registration of parsed.registrations) {
    if (
      registration === null ||
      typeof registration !== "object" ||
      !("semanticProfile" in registration) ||
      typeof registration.semanticProfile !== "string" ||
      !("profileSha256" in registration) ||
      typeof registration.profileSha256 !== "string"
    ) {
      continue;
    }
    const existing = digests.get(registration.semanticProfile);
    assert.ok(
      existing === undefined || existing === registration.profileSha256,
      `inconsistent frozen digest for ${registration.semanticProfile}`,
    );
    digests.set(registration.semanticProfile, registration.profileSha256);
  }
  return digests;
}

function assertLegacyValueDomainDeclarations(
  declarations: ReadonlyArray<LegacyValueDomainDeclaration>,
  baselineDigests: ReadonlyMap<string, string>,
  artifactDigests: ReadonlyMap<string, string>,
  readmes: ReadonlyMap<string, string>,
): void {
  assert.equal(declarations.length, 4, "exactly four legacy declarations");
  assert.equal(
    new Set(declarations.map(declarationKey)).size,
    declarations.length,
    "legacy declarations must be unique",
  );
  for (const declaration of declarations) {
    const frozenDigest = baselineDigests.get(declaration.profile);
    assert.ok(
      frozenDigest !== undefined,
      `${declaration.profile} must be present in the frozen baseline`,
    );
    assert.equal(
      artifactDigests.get(declaration.profile),
      frozenDigest,
      `${declaration.profile} must retain its frozen artifact bytes`,
    );
    assert.ok(
      readmes.get(declaration.profile)?.split("\n").includes(
        declaration.readmeLine,
      ) ?? false,
      `${declaration.profile} must retain its exact README declaration`,
    );
  }
}

async function liveLegacyDeclarationEvidence(): Promise<Readonly<{
  baselineDigests: ReadonlyMap<string, string>;
  artifactDigests: ReadonlyMap<string, string>;
  readmes: ReadonlyMap<string, string>;
}>> {
  const artifactDigests = new Map<string, string>();
  const readmes = new Map<string, string>();
  await Promise.all(legacyValueDomainDeclarations.map(async ({ profile }) => {
    const [artifact, readme] = await Promise.all([
      profileArtifactSource(profile),
      readFile(
        new URL(`../../../profiles/${profile}/README.md`, import.meta.url),
        "utf8",
      ),
    ]);
    artifactDigests.set(
      profile,
      createHash("sha256").update(artifact).digest("hex"),
    );
    readmes.set(profile, readme);
  }));
  return {
    baselineDigests: await frozenProfileDigests(),
    artifactDigests,
    readmes,
  };
}

test("closes every registered profile and write surface over the exact typed value domain", async () => {
  const compiled = await importCompiledValueDomain();
  assert.deepEqual(Object.values(compiled.VariableWriteSurface), surfaces);

  for (const profile of Object.values(SemanticProfileId)) {
    const expected = expectedCapabilities.get(profile) ?? {};
    for (const surface of surfaces) {
      assert.equal(
        compiled.profileAllowsVariableBindings(profile, surface, []),
        true,
        `${profile} ${surface} must admit the empty patch`,
      );
      for (const kind of Object.values(VariableValueKind)) {
        const binding = bindings.get(kind);
        assert.ok(binding !== undefined);
        assert.equal(
          compiled.profileAllowsVariableBindings(profile, surface, [binding]),
          expected[surface]?.kinds.includes(kind) ?? false,
          `${profile} ${surface} ${kind}`,
        );
      }
    }
  }
});

test("fails closed for unknown profiles and requires every nonempty cell's declaration", async () => {
  const compiled = await importCompiledValueDomain();
  for (const surface of surfaces) {
    assert.equal(
      compiled.profileAllowsVariableBindings("unknown-profile", surface, []),
      false,
    );
    assert.equal(
      compiled.profileAllowsVariableBindings(
        "unknown-profile",
        surface,
        [bindings.get(VariableValueKind.String)!],
      ),
      false,
    );
  }
  assert.equal(
    compiled.profileAllowsVariableBindings(
      SemanticProfileId.UserTask,
      "unknown-surface" as VariableWriteSurface,
      [],
    ),
    false,
  );

  for (const [profile, capabilityBySurface] of expectedCapabilities) {
    const features = await profileFeatures(profile);
    for (const surface of surfaces) {
      const declared = capabilityBySurface[surface];
      if (declared === undefined) {
        continue;
      }
      const legacy = legacyDeclarationKeys.has(declarationKey({
        profile,
        surface,
      }));
      assert.equal(
        declared.features.length === 0,
        legacy,
        `${profile} ${surface} must use exactly one declaration strategy`,
      );
      for (const feature of declared.features) {
        assert.ok(
          features.includes(feature),
          `${profile} ${surface} must declare ${feature}`,
        );
      }
    }
  }
});

test("binds exactly four legacy declarations to frozen artifact bytes and exact README lines", async () => {
  const evidence = await liveLegacyDeclarationEvidence();
  assertLegacyValueDomainDeclarations(
    legacyValueDomainDeclarations,
    evidence.baselineDigests,
    evidence.artifactDigests,
    evidence.readmes,
  );
});

test("rejects every legacy declaration drift class", async () => {
  const evidence = await liveLegacyDeclarationEvidence();
  const first = legacyValueDomainDeclarations[0]!;

  assert.throws(() => assertLegacyValueDomainDeclarations(
    legacyValueDomainDeclarations,
    evidence.baselineDigests,
    new Map(evidence.artifactDigests).set(first.profile, "0".repeat(64)),
    evidence.readmes,
  ), /frozen artifact bytes/u);
  assert.throws(() => assertLegacyValueDomainDeclarations(
    legacyValueDomainDeclarations,
    evidence.baselineDigests,
    evidence.artifactDigests,
    new Map(evidence.readmes).set(first.profile, ""),
  ), /exact README declaration/u);
  assert.throws(() => assertLegacyValueDomainDeclarations(
    legacyValueDomainDeclarations,
    evidence.baselineDigests,
    evidence.artifactDigests,
    new Map(evidence.readmes).set(
      first.profile,
      `${first.readmeLine} changed`,
    ),
  ), /exact README declaration/u);
  assert.throws(() => assertLegacyValueDomainDeclarations(
    [...legacyValueDomainDeclarations, {
      profile: SemanticProfileId.UserTask,
      surface: "processStart",
      readmeLine: "External value-domain declaration: `processStart = String`.",
    }],
    evidence.baselineDigests,
    evidence.artifactDigests,
    evidence.readmes,
  ), /exactly four/u);
  assert.throws(() => assertLegacyValueDomainDeclarations(
    [{
      ...first,
      profile: "not-in-the-frozen-baseline",
    }, ...legacyValueDomainDeclarations.slice(1)],
    evidence.baselineDigests,
    evidence.artifactDigests,
    evidence.readmes,
  ), /present in the frozen baseline/u);
});

test("does not inherit String or Null writes into preservation and composition profiles", async () => {
  const compiled = await importCompiledValueDomain();
  for (const profile of [
    SemanticProfileId.UserTaskPreservedNotation,
    SemanticProfileId.TimerUserTaskComposition,
  ]) {
    for (const surface of ["processStart", "userTaskCompletion"] as const) {
      for (const kind of [VariableValueKind.String, VariableValueKind.Null]) {
        const binding = bindings.get(kind);
        assert.ok(binding !== undefined);
        assert.equal(
          compiled.profileAllowsVariableBindings(profile, surface, [binding]),
          false,
          `${profile} ${surface} ${kind}`,
        );
      }
    }
  }
});
