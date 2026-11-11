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
 * The Lean kernel's result for one population scenario file, one program per definition in scenario order and the
 * file of the steps' digests (`populationStepDigests`).
 */
export async function runLeanKernelPopulation(
  digestsPath: string,
  programPaths: ReadonlyArray<string>,
  scenarioPath: string,
): Promise<unknown> {
  return parseWireJson(await runKernelDriver(["--population", digestsPath, ...programPaths, scenarioPath], 1), scenarioPath);
}

export function writeProgram(programPath: string, program: KernelJson): Promise<void> {
  return writeFile(programPath, JSON.stringify(program), "utf8");
}
