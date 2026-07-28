import { fileURLToPath } from "node:url";

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

async function runTests(extraArguments: readonly string[]): Promise<void> {
  const arguments_ = [
    "-s",
    mavenSettings,
    "-f",
    `${runnerDirectory}/pom.xml`,
    "--no-transfer-progress",
    "-Dstyle.color=never",
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
    timeoutMs: 60_000,
    terminationGraceMs: 2_000,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

await runTests([]);
await runTests([
  "-Dcibseven.version=2.0.0",
  "-Dtest=CibSevenBoundaryErrorPhaseZeroProbeTest,CibSevenBoundaryErrorScenarioRunnerTest",
]);
