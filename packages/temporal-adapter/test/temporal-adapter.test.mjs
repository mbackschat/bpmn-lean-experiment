import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import {
  BpmnCompilationStatus,
  compileSequentialUserTaskBpmn,
} from "@bpmn-lean/bpmn-source";
import { runScenario } from "@bpmn-lean/semantic-core";

import { TemporalScenarioRunner } from "../dist/index.js";


const scenarioUrl = new URL(
  "../../../scenarios/m0-sequential-user-task/scenario.json",
  import.meta.url,
);
const interactionScenarioUrls = [
  "scenario.json",
  "wrong-activation.scenario.json",
  "stale-completion.scenario.json",
].map(
  (relativePath) =>
    new URL(
      `../../../scenarios/m1-user-task-discovery-completion/${relativePath}`,
      import.meta.url,
    ),
);
const bpmnUrl = new URL(
  "../../../scenarios/m0-sequential-user-task/process.bpmn",
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

async function loadExecutionInput(selectedScenarioUrl = scenarioUrl) {
  const scenario = await loadJson(selectedScenarioUrl);
  const compilation = await compileSequentialUserTaskBpmn({
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
  return {
    scenario,
    executableIr: compilation.executableIr,
  };
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
  const { scenario, executableIr } = await loadExecutionInput();
  const semanticCoreResult = runScenario(scenario, executableIr);

  const execution = await withDeadline(
    runner.runScenario(
      scenario,
      executableIr,
      {
        workflowId: "m0-live-sequential-user-task",
      },
    ),
    15_000,
    "Temporal scenario",
  );

  assert.deepEqual(
    execution.waitTrace,
    semanticCoreResult.trace.slice(0, 3),
  );
  assert.deepEqual(execution.result, semanticCoreResult);
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

test("one server and Worker execute the complete User Task interaction batch", async () => {
  const inputs = await Promise.all(
    interactionScenarioUrls.map(loadExecutionInput),
  );
  const batchItems = inputs.map(
    ({ scenario, executableIr }, index) => ({
      scenario,
      executableIr,
      options: {
        workflowId: `m1-user-task-batch-${index}`,
      },
    }),
  );

  const executions = await withDeadline(
    runner.runScenarios(batchItems),
    15_000,
    "Temporal interaction batch",
  );

  assert.equal(executions.length, inputs.length);
  for (const [index, execution] of executions.entries()) {
    const input = inputs[index];
    assert.deepEqual(
      execution.waitTrace,
      runScenario(input.scenario, input.executableIr).trace.slice(0, 3),
    );
    assert.deepEqual(
      execution.result,
      runScenario(input.scenario, input.executableIr),
    );
    assert.ok(execution.history.events.length > 0);
  }
});

test("batch execution rejects duplicate Workflow identities before start", async () => {
  const input = await loadExecutionInput(interactionScenarioUrls[0]);
  const duplicate = {
    ...input,
    options: { workflowId: "m1-duplicate-workflow-id" },
  };

  await assert.rejects(
    runner.runScenarios([duplicate, duplicate]),
    /Workflow IDs must be unique/u,
  );
});
