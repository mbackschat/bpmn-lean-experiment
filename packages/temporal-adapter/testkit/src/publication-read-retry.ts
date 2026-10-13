import { setTimeout as delay } from "node:timers/promises";

/**
 * The wire arm both client publication results use for "the Query did not answer".
 *
 * A literal rather than either result enum's member, because the reader serves the execution and
 * the occurrence results alike; the unit test pins both enums to this value.
 */
export const publicationUnavailableKind = "unavailable" as const;

export type PublicationReadPolicy = Readonly<{
  /** Pause between two attempts. */
  pauseMs: number;
  /** Total time after which a still-unavailable publication is reported as a hang. */
  hangGuardMs: number;
}>;

export const defaultPublicationReadPolicy: PublicationReadPolicy = {
  pauseMs: 50,
  hangGuardMs: 120_000,
};

/** A publication read result without the `unavailable` arm. */
export type AnsweredPublicationRead<Result extends Readonly<{ kind: string }>> = Exclude<
  Result,
  Readonly<{ kind: typeof publicationUnavailableKind }>
>;

/**
 * Rereads a Product 1 publication while the client reports it `unavailable`, then returns the
 * first other result unchanged.
 *
 * `unavailable` is the production clients' transient arm: each Query carries a 5 s deadline
 * (`operationDeadlineMs` in the execution, occurrence and segment publication clients), and a Query
 * the Worker never answers within it leaves the client with nothing to say about the Process. The
 * demonstrated cause under host load is
 * [TD-001](../../../../docs/TEMPORAL-DEFECTS-LEDGER.md#td-001-query-loss-during-run-eviction): Core
 * drops the Queries queued behind a Run eviction, and load widens that window. Product 2 treats the
 * arm as retryable for the same reason (`PostgresqlOperateRecoveryRetryReason.GatewayUnavailable` in
 * `postgresql-execution-recovery-step.ts`), so rereading matches the public retryable contract; it
 * does not repair the defect. A hosted test that asserted `available` on one read would instead
 * assert that no Query was lost, which is not the property under test. Callers keep asserting
 * `available`, `notFound`, `notReady` or `gap` exactly; no other arm is retried, and a read that
 * throws propagates at once.
 *
 * Each reread writes one `console.warn` line, so how often TD-001 strikes stays visible in the
 * test output even though the test passes.
 *
 * `hangGuardMs` only stops a publication that never answers. It is a hang guard, not a
 * performance assertion: no test may rely on the elapsed time staying under it, and tightening it
 * would reintroduce the host-load dependence this reader removes.
 */
export async function readPublicationUntilAnswered<Result extends Readonly<{ kind: string }>>(
  operation: string,
  read: () => Promise<Result>,
  policy: PublicationReadPolicy = defaultPublicationReadPolicy,
): Promise<AnsweredPublicationRead<Result>> {
  const startedAt = performance.now();
  for (let attempts = 1; ; attempts += 1) {
    const result = await read();
    if (isAnswered(result)) return result;
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (elapsedMs >= policy.hangGuardMs) {
      throw new Error(
        `${operation} stayed ${publicationUnavailableKind} for ${elapsedMs} ms over ${attempts} attempts ` +
          `(hang guard ${policy.hangGuardMs} ms)`,
      );
    }
    console.warn(
      `publication read "${operation}": attempt ${attempts} returned ${publicationUnavailableKind}; rereading`,
    );
    await delay(policy.pauseMs);
  }
}

function isAnswered<Result extends Readonly<{ kind: string }>>(
  result: Result,
): result is AnsweredPublicationRead<Result> {
  return result.kind !== publicationUnavailableKind;
}
