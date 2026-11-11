/**
 * The differential pipeline: builds the TypeScript packages and Lean `kernelRun` once, then runs the kernel oracle
 * over every discovered scenario (Lean = TypeScript, kernel = retained CIB Seven evidence) under the deadline the
 * discovered scenario count derives (`pipeline-budget.ts`). `--model-corpus` runs the corpus inspection instead.
 *
 * No CIB Seven build: the pipeline compares retained evidence, and the runtime lane's oracle script reproduces that
 * evidence with the pinned engine. No Temporal server: the host target is the hosted differential lane.
 * `BPMN_PIPELINE_PREBUILT=1` skips the build when an earlier stage produced it.
 */
import { fileURLToPath } from "node:url";

import { runCommand } from "./run-command.ts";
import { nativeLeanDriverBuildTimeoutMs } from "./lean-native-driver.ts";
import { pipelineCommandTimeoutMs } from "./pipeline-budget.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function runProjectCommand(command: string, args: ReadonlyArray<string>, timeoutMs: number) {
  return runCommand(command, args, { cwd: projectRoot, env: process.env, timeoutMs });
}

const modelCorpusOnly = process.argv.slice(2).includes("--model-corpus");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--model-corpus");
if (unknownArguments.length > 0) {
  throw new TypeError(`unsupported pipeline arguments: ${unknownArguments.join(", ")}`);
}
if (process.env.BPMN_PIPELINE_PREBUILT !== "1") {
  await Promise.all([
    runProjectCommand("./scripts/pnpm.sh", ["run", "build:differential"], 120_000),
    runProjectCommand("./scripts/lake.sh", ["build", "kernelRun"], nativeLeanDriverBuildTimeoutMs),
  ]);
}

const testFiles = modelCorpusOnly
  ? ["model-corpus/test/executable-model-corpus.test.ts"]
  : ["packages/differential/test/kernel-behavior-oracle.integration-test.ts", "packages/differential/test/row-fixtures.integration-test.ts"];

const testRun = await runProjectCommand(
  process.execPath,
  ["--test", "--test-concurrency=1", ...testFiles],
  pipelineCommandTimeoutMs(),
);

process.stdout.write(testRun.stdout);
process.stderr.write(testRun.stderr);
