import assert from "node:assert/strict";
import { test } from "node:test";

import { wrapCibSevenMavenFailure } from "./cibseven-maven-budget.ts";
import { readFile } from "node:fs/promises";

import { scenarioEvidenceValidator } from "./contract-artifacts.ts";
import {
  admitReplacements,
  bridgeOutcomes,
  CibHeapExhaustedError,
  exhaustedHeapScenario,
  cibBridgeDeadlineMs,
  cibEvidenceEffectSchedule,
  isolateResourceBreaches,
  requireCleanPopulation,
  requireReplacementAuthorization,
} from "./replace-cibseven-evidence.ts";
import { CommandTimeoutError } from "./run-command.ts";

test("routes a scenario to its CIB schedule by its incident options and its cancel command", () => {
  const retry = { kind: "command", commandId: "retry", action: { kind: "retryIncident", generation: 1 } };
  const cancel = { kind: "command", commandId: "cancel", action: { kind: "cancelIncidentProcess", generation: 1 } };
  const incidents = { incidents: { cancellable: true } };
  assert.equal(cibEvidenceEffectSchedule({ options: incidents, stimuli: [retry] }), "incidentReportRetrySuccess");
  assert.equal(cibEvidenceEffectSchedule({ options: incidents, stimuli: [retry, cancel] }), "incidentReportCancel");
  assert.equal(cibEvidenceEffectSchedule({ stimuli: [retry, cancel] }), "plainSuccess");
});

test("requires explicit authorization before replacing CIB evidence", () => {
  assert.throws(
    () => requireReplacementAuthorization([]),
    /exact --replace flag/,
  );
  assert.throws(
    () => requireReplacementAuthorization(["--replace", "--extra"]),
    /exact --replace flag/,
  );
  assert.doesNotThrow(
    () => requireReplacementAuthorization(["--replace"]),
  );
});

test("reads each scenario's answer or harness failure from the bridge output, in request order", () => {
  const result = { kind: "scenarioResult", scenarioId: "a" };
  const failure = { kind: "scenarioHarnessFailure", scenarioId: "b", failure: "java.lang.IllegalStateException: no host" };
  const population = { kind: "cibSevenPopulationResult", scenarioId: "c" };
  assert.deepEqual(
    bridgeOutcomes(["a", "b", "c"], [JSON.stringify(result), JSON.stringify(failure), JSON.stringify(population)]),
    {
      results: [result],
      populations: [population],
      failures: [{ scenarioId: "b", failure: "java.lang.IllegalStateException: no host" }],
    },
  );
});

test("keeps population evidence only from a clean run under the profile's pinned producer", () => {
  const profile = { id: "p", oracle: { version: "2.2.0", revision: "r" }, environment: { java: "21", database: "H2 2.3.232" } };
  const result = (cleanup: Record<string, number>, engineVersion = "2.2.0") => ({
    scenarioId: "p", deployments: [], steps: [], processStates: [],
    diagnostics: { engineVersion, databaseVersion: "2.3.232", cleanup },
  });
  assert.doesNotThrow(() => requireCleanPopulation(result({ deployments: 0, jobs: 0 }), profile));
  assert.throws(() => requireCleanPopulation(result({ deployments: 1 }), profile), /did not clean up/);
  assert.throws(() => requireCleanPopulation(result({}, "2.0.0"), profile), /producer identity differs/);
});

test("refuses bridge output that skips, reorders or invents a scenario", () => {
  const line = (kind: string, scenarioId: string) => JSON.stringify({ kind, scenarioId, failure: "x" });
  assert.throws(() => bridgeOutcomes(["a", "b"], [line("scenarioResult", "a")]), /answered 1 of 2 scenarios/);
  assert.throws(() => bridgeOutcomes(["a", "b"], [line("scenarioResult", "b"), line("scenarioResult", "a")]),
    /line 1 answers b, not a/);
  assert.throws(() => bridgeOutcomes(["a"], [line("other", "a")]), /line 1 has kind other/);
});

test("gives the preparing bridge call the shared Maven ceiling and every scenario batch its fixed deadline", () => {
  // The preparing call carries the cold-host work (dependency resolution, compilation, JVM start) under the one ceiling
  // every CIB Maven call site shares (`cibseven-maven-budget.ts`); a scenario batch keeps its own fixed deadline.
  assert.equal(cibBridgeDeadlineMs(0, {}), 120_000);
  assert.equal(cibBridgeDeadlineMs(0, { BPMN_CIB_MAVEN_TIMEOUT_MS: "200000" }), 200_000);
  assert.equal(cibBridgeDeadlineMs(20, {}), 30_000);
  assert.equal(cibBridgeDeadlineMs(1, { BPMN_CIB_MAVEN_TIMEOUT_MS: "200000" }), 30_000);
});

/**
 * A bridge stand-in that answers every scenario, or fails as `runCibBatch` does when its batch holds `slow` (the batch
 * deadline) or `hungry` (the JVM heap ceiling).
 */
function bridgeStandIn(slow: string | undefined, hungry?: string) {
  const invocations: string[][] = [];
  const run = async (batch: ReadonlyArray<Readonly<{ id: string }>>) => {
    const ids = batch.map(({ id }) => id);
    invocations.push(ids);
    if (slow !== undefined && ids.includes(slow)) {
      throw wrapCibSevenMavenFailure("2.2.0", new CommandTimeoutError("mvnw", 30_000, "", ""));
    }
    if (hungry !== undefined && ids.includes(hungry)) {
      throw new CibHeapExhaustedError(hungry, new Error("mvnw exited with 1"));
    }
    return bridgeOutcomes(ids, ids.map((scenarioId) => JSON.stringify({ kind: "scenarioResult", scenarioId })));
  };
  return { invocations, run };
}

test("isolates the one scenario that exceeds the batch deadline as a harness failure and answers the rest", async () => {
  const { invocations, run } = bridgeStandIn("c");
  const logged: string[] = [];
  const outcome = await isolateResourceBreaches([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], run, (line) => {
    logged.push(line);
  });
  assert.deepEqual(outcome.results.map(({ scenarioId }) => scenarioId), ["a", "b", "d"]);
  assert.deepEqual(outcome.failures, [{ scenarioId: "c", failure: "CIB_SCENARIO_DEADLINE_EXCEEDED budgetMs=30000" }]);
  assert.deepEqual(invocations, [["a", "b", "c", "d"], ["a", "b"], ["c", "d"], ["c"], ["d"]]);
  assert.equal(logged.length, 2);
  assert.match(logged[0]!, /a, b, c, d/u);
  assert.match(logged[1]!, /c, d/u);
});

test("isolates the one scenario that exhausts the JVM heap as a harness failure and answers the rest", async () => {
  // Verify run 43235878488: `count-product-over-safe` (1,874,919,424 parallel instances) exhausted the heap after 19 s,
  // inside the 30 s deadline, and aborted the whole replacement.
  const { invocations, run } = bridgeStandIn(undefined, "b");
  const outcome = await isolateResourceBreaches([{ id: "a" }, { id: "b" }, { id: "c" }], run, () => {});
  assert.deepEqual(outcome.results.map(({ scenarioId }) => scenarioId), ["a", "c"]);
  assert.deepEqual(outcome.failures, [{ scenarioId: "b", failure: "CIB_SCENARIO_HEAP_EXHAUSTED" }]);
  assert.deepEqual(invocations, [["a", "b", "c"], ["a", "b"], ["a"], ["b"], ["c"]]);
});

test("reads a heap exhaustion only from the bridge's last line naming it", () => {
  const exhausted = JSON.stringify({ kind: "scenarioHarnessFailure", scenarioId: "b", failure: "CIB_SCENARIO_HEAP_EXHAUSTED" });
  const answered = JSON.stringify({ kind: "scenarioResult", scenarioId: "a" });
  const other = JSON.stringify({ kind: "scenarioHarnessFailure", scenarioId: "b", failure: "java.lang.IllegalStateException" });
  assert.equal(exhaustedHeapScenario([answered, exhausted]), "b");
  assert.equal(exhaustedHeapScenario([exhausted, answered]), undefined);
  assert.equal(exhaustedHeapScenario([answered, other]), undefined);
  assert.equal(exhaustedHeapScenario([]), undefined);
});

test("propagates a bridge failure other than a resource breach unchanged, without splitting", async () => {
  const failure = new Error("mvnw exited with code 1");
  const invocations: number[] = [];
  await assert.rejects(
    isolateResourceBreaches([{ id: "a" }, { id: "b" }], async () => {
      invocations.push(1);
      throw wrapCibSevenMavenFailure("2.2.0", failure);
    }, () => {}),
    (error) => error === failure,
  );
  assert.equal(invocations.length, 1);
});

test("runs a batch inside its deadline in one bridge call", async () => {
  const { invocations, run } = bridgeStandIn(undefined);
  const logged: string[] = [];
  const outcome = await isolateResourceBreaches([{ id: "a" }, { id: "b" }, { id: "c" }], run, (line) => {
    logged.push(line);
  });
  assert.equal(outcome.results.length, 3);
  assert.deepEqual(outcome.failures, []);
  assert.deepEqual(invocations, [["a", "b", "c"]]);
  assert.deepEqual(logged, []);
});

// Run 43279665960 retained an evidence file whose unnamed User Tasks lacked the `name` the schema requires as an explicit
// null; it surfaced only at the repository's contract gate. A replacement must meet its schema before it is written.
test("a replacement outside its evidence schema is reported as a failure and never written", async () => {
  const relativePath = "scenarios/open-rows/human-task-result-identity/called-task-identity.cibseven-evidence.json";
  const valid = JSON.parse(await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8")) as {
    producerObservations: { taskQueries: Array<{ tasks: Array<Record<string, unknown>> }> };
  };
  const invalid = structuredClone(valid);
  delete invalid.producerObservations.taskQueries.find(({ tasks }) => tasks.length > 0)!.tasks[0]!["name"];
  const validate = await scenarioEvidenceValidator(new URL("..", import.meta.url).pathname);
  const { admitted, failures } = admitReplacements(
    [{ relativePath, value: valid }, { relativePath: "elsewhere.cibseven-evidence.json", value: invalid }],
    validate,
  );
  assert.deepEqual(admitted.map(({ relativePath: admittedPath }) => admittedPath), [relativePath]);
  assert.equal(failures.length, 1);
  assert.match(failures[0]!, /^elsewhere\.cibseven-evidence\.json: evidence violates its schema: .*name/u);
});
