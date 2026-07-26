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

import {
  TemporalCompletionDelivery,
  TemporalScenarioRunner,
  isCompletedProcessReceipt,
} from "../dist/index.js";

const scenarioUrl = new URL(
  "../../../scenarios/intermediate-catch-timer/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../scenarios/intermediate-catch-timer/process.bpmn",
  import.meta.url,
);
const cacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-test-server/", import.meta.url),
);

function withDeadline(promise, timeoutMs, operation) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${operation} exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

const scenario = JSON.parse(await readFile(scenarioUrl, "utf8"));
const compilation = await compileBpmnToSemanticProcess({
  bytes: await readFile(bpmnUrl),
  sourceId: scenario.bpmn.id,
  expectedSha256: scenario.bpmn.sha256,
  semanticProfile: scenario.profile,
  limits: {
    maxBytes: 1024 * 1024,
    parserDeadlineMs: 1_000,
  },
});
assert.equal(compilation.status, BpmnCompilationStatus.Accepted);

const started = performance.now();
const runner = await withDeadline(
  TemporalScenarioRunner.createTimeSkipping({
    downloadDirectory: cacheDirectory,
  }),
  45_000,
  "time-skipping runner startup",
);

try {
  const execution = await withDeadline(
    runner.runScenario(scenario, compilation.semanticProcess, {
      workflowId: "intermediate-catch-timer-time-skipping",
      completionDelivery: TemporalCompletionDelivery.Ordered,
    }),
    15_000,
    "time-skipping timer execution",
  );
  assert.deepEqual(
    execution.result,
    runScenario(scenario, compilation.semanticProcess),
  );
  assert.equal(isCompletedProcessReceipt(execution.receipt), true);
  process.stdout.write(
    `BPMN_TIMER_TIME_SKIPPING ${JSON.stringify({
      elapsedMs: performance.now() - started,
      historyEvents: execution.history.events.length,
    })}\n`,
  );
} finally {
  await withDeadline(
    runner.shutdown(),
    10_000,
    "time-skipping runner shutdown",
  );
}
