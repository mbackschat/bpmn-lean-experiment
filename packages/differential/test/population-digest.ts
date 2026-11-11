/**
 * The digests a population's command ledger binds (population contract §7): for each step, the SHA-256 of its
 * canonical wire form, the scenario's JSON for the step with every object's keys in code-unit order and its logical
 * time `at`, given or inherited from the step before (0 for the first). The harness computes them once and passes them
 * to both kernels, so neither kernel reimplements canonical JSON or SHA-256.
 */
import { createHash } from "node:crypto";

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, sortedKeys(entry)]));
  }
  return value;
}

export function populationStepDigests(steps: readonly unknown[]): string[] {
  let clock = 0;
  return steps.map((step) => {
    const record = step !== null && typeof step === "object" && !Array.isArray(step) ? step as Record<string, unknown> : {};
    const at = record["at"];
    if (typeof at === "number") clock = at;
    return createHash("sha256").update(JSON.stringify(sortedKeys({ ...record, at: clock }))).digest("hex");
  });
}
