/** The kernel IL a differential case feeds both kernels. */
import path from "node:path";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import type { KernelJson, KernelRead, KernelSource } from "@bpmn-lean/bpmn-source";
import { admit, decodeProgram } from "@bpmn-lean/kernel";

import { projectRoot, readJson } from "./pipeline-target-support.ts";

type ProfileDocument = Readonly<{ bpmn?: Readonly<{ relationships?: ReadonlyArray<string> }> }>;

const readLimits = { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 };

export type CaseSource = Readonly<{
  relativePath: string;
  bytes: Uint8Array;
  sha256: string;
  overlay: KernelSource["overlay"];
}>;

/** Reads one BPMN source with the relations its profile selects; a refusal is returned, not thrown. */
export async function readCaseSource(source: CaseSource, profileId: string): Promise<KernelRead> {
  const profile = await readJson<ProfileDocument>(path.join(projectRoot, "profiles", profileId, "profile.json"));
  return readKernelProgram({
    bytes: source.bytes,
    expectedSha256: source.sha256,
    overlay: source.overlay,
    profile: profileId,
    limits: readLimits,
  }, kernelProfileOptions(profile.bpmn?.relationships ?? []));
}

/**
 * Reads one case's BPMN source to the kernel IL.
 *
 * Every scenario's model must be read: a refusal here means a source the reader cannot read faithfully, which is a
 * harness error rather than a semantic outcome to compare.
 */
export async function readCaseKernelProgram(source: CaseSource, profileId: string): Promise<KernelJson> {
  const read = await readCaseSource(source, profileId);
  if (read.kind === "refused") {
    throw new Error(`Kernel reader refused ${source.relativePath}: ${read.code} ${read.element ?? ""} ${read.evidence}`);
  }
  return read.program;
}

export type KernelAdmission = Readonly<{ status: "accepted" } | { status: "rejected"; refusal: string }>;

/** The kernel's admission decision for one read: the reader's refusal, a strict-decoding refusal, or `admit`'s. */
export function kernelAdmission(read: KernelRead): KernelAdmission {
  if (read.kind === "refused") return { status: "rejected", refusal: read.code };
  const decoded = decodeProgram(read.program);
  if (!decoded.ok) return { status: "rejected", refusal: decoded.refusal };
  const refusal = admit(decoded.value);
  return refusal === null ? { status: "accepted" } : { status: "rejected", refusal };
}
