/** Lean `kernelRun` invocation for the differential: the one place a differential test starts a Lean process. */
import { writeFile } from "node:fs/promises";

import type { KernelJson } from "@bpmn-lean/bpmn-source";

import { prepareNativeLeanDriver } from "../../../scripts/lean-native-driver.ts";
import { leanDriverBatchTimeoutMsFor } from "../../../scripts/pipeline-budget.ts";
import { parseWireJson } from "../../../scripts/strict-json.ts";
import { runProcess } from "./pipeline-target-support.ts";

const kernelDriver = "Kernel/Run.lean";

/** Runs `kernelRun` once with the given arguments; the deadline covers execution only, never the build. */
async function runKernelDriver(args: ReadonlyArray<string>, caseCount: number): Promise<string> {
  const execution = await runProcess(
    await prepareNativeLeanDriver(kernelDriver),
    args,
    leanDriverBatchTimeoutMsFor(caseCount),
    "utf8Fatal",
  );
  return execution.stdout;
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

export function writeProgram(programPath: string, program: KernelJson): Promise<void> {
  return writeFile(programPath, JSON.stringify(program), "utf8");
}
