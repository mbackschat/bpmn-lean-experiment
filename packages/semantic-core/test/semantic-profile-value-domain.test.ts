import assert from "node:assert/strict";
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
  [SemanticProfileId.MappedSuccessServiceTask, {
    effectCompletion: capability(
      [VariableValueKind.String],
      "effect-completion-string-local-data",
    ),
  }],
  [SemanticProfileId.MappedBoundaryErrorServiceTask, {
    effectCompletion: capability(
      stringNull,
      "effect-completion-string-null-local-data",
    ),
  }],
  [SemanticProfileId.ExclusiveGatewaySimpleBoolean, {
    processStart: capability(stringNull, "process-start-string-null-data"),
  }],
  [SemanticProfileId.InclusiveGatewaySelectedBranches, {
    processStart: capability(stringNull, "process-start-string-null-data"),
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

async function profileFeatures(profile: string): Promise<ReadonlyArray<string>> {
  const source = await readFile(
    new URL(`../../../profiles/${profile}/profile.json`, import.meta.url),
    "utf8",
  );
  const artifact: unknown = JSON.parse(source);
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

test("fails closed for unknown profiles and requires every nonempty cell's feature atoms", async () => {
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
      for (const feature of capabilityBySurface[surface]?.features ?? []) {
        assert.ok(
          features.includes(feature),
          `${profile} ${surface} must declare ${feature}`,
        );
      }
    }
  }
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
