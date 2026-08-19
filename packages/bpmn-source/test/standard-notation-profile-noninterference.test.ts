/** Complete registered-profile guard for the standard-notation preservation capability. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";
import type {
  CheckedProcess,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";
import {
  assertStandardNotationProfileContract,
  readRegisteredProfileArtifacts,
  type RegisteredProfileArtifact,
} from "./standard-notation-profile-contract-test-support.ts";

const standardNotationProfiles = Object.freeze([
  SemanticProfileId.UserTaskPreservedNotation,
  SemanticProfileId.UserTaskProcessDataPreservedNotation,
]);
const standardNotationProfileSet = new Set<string>(standardNotationProfiles);
const notationSource = new URL(
  "../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const executedOnlySource = new URL(
  "../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);
const profilesRoot = new URL("../../../profiles/", import.meta.url);

async function compile(source: URL, profile: string, sourceId: string) {
  return compileBpmnToSemanticProcess({
    bytes: await readFile(source),
    sourceId,
    expectedSha256: undefined,
    semanticProfile: profile,
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });
}

function normalizeCheckedSource(
  checked: CheckedProcess,
): CheckedProcess {
  return {
    ...checked,
    identity: {
      ...checked.identity,
      sourceId: "normalized-source",
      sourceSha256: "0".repeat(64),
    },
  };
}

function normalizeProgramSource(
  program: SemanticProcessProgram,
): SemanticProcessProgram {
  return {
    ...program,
    identity: {
      ...program.identity,
      sourceId: "normalized-source",
      sourceSha256: "0".repeat(64),
    },
  };
}

function replaceArtifact(
  artifacts: ReadonlyArray<RegisteredProfileArtifact>,
  profileId: string,
  replace: (
    artifact: RegisteredProfileArtifact,
  ) => RegisteredProfileArtifact,
): ReadonlyArray<RegisteredProfileArtifact> {
  return artifacts.map((artifact) =>
    artifact.id === profileId ? replace(artifact) : artifact
  );
}

const artifacts = await readRegisteredProfileArtifacts(profilesRoot);
const admittedProfileIds = new Set<string>();
for (const profile of Object.values(SemanticProfileId)) {
  const result = await compile(notationSource, profile, `contract-${profile}`);
  if (result.status === BpmnCompilationStatus.Accepted) {
    admittedProfileIds.add(profile);
  }
}

test("binds every registered profile artifact to actual standard-notation dispatch", () => {
  assertStandardNotationProfileContract({
    artifacts,
    registeredProfileIds: Object.values(SemanticProfileId),
    admittedProfileIds,
  });
});

test("rejects a missing standard-notation declaration atom", () => {
  const mutated = replaceArtifact(
    artifacts,
    SemanticProfileId.UserTaskProcessDataPreservedNotation,
    (artifact) => ({
      ...artifact,
      features: artifact.features.filter(
        (feature) => feature !== "retained-definitions-metadata",
      ),
    }),
  );
  assert.throws(
    () => assertStandardNotationProfileContract({
      artifacts: mutated,
      registeredProfileIds: Object.values(SemanticProfileId),
      admittedProfileIds,
    }),
    /incomplete standard-notation declaration/u,
  );
});

test("rejects executable standard-notation dispatch without a declaration", () => {
  const mutatedDispatch = new Set(admittedProfileIds);
  mutatedDispatch.add(SemanticProfileId.TimerUserTaskComposition);
  assert.throws(
    () => assertStandardNotationProfileContract({
      artifacts,
      registeredProfileIds: Object.values(SemanticProfileId),
      admittedProfileIds: mutatedDispatch,
    }),
    /artifact and executable dispatch disagree/u,
  );
});

test("rejects a standard-notation declaration without executable dispatch", () => {
  const mutated = replaceArtifact(
    artifacts,
    SemanticProfileId.TimerUserTaskComposition,
    (artifact) => ({
      ...artifact,
      features: [
        ...artifact.features,
        "retained-definitions-metadata",
        "retained-diagram-interchange",
        "retained-collaboration-and-participant",
        "retained-lane-set",
        "retained-artifacts",
        "retained-documentation",
      ],
    }),
  );
  assert.throws(
    () => assertStandardNotationProfileContract({
      artifacts: mutated,
      registeredProfileIds: Object.values(SemanticProfileId),
      admittedProfileIds,
    }),
    /artifact and executable dispatch disagree/u,
  );
});

test("requires the frozen predecessor's exact Definitions metadata declaration", () => {
  const mutated = replaceArtifact(
    artifacts,
    SemanticProfileId.UserTaskPreservedNotation,
    (artifact) => ({
      ...artifact,
      readme: artifact.readme.replace(
        "Preserved Definitions metadata declaration: `name | exporter | exporterVersion`; retained in exact source bytes and excluded from execution projections.",
        "",
      ),
    }),
  );
  assert.throws(
    () => assertStandardNotationProfileContract({
      artifacts: mutated,
      registeredProfileIds: Object.values(SemanticProfileId),
      admittedProfileIds,
    }),
    /incomplete standard-notation declaration/u,
  );
});

test("admits standard notation under exactly the independently enumerated profiles", async () => {
  for (const profile of Object.values(SemanticProfileId)) {
    const result = await compile(notationSource, profile, `notation-${profile}`);
    assert.equal(
      result.status,
      standardNotationProfileSet.has(profile)
        ? BpmnCompilationStatus.Accepted
        : BpmnCompilationStatus.Rejected,
      profile,
    );
  }
});

for (const profile of standardNotationProfiles) {
  test(`${profile} keeps standard notation out of both execution projections`, async () => {
    const [notation, executedOnly] = await Promise.all([
      compile(notationSource, profile, `notation-${profile}`),
      compile(executedOnlySource, profile, `executed-${profile}`),
    ]);
    assert.ok(notation.checkedProcess !== undefined);
    assert.ok(executedOnly.checkedProcess !== undefined);
    assert.ok(notation.semanticProcess !== undefined);
    assert.ok(executedOnly.semanticProcess !== undefined);
    assert.deepEqual(
      normalizeCheckedSource(notation.checkedProcess),
      normalizeCheckedSource(executedOnly.checkedProcess),
    );
    assert.deepEqual(
      normalizeProgramSource(notation.semanticProcess),
      normalizeProgramSource(executedOnly.semanticProcess),
    );
  });
}
