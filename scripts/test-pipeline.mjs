import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { runCommand } from "./run-command.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const javaHome =
  process.env.BPMN_JAVA_HOME ?? "/opt/homebrew/opt/openjdk@21";

function runProjectCommand(command, args, options) {
  return runCommand(command, args, {
    cwd: projectRoot,
    env: options.env ?? process.env,
    timeoutMs: options.timeoutMs,
  });
}

async function buildPipeline() {
  const coreBuild = runProjectCommand(
    "tsc",
    ["-p", "packages/semantic-core/tsconfig.json"],
    { timeoutMs: 120_000 },
  );
  await Promise.all([
    coreBuild,
    runProjectCommand("lake", ["build", "emitSequentialUserTaskResults"], {
      timeoutMs: 120_000,
    }),
    runProjectCommand(
      "runners/cibseven/mvnw",
      [
        "-s",
        "runners/cibseven/maven-settings.xml",
        "-f",
        "runners/cibseven/pom.xml",
        "--no-transfer-progress",
        "-Dstyle.color=never",
        "-DskipTests",
        "test-compile",
      ],
      {
        env: { ...process.env, JAVA_HOME: javaHome },
        timeoutMs: 120_000,
      },
    ),
  ]);
  await Promise.all([
    runProjectCommand("tsc", ["-p", "packages/bpmn-source/tsconfig.json"], {
      timeoutMs: 120_000,
    }),
    runProjectCommand("tsc", ["-p", "packages/differential/tsconfig.json"], {
      timeoutMs: 120_000,
    }),
    runProjectCommand("tsc", ["-p", "packages/temporal-adapter/tsconfig.json"], {
      timeoutMs: 120_000,
    }),
  ]);
}

const isPrebuilt = process.env.BPMN_PIPELINE_PREBUILT === "1";
const buildStarted = performance.now();
if (!isPrebuilt) {
  await buildPipeline();
}
const buildMs = isPrebuilt ? 0 : performance.now() - buildStarted;

const testRun = await runProjectCommand(
  process.execPath,
  [
    "--test",
    "--test-concurrency=1",
    "packages/differential/test/pipeline.test.mjs",
  ],
  {
    env: {
      ...process.env,
      BPMN_PIPELINE_BUILD_MS: buildMs.toFixed(3),
      BPMN_PIPELINE_BUILD_MODE: isPrebuilt ? "prebuilt" : "measured",
      BPMN_JAVA_HOME: javaHome,
    },
    timeoutMs: 45_000,
  },
);

process.stdout.write(testRun.stdout);
process.stderr.write(testRun.stderr);
