/**
 * Live product acceptance across the distinct host interaction mechanisms.
 *
 * Scope rule: one live run per *mechanism*, not per profile. A model that only reuses an already
 * evidenced mechanism adds wall-clock without new information, which the project's vertical-slice
 * limit rejects; admission coverage for every registered profile stays in the port-free
 * example-configuration test. This lane therefore proves the seams, not the catalog.
 *
 * Each run uses the real command orchestration against a caller-managed local Temporal service, so a
 * regression in connection, Worker registration, Query, Update, Signal ingress, or Activity dispatch
 * fails here rather than in a mocked substitute.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createCachedLocalEnvironment } from "@bpmn-lean/temporal-adapter";

import { loadRunnableMvpConfig } from "../cli/runnable-mvp-config.ts";
import {
  RunnableMvpEventKind,
  RunnableMvpResultKind,
  runRunnableTemporalMvp,
} from "../cli/runnable-mvp.ts";
import type { RunnableMvpEvent } from "../cli/runnable-mvp.ts";

import { withDeadline } from "./temporal-test-support.ts";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const exampleRoot = path.join(projectRoot, "examples/temporal-mvp");
const temporalCacheDirectory = path.join(projectRoot, ".cache/temporal-cli/");
const serverStartupDeadlineMs = 40_000;
const runDeadlineMs = 30_000;

/** Each entry names the mechanism the run is the evidence for. */
const liveMechanisms = [
  {
    example: "user-task-discovery-completion",
    mechanism: "completion Update through one published task occurrence",
  },
  {
    example: "parallel-fork-join",
    mechanism: "two concurrent published tasks answered in declared plan order",
  },
  {
    example: "intermediate-catch-timer",
    mechanism: "zero interactions with one host-resolved durable timer",
  },
  {
    example: "intermediate-catch-message",
    mechanism: "Message delivery through the published subscription identity",
  },
  {
    example: "service-task-effect",
    mechanism: "product effect Activity returning its declared success arm",
  },
  {
    example: "boundary-error",
    mechanism: "product effect Activity returning its declared bpmnError arm",
  },
] as const;

test("runs every distinct host interaction mechanism live", async () => {
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-mvp-live",
      downloadDirectory: temporalCacheDirectory,
    }),
    serverStartupDeadlineMs,
    "live product acceptance server startup",
  );
  try {
    for (const [index, { example, mechanism }] of liveMechanisms.entries()) {
      const config = await loadRunnableMvpConfig(
        path.join(exampleRoot, `${example}.json`),
      );
      const events: RunnableMvpEvent[] = [];
      const result = await withDeadline(
        runRunnableTemporalMvp(
          {
            ...config,
            process: { ...config.process, instanceId: `MvpLive_${index}_1` },
            // The simulated thinking delay is host behavior; a short one keeps the gate cheap
            // without changing which semantic command the actor eventually submits.
            interactions: config.interactions.map((response) => ({
              ...response,
              delayMs: 5,
            })),
            temporal: {
              ...config.temporal,
              address: environment.address,
              namespace: environment.namespace ?? "default",
              taskQueue: `bpmn-mvp-live-${index}`,
            },
          },
          (event) => events.push(event),
        ),
        runDeadlineMs,
        `live product run for ${example}`,
      );

      assert.equal(
        result.kind,
        RunnableMvpResultKind.Completed,
        `${example} must complete live: ${mechanism}`,
      );
      if (result.kind !== RunnableMvpResultKind.Completed) {
        return;
      }
      assert.equal(result.receipt.processInstanceId, `MvpLive_${index}_1`);
      assert.equal(
        events.filter(
          (event) => event.kind === RunnableMvpEventKind.InteractionResolved,
        ).length,
        config.interactions.length,
        `${example} must resolve exactly its declared interactions`,
      );
    }
  } finally {
    await withDeadline(
      environment.teardown(),
      10_000,
      "live product acceptance server teardown",
    );
  }
});
