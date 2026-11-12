/** The kernel IL a differential case feeds both kernels. */
import { readFileSync } from "node:fs";
import path from "node:path";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import type { KernelJson, KernelProfileOptions, KernelRead, KernelSource } from "@bpmn-lean/bpmn-source";
import { admit, decodeProgram, encodeProgram, type JsonValue } from "@bpmn-lean/kernel";

import { parseWireJson } from "../../../scripts/strict-json.ts";
import { projectRoot } from "./pipeline-target-support.ts";

type ProfileDocument = Readonly<{ bpmn?: Readonly<{ relationships?: ReadonlyArray<string> }> }>;

const readLimits = { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 };

export type CaseSource = Readonly<{
  relativePath: string;
  bytes: Uint8Array;
  sha256: string;
  overlay: KernelSource["overlay"];
  decisions?: KernelSource["decisions"];
}>;

/** The kernel options profile `profileId` selects, derived from its CIB relations. */
export function profileKernelOptions(profileId: string, root: string = projectRoot): KernelProfileOptions {
  const file = path.join(root, "profiles", profileId, "profile.json");
  const profile = parseWireJson<ProfileDocument>(readFileSync(file, "utf8"), file);
  return kernelProfileOptions(profile.bpmn?.relationships ?? []);
}

/** Reads one BPMN source with the relations its profile selects; a refusal is returned, not thrown. */
export async function readCaseSource(source: CaseSource, profileId: string): Promise<KernelRead> {
  return readKernelProgram({
    bytes: source.bytes,
    expectedSha256: source.sha256,
    overlay: source.overlay,
    profile: profileId,
    limits: readLimits,
    ...(source.decisions === undefined ? {} : { decisions: source.decisions }),
  }, profileKernelOptions(profileId));
}

/**
 * Reads one case's BPMN source to the kernel IL.
 *
 * For callers whose model must be read, a population definition or a fixture: a refusal here is a harness error. A
 * single-instance scenario's refused source is a refused deployment instead (`scenarioKernelInput`).
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

/** The kernel codec's canonical encoding of a read program (guard 21's row fixtures), or its strict-decoding refusal. */
export function canonicalKernelProgram(program: KernelJson): Readonly<{ ok: true; value: JsonValue } | { ok: false; refusal: string }> {
  const decoded = decodeProgram(program);
  return decoded.ok ? { ok: true, value: encodeProgram(decoded.value) } : { ok: false, refusal: decoded.refusal };
}
