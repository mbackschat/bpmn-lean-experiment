/** The kernel IL a differential case feeds both kernels. */
import path from "node:path";

import { kernelProfileOptions, lowerCheckedProcessToKernel } from "@bpmn-lean/bpmn-source";
import type { AcceptedBpmnCompilation, KernelJson } from "@bpmn-lean/bpmn-source";

import { projectRoot, readJson } from "./pipeline-target-support.ts";

type ProfileDocument = Readonly<{ bpmn?: Readonly<{ relationships?: ReadonlyArray<string> }> }>;

/**
 * Lowers one checked process with the relations its case's profile selects.
 *
 * Every registered model must lower: a refusal here means a case the kernel cannot carry, which is a harness error
 * rather than a semantic outcome to compare.
 */
export async function lowerCaseToKernel(
  checkedProcess: AcceptedBpmnCompilation["checkedProcess"],
  profileId: string,
): Promise<KernelJson> {
  const profile = await readJson<ProfileDocument>(path.join(projectRoot, "profiles", profileId, "profile.json"));
  const lowered = lowerCheckedProcessToKernel(checkedProcess, kernelProfileOptions(profile.bpmn?.relationships ?? []));
  if (lowered.kind === "refused") {
    throw new Error(`Kernel lowering refused ${checkedProcess.identity.sourceId}: ${lowered.code}`);
  }
  return lowered.program;
}
