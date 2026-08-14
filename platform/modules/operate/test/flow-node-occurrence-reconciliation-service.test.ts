import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  FlowNodeOccurrenceReconciliationKind,
  FlowNodeOccurrenceReconciliationService,
  SqliteExecutionPublicationRepository,
  SqliteFlowNodeOccurrenceRepository,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";

import { firstPage, secondPage } from "./execution-publication-fixture.ts";
import {
  occurrenceFirstPage,
  occurrenceRegistration,
  occurrenceSecondPage,
} from "./flow-node-occurrence-fixture.ts";

test("revision-zero rebuild retains prior semantic bytes after a late public failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-occurrence-reconcile-"));
  const databaseFile = join(root, "operate.sqlite");
  const instances = new SqliteProcessInstanceRepository(databaseFile);
  const executions = new SqliteExecutionPublicationRepository(databaseFile);
  const occurrences = new SqliteFlowNodeOccurrenceRepository(databaseFile, executions);
  try {
    instances.recordConfirmed({
      instance: occurrenceRegistration.instance,
      locator: occurrenceRegistration.locator,
    });
    const registration = instances.getRegistration("Instance_1")!;
    executions.applyPage(registration, firstPage(3));
    executions.applyPage(registration, secondPage());

    const gateway = new QueueGateway([
      { kind: "available", page: occurrenceFirstPage(3) },
      { kind: "available", page: occurrenceSecondPage() },
    ]);
    const service = new FlowNodeOccurrenceReconciliationService({
      publications: occurrences,
      gateway,
    });
    assert.equal((await service.reconcile(registration)).kind,
      FlowNodeOccurrenceReconciliationKind.Available);
    assert.deepEqual(gateway.cursors, [0, 2]);
    const before = semanticRows(databaseFile);

    const drift = occurrenceSecondPage();
    const driftBatch = drift.batches[0];
    assert.ok(driftBatch);
    Reflect.set(driftBatch, "commandId", "command-drift");
    gateway.reset([
      { kind: "available", page: occurrenceFirstPage(3) },
      { kind: "available", page: drift },
    ]);
    assert.equal((await service.rebuild(registration)).kind,
      FlowNodeOccurrenceReconciliationKind.Gap);
    assert.deepEqual(gateway.cursors, [0, 2]);
    assert.deepEqual(semanticRows(databaseFile), before);

    gateway.reset([
      { kind: "available", page: occurrenceFirstPage(3) },
      { kind: "available", page: occurrenceSecondPage() },
    ]);
    assert.equal((await service.reconcile(registration)).kind,
      FlowNodeOccurrenceReconciliationKind.Gap);
    assert.deepEqual(gateway.cursors, []);
    assert.equal((await service.rebuild(registration)).kind,
      FlowNodeOccurrenceReconciliationKind.Available);
    assert.deepEqual(semanticRows(databaseFile), before);
  } finally {
    occurrences.close();
    executions.close();
    instances.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("classifies positive-cursor notReady as a gap without retrying or repairing", async () => {
  const publications = {
    get: () => ({ headRevision: 2 }),
    applyPage: () => { throw new Error("must not apply"); },
    replaceFromPages: () => { throw new Error("must not replace"); },
    markCalls: [] as string[],
    mark(_registration: unknown, status: string) { this.markCalls.push(status); },
  };
  const gateway = new QueueGateway([{ kind: "notReady" }]);
  const service = new FlowNodeOccurrenceReconciliationService({
    publications: publications as never,
    gateway,
  });
  assert.equal((await service.reconcile(occurrenceRegistration)).kind,
    FlowNodeOccurrenceReconciliationKind.Gap);
  assert.deepEqual(gateway.cursors, [2]);
  assert.deepEqual(publications.markCalls, ["gap"]);
});

test("reads its retained occurrence cursor after E1 has advanced and applies the suffix", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-occurrence-e1-ahead-"));
  const databaseFile = join(root, "operate.sqlite");
  const instances = new SqliteProcessInstanceRepository(databaseFile);
  const executions = new SqliteExecutionPublicationRepository(databaseFile);
  const occurrences = new SqliteFlowNodeOccurrenceRepository(databaseFile, executions);
  try {
    instances.recordConfirmed({
      instance: occurrenceRegistration.instance,
      locator: occurrenceRegistration.locator,
    });
    const registration = instances.getRegistration("Instance_1")!;
    executions.applyPage(registration, firstPage());
    occurrences.applyPage(registration, occurrenceFirstPage());
    executions.applyPage(registration, secondPage());
    const gateway = new QueueGateway([
      { kind: "available", page: occurrenceSecondPage() },
    ]);
    const service = new FlowNodeOccurrenceReconciliationService({
      publications: occurrences,
      gateway,
    });
    assert.equal((await service.reconcile(registration)).kind,
      FlowNodeOccurrenceReconciliationKind.Available);
    assert.deepEqual(gateway.cursors, [2]);
  } finally {
    occurrences.close();
    executions.close();
    instances.close();
    await rm(root, { recursive: true, force: true });
  }
});

class QueueGateway {
  readonly cursors: number[] = [];
  #results: unknown[];

  constructor(results: readonly unknown[]) {
    this.#results = [...structuredClone(results)];
  }

  reset(results: readonly unknown[]): void {
    this.#results = [...structuredClone(results)];
    this.cursors.length = 0;
  }

  async observe(request: Readonly<{ afterRevision: number; limit?: number }>) {
    this.cursors.push(request.afterRevision);
    assert.equal(request.limit, 100);
    const result = this.#results.shift();
    if (result === undefined) throw new Error("unexpected gateway call");
    return result;
  }
}

function semanticRows(databaseFile: string): readonly unknown[] {
  const database = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    return [
      database.prepare(`
        SELECT * FROM flow_node_occurrence_batches
        ORDER BY process_instance_id, from_revision
      `).all(),
      database.prepare(`
        SELECT * FROM flow_node_occurrences
        ORDER BY hosting_process_instance_id, start_revision, start_index
      `).all(),
    ];
  } finally {
    database.close();
  }
}
