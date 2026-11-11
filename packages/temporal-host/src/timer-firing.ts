/**
 * The firing Workflow of a Timer start ([population ingress](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)):
 * a Schedule's single action starts it at the occurrence's due second, and its only work is to submit the population
 * command `timerStart` for that occurrence, under its own Workflow ID as the command identity. The ingress answers with
 * the kernel's verdict and, on commit, starts the instance under the kernel-derived identity; the firing returns that
 * answer and decides nothing itself.
 */
import { proxyActivities, workflowInfo } from "@temporalio/workflow";

import type { CommandAnswer, PopulationActivities, TimerFiringArgs } from "./population-contract.js";

/** Transport retries only; a refusal before acceptance other than a full queue fails the firing (`fireTimerStart`). */
const activities = proxyActivities<Pick<PopulationActivities, "fireTimerStart">>({
  startToCloseTimeout: "1m",
  retry: { initialInterval: "1s", backoffCoefficient: 2, maximumInterval: "1m" },
});

export async function fireTimerStart(args: TimerFiringArgs): Promise<CommandAnswer> {
  return activities.fireTimerStart({ ...args, commandId: workflowInfo().workflowId });
}
