import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { decodeProcessInstanceSearchPage, processInstancesPath } from "@bpmn-lean/platform-contracts";
import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";
import { createPlatformServer, readPlatformServerConfig } from "@bpmn-lean/platform-server";
import type { PlatformServerRuntime } from "@bpmn-lean/platform-server";
import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import {
  ExternalTemporalRuntime, createCachedLocalEnvironment, createHostEffectActivities,
  readBpmnProcessTrace, readUserTaskDetail, submitMessageDelivery, submitUserTaskCompletion,
  withDeadline,
} from "@bpmn-lean/temporal-testkit";
import type { HostInteractionPort } from "@bpmn-lean/temporal-testkit";

import { allocatePlaywrightLoopbackPort } from "../../../scripts/playwright-loopback-ports.ts";
import { buildProcessShowcaseCatalog } from "../../../scripts/rc-showcase-catalog.ts";
import { prepareRcShowcases } from "./rc-showcase-preparation.ts";
import {
  RcShowcaseActors, driveRcShowcaseActor, loadRcShowcaseBindings, mergeRcEffectHandlers,
} from "./rc-showcase-actor.ts";
import type { RcShowcaseBinding } from "./rc-showcase-actor.ts";

type Environment = Awaited<ReturnType<typeof createCachedLocalEnvironment>>;
export type RcShowcaseRuntimeOptions = Readonly<{
  port?: number;
  webAssetDirectory?: string;
  automatedParticipants?: boolean;
}>;

const defaultWebAssets = fileURLToPath(new URL("../../../platform/apps/web/dist/", import.meta.url));
const temporalCacheDirectory = fileURLToPath(new URL("../../../.cache/temporal-cli/", import.meta.url));

/** Isolated evaluation host; scripted participants require an explicit automation launch. */
export class RcShowcaseRuntime {
  readonly #directory: string;
  readonly #port: number;
  readonly #bindings: readonly RcShowcaseBinding[];
  readonly #stop = new AbortController();
  readonly #actors: RcShowcaseActors | undefined;
  #environment: Environment | undefined;
  #worker: ExternalTemporalRuntime | undefined;
  #platform: PlatformServerRuntime | undefined;
  #origin: string | undefined;
  #polling: Promise<void> | undefined;
  #failure: unknown;
  #closing: Promise<void> | undefined;
  #started = false;

  private constructor(directory: string, port: number, bindings: readonly RcShowcaseBinding[], automatedParticipants: boolean) {
    this.#directory = directory;
    this.#port = port;
    this.#bindings = bindings;
    this.#actors = automatedParticipants ? new RcShowcaseActors(bindings, async (binding, instance) => {
      try {
        await driveRcShowcaseActor(binding, this.#interactionPort(instance), this.#stop.signal);
      } catch (error: unknown) {
        if (!this.#isStoppedWait(error)) throw error;
      }
    }) : undefined;
  }

  static async create(options: RcShowcaseRuntimeOptions = {}): Promise<RcShowcaseRuntime> {
    const requestedPort = options.port ?? 3_000;
    if (!Number.isSafeInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
      throw new RangeError("RC showcase port must be 0 or a valid TCP port");
    }
    const automatedParticipants = options.automatedParticipants ?? false;
    if (typeof automatedParticipants !== "boolean") throw new TypeError("automatedParticipants must be boolean");
    const bindings = await loadRcShowcaseBindings();
    mergeRcEffectHandlers(bindings);
    const port = requestedPort === 0 ? await allocatePlaywrightLoopbackPort() : requestedPort;
    const directory = await mkdtemp(join(tmpdir(), "bpmn-rc-showcase-"));
    try {
      const webDirectory = join(directory, "web");
      await cp(options.webAssetDirectory ?? defaultWebAssets, webDirectory, { recursive: true });
      await writeFile(join(webDirectory, "rc-showcase-runtime.json"),
        JSON.stringify({ kind: "rcShowcaseRuntime", version: 1, automatedParticipants }));
      return new RcShowcaseRuntime(directory, port, bindings, automatedParticipants);
    } catch (error: unknown) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  get origin(): string {
    if (this.#origin === undefined) throw new Error("RC showcase is not listening");
    return this.#origin;
  }

  assertHealthy(): void {
    if (this.#failure !== undefined) throw this.#failure;
    this.#actors?.check();
  }

  async start(): Promise<void> {
    if (this.#started || this.#stop.signal.aborted) throw new Error("RC showcase cannot start twice or after close");
    this.#started = true;
    try {
      const identity = `bpmn-rc-showcase-${randomUUID()}`;
      this.#environment = await withDeadline(createCachedLocalEnvironment({
        identity, downloadDirectory: temporalCacheDirectory,
      }), 40_000, "RC showcase Temporal startup");
      this.#worker = await ExternalTemporalRuntime.initializeFreshNamespace({
        address: this.#environment.address, namespace: identity, taskQueue: identity, identity,
      }, createHostEffectActivities(mergeRcEffectHandlers(this.#bindings)), 86_400);
      const origin = `http://127.0.0.1:${this.#port}`;
      this.#platform = await createPlatformServer({
        ...readPlatformServerConfig({}),
        host: "127.0.0.1", port: this.#port, publicOrigin: origin,
        dataDirectory: join(this.#directory, "data"), webAssetDirectory: join(this.#directory, "web"),
        maxSourceBytes: 1024 * 1024, parserDeadlineMs: 5_000,
        temporalAddress: this.#environment.address, temporalNamespace: identity, temporalTaskQueue: identity,
        temporalConnectTimeoutMs: 5_000,
        fakeActorId: "demo-user", fakeActorGroups: ["reviewers", "operators"],
        maxWorkProcesses: 100, maxWorkTasks: 1_000,
      });
      this.#origin = await withDeadline(this.#platform.listen(), 20_000, "RC showcase platform listen");
      const catalog = await buildProcessShowcaseCatalog(fileURLToPath(new URL("../../../", import.meta.url)));
      await prepareRcShowcases(this.#origin,
        catalog.filter((entry) => this.#actors !== undefined || entry.showcase?.mode === "human"), (input, init) => fetch(input, {
        ...init, signal: AbortSignal.any([this.#stop.signal, AbortSignal.timeout(10_000)]),
      }));
      this.#polling = this.#poll().catch((error: unknown) => {
        if (this.#isStoppedWait(error)) return;
        this.#failure = error;
        this.#stop.abort();
        console.error("RC showcase actor/discovery failure", error);
      });
    } catch (error: unknown) {
      try { await this.close(); } catch (cleanup: unknown) {
        throw new AggregateError([error, cleanup], "RC showcase startup and cleanup failed");
      }
      throw error;
    }
  }

  /** Resolves on requested shutdown; actor or discovery failures remain visible to the caller. */
  async wait(): Promise<void> {
    if (this.#polling === undefined) throw new Error("RC showcase is not started");
    await this.#polling;
    this.assertHealthy();
  }

  close(): Promise<void> {
    this.#closing ??= this.#close();
    return this.#closing;
  }

  async #close(): Promise<void> {
    this.#stop.abort();
    await this.#polling;
    const failures: unknown[] = this.#failure === undefined ? [] : [this.#failure];
    for (const close of [
      () => this.#actors?.drain(),
      () => this.#platform?.close(),
      () => this.#worker?.shutdown(),
      () => this.#environment?.teardown(),
      () => rm(this.#directory, { recursive: true, force: true }),
    ]) {
      try { await close(); } catch (error: unknown) { failures.push(error); }
    }
    this.#origin = undefined;
    if (failures.length > 0) throw new AggregateError(failures, "RC showcase shutdown failed");
  }

  async #poll(): Promise<void> {
    if (this.#stop.signal.aborted) return;
    if (this.#actors === undefined) {
      await new Promise<void>((resolve) => this.#stop.signal.addEventListener("abort", () => resolve(), { once: true }));
      return;
    }
    while (!this.#stop.signal.aborted) {
      this.#actors?.check();
      let cursor: string | undefined;
      const cursors = new Set<string>();
      do {
        const path = processInstancesPath({ limit: 100, ...(cursor === undefined ? {} : { cursor }) });
        const response = await fetch(new URL(path, this.origin), {
          signal: AbortSignal.any([this.#stop.signal, AbortSignal.timeout(10_000)]),
        });
        if (!response.ok) throw new Error(`RC instance discovery returned HTTP ${response.status}`);
        const page = decodeProcessInstanceSearchPage(await response.json());
        this.#stop.signal.throwIfAborted();
        for (const instance of page.instances) this.#actors.discover(instance);
        cursor = page.nextCursor ?? undefined;
        if (cursor !== undefined) {
          if (cursors.has(cursor)) throw new Error("RC instance discovery repeated a page cursor");
          cursors.add(cursor);
        }
        this.#actors?.check();
      } while (cursor !== undefined);
      await delay(250, undefined, { signal: this.#stop.signal });
    }
  }

  #interactionPort(instance: PublicProcessInstanceIdentity): HostInteractionPort {
    const client = this.#worker!.workflowClient;
    const id = instance.processInstanceId;
    const signal = this.#stop.signal;
    return {
      readState: async () => {
        signal.throwIfAborted();
        const trace = await readBpmnProcessTrace(client, id);
        const state = trace.findLast((entry) => entry.kind === CanonicalObservationKind.State);
        if (state === undefined || state.instanceId !== id) throw new Error("RC actor requires its published instance state");
        return state;
      },
      readUserTaskDetail: async (request) => {
        signal.throwIfAborted();
        return readUserTaskDetail(client, id, request);
      },
      submitCompletion: async (stimulus) => {
        signal.throwIfAborted();
        return submitUserTaskCompletion(client, id, stimulus);
      },
      submitMessage: async (stimulus) => {
        signal.throwIfAborted();
        return submitMessageDelivery(client, id, stimulus);
      },
      publishCorrelated: async () => { throw new Error("RC showcase selects no correlated-message actor"); },
      submitCancellation: async () => { throw new Error("RC showcase selects no incident-cancellation actor"); },
    };
  }

  #isStoppedWait(error: unknown): boolean {
    return this.#stop.signal.aborted && (error === this.#stop.signal.reason
      || (error instanceof Error && error.name === "AbortError"));
  }
}
