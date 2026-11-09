/**
 * The showcase's Temporal side: one cached ephemeral server and one host Worker polling the platform's Task Queue.
 *
 * Each showcase owns its own ephemeral server, so the server's default Namespace isolates it as well as a fresh
 * Namespace would; the old adapter registered one only to initialize Worker deployment versioning, which the host
 * does not use.
 */
import { createCachedLocalEnvironment } from "@bpmn-lean/temporal-host/testing";
import { createHostWorker, type EffectHandler } from "@bpmn-lean/temporal-host/worker";

export type TemporalEnvironment = Awaited<ReturnType<typeof createCachedLocalEnvironment>>;
type Worker = Awaited<ReturnType<typeof createHostWorker>>;

export { createCachedLocalEnvironment };
export type { EffectHandler };

/** The bound on one Script Task's evaluation; a breach is the effect's technical failure. */
const scriptTimeoutMs = 5_000;

/** The Namespace every client and Worker of a showcase server uses. */
export function environmentNamespace(environment: TemporalEnvironment): string {
  return environment.namespace ?? "default";
}

/**
 * Refuses every effect. A thrown error is a transport failure Temporal retries, so an effect-bearing Process under
 * this handler stays open instead of committing a result no configuration declared.
 */
export const noEffects: EffectHandler = async (request) => {
  throw new Error(`no effect handler is configured for ${request.protocol}/${request.operation}`);
};

/** A running host Worker; `shutdown` stops polling and waits until the Worker has drained. */
export class ShowcaseWorker {
  readonly #worker: Worker;
  readonly #running: Promise<void>;
  #stopped = false;

  /** Showcases run their TypeScript under Node's type stripping, which refuses parameter properties. */
  private constructor(worker: Worker, running: Promise<void>) {
    this.#worker = worker;
    this.#running = running;
  }

  static async start(
    environment: TemporalEnvironment,
    options: Readonly<{ taskQueue: string; identity: string; effects: EffectHandler }>,
  ): Promise<ShowcaseWorker> {
    const worker = await createHostWorker({
      connection: environment.nativeConnection,
      namespace: environmentNamespace(environment),
      taskQueue: options.taskQueue,
      identity: options.identity,
      effects: options.effects,
      scriptTimeoutMs,
    });
    return new ShowcaseWorker(worker, worker.run());
  }

  async shutdown(): Promise<void> {
    if (!this.#stopped) {
      this.#stopped = true;
      this.#worker.shutdown();
    }
    await this.#running;
  }
}

/** Rejects with `label` when `operation` does not settle within `deadlineMs`. */
export async function withDeadline<T>(operation: Promise<T>, deadlineMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${deadlineMs} ms`)), deadlineMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
