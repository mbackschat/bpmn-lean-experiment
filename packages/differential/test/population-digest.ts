/**
 * The digests a population's command ledger binds (population contract §7): for each step, the SHA-256 of its
 * canonical wire form, the scenario's JSON for the step without its logical time `at` and with every object's keys in
 * code-unit order. A retry arrives later than the command it repeats, so its time is not its content (engine contract
 * (5)). The harness computes them once and passes them to both kernels, so neither kernel reimplements canonical JSON or
 * SHA-256, and the Lean kernel trusts them: the binding of a digest to its content is outside the Lean authority.
 */
import { createHash } from "node:crypto";

import { canonicalJson } from "@bpmn-lean/temporal-host/host";

export function populationStepDigests(steps: readonly unknown[]): string[] {
  return steps.map((step) => {
    const record = step !== null && typeof step === "object" && !Array.isArray(step) ? step as Record<string, unknown> : {};
    const { at: _at, ...content } = record;
    return createHash("sha256").update(canonicalJson(content)).digest("hex");
  });
}
