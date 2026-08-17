import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import type {
  PostgresqlQuery,
  PostgresqlQueryResult,
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  PostgresqlIncidentSnapshotGeneration,
} from "@bpmn-lean/platform-operate";
import {
  PostgresqlIncidentSnapshotReader,
} from "@bpmn-lean/platform-operate";
import {
  PostgresqlIncidentSnapshotRecoveryStep,
} from "@bpmn-lean/platform-operate";
import {
  PostgresqlIncidentSnapshotService,
} from "@bpmn-lean/platform-operate";
import {
  OperatePostgresqlRecoveryFamily,
  PostgresqlOperateRecoveryCandidateSource,
  decodeOperateRecoveryCandidateKey,
} from "@bpmn-lean/platform-operate";
import {
  PostgresqlOperateRecoveryStepKind,
} from "@bpmn-lean/platform-operate";
import {
  PostgresqlProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import { IncidentSnapshotUnavailableError } from "@bpmn-lean/platform-operate";

import { processPublication } from "../support/process-instance-repository-contract.ts";
import {
  createOperateTestRuntime,
  migrateOperateDatabase,
  resetOperateDatabase,
} from "./postgresql-operate-test-support.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL incident snapshot requires the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createOperateTestRuntime(baseUrl, "operate-incident-snapshot", 20);

  before(async () => {
    await migrateOperateDatabase(baseUrl);
  });

  after(async () => {
    await runtime.close();
  });

  test("zero and terminal populations complete without Product 1", async () => {
    await resetOperateDatabase(runtime);
    const source = candidates(runtime);
    assert.deepEqual(await list(source, 10), []);
    assert.deepEqual((await reader(runtime).read()).value, { incidents: [] });

    await resetOperateDatabase(runtime);
    const repository = new PostgresqlProcessInstanceRepository(runtime);
    await repository.recordConfirmed(processPublication("terminal\u0000process"));
    await repository.recordObservation("terminal\u0000process", "closed");
    let gatewayCalls = 0;
    assert.deepEqual(await list(source, 10), []);
    const step = recovery(runtime, async () => {
      gatewayCalls += 1;
      return { status: "observed", incidents: [] };
    });
    assert.ok(step);
    assert.equal(gatewayCalls, 0);
    assert.deepEqual((await reader(runtime).read()).value, { incidents: [] });
  });

  test("materializes a bounded contiguous population and returns exact byte-sorted keys", async () => {
    await resetOperateDatabase(runtime);
    const repository = new PostgresqlProcessInstanceRepository(runtime);
    for (const processInstanceId of ["é😀\u0000z", "a\u0000z", "a"]) {
      await repository.recordConfirmed(processPublication(processInstanceId));
    }
    const source = candidates(runtime);
    const first = await list(source, 2);
    assert.deepEqual(first.map(decodeOperateRecoveryCandidateKey), ["a\u0000z", "é😀\u0000z"]);
    assert.equal(await scalar(runtime, `
      SELECT materialized_through::text AS value
      FROM bpmn_platform.operate_incident_snapshot_generations WHERE state = 'building'
    `), "2");
    first[0]![0] = 0;
    assert.deepEqual((await list(source, 2)).map(decodeOperateRecoveryCandidateKey), [
      "a",
      "a\u0000z",
    ]);
    const all = await list(source, 10);
    assert.deepEqual(all.map(decodeOperateRecoveryCandidateKey), ["a", "a\u0000z", "é😀\u0000z"]);
    await completeCandidates(runtime, all, "final");
    assert.equal((await reader(runtime).read()).value.incidents.length, 3);
  });

  test("committed duplicates, rollback, and concurrent registrations keep a gap-free population", async () => {
    await resetOperateDatabase(runtime);
    const repository = new PostgresqlProcessInstanceRepository(runtime);
    await Promise.all(Array.from({ length: 6 }, async () =>
      await repository.recordConfirmed(processPublication("duplicate"))));
    await assert.rejects(runtime.transaction(async (session) => {
      await repository.recordConfirmed(session, processPublication("rolled-back"));
      throw new Error("rollback");
    }), /rollback/u);
    await Promise.all(["one", "two", "three"].map(async (id) =>
      await repository.recordConfirmed(processPublication(id))));
    const result = await runtime.query({
      text: `
        SELECT population_ordinal::text AS value
        FROM bpmn_platform.operate_process_instances
        ORDER BY population_ordinal ASC
      `,
    });
    assert.deepEqual(result.rows.map(({ value }) => value), ["1", "2", "3", "4"]);
    assert.equal(await scalar(runtime, `
      SELECT population_head::text AS value
      FROM bpmn_platform.operate_incident_snapshot_control
    `), "4");
  });

  test("discarded and stale callbacks write nothing while closed-during-observation is absorbing", async () => {
    await resetOperateDatabase(runtime);
    const repository = new PostgresqlProcessInstanceRepository(runtime);
    await repository.recordConfirmed(processPublication("closing"));
    const source = candidates(runtime);
    const [key] = await list(source, 10);
    assert.ok(key);
    const prepared = await recovery(runtime, async () => ({
      status: "observed",
      incidents: [operationsIncident("closing", "Service\u0000Task")],
    })).prepare(key);
    assert.equal(prepared.kind, PostgresqlOperateRecoveryStepKind.Complete);
    assert.equal(await scalar(runtime, `
      SELECT count(*)::text AS value FROM bpmn_platform.operate_incident_snapshot_incidents
    `), "0");
    await repository.recordObservation("closing", "closed");
    if (prepared.kind !== PostgresqlOperateRecoveryStepKind.Complete) assert.fail("unreachable");
    await runtime.transaction(prepared.apply);
    assert.deepEqual((await reader(runtime).read()).value, { incidents: [] });
    await runtime.transaction(prepared.apply);
    assert.equal(await scalar(runtime, `
      SELECT count(*)::text AS value FROM bpmn_platform.operate_incident_snapshot_incidents
    `), "0");
  });

  test("unknown and unavailable observations retry while malformed producer data fails closed", async () => {
    for (const [result, kind] of [
      [{ status: "unknown" }, PostgresqlOperateRecoveryStepKind.Retry],
      [{ status: "unavailable" }, PostgresqlOperateRecoveryStepKind.Retry],
      [{ status: "observed", incidents: [{}] }, PostgresqlOperateRecoveryStepKind.Fail],
    ] as const) {
      await resetOperateDatabase(runtime);
      await new PostgresqlProcessInstanceRepository(runtime)
        .recordConfirmed(processPublication("retry"));
      const [key] = await list(candidates(runtime), 10);
      assert.ok(key);
      assert.equal((await recovery(runtime, async () => result).prepare(key)).kind, kind);
      assert.equal(await scalar(runtime, `
        SELECT succeeded_count::text AS value
        FROM bpmn_platform.operate_incident_snapshot_generations
      `), "0");
    }
  });

  test("a complete H becomes unavailable after H+1 or nonclosed registration drift", async () => {
    await resetOperateDatabase(runtime);
    const repository = new PostgresqlProcessInstanceRepository(runtime);
    await repository.recordConfirmed(processPublication("generation-H"));
    await completeCandidates(runtime, await list(candidates(runtime), 10), "H");
    await reader(runtime).read();
    await repository.recordConfirmed(processPublication("generation-H-plus-1"));
    const counted = countingRuntime(runtime);
    await assert.rejects(reader(counted.runtime).read(), IncidentSnapshotUnavailableError);
    assert.equal(counted.queries(), 1);

    await resetOperateDatabase(runtime);
    await repository.recordConfirmed(processPublication("observation-drift"));
    await completeCandidates(runtime, await list(candidates(runtime), 10), "drift");
    await repository.recordObservation("observation-drift", "indeterminate");
    await assert.rejects(reader(runtime).read(), IncidentSnapshotUnavailableError);
  });

  test("reader rejects canonical, redundant, item, head, and timestamp corruption", async () => {
    const damages = [
      `UPDATE bpmn_platform.operate_incident_snapshot_incidents SET incident_json = '{}';`,
      `UPDATE bpmn_platform.operate_incident_snapshot_incidents SET incident_element_id = decode('78', 'hex');`,
      `UPDATE bpmn_platform.operate_incident_snapshot_generation_items SET expected_process_locator = decode('78', 'hex');`,
      `UPDATE bpmn_platform.operate_incident_snapshot_control SET population_head = population_head + 1;`,
      `UPDATE bpmn_platform.operate_incident_snapshot_generation_items SET observed_at = clock_timestamp() + interval '1 day';`,
    ];
    for (const damage of damages) {
      await resetOperateDatabase(runtime);
      await new PostgresqlProcessInstanceRepository(runtime)
        .recordConfirmed(processPublication("corruption"));
      await completeCandidates(runtime, await list(candidates(runtime), 10), "corrupt");
      await runtime.query({ text: damage });
      await assert.rejects(reader(runtime).read(), IncidentSnapshotUnavailableError);
    }
  });

  test("reader enforces both ceilings, detaches results, uses one query, and leaves runtime open", async () => {
    await resetOperateDatabase(runtime);
    await new PostgresqlProcessInstanceRepository(runtime)
      .recordConfirmed(processPublication("ceiling"));
    const [key] = await list(candidates(runtime), 10);
    assert.ok(key);
    const prepared = await recovery(runtime, async () => ({
      status: "observed",
      incidents: [
        operationsIncident("ceiling", "A"),
        operationsIncident("ceiling", "B"),
      ],
    }), 2).prepare(key);
    assert.equal(prepared.kind, PostgresqlOperateRecoveryStepKind.Complete);
    if (prepared.kind !== PostgresqlOperateRecoveryStepKind.Complete) assert.fail("unreachable");
    await runtime.transaction(prepared.apply);
    await assert.rejects(reader(runtime, { perProcess: 1 }).read(), IncidentSnapshotUnavailableError);
    await assert.rejects(reader(runtime, { total: 1 }).read(), IncidentSnapshotUnavailableError);

    const counted = countingRuntime(runtime);
    const projectionReader = reader(counted.runtime);
    const read = await projectionReader.read();
    assert.equal(counted.queries(), 1);
    assert.equal(read.value.incidents.length, 2);
    const original = read.value.incidents[0]!.incident.effect.descriptor.operation;
    (read.value.incidents[0]!.incident.effect.descriptor as { operation: string }).operation = "mutated";
    assert.equal(
      (await projectionReader.read()).value.incidents[0]!.incident.effect.descriptor.operation,
      original,
    );
    const service = new PostgresqlIncidentSnapshotService(projectionReader);
    assert.equal((await service.currentSnapshot()).value.incidents.length, 2);
    assert.equal((await runtime.query({ text: "SELECT 1 AS value" })).rows[0]?.value, 1);
    assert.equal(counted.closes(), 0);
  });
}

function candidates(runtime: PostgresqlRuntime) {
  return new PostgresqlOperateRecoveryCandidateSource(runtime);
}

async function list(
  source: PostgresqlOperateRecoveryCandidateSource,
  limit: number,
): Promise<ReadonlyArray<Uint8Array>> {
  return await source.listCandidateKeys(
    OperatePostgresqlRecoveryFamily.IncidentSnapshot,
    limit,
    60_000,
  );
}

function recovery(
  runtime: PostgresqlRuntime,
  observeIncidents: () => Promise<unknown>,
  maxIncidentsPerProcess = 10,
) {
  return new PostgresqlIncidentSnapshotRecoveryStep({
    runtime,
    gateway: { observeIncidents },
    maxIncidentsPerProcess,
  });
}

async function completeCandidates(
  runtime: PostgresqlRuntime,
  keys: readonly Uint8Array[],
  suffix: string,
): Promise<void> {
  for (const key of keys) {
    const processInstanceId = decodeOperateRecoveryCandidateKey(key);
    const prepared = await recovery(runtime, async () => ({
      status: "observed",
      incidents: [operationsIncident(processInstanceId, `Task-${suffix}`)],
    })).prepare(key);
    assert.equal(prepared.kind, PostgresqlOperateRecoveryStepKind.Complete);
    if (prepared.kind !== PostgresqlOperateRecoveryStepKind.Complete) assert.fail("unreachable");
    await runtime.transaction(prepared.apply);
  }
}

function operationsIncident(processInstanceId: string, elementId: string) {
  const effectId = { processInstanceId, elementId, activation: 1 } as const;
  const incidentId = { effectId, generation: 1 } as const;
  return {
    incident: {
      kind: "effectExecutionFailed",
      id: incidentId,
      effect: {
        id: effectId,
        descriptor: { protocol: "demo", operation: "invoke" },
        arguments: [],
      },
    },
    interactions: [{ kind: "retryIncident", incidentId }],
  } as const;
}

function reader(
  runtime: PostgresqlRuntime,
  ceilings: Readonly<{ perProcess?: number; total?: number }> = {},
) {
  return new PostgresqlIncidentSnapshotReader({
    runtime,
    maxAgeMs: 60_000,
    maxProcesses: 100,
    maxIncidentsPerProcess: ceilings.perProcess ?? 10,
    maxIncidents: ceilings.total ?? 100,
  });
}

async function scalar(runtime: PostgresqlRuntime, text: string): Promise<unknown> {
  return (await runtime.query({ text })).rows[0]?.value;
}

function countingRuntime(delegate: PostgresqlRuntime) {
  let queryCount = 0;
  let closeCount = 0;
  const runtime: PostgresqlRuntime = {
    query: async <Row extends PostgresqlRow = PostgresqlRow>(
      query: PostgresqlQuery,
    ): Promise<PostgresqlQueryResult<Row>> => {
      queryCount += 1;
      return await delegate.query<Row>(query);
    },
    transaction: async (run) => await delegate.transaction(run),
    withDedicatedSession: async (run) => await delegate.withDedicatedSession(run),
    databaseClockEpochMs: async () => await delegate.databaseClockEpochMs(),
    close: async () => {
      closeCount += 1;
    },
  };
  return { runtime, queries: () => queryCount, closes: () => closeCount };
}
