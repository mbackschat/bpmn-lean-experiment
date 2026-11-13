import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  resolveCibSevenMavenTimeoutMs,
  retainedEvidenceBatches,
  wrapCibSevenMavenFailure,
} from "./cibseven-maven-budget.ts";
import { cibSevenReleaseBuildDirectory } from "./cibseven-maven-build.ts";
import { resolveJavaHome } from "./java-home.ts";
import { runCommand } from "./run-command.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const runnerDirectory = fileURLToPath(
  new URL("../runners/cibseven/", import.meta.url),
);
const mavenWrapper = fileURLToPath(
  new URL("../runners/cibseven/mvnw", import.meta.url),
);
const mavenSettings =
  process.env.BPMN_MAVEN_SETTINGS ??
  fileURLToPath(
    new URL(
      "../runners/cibseven/maven-settings.xml",
      import.meta.url,
    ),
  );
const mavenTimeoutMs = resolveCibSevenMavenTimeoutMs(process.env);

async function runTests(
  release: string,
  extraArguments: readonly string[],
): Promise<void> {
  const arguments_ = [
    "-s",
    mavenSettings,
    "-f",
    `${runnerDirectory}/pom.xml`,
    "--no-transfer-progress",
    "-Dstyle.color=never",
    `-Dbpmn.build.directory=${cibSevenReleaseBuildDirectory(runnerDirectory, release)}`,
    ...extraArguments,
    "test",
  ];
  const localRepository = process.env.BPMN_MAVEN_REPO_LOCAL;
  if (localRepository !== undefined && localRepository !== "") {
    arguments_.unshift(`-Dmaven.repo.local=${localRepository}`);
  }

  const result = await runCommand(mavenWrapper, arguments_, {
    cwd: projectRoot,
    env: {
      ...process.env,
      JAVA_HOME: resolveJavaHome(),
    },
    timeoutMs: mavenTimeoutMs,
    terminationGraceMs: 2_000,
  }).catch((error: unknown) => {
    throw wrapCibSevenMavenFailure(release, error);
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

await runTests("2.2.0", [
  "-Dtest=*Test,!CibSevenMappedSuccessScenarioRunnerTest,!CibSevenMappedBoundaryErrorScenarioRunnerTest,!CibSevenRetainedEvidenceTest",
]);
// The retained-evidence replay runs in batches, each its own call under the deadline (#70); the test partitions its own
// discovery, so this count only sizes the batches and a miscount cannot leave a file out.
const evidenceFiles = (await readdir(fileURLToPath(new URL("../scenarios/", import.meta.url)), { recursive: true }))
  .filter((file) => file.endsWith("cibseven-evidence.json")).length;
const batches = retainedEvidenceBatches(evidenceFiles);
for (let batch = 1; batch <= batches; batch += 1) {
  await runTests("2.2.0", ["-Dtest=CibSevenRetainedEvidenceTest", `-Dbpmnlean.retainedEvidenceBatch=${String(batch)}/${String(batches)}`]);
}
await runTests("2.0.0", [
  "-Dcibseven.version=2.0.0",
  "-Dtest=CibSevenMappedSuccessScenarioRunnerTest,CibSevenMappedBoundaryErrorScenarioRunnerTest,CibSevenExclusiveGatewayJuelProbeTest,CibSevenIsolatedJuelRuntimeProbeTest",
]);
