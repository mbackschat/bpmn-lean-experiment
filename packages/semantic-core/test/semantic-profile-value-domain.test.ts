import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID,
  SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID,
  SemanticProfileId,
  VariableValueKind,
  initialState,
  isVariablePatch,
  runtimeStateCarriesOnlyProfilePortableValues,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, VariableBinding } from "@bpmn-lean/semantic-core";

const surfaces = [
  "processStart",
  "userTaskCompletion",
  "effectCompletion",
] as const;

test("registers Activity boundary Message for ordinary product admission", () => {
  assert.equal(
    Reflect.get(SemanticProfileId, "ActivityBoundaryMessage"),
    "bpmn-2.0.2-activity-boundary-message-draft",
  );
});

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

// SingletonBusinessItem at kind level; the 1,024-byte root String bound is a value rule the kind table cannot express.
const singletonBusinessItem = [
  ...stringNullBoolean,
  VariableValueKind.Integer,
  VariableValueKind.Decimal,
  VariableValueKind.Map,
] as const;

const expectedCapabilities = new Map<string, ProfileCapabilities>([
  [SemanticProfileId.PortableBusinessValuesHandoff, {
    processStart: capability(singletonBusinessItem, "process-start-singleton-business-item-data"),
    userTaskCompletion: capability(singletonBusinessItem, "user-task-singleton-business-item-completion-data"),
  }],
  [SemanticProfileId.PortableBusinessEffectData, {
    processStart: capability(stringNull, "process-start-string-null-data"),
    effectCompletion: capability(singletonBusinessItem, "exact-singleton-business-item-local-result-patch"),
  }],
  [SemanticProfileId.StructuredProcessComposition, {
    processStart: capability(stringNull, "process-start-string-null-data"),
    userTaskCompletion: capability(stringNull, "user-task-string-null-completion-data"),
  }],
  [SemanticProfileId.SerialBusinessTaskComposition, {
    processStart: capability(stringNull, "process-start-string-null-data"),
    userTaskCompletion: capability(stringNull, "user-task-string-null-completion-data"),
    effectCompletion: capability(stringNull, "exact-string-null-local-result-patch"),
  }],
  [SemanticProfileId.MixedTaskControlFlow, {
    processStart: capability(stringNull, "process-start-string-null-data"),
    userTaskCompletion: capability(stringNull, "user-task-string-null-completion-data"),
    effectCompletion: capability(stringNull, "exact-string-null-local-result-patch"),
  }],
  [SemanticProfileId.MixedTaskBusinessError, {
    processStart: capability(stringNull, "process-start-string-null-data"),
    userTaskCompletion: capability(stringNull, "user-task-string-null-completion-data"),
    effectCompletion: capability(stringNull, "exact-string-null-local-result-patch"),
  }],
  [SemanticProfileId.CallActivityDataBoundaries, {
    processStart: capability(stringNull, "process-start-string-null-data"),
    userTaskCompletion: capability(stringNull, "user-task-string-null-completion-data"),
  }],
  [SemanticProfileId.Compensation, {
    processStart: capability([VariableValueKind.String], "process-start-string-variable"),
  }],
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
  [SemanticProfileId.ParallelMultiInstanceUserTask, {
    processStart: capability(
      [VariableValueKind.String, VariableValueKind.StringList],
      "process-start-string-variable",
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
  [SemanticProfileId.ActivityDataInputUserTask, {
    processStart: capability(stringNull, "process-start-string-null-data"),
  }],
  [SemanticProfileId.ActivityDataInputOutputUserTask, {
    processStart: capability(stringNull, "process-start-string-null-data"),
    userTaskCompletion: capability(stringNull, "user-task-string-null-completion-data"),
  }],
  [SemanticProfileId.ActivityDataOutputUserTask, {
    userTaskCompletion: capability(
      stringNull,
      "user-task-string-null-completion-data",
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
      // Explicit, because the recursive portable arms must not enter this profile by enumerating the enum.
      [
        VariableValueKind.Boolean,
        VariableValueKind.Integer,
        VariableValueKind.String,
        VariableValueKind.StringList,
        VariableValueKind.Null,
      ],
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
  [VariableValueKind.Decimal, {
    name: "candidate",
    value: { kind: VariableValueKind.Decimal, coefficient: "12345", scale: 2 },
  }],
  [VariableValueKind.List, {
    name: "candidate",
    value: {
      kind: VariableValueKind.List,
      value: [{ kind: VariableValueKind.String, value: "value" }],
    },
  }],
  [VariableValueKind.Map, {
    name: "candidate",
    value: {
      kind: VariableValueKind.Map,
      value: [{ name: "field", value: { kind: VariableValueKind.Null } }],
    },
  }],
]);

const portableKinds = [
  VariableValueKind.Decimal,
  VariableValueKind.List,
  VariableValueKind.Map,
] as const;

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

test("admits only String values at the Compensation checkpoint Process-start surface", async () => {
  const compiled = await importCompiledValueDomain();
  for (const surface of surfaces) {
    assert.equal(
      compiled.profileAllowsVariableBindings(
        COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
        surface,
        [],
      ),
      true,
    );
    for (const binding of bindings.values()) {
      assert.equal(
        compiled.profileAllowsVariableBindings(
          COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
          surface,
          [binding],
        ),
        surface === "processStart" && binding.value.kind === VariableValueKind.String,
        `${surface} ${binding.value.kind}`,
      );
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

test("refuses a well-formed recursive portable value at every surface of every profile that does not select it", async () => {
  const compiled = await importCompiledValueDomain();
  const profiles = await admittedProfiles();
  for (const kind of portableKinds) {
    const binding = bindings.get(kind);
    assert.ok(binding !== undefined);
    // Recognition and eligibility are separate: the value is well-formed, so only the profile domain can refuse it.
    assert.equal(isVariablePatch([binding]), true, kind);
    for (const profile of profiles) {
      for (const surface of surfaces) {
        // Only two profiles select Decimal and Map: the serial handoff at its two Property-path surfaces and the
        // structured effect-data profile at effect completion alone; a root List nowhere.
        const selected = kind !== VariableValueKind.List && (
          (profile === SemanticProfileId.PortableBusinessValuesHandoff && surface !== "effectCompletion") ||
          (profile === SemanticProfileId.PortableBusinessEffectData && surface === "effectCompletion"));
        assert.equal(
          compiled.profileAllowsVariableBindings(profile, surface, [binding]),
          selected,
          `${profile} ${surface} ${kind}`,
        );
      }
    }
  }
});

// Restoration reads carried state structurally, so profile eligibility must be rechecked there (PBV-INGRESS-01).
test("refuses a carried portable value under every admitted profile that selects none while keeping legacy kinds", async () => {
  const string = bindings.get(VariableValueKind.String);
  assert.ok(string !== undefined);
  for (const profile of await admittedProfiles()) {
    if (profile === SemanticProfileId.PortableBusinessValuesHandoff || profile === SemanticProfileId.PortableBusinessEffectData) continue;
    assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, carrying(string)), true, profile);
    for (const kind of portableKinds) {
      const binding = bindings.get(kind);
      assert.ok(binding !== undefined);
      assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, carrying(binding)), false, `${profile} ${kind}`);
    }
  }
});

function carrying(binding: VariableBinding): RuntimeState {
  return { ...initialState, variables: { ...initialState.variables, process: { bindings: [binding] } } };
}

async function admittedProfiles(): Promise<readonly string[]> {
  // The interrupting Message Event Sub-Process identity is package-internal, so it is read from the built catalog.
  const catalog = await import(
    new URL("../dist/semantic-profile-catalog.js", import.meta.url).href
  ) as { INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID: string };
  const profiles = [
    ...Object.values(SemanticProfileId),
    SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID,
    PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID,
    catalog.INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID,
  ];
  assert.ok(profiles.length > 30, "profile enumeration must not be vacuous");
  return profiles;
}

// Each forged state holds one value at a different carried path; only the path differs, so a path the
// enumerator skips is the only way a case can pass. The states are deliberately partial: the profile check reads
// carried values only, and structural validity is restoration's separate obligation.
function statesCarryingAtEveryPath(carried: VariableBinding): ReadonlyArray<readonly [string, RuntimeState]> {
  const owner = initialState.scopeOccurrences[0]?.id ?? { processInstanceId: "Instance", elementId: "scope", activation: 1 };
  const snapshot = { frames: [{ owner, bindings: [carried] }] };
  const handler = (lifecycle: "pending" | "compensating") => ({ lifecycle, restoredContext: snapshot });
  const forged = (fields: Record<string, unknown>): RuntimeState => ({ ...initialState, ...fields }) as RuntimeState;
  const variables = (fields: Record<string, unknown>) => forged({ variables: { ...initialState.variables, ...fields } });
  return [
    ["process", variables({ process: { bindings: [carried] } })],
    ["scopes", variables({ scopes: [{ owner, bindings: [carried] }] })],
    ["processInterfaces.inputs", variables({ processInterfaces: [{ owner, inputs: [carried], outputs: [] }] })],
    ["processInterfaces.outputs", variables({ processInterfaces: [{ owner, inputs: [], outputs: [carried] }] })],
    ["activities", variables({ activities: [{ owner, bindings: [carried] }] })],
    ["effectWaits", forged({ effectWaits: [{ arguments: [carried] }] })],
    ["compensationHandlerEffectWaits", forged({ compensationHandlerEffectWaits: [{ arguments: [carried] }] })],
    ["pending restoredContext", forged({ compensationTriggers: [{ handlers: [handler("pending")] }] })],
    ["compensating restoredContext", forged({ compensationTriggers: [{ handlers: [handler("compensating")] }] })],
    ["promoted snapshot", forged({ compensationParentContextRetentions: [{ kind: "promoted", snapshot }] })],
  ];
}

test("refuses a portable value at every carried RuntimeState path", () => {
  const map = bindings.get(VariableValueKind.Map);
  assert.ok(map !== undefined);
  for (const [path, state] of statesCarryingAtEveryPath(map)) {
    assert.equal(runtimeStateCarriesOnlyProfilePortableValues(SemanticProfileId.UserTaskPreservedNotation, state), false, path);
  }
});

// Under the serial handoff every carried value must be a SingletonBusinessItem, not merely a selected kind.
test("the serial handoff accepts a SingletonBusinessItem and refuses any other value at every carried path", () => {
  const handoff = SemanticProfileId.PortableBusinessValuesHandoff;
  const named = (value: VariableBinding["value"]): VariableBinding => ({ name: "candidate", value });
  const accepted = [named({ kind: VariableValueKind.String, value: "a".repeat(1024) }), named({ kind: VariableValueKind.Null }),
    named({ kind: VariableValueKind.Map, value: [] }), bindings.get(VariableValueKind.Decimal)!, bindings.get(VariableValueKind.Map)!];
  const refused = [bindings.get(VariableValueKind.List)!, bindings.get(VariableValueKind.StringList)!,
    named({ kind: VariableValueKind.String, value: "a".repeat(1025) })];
  for (const candidate of accepted) {
    for (const [path, state] of statesCarryingAtEveryPath(candidate)) {
      assert.equal(runtimeStateCarriesOnlyProfilePortableValues(handoff, state), true, `${path} ${candidate.value.kind}`);
    }
  }
  for (const candidate of refused) {
    for (const [path, state] of statesCarryingAtEveryPath(candidate)) {
      assert.equal(runtimeStateCarriesOnlyProfilePortableValues(handoff, state), false, `${path} ${candidate.value.kind}`);
    }
  }
});

// The effect-data profile's Start surface stays String/Null but takes the SingletonBusinessItem 1,024-byte root bound.
test("the structured effect-data profile bounds a Start String and admits a SingletonBusinessItem result only", async () => {
  const compiled = await importCompiledValueDomain();
  const profile = SemanticProfileId.PortableBusinessEffectData;
  const named = (value: VariableBinding["value"]): VariableBinding => ({ name: "candidate", value });
  const text = (length: number) => named({ kind: VariableValueKind.String, value: "a".repeat(length) });
  assert.equal(compiled.profileAllowsVariableBindings(profile, "processStart", [text(1024)]), true);
  assert.equal(compiled.profileAllowsVariableBindings(profile, "processStart", [text(1025)]), false);
  assert.equal(compiled.profileAllowsVariableBindings(profile, "processStart", [named({ kind: VariableValueKind.Null })]), true);
  assert.equal(compiled.profileAllowsVariableBindings(profile, "processStart", [bindings.get(VariableValueKind.Map)!]), false);
  assert.equal(compiled.profileAllowsVariableBindings(profile, "effectCompletion", [text(1024)]), true);
  assert.equal(compiled.profileAllowsVariableBindings(profile, "effectCompletion", [text(1025)]), false);
  assert.equal(compiled.profileAllowsVariableBindings(profile, "effectCompletion", [bindings.get(VariableValueKind.Map)!]), true);
  assert.equal(compiled.profileAllowsVariableBindings(profile, "effectCompletion", [bindings.get(VariableValueKind.List)!]), false);
  assert.equal(compiled.profileAllowsVariableBindings(profile, "userTaskCompletion", [text(1)]), false);
  // Existing profiles keep their meaning: a 1,025-byte Start String is still a legacy String.
  assert.equal(compiled.profileAllowsVariableBindings(SemanticProfileId.SerialBusinessTaskComposition, "processStart", [text(1025)]), true);
});

test("the structured effect-data profile accepts a SingletonBusinessItem and refuses any other value at every carried path", () => {
  const profile = SemanticProfileId.PortableBusinessEffectData;
  const named = (value: VariableBinding["value"]): VariableBinding => ({ name: "candidate", value });
  const accepted = [named({ kind: VariableValueKind.String, value: "a".repeat(1024) }), named({ kind: VariableValueKind.Null }),
    named({ kind: VariableValueKind.Map, value: [] }), bindings.get(VariableValueKind.Decimal)!, bindings.get(VariableValueKind.Map)!];
  const refused = [bindings.get(VariableValueKind.List)!, bindings.get(VariableValueKind.StringList)!,
    named({ kind: VariableValueKind.String, value: "a".repeat(1025) })];
  for (const candidate of accepted) {
    for (const [path, state] of statesCarryingAtEveryPath(candidate)) {
      assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, state), true, `${path} ${candidate.value.kind}`);
    }
  }
  for (const candidate of refused) {
    for (const [path, state] of statesCarryingAtEveryPath(candidate)) {
      assert.equal(runtimeStateCarriesOnlyProfilePortableValues(profile, state), false, `${path} ${candidate.value.kind}`);
    }
  }
});
