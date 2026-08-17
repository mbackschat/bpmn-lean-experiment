import assert from "node:assert/strict";
import test from "node:test";

import {
  RecoveryWorkerInfrastructureError,
  RecoveryWorkerRuntime,
} from "../dist/runtime.js";
import { recoveryWorkerFamilies } from "../dist/family-loops.js";

test("an observed loop error aborts every sibling and fails the run", async () => {
  const settled: string[] = [];
  const loops = recoveryWorkerFamilies.map((family, index) => ({
    family,
    runUntilAborted: async (signal: AbortSignal, observe: (run: never) => Promise<void>) => {
      if (index === 0) {
        await observe({
          claimed: 1,
          completed: 0,
          retried: 0,
          permanentlyFailed: 0,
          leaseLost: 0,
          errors: 1,
        } as never);
      } else {
        await aborted(signal);
        settled.push(family);
      }
    },
  }));
  const runtime = new RecoveryWorkerRuntime(
    loops,
    owner("engine"),
    owner("postgresql"),
    async () => undefined,
  );
  await assert.rejects(runtime.run(), RecoveryWorkerInfrastructureError);
  assert.equal(settled.length, 10);
});

test("permanent domain failures are reported without aborting siblings", async () => {
  const controller = new AbortController();
  const reports: unknown[] = [];
  const loops = recoveryWorkerFamilies.map((family) => ({
    family,
    runUntilAborted: async (signal: AbortSignal, observe: (run: never) => Promise<void>) => {
      await observe({
        claimed: 1,
        completed: 0,
        retried: 0,
        permanentlyFailed: 1,
        leaseLost: 0,
        errors: 0,
      } as never);
      controller.abort();
      await aborted(signal);
    },
  }));
  const runtime = new RecoveryWorkerRuntime(
    loops,
    owner("engine"),
    owner("postgresql"),
    async (report) => { reports.push(report); },
  );
  const run = runtime.run();
  await runtime.close();
  await run;
  assert.equal(reports.length, 11);
});

test("shutdown settles loops before attempting both owners and is idempotent", async () => {
  const events: string[] = [];
  const loops = recoveryWorkerFamilies.map((family) => ({
    family,
    runUntilAborted: async (signal: AbortSignal) => {
      events.push(`start:${family}`);
      await aborted(signal);
      events.push(`settle:${family}`);
    },
  }));
  const runtime = new RecoveryWorkerRuntime(
    loops,
    { close: async () => { events.push("close:engine"); throw new Error("engine close"); } },
    { close: async () => { events.push("close:postgresql"); } },
  );
  const run = runtime.run();
  await assert.rejects(runtime.close(), /engine close/u);
  await run;
  await assert.rejects(runtime.close(), /engine close/u);
  const firstOwnerClose = events.findIndex((event) => event.startsWith("close:"));
  const lastLoopSettle = events.findLastIndex((event) => event.startsWith("settle:"));
  assert.ok(firstOwnerClose > lastLoopSettle);
  assert.equal(events.filter((event) => event === "close:engine").length, 1);
  assert.equal(events.filter((event) => event === "close:postgresql").length, 1);
});

function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

function owner(label: string) {
  return { close: async () => { void label; } };
}
