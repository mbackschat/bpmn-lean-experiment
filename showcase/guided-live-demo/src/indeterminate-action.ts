import { setTimeout as waitFor } from "node:timers/promises";

export type TerminalIncidentActionOptions = Readonly<{
  action: string;
  deadlineMs: number;
  pollingDelayMs: number;
  submit: () => Promise<number>;
  now?: () => number;
  wait?: (delayMs: number) => Promise<void>;
}>;

/** Paces exact resubmissions until two-phase recovery publishes a terminal response. */
export async function awaitTerminalIncidentAction(
  options: TerminalIncidentActionOptions,
): Promise<void> {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (async (delayMs: number) => await waitFor(delayMs));
  const deadlineAt = now() + options.deadlineMs;

  while (true) {
    const remainingMs = deadlineAt - now();
    if (remainingMs <= 0) {
      throw new Error(
        `${options.action} did not commit within ${options.deadlineMs} ms`,
      );
    }
    await wait(Math.min(options.pollingDelayMs, remainingMs));
    const status = await options.submit();
    switch (status) {
      case 200:
        return;
      case 202:
        break;
      default:
        throw new Error(
          `${options.action} returned unexpected HTTP ${status}`,
        );
    }
  }
}
