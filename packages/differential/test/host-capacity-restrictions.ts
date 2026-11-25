/**
 * The single-instance scenarios the kernel runs and the host refuses by a Workflow-chain capacity bound
 * ([capacity table](../../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#workflow-chain-capacity)): each input up to the
 * refused one commits as in the kernel, and the refused one is rejected with the bound's code before anything commits.
 * The host targets check these against that code instead of the kernel's result.
 */
export const hostCapacityRestrictions: ReadonlyMap<string, Readonly<{ commandId: string; code: string }>> = new Map([
  // One input's journal of about 6,000 transitions publishes 2,604,132 bytes in one batch (measured 2026-11-13).
  ["scenarios/open-rows/cycle-compositions/automatic-loop-long-burst.scenario.json", { commandId: "s01-start", code: "host.capacity.publicationBatch" }],
  ["scenarios/open-rows/cycle-compositions/automatic-loop-tail-at-closure-bound.scenario.json", { commandId: "s01-start", code: "host.capacity.publicationBatch" }],
  // Its 1,412 open User Tasks take the state past its bound before the batch is measured.
  // DC3's fuel witnesses: one input loops 171 and 359 times past an Inclusive join, publishing 95,572 + 235,009 and
  // 201,009 + 494,290 bytes (execution + occurrences) in one batch (measured 2026-11-19, spike T75).
  ["scenarios/open-rows/inclusive-join-compositions/looped-arrivals-171-then-hold.scenario.json", { commandId: "s01-start", code: "host.capacity.publicationBatch" }],
  ["scenarios/open-rows/inclusive-join-compositions/looped-arrivals-second-join-359-then-hold2.scenario.json", { commandId: "s01-start", code: "host.capacity.publicationBatch" }],
  ["scenarios/open-rows/cycle-compositions/automatic-loop-waiting-branch-at-work-bound.scenario.json", { commandId: "s01-start", code: "host.capacity.state" }],
]);

/** The first input of `result` that did not commit, as the scenario trace records it. */
export function firstUncommitted(result: unknown): unknown {
  const trace = (result as { readonly trace: readonly Record<string, unknown>[] }).trace;
  const entry = trace.find((item) => item["kind"] === "command" && item["outcome"] !== "committed");
  return entry === undefined ? null : { commandId: entry["commandId"], outcome: entry["outcome"], code: entry["code"] };
}
