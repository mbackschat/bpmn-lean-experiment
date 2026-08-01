import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/** Locks portable contributor bootstrap, diagnostics, and external-source pins. */
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

type LockedSource = Readonly<{
  scope: string;
  relativePath: string;
  remote: string;
  reference: string;
  revision: string;
  materialKind: string;
}>;

function decodeLock(text: string): ReadonlyArray<LockedSource> {
  return text
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const [scope, relativePath, remote, reference, revision, materialKind] =
        line.split("\t");
      assert.ok(
        scope && relativePath && remote && reference && revision && materialKind,
        line,
      );
      return { scope, relativePath, remote, reference, revision, materialKind };
    });
}

test("locks every registered external Git checkout for portable setup", async () => {
  const [lockText, sources] = await Promise.all([
    readFile(path.join(projectRoot, "scripts/external-sources.lock"), "utf8"),
    readFile(path.join(projectRoot, "docs/SOURCES.md"), "utf8"),
  ]);
  const locked = decodeLock(lockText);

  assert.equal(locked.length, 17);
  assert.deepEqual(
    locked.filter((source) => source.scope === "verify")
      .map((source) => source.relativePath),
    [],
  );
  assert.deepEqual(
    locked.filter((source) => source.scope === "adoption")
      .map((source) => source.relativePath),
    ["a12/a12-workflows"],
  );
  for (const source of locked) {
    assert.match(source.remote, /^https:\/\/github\.com\/.+\.git$/u);
    assert.match(source.reference, /^(?:commit|tag:[A-Za-z0-9._-]+)$/u);
    assert.match(source.revision, /^[0-9a-f]{40}$/u);
    assert.match(
      source.materialKind,
      /^(?:repository|submodule:[A-Za-z0-9._/-]+)$/u,
    );
    assert.match(sources, new RegExp(source.relativePath.replaceAll("/", "\\/"), "u"));
    assert.match(sources, new RegExp(source.revision, "u"));
  }
  assert.deepEqual(
    locked.filter((source) => source.materialKind.startsWith("submodule:"))
      .map((source) => [source.relativePath, source.revision]),
    [
      [
        "temporal/sdk-typescript/packages/core-bridge/sdk-core",
        "3dac9013b9031e5ffd51d7335838585b2db42efb",
      ],
      [
        "webassembly-spec/document/core/util/katex",
        "e751278cff42fada16dba6df331fda52aaa90f73",
      ],
      [
        "wasm-spectec/document/core/util/katex",
        "e751278cff42fada16dba6df331fda52aaa90f73",
      ],
      [
        "spectec/document/core/util/katex",
        "e751278cff42fada16dba6df331fda52aaa90f73",
      ],
    ],
  );
  assert.deepEqual(
    locked.filter((source) => source.reference.startsWith("tag:"))
      .map((source) => [source.relativePath, source.reference]),
    [
      ["fuml-reference-implementation", "tag:v1.5.0a"],
      ["webassembly-spec/document/core/util/katex", "tag:v0.13.19"],
      ["wasm-spectec/document/core/util/katex", "tag:v0.13.19"],
      ["spectec/document/core/util/katex", "tag:v0.13.19"],
    ],
  );
});

test("owns setup, fail-closed scoped preflights, doctor, and CI provisioning", async () => {
  const [
    setup,
    preflight,
    doctor,
    verification,
    adoptionGate,
    adoptionCheck,
    corpusFetch,
    workflow,
    guide,
    readme,
    packageManifest,
    caches,
    mavenWrapperProperties,
  ] =
    await Promise.all([
      readFile(path.join(projectRoot, "scripts/setup-external-sources.sh"), "utf8"),
      readFile(path.join(projectRoot, "scripts/check-external-sources.sh"), "utf8"),
      readFile(path.join(projectRoot, "scripts/doctor.sh"), "utf8"),
      readFile(path.join(projectRoot, "scripts/verify.sh"), "utf8"),
      readFile(path.join(projectRoot, "scripts/test-a12-adoption.sh"), "utf8"),
      readFile(path.join(projectRoot, "packages/bpmn-source/calibration/a12-adoption-source.ts"), "utf8"),
      readFile(path.join(projectRoot, "scripts/fetch-bpmn-corpus.sh"), "utf8"),
      readFile(path.join(projectRoot, ".github/workflows/verify.yml"), "utf8"),
      readFile(path.join(projectRoot, "docs/CONTRIBUTOR-SETUP-GUIDE.md"), "utf8"),
      readFile(path.join(projectRoot, "README.md"), "utf8"),
      readFile(path.join(projectRoot, "package.json"), "utf8"),
      readFile(path.join(projectRoot, "scripts/workspace-cache.lock"), "utf8"),
      readFile(path.join(projectRoot, "runners/cibseven/.mvn/wrapper/maven-wrapper.properties"), "utf8"),
    ]);

  assert.match(setup, /external-sources\.lock/u);
  assert.match(setup, /fetch-bpmn-corpus\.sh/u);
  assert.match(setup, /git clone/u);
  assert.match(setup, /submodule update --init/u);
  assert.match(setup, /rev-parse --show-toplevel/u);
  assert.doesNotMatch(setup, /if test -e "\$checkout"; then\s+continue/u);
  assert.match(setup, /exists but is not a Git checkout root/u);
  assert.match(preflight, /verify-bpmn-corpus\.sh/u);
  assert.match(preflight, /git -C "\$checkout" rev-parse HEAD/u);
  assert.match(preflight, /git -C "\$checkout" remote get-url origin/u);
  assert.match(preflight, /refs\/tags\/\$\{reference#tag:\}/u);
  assert.match(preflight, /HEAD:\$submodule_path/u);
  assert.match(preflight, /rev-parse --show-toplevel/u);
  assert.match(doctor, /check-external-sources\.sh/u);
  assert.match(doctor, /Node 24\.18\.0/u);
  assert.match(doctor, /pnpm 11\.18\.0/u);
  assert.match(doctor, /DOCTOR_EXTERNAL_DECLARED/u);
  assert.match(doctor, /DOCTOR_DEPENDENCY_OWNER/u);
  assert.match(doctor, /workspace-cache\.lock/u);
  assert.match(doctor, /DOCTOR_CACHE/u);
  assert.match(doctor, /DOCTOR_CACHE_ARTIFACT/u);
  assert.match(doctor, /2e181515ce8ae14b7a904c40bb4794831f5fd1d9641107a13b916af15af4001a/u);
  assert.match(verification, /doctor\.sh verify/u);
  assert.match(verification, /A12_ADOPTION_EVIDENCE status=not-run/u);
  assert.doesNotMatch(verification, /^\.\/scripts\/test-a12-adoption\.sh$/mu);
  assert.match(adoptionGate, /check-external-sources\.sh" adoption/u);
  assert.match(adoptionGate, /a12-adoption-source\.ts/u);
  assert.match(adoptionCheck, /CreateDocument\.bpmn/u);
  assert.match(adoptionCheck, /TestProcessWithRelationshipModeledDocumentModels_DocRef\.bpmn/u);
  assert.match(adoptionCheck, /BPMN_EXTERNAL_ROOT/u);
  assert.match(packageManifest, /"test:a12-adoption"/u);
  assert.match(corpusFetch, /mktemp -d "\$corpus_parent\/\.bpmn-corpus-fetch\.XXXXXX"/u);
  assert.match(workflow, /setup-external-sources\.sh verify/u);
  assert.match(guide, /setup-external-sources\.sh adoption/u);
  assert.match(guide, /doctor\.sh research/u);
  assert.match(guide, /workspace meta-repository/u);
  assert.match(readme, /CONTRIBUTOR-SETUP-GUIDE\.md/u);
  assert.match(
    mavenWrapperProperties,
    /^distributionSha256Sum=2e181515ce8ae14b7a904c40bb4794831f5fd1d9641107a13b916af15af4001a$/mu,
  );
  for (const dependencyOwner of [
    ".nvmrc",
    ".node-version",
    "package.json",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
    "packages/bpmn-source/package.json",
    "packages/differential/package.json",
    "packages/semantic-core/package.json",
    "packages/temporal-adapter/package.json",
    "lean-toolchain",
    "lakefile.toml",
    "lake-manifest.json",
    "runners/cibseven/pom.xml",
    "runners/cibseven/.mvn/wrapper/maven-wrapper.properties",
    "runners/cibseven/.mvn/wrapper/maven-wrapper.jar",
    "scripts/external-sources.lock",
    "scripts/workspace-cache.lock",
    "docs/reference/bpmn-2.0.2/LOCAL-CORPUS.sha256",
  ]) {
    assert.ok(doctor.includes(`  ${dependencyOwner}`), dependencyOwner);
  }
  assert.match(caches, /^dependency\tnode_modules\tpnpm-lock\.yaml$/mu);
  assert.match(caches, /^cache\t\.cache\/temporal-cli\tTemporal CLI v1\.8\.1$/mu);
  assert.match(caches, /^cache\t\.cache\/temporal-test-server\tTemporal SDK 1\.21\.0 test server$/mu);
  assert.match(caches, /^external-cache\t\$MAVEN_USER_HOME\/repository\tMaven artifact repository$/mu);
  assert.deepEqual(
    caches.split("\n")
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => line.split("\t")[1]),
    [
      "node_modules",
      ".pnpm-store",
      ".lake",
      ".uv-cache",
      "dist",
      "coverage",
      ".cache/temporal-cli",
      ".cache/temporal-test-server",
      "runners/cibseven/target",
      "packages/bpmn-source/dist",
      "packages/differential/dist",
      "packages/semantic-core/dist",
      "packages/temporal-adapter/dist",
      "$MAVEN_USER_HOME/repository",
      "$MAVEN_USER_HOME/wrapper/dists",
      "$BPMN_EXTERNAL_ROOT/omg-bpmn-2.0.2/BPMN-2.0.2.md",
      "$BPMN_EXTERNAL_ROOT/omg-bpmn-2.0.2/BPMN-2_0_2_images",
    ],
  );
});

test("external evidence consumers fail closed and honor the shared root", async () => {
  const [
    sourceTest,
    adoptionCheck,
    metamodel,
    miwg,
    breadth,
    cibGate,
    cibTests,
    validator,
  ] = await Promise.all([
    readFile(path.join(projectRoot, "packages/bpmn-source/test/bpmn-source.test.ts"), "utf8"),
    readFile(path.join(projectRoot, "packages/bpmn-source/calibration/a12-adoption-source.ts"), "utf8"),
    readFile(path.join(projectRoot, "scripts/check-bpmn-semantic-process-metamodel.ts"), "utf8"),
    readFile(path.join(projectRoot, "packages/bpmn-source/calibration/miwg-observation.ts"), "utf8"),
    readFile(path.join(projectRoot, "scripts/cib-bpmn-breadth.ts"), "utf8"),
    readFile(path.join(projectRoot, "scripts/test-cibseven-oracle.sh"), "utf8"),
    readFile(path.join(projectRoot, "scripts/run-cibseven-tests.ts"), "utf8"),
    readFile(path.join(projectRoot, "scripts/validate-bpmn-xml.sh"), "utf8"),
  ]);

  for (const consumer of [adoptionCheck, metamodel, miwg, breadth, validator]) {
    assert.match(consumer, /BPMN_EXTERNAL_ROOT/u);
  }
  assert.doesNotMatch(sourceTest, /context\.skip/u);
  assert.doesNotMatch(sourceTest, /a12\/a12-workflows/u);
  assert.doesNotMatch(metamodel, /METAMODEL_CHECK skipped/u);
  assert.doesNotMatch(miwg, /BPMN_MIWG_IMPORT skipped/u);
  assert.match(cibGate, /check-external-sources\.sh" verify/u);
  assert.doesNotMatch(cibGate, /runner_a12_model/u);
  assert.match(cibTests, /!CibSevenBoundaryErrorPhaseZeroProbeTest/u);
  assert.doesNotMatch(cibTests, /externalTargetCarriesTheReviewedEmptyAttributeShape/u);
  assert.doesNotMatch(validator, /well-formedness only/u);
});
