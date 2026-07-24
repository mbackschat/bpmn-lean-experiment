import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import { runScenario } from "@bpmn-lean/semantic-core";

import { TemporalScenarioRunner } from "../dist/index.js";


const scenarioUrl = new URL(
  "../../../scenarios/m0-sequential-user-task/scenario.json",
  import.meta.url,
);
const retainedHistoryUrl = new URL(
  "./fixtures/m0-sequential-user-task.history.json",
  import.meta.url,
);
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);

let runner;

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

async function loadJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

before(async () => {
  runner = await withDeadline(
    TemporalScenarioRunner.create({
      cliVersion: "v1.8.1",
      downloadDirectory: temporalCacheDirectory,
    }),
    45_000,
    "Temporal runner startup",
  );
});

after(async () => {
  if (runner !== undefined) {
    await withDeadline(runner.shutdown(), 10_000, "Temporal runner shutdown");
  }
});

test("full server preserves the calibrated trace and replays its history", async () => {
  const scenario = await loadJson(scenarioUrl);

  const execution = await withDeadline(
    runner.runScenario(scenario, {
      workflowId: "m0-live-sequential-user-task",
    }),
    15_000,
    "Temporal scenario",
  );

  assert.deepEqual(
    execution.waitTrace,
    scenario.calibration.expectedTrace.slice(0, 3),
  );
  assert.deepEqual(execution.result, runScenario(scenario));
  assert.ok(execution.history.events.length > 0);

  await withDeadline(
    runner.replayHistory(
      execution.history,
      "m0-live-sequential-user-task",
    ),
    10_000,
    "live history replay",
  );
});

test("retained history replays independently of a live execution", async () => {
  const history = await loadJson(retainedHistoryUrl);

  await withDeadline(
    runner.replayHistory(history, "m0-retained-sequential-user-task"),
    10_000,
    "retained history replay",
  );
});
