/** The kernel IL a differential case feeds both kernels. */
import path from "node:path";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import type { KernelJson, KernelSource } from "@bpmn-lean/bpmn-source";

import { projectRoot, readJson } from "./pipeline-target-support.ts";

type ProfileDocument = Readonly<{ bpmn?: Readonly<{ relationships?: ReadonlyArray<string> }> }>;

const readLimits = { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 };

/**
 * Reads one case's BPMN source to the kernel IL with the relations its profile selects.
 *
 * Every registered model must be read: a refusal here means a source the reader cannot read faithfully, which is a
 * harness error rather than a semantic outcome to compare.
 */
export async function readCaseKernelProgram(
  source: Readonly<{ relativePath: string; bytes: Uint8Array; sha256: string; overlay: KernelSource["overlay"] }>,
  profileId: string,
): Promise<KernelJson> {
  const profile = await readJson<ProfileDocument>(path.join(projectRoot, "profiles", profileId, "profile.json"));
  const read = await readKernelProgram({
    bytes: source.bytes,
    expectedSha256: source.sha256,
    overlay: source.overlay,
    profile: profileId,
    limits: readLimits,
  }, kernelProfileOptions(profile.bpmn?.relationships ?? []));
  if (read.kind === "refused") {
    throw new Error(`Kernel reader refused ${source.relativePath}: ${read.code} ${read.element ?? ""} ${read.evidence}`);
  }
  return read.program;
}
