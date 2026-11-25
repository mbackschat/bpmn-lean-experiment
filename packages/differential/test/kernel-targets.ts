/** Lean `kernelRun` invocation for the differential: the one place a differential test starts a Lean process. */
import { constants, cpSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { KernelJson } from "@bpmn-lean/bpmn-source";

import { nativeLeanDriverBuildTimeoutMs, prepareNativeLeanDriver } from "../../../scripts/lean-native-driver.ts";
import { leanDriverBatchTimeoutMsFor } from "../../../scripts/pipeline-budget.ts";
import { parseStrictJson, parseWireJson } from "../../../scripts/strict-json.ts";
import { runCommand } from "../../../scripts/run-command.ts";
import { projectRoot, runProcess } from "./pipeline-target-support.ts";

const kernelDriver = "Kernel/Run.lean";

/**
 * Runs `kernelRun` once with the given arguments, the checkout's build unless `binary` names another (the
 * opposite-key-order build's); the deadline covers execution only, never the build.
 */
async function runKernelDriver(args: ReadonlyArray<string>, caseCount: number, binary?: string): Promise<string> {
  const execution = await runProcess(
    binary ?? await prepareNativeLeanDriver(kernelDriver),
    args,
    leanDriverBatchTimeoutMsFor(caseCount),
    "utf8Fatal",
  );
  return execution.stdout;
}

/** What a copy of the checkout needs to build `kernelRun` with its wrapper: the Lean sources, Lake's configuration, the wrapper and what it reads. */
const leanInputs = [
  "Kernel", "Kernel.lean", "lakefile.toml", "lean-toolchain", "lake-manifest.json", "package.json",
  "scripts/lake.sh", "scripts/pinned-toolchain.sh", "scripts/memory-brake.sh",
];

const normalKeyOrder = "def keyOrderOpposite : Bool := false";

/**
 * The opposite-key-order build of `kernelRun` (KD7): the checkout's Lean inputs and `.lake/build` copied to `directory`,
 * `Kernel/State/KeyOrder.lean`'s constant set to `true`, and `kernelRun` built there. The constant's body is hidden from
 * its importers, so Lake rebuilds that module alone and relinks (4 s, 2026-11-24). Resolves to the built executable,
 * after checking that the constant occurred exactly once and that the executable differs from the checkout's, so a
 * build that did not take never reads as agreement.
 */
export async function oppositeKeyOrderKernelRun(directory: string): Promise<string> {
  for (const input of leanInputs) cpSync(path.join(projectRoot, input), path.join(directory, input), { recursive: true });
  // A clone where the file system has one (APFS, Btrfs), else a copy; Lake's traces travel with the build.
  cpSync(path.join(projectRoot, ".lake", "build"), path.join(directory, ".lake", "build"), { recursive: true, mode: constants.COPYFILE_FICLONE });
  const constantPath = path.join(directory, "Kernel", "State", "KeyOrder.lean");
  const source = await readFile(constantPath, "utf8");
  if (source.split(normalKeyOrder).length !== 2) throw new Error(`${normalKeyOrder} must occur exactly once in KeyOrder.lean`);
  await writeFile(constantPath, source.replace(normalKeyOrder, "def keyOrderOpposite : Bool := true"), "utf8");
  await runCommand("./scripts/lake.sh", ["build", "kernelRun"], { cwd: directory, env: process.env, timeoutMs: nativeLeanDriverBuildTimeoutMs });
  const binary = path.join(directory, ".lake", "build", "bin", "kernelRun");
  if ((await readFile(binary)).equals(await readFile(await prepareNativeLeanDriver(kernelDriver)))) {
    throw new Error("the opposite-key-order build's kernelRun is the checkout's");
  }
  return binary;
}

/** The Lean kernel's result for one single-instance scenario file. */
export async function runLeanKernelScenario(programPath: string, scenarioPath: string): Promise<unknown> {
  return parseWireJson(await runKernelDriver([programPath, scenarioPath], 1), scenarioPath);
}

/**
 * The Lean kernel's host-view run of one single-instance scenario file (`kernelRun --host-view`): its result, the
 * program's host requirements and definition capabilities, and the host view of every committed input.
 */
export async function runLeanKernelHostView(programPath: string, scenarioPath: string): Promise<unknown> {
  return parseWireJson(await runKernelDriver(["--host-view", programPath, scenarioPath], 1), scenarioPath);
}

/**
 * The Lean kernel's result for one population scenario file, one deployment source per deployment in deploy order
 * (`populationPrograms`) and the file of the steps' digests (`populationStepDigests`).
 */
export async function runLeanKernelPopulation(
  digestsPath: string,
  sourcePaths: ReadonlyArray<string>,
  scenarioPath: string,
): Promise<unknown> {
  return parseWireJson(await runKernelDriver(["--population", digestsPath, ...sourcePaths, scenarioPath], 1), scenarioPath);
}

/**
 * The Lean strict codec's answer for each program file (`kernelRun --decode`): `null` when it decodes, else its refusal.
 * An empty list starts no process.
 */
export async function decodeLeanPrograms(programPaths: ReadonlyArray<string>): Promise<ReadonlyMap<string, string | null>> {
  if (programPaths.length === 0) return new Map();
  const answers = parseWireJson<ReadonlyArray<Readonly<{ fixture: string; refusal: string | null }>>>(
    await runKernelDriver(["--decode", ...programPaths], programPaths.length), "kernelRun --decode");
  return new Map(answers.map(({ fixture, refusal }) => [fixture, refusal]));
}

/**
 * The Lean answer for each kernel fixture file (`kernelRun --fixture`), read in one process; a malformed fixture fails
 * the whole run with its `fixture-` code, and so does an empty list, which `kernelRun` refuses as a usage error.
 */
export async function runLeanKernelFixtures(fixturePaths: ReadonlyArray<string>): Promise<ReadonlyMap<string, unknown>> {
  const answers = parseWireJson<ReadonlyArray<Readonly<{ fixture: string; answer: unknown }>>>(
    await runKernelDriver(["--fixture", ...fixturePaths], fixturePaths.length), "kernelRun --fixture");
  return new Map(answers.map(({ fixture, answer }) => [fixture, answer]));
}

/**
 * The Lean answer to each case of a batch file (`kernelRun --batch`), in file order: `{answer}`, or `{error}` with the
 * harness error that case raised. Its answers echo the cases' variable values, which may be negative Integers, so it is
 * read as strict JSON rather than as a wire document of unsigned integers.
 */
export async function runLeanKernelBatch(casesPath: string, caseCount: number): Promise<ReadonlyArray<unknown>> {
  return parseStrictJson<ReadonlyArray<unknown>>(await leanKernelBatchText(casesPath, caseCount), casesPath);
}

/** What `kernelRun --batch` prints for a batch file, byte for byte, from the checkout's build or `binary`. */
export function leanKernelBatchText(casesPath: string, caseCount: number, binary?: string): Promise<string> {
  return runKernelDriver(["--batch", casesPath], caseCount, binary);
}

export function writeProgram(programPath: string, program: KernelJson): Promise<void> {
  return writeFile(programPath, JSON.stringify(program), "utf8");
}
