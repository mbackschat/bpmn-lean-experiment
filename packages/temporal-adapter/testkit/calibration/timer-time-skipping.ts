import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  runScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";

import {
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
  TemporalScenarioRunner,
  isCompletedProcessReceipt,
} from "@bpmn-lean/temporal-testkit";

// `PT15M` is the exact-duration case (docs/capsules/TIMER-EXACT-DURATIONS-PROPOSAL.md): Temporal's skipped clock
// runs a deadline that the host-clock pipeline would wait in full.
const scenarioSources = [
  ["intermediate-catch-timer", "scenarios/intermediate-catch-timer"],
  ["intermediate-catch-timer-pt15m", "packages/bpmn-source/test/fixtures/intermediate-catch-timer-durations/pt15m"],
] as const;
const cacheDirectory = fileURLToPath(
  new URL("../../../../.cache/temporal-test-server/", import.meta.url),
);

function withDeadline<Value>(
  promise: Promise<Value>,
  timeoutMs: number,
  operation: string,
): Promise<Value> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${operation} exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// The retained scenario is a tracked answer-free document locked by the
// contract gate, so its declared type is the current wire contract.
async function compileScenario([directory, source]: readonly [string, string]) {
  const scenarioUrl = new URL(`../../../../${source}/scenario.json`, import.meta.url);
  const bpmnUrl = new URL(`../../../../${source}/process.bpmn`, import.meta.url);
  const scenario = JSON.parse(
    await readFile(scenarioUrl, "utf8"),
  ) as Scenario;
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(bpmnUrl),
    sourceId: scenario.bpmn.id,
    expectedSha256: scenario.bpmn.sha256,
    sourceOverlay: null,
    semanticProfile: scenario.profile,
    limits: {
      maxBytes: 1024 * 1024,
      parserDeadlineMs: 1_000,
    },
  });
  assert.ok(
    compilation.status === BpmnCompilationStatus.Accepted,
    `${scenario.bpmn.id} was rejected: ${JSON.stringify(compilation.diagnostics)}`,
  );
  return { directory, scenario, semanticProcess: compilation.semanticProcess };
}
const compiled = await Promise.all(scenarioSources.map(compileScenario));

const started = performance.now();
const runner = await withDeadline(
  TemporalScenarioRunner.createTimeSkipping({
    downloadDirectory: cacheDirectory,
  }),
  45_000,
  "time-skipping runner startup",
);

try {
  for (const { directory, scenario, semanticProcess } of compiled) {
    const execution = await withDeadline(
      runner.runScenario(scenario, semanticProcess, {
        workflowId: `${directory}-time-skipping`,
        completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.Normal,
        effectExecutionSchedule: null,
      }),
      15_000,
      "time-skipping timer execution",
    );
    assert.deepEqual(
      execution.result,
      runScenario(scenario, semanticProcess),
    );
    assert.equal(isCompletedProcessReceipt(execution.receipt), true);
    process.stdout.write(
      `BPMN_TIMER_TIME_SKIPPING ${JSON.stringify({
        scenario: directory,
        elapsedMs: performance.now() - started,
        historyEvents: execution.history.events.length,
      })}\n`,
    );
  }
} finally {
  await withDeadline(
    runner.shutdown(),
    10_000,
    "time-skipping runner shutdown",
  );
}
