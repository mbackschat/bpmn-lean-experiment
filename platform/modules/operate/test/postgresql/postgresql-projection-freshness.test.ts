import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
  FlowNodeMetricsResultKind,
} from "@bpmn-lean/platform-contracts";
import type {
  ExecutionPublicationPage,
  FlowNodeOccurrencePage,
} from "@bpmn-lean/platform-contracts";
import {
  PostgresqlExecutionRecoveryStep,
  PostgresqlFlowNodeOccurrenceRecoveryStep,
  PostgresqlProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type {
  OperateProcessRegistration,
} from "@bpmn-lean/platform-operate";
import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";

import {
  PostgresqlExecutionProjectionReader,
} from "@bpmn-lean/platform-operate";
import {
  PostgresqlFlowNodeMetricsReader,
} from "@bpmn-lean/platform-operate";
import {
  PostgresqlProjectionReadKind,
} from "@bpmn-lean/platform-operate";
import {
  firstPage,
  registration,
  secondPage,
} from "../execution-publication-fixture.ts";
import {
  occurrenceFirstPage,
  occurrenceSecondPage,
} from "../flow-node-occurrence-fixture.ts";
import {
  createOperateTestRuntime,
  migrateOperateDatabase,
  resetOperateDatabase,
} from "./postgresql-operate-test-support.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL projection freshness requires the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createOperateTestRuntime(baseUrl, "operate-projection-freshness", 12);

  before(async () => await migrateOperateDatabase(baseUrl));
  after(async () => await runtime.close());

  test("one metrics statement includes a registration committed after cut H and fails closed", async () => {
    await resetOperateDatabase(runtime);
    const first = await register(runtime, registration.instance.processInstanceId);
    await observeComplete(runtime, first);
    const reader = new PostgresqlFlowNodeMetricsReader({ runtime, maxAgeMs: 60_000 });
    const atH = await reader.read(registration.instance.definition);
    assert.equal(atH.kind, PostgresqlProjectionReadKind.Available);
    if (atH.kind !== PostgresqlProjectionReadKind.Available) return;
    assert.equal(atH.read.value.kind, FlowNodeMetricsResultKind.Available);
    if (atH.read.value.kind === FlowNodeMetricsResultKind.Available) {
      assert.equal(atH.read.value.snapshot.population.processInstances, 1);
    }

    await register(runtime, "Instance_H_plus_1");
    const afterRegistration = await reader.read(registration.instance.definition);
    assert.equal(afterRegistration.kind, PostgresqlProjectionReadKind.Unavailable);
  });

  test("metrics uses one query, preserves a terminal U+0000 cut, and fails closed on age", async () => {
    await resetOperateDatabase(runtime);
    const definition = {
      ...structuredClone(registration.instance.definition),
      processId: "Process_\u0000terminal",
    };
    const terminal = await registerDefinition(runtime, "terminal\u0000instance", definition);
    await new PostgresqlProcessInstanceRepository(runtime).recordObservation(
      terminal.instance.processInstanceId,
      "closed",
    );
    let queryCount = 0;
    const counted = countQueries(runtime, () => queryCount += 1);
    const reader = new PostgresqlFlowNodeMetricsReader({
      runtime: counted,
      maxAgeMs: 60_000,
    });
    const allTerminal = await reader.read(definition);
    assert.equal(allTerminal.kind, PostgresqlProjectionReadKind.Available);
    assert.equal(queryCount, 1);
    if (allTerminal.kind === PostgresqlProjectionReadKind.Available) {
      assert.equal(allTerminal.read.value.kind, FlowNodeMetricsResultKind.Available);
      if (allTerminal.read.value.kind === FlowNodeMetricsResultKind.Available) {
        assert.equal(allTerminal.read.value.snapshot.population.processInstances, 1);
        assert.deepEqual(allTerminal.read.value.snapshot.flowNodes, []);
      }
      assert.ok(allTerminal.read.freshness!.observedAfterEpochMs > 0);
    }
    assert.equal((await runtime.query({ text: "SELECT 1 AS value" })).rows[0]?.value, 1);

    await resetOperateDatabase(runtime);
    const exact = await register(runtime, registration.instance.processInstanceId);
    await observeComplete(runtime, exact);
    await runtime.query({
      text: `
        WITH execution AS (
          UPDATE bpmn_platform.operate_execution_publications
          SET last_complete_observed_at_epoch_ms = 0
          WHERE process_instance_id = $1
          RETURNING process_instance_id
        )
        UPDATE bpmn_platform.operate_flow_node_occurrence_publications AS occurrence
        SET last_complete_observed_at_epoch_ms = 0
        FROM execution
        WHERE occurrence.process_instance_id = execution.process_instance_id
      `,
      values: [candidateKey(exact)],
    });
    assert.equal(
      (await new PostgresqlFlowNodeMetricsReader({ runtime, maxAgeMs: 1 }).read(
        registration.instance.definition,
      )).kind,
      PostgresqlProjectionReadKind.Unavailable,
    );
  });

  test("execution reads require aligned fresh E1 and occurrence facts and reject status drift", async () => {
    await resetOperateDatabase(runtime);
    const exact = await register(runtime, registration.instance.processInstanceId);
    await observeExecution(runtime, exact, firstPage());
    let queryCount = 0;
    const reader = new PostgresqlExecutionProjectionReader({
      runtime: countQueries(runtime, () => queryCount += 1),
      maxAgeMs: 60_000,
    });
    assert.equal(
      (await reader.page(exact.instance.processInstanceId, {
        afterRevision: 0,
        limit: 1,
      })).kind,
      PostgresqlProjectionReadKind.Unavailable,
      "a complete E1 head without aligned occurrence freshness must not succeed",
    );

    await observeOccurrence(runtime, exact, occurrenceFirstPage());
    const available = await reader.page(exact.instance.processInstanceId, {
      afterRevision: 0,
      limit: 1,
    });
    assert.equal(available.kind, PostgresqlProjectionReadKind.Available);
    assert.equal(available.kind === PostgresqlProjectionReadKind.Available
      ? available.read.value.headRevision
      : null, 2);
    assert.equal(queryCount, 2);
    const exported = await reader.export(exact.instance.processInstanceId);
    assert.equal(exported.kind, PostgresqlProjectionReadKind.Available);
    assert.equal(queryCount, 3);

    await runtime.query({
      text: `
        UPDATE bpmn_platform.operate_execution_publications
        SET current_process_status = 'completed'
        WHERE process_instance_id = $1
      `,
      values: [candidateKey(exact)],
    });
    assert.equal(
      (await reader.export(exact.instance.processInstanceId)).kind,
      PostgresqlProjectionReadKind.Unavailable,
    );
  });

  test("exact no-suffix observations advance both database-clock completion watermarks", async () => {
    await resetOperateDatabase(runtime);
    const exact = await register(runtime, registration.instance.processInstanceId);
    await observeComplete(runtime, exact);
    await runtime.query({
      text: `
        WITH execution AS (
          UPDATE bpmn_platform.operate_execution_publications
          SET last_complete_observed_at_epoch_ms = 0
          WHERE process_instance_id = $1
          RETURNING process_instance_id
        )
        UPDATE bpmn_platform.operate_flow_node_occurrence_publications AS occurrence
        SET last_complete_observed_at_epoch_ms = 0
        FROM execution
        WHERE occurrence.process_instance_id = execution.process_instance_id
      `,
      values: [candidateKey(exact)],
    });

    await observeExecution(runtime, exact, noSuffixExecutionPage());
    await observeOccurrence(runtime, exact, noSuffixOccurrencePage());
    const watermarks = await runtime.query({
      text: `
        SELECT
          e.last_complete_observed_at_epoch_ms::text AS execution_watermark,
          e.current_process_status,
          o.last_complete_observed_at_epoch_ms::text AS occurrence_watermark
        FROM bpmn_platform.operate_execution_publications AS e
        JOIN bpmn_platform.operate_flow_node_occurrence_publications AS o
          USING (process_instance_id)
        WHERE e.process_instance_id = $1
      `,
      values: [candidateKey(exact)],
    });
    assert.ok(Number(watermarks.rows[0]?.execution_watermark) > 0);
    assert.ok(Number(watermarks.rows[0]?.occurrence_watermark) > 0);
    assert.equal(watermarks.rows[0]?.current_process_status, "running");
  });

  test("a closed aligned terminal projection remains readable after its observation age", async () => {
    await resetOperateDatabase(runtime);
    const exact = await register(runtime, registration.instance.processInstanceId);
    await observeComplete(runtime, exact);
    await new PostgresqlProcessInstanceRepository(runtime).recordObservation(
      exact.instance.processInstanceId,
      "closed",
    );
    await observeExecution(runtime, exact, terminalExecutionPage());
    await observeOccurrence(runtime, exact, occurrenceSecondPage());
    await runtime.query({
      text: `
        WITH execution AS (
          UPDATE bpmn_platform.operate_execution_publications AS publication
          SET last_complete_observed_at_epoch_ms = 0
          WHERE publication.process_instance_id = $1
          RETURNING publication.process_instance_id
        )
        UPDATE bpmn_platform.operate_flow_node_occurrence_publications AS occurrence
        SET last_complete_observed_at_epoch_ms = 0
        FROM execution
        WHERE occurrence.process_instance_id = execution.process_instance_id
      `,
      values: [candidateKey(exact)],
    });

    const read = await new PostgresqlExecutionProjectionReader({
      runtime,
      maxAgeMs: 1,
    }).page(exact.instance.processInstanceId, { afterRevision: 0, limit: 1 });
    assert.equal(read.kind, PostgresqlProjectionReadKind.Available);
    if (read.kind === PostgresqlProjectionReadKind.Available) {
      assert.ok(read.read.freshness.observedAfterEpochMs > 0);
    }
    const metrics = await new PostgresqlFlowNodeMetricsReader({
      runtime,
      maxAgeMs: 1,
    }).read(exact.instance.definition);
    assert.equal(metrics.kind, PostgresqlProjectionReadKind.Available);
    if (metrics.kind === PostgresqlProjectionReadKind.Available) {
      assert.ok(metrics.read.freshness.observedAfterEpochMs > 0);
    }
  });
}

async function register(
  runtime: PostgresqlRuntime,
  processInstanceId: string,
): Promise<OperateProcessRegistration> {
  return await registerDefinition(runtime, processInstanceId, registration.instance.definition);
}

async function registerDefinition(
  runtime: PostgresqlRuntime,
  processInstanceId: string,
  definition: typeof registration.instance.definition,
): Promise<OperateProcessRegistration> {
  const instance = { processInstanceId, definition: structuredClone(definition) };
  const locator = `locator:${processInstanceId}`;
  const ordinal = await new PostgresqlProcessInstanceRepository(runtime)
    .recordConfirmed({ instance, locator });
  return { ordinal, instance, locator, observation: "active" };
}

async function observeComplete(
  runtime: PostgresqlRuntime,
  exact: OperateProcessRegistration,
): Promise<void> {
  await observeExecution(runtime, exact, firstPage());
  await observeOccurrence(runtime, exact, occurrenceFirstPage());
}

async function observeExecution(
  runtime: PostgresqlRuntime,
  exact: OperateProcessRegistration,
  page: ExecutionPublicationPage,
): Promise<void> {
  const prepared = await new PostgresqlExecutionRecoveryStep({
    runtime,
    gateway: {
      observe: async () => ({ kind: ExecutionPublicationResultKind.Available, page }),
    },
  }).prepare(candidateKey(exact));
  assert.equal(prepared.kind, "complete");
  if (prepared.kind === "complete") await runtime.transaction(prepared.apply);
}

async function observeOccurrence(
  runtime: PostgresqlRuntime,
  exact: OperateProcessRegistration,
  page: FlowNodeOccurrencePage,
): Promise<void> {
  const prepared = await new PostgresqlFlowNodeOccurrenceRecoveryStep({
    runtime,
    gateway: {
      observe: async () => ({
        kind: FlowNodeOccurrencePublicationResultKind.Available,
        page,
      }),
    },
  }).prepare(candidateKey(exact));
  assert.equal(prepared.kind, "complete");
  if (prepared.kind === "complete") await runtime.transaction(prepared.apply);
}

function noSuffixExecutionPage(): ExecutionPublicationPage {
  const initial = firstPage();
  return {
    ...initial,
    requestedAfterRevision: initial.headRevision,
    pageThroughRevision: initial.headRevision,
    batches: [],
  };
}

function noSuffixOccurrencePage(): FlowNodeOccurrencePage {
  const initial = occurrenceFirstPage();
  return {
    ...initial,
    requestedAfterRevision: initial.headRevision,
    pageThroughRevision: initial.headRevision,
    batches: [],
  };
}

function terminalExecutionPage(): ExecutionPublicationPage {
  const page = secondPage();
  if (page.current === null) throw new TypeError("terminal fixture requires current execution");
  return {
    ...page,
    current: {
      ...page.current,
      state: { ...page.current.state, status: "completed" },
    },
  };
}

function candidateKey(exact: OperateProcessRegistration): Uint8Array {
  return new TextEncoder().encode(exact.instance.processInstanceId);
}

function countQueries(
  runtime: PostgresqlRuntime,
  increment: () => void,
): PostgresqlRuntime {
  return {
    query: async (query) => {
      increment();
      return await runtime.query(query);
    },
    transaction: async (run) => await runtime.transaction(run),
    withDedicatedSession: async (run) => await runtime.withDedicatedSession(run),
    databaseClockEpochMs: async () => await runtime.databaseClockEpochMs(),
    close: async () => await runtime.close(),
  };
}
