import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { runCommand } from "./run-command.ts";
import { resolveJavaHome } from "./java-home.ts";
import { warmPipelineCommandTimeoutMs } from "./pipeline-budget.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const javaHome = resolveJavaHome();

function runProjectCommand(
  command: string,
  args: ReadonlyArray<string>,
  options: Readonly<{
    env?: NodeJS.ProcessEnv;
    timeoutMs: number;
  }>,
) {
  return runCommand(command, args, {
    cwd: projectRoot,
    env: options.env ?? process.env,
    timeoutMs: options.timeoutMs,
  });
}

async function buildPipeline() {
  await Promise.all([
    runProjectCommand("./scripts/pnpm.sh", ["run", "build:verification-typescript"], {
      timeoutMs: 120_000,
    }),
    runProjectCommand(
      "./scripts/lake.sh",
      [
        "build",
        "BpmnSemantics.SemanticProcessJsonMain",
        "BpmnSemantics.EnginePopulationScenarioJsonMain",
      ],
      { timeoutMs: 120_000 },
    ),
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
}

const isPrebuilt = process.env.BPMN_PIPELINE_PREBUILT === "1";
const modelCorpusOnly = process.argv.slice(2).includes("--model-corpus");
const unknownArguments = process.argv.slice(2).filter(
  (argument) => argument !== "--model-corpus",
);
if (unknownArguments.length > 0) {
  throw new TypeError(
    `unsupported pipeline arguments: ${unknownArguments.join(", ")}`,
  );
}
const buildStarted = performance.now();
if (!isPrebuilt) {
  await buildPipeline();
}
const buildMs = isPrebuilt ? 0 : performance.now() - buildStarted;
const testFiles = modelCorpusOnly
  ? [
      "model-corpus/test/executable-model-corpus.test.ts",
      "packages/differential/test/executable-model-corpus.test.ts",
      "packages/differential/test/message-key-correlation-population-lean-core.integration-test.ts",
      "packages/temporal-adapter/testkit/test/message-key-correlation-refinement.temporal-serial-test.ts",
    ]
  : ["packages/differential/test/pipeline.test.ts"];

const testRun = await runProjectCommand(
  process.execPath,
  [
    "--no-parallel-scavenge",
    "--test",
    "--test-concurrency=1",
    ...testFiles,
  ],
  {
    env: {
      ...process.env,
      BPMN_PIPELINE_BUILD_MS: buildMs.toFixed(3),
      BPMN_PIPELINE_BUILD_MODE: isPrebuilt ? "prebuilt" : "measured",
      BPMN_JAVA_HOME: javaHome,
    },
    timeoutMs: warmPipelineCommandTimeoutMs(process.env),
  },
);

process.stdout.write(testRun.stdout);
process.stderr.write(testRun.stderr);
