/** Fixtures for the engine API's tests: retained scenario models read as exact bytes, and profiles as data. */
import { readFile } from "node:fs/promises";

import {
  EngineDeploymentStatus,
  registerEngineDeployment,
  type EngineDeploymentRequest,
  type EngineHost,
  type EngineProfile,
  type EngineServedRequirements,
} from "@bpmn-lean/engine-api";
import { createMemoryEngineHost, servesEverything, type MemoryEngineHost } from "@bpmn-lean/engine-api/testing";
import type { ProcessHost } from "@bpmn-lean/temporal-host/host";

export { pendingSchedule, servesEverything } from "@bpmn-lean/engine-api/testing";

export const limits = { maxBytes: 1_048_576, parserDeadlineMs: 1_000 } as const;

/** The standards reading: no CIB relation selected. */
export const standardProfile: EngineProfile = { id: "test-standard", relations: [] };

/** A technical failure raises an incident that Retry or Cancel resolves (CIB-EXT-0013, CIB-OP-0009). */
export const incidentProfile: EngineProfile = { id: "test-incident", relations: ["CIB-EXT-0013", "CIB-OP-0009"] };

/** The CIB Seven 2.2.0 cumulative profile as the catalog holds it: its identity and its selected relations. */
export async function cibProfile(): Promise<EngineProfile> {
  const document = JSON.parse(await readFile(new URL("../../../profiles/cibseven-2.2.0/profile.json", import.meta.url), "utf8")) as
    Readonly<{ id: string; bpmn: Readonly<{ relationships: readonly string[] }> }>;
  return { id: document.id, relations: document.bpmn.relationships };
}

export async function scenarioBytes(relativePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL(`../../../scenarios/${relativePath}`, import.meta.url)));
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type TestHost = MemoryEngineHost;

/** The population every `testHost` serves, named by its Task Queue; it scopes process-instance addresses. */
export const testPopulation = "engine-test";

/** A memory host whose Workflow time is `now`, 1,000 ms unless a test moves it. */
export function testHost(served: EngineServedRequirements = servesEverything, now: () => number = () => 1_000): TestHost {
  return createMemoryEngineHost({ served, taskQueue: testPopulation, now });
}

/** `request` once the definition version it names is registered with its host's population, as Product 2 deploys. */
export async function deployed<R extends EngineDeploymentRequest>(request: R): Promise<R> {
  const result = await registerEngineDeployment(request);
  if (result.status !== EngineDeploymentStatus.Registered) throw new Error(`deployment refused: ${result.failure.code}`);
  return request;
}

/** What the held start answers once released: the kernel's commit, or its refusal, the chain then ending `NotStarted`. */
export type HeldStartVerdict = "commits" | "refuses";

/**
 * `host` with its one start held undecided as Temporal shows it while the start's first Workflow task runs: the chain
 * and its memo are retained, the chain runs, and no committed view exists yet. Released, the start commits, or the
 * kernel refuses it and the chain ends with no committed view.
 */
export function heldStart(host: TestHost): Readonly<{
  host: EngineHost; reached: Promise<void>; release: (verdict: HeldStartVerdict) => void;
}> {
  let decide!: (verdict: HeldStartVerdict) => void;
  let reach!: () => void;
  const decided = new Promise<HeldStartVerdict>((resolve) => { decide = resolve; });
  const reached = new Promise<void>((resolve) => { reach = resolve; });
  let phase: "inFlight" | HeldStartVerdict | null = null;
  const hidden = (): boolean => phase === "inFlight" || phase === "refuses";
  const processes: ProcessHost = {
    start: async (request) => {
      const result = await host.processes.start(request);
      if (phase !== null) return result;
      phase = "inFlight";
      reach();
      phase = await decided;
      return phase === "commits" ? result : { outcome: "rejected", code: "held-start-refused", revision: null };
    },
    command: (workflowId, stimulus) => host.processes.command(workflowId, stimulus),
    deliver: (workflowId, stimulus) => host.processes.deliver(workflowId, stimulus),
    observation: (workflowId) => host.processes.observation(workflowId),
    hostView: async (workflowId) => {
      const snapshot = await host.processes.hostView(workflowId);
      return hidden() ? { ...snapshot, view: null } : snapshot;
    },
    publication: (workflowId, afterRevision, limit) => host.processes.publication(workflowId, afterRevision, limit),
    describe: async (workflowId) => {
      const described = await host.processes.describe(workflowId);
      return described === null || !hidden() ? described : { ...described, running: phase === "inFlight" };
    },
  };
  return { host: { ...host, processes }, reached, release: decide };
}
