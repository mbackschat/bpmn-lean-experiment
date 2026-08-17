import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  FlowNodeOccurrenceProjectionStatus,
  SqliteExecutionPublicationRepository,
  SqliteFlowNodeOccurrenceRepository,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type { FlowNodeOccurrencePage } from "@bpmn-lean/platform-contracts";

import { firstPage, secondPage } from "./execution-publication-fixture.ts";
import {
  occurrenceRootScope,
  occurrenceFirstPage,
  occurrenceRegistration,
  occurrenceSecondPage,
} from "./flow-node-occurrence-fixture.ts";

test("rejects positive-cursor unknown terminals and prior-time regression atomically", async () => {
  await withRepositories(async ({ instances, executions, occurrences, databaseFile }) => {
    const registration = await recordRegistration(instances);
    await executions.applyPage(registration, firstPage(3));
    await executions.applyPage(registration, secondPage());
    await occurrences.applyPage(registration, occurrenceFirstPage(3));
    const before = semanticRows(databaseFile);

    const unknownTerminal = occurrenceSecondPage();
    const unknownBatch = unknownTerminal.batches[0];
    const unknownTransition = unknownBatch?.transitions[0];
    const unknownEnd = unknownTransition?.lifecycle.ended[0];
    assert.ok(unknownEnd);
    Reflect.set(unknownEnd, "id", {
      processInstanceId: registration.instance.processInstanceId,
      startRevision: 1,
      startIndex: 0,
    });
    await assert.rejects(() => occurrences.applyPage(registration, unknownTerminal));
    assert.deepEqual(semanticRows(databaseFile), before);

    await assert.rejects(() => occurrences.applyPage(
      registration,
      occurrenceSecondPage(99),
    ));
    assert.deepEqual(semanticRows(databaseFile), before);
    assert.equal((await occurrences.get(registration.instance.processInstanceId))?.headRevision, 2);
  });
});

test("rejects transport-valid occurrence pages that drift from retained E1", async () => {
  await withRepositories(async ({ instances, executions, occurrences, databaseFile }) => {
    const registration = await recordRegistration(instances);
    await executions.applyPage(registration, firstPage());
    const changedCommand = occurrenceFirstPage();
    const changedBatch = changedCommand.batches[0];
    assert.ok(changedBatch);
    Reflect.set(changedBatch, "commandId", "different-command");
    await assert.rejects(() => occurrences.applyPage(registration, changedCommand));
    assert.deepEqual(semanticRows(databaseFile), [[], []]);
  });
});

test("reopen reconstructs exact rows and revision-zero replacement is atomic", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-occurrence-reopen-"));
  const databaseFile = join(root, "operate.sqlite");
  let instances: SqliteProcessInstanceRepository | undefined;
  let executions: SqliteExecutionPublicationRepository | undefined;
  let occurrences: SqliteFlowNodeOccurrenceRepository | undefined;
  try {
    instances = new SqliteProcessInstanceRepository(databaseFile);
    executions = new SqliteExecutionPublicationRepository(databaseFile);
    occurrences = new SqliteFlowNodeOccurrenceRepository(databaseFile, executions);
    const registration = await recordRegistration(instances);
    await executions.applyPage(registration, firstPage(3));
    await executions.applyPage(registration, secondPage());
    await occurrences.applyPage(registration, occurrenceFirstPage(3));
    await occurrences.applyPage(registration, occurrenceSecondPage());
    const expected = await occurrences.get(registration.instance.processInstanceId);
    occurrences.close();
    occurrences = new SqliteFlowNodeOccurrenceRepository(databaseFile, executions);
    assert.deepEqual(await occurrences.get(registration.instance.processInstanceId), expected);

    const before = semanticRows(databaseFile);
    const malformed = occurrenceSecondPage();
    const malformedBatch = malformed.batches[0];
    assert.ok(malformedBatch);
    Reflect.set(malformedBatch, "commandId", "drift");
    assert.ok(occurrences);
    const reopenedOccurrences = occurrences;
    await assert.rejects(() => reopenedOccurrences.replaceFromPages(
      registration,
      [occurrenceFirstPage(3), malformed],
    ));
    assert.deepEqual(semanticRows(databaseFile), before);
    assert.equal(expected?.status, FlowNodeOccurrenceProjectionStatus.Healthy);
  } finally {
    occurrences?.close();
    executions?.close();
    instances?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("appends, advances, and marks occurrences without deleting accepted rows", async () => {
  await withRepositories(async ({
    instances,
    executions,
    occurrences,
    databaseFile,
  }) => {
    const registration = await recordRegistration(instances);
    await executions.applyPage(registration, firstPage(3));
    await executions.applyPage(registration, secondPage());
    await occurrences.applyPage(registration, occurrenceFirstPage(3));
    const prefixBatches = semanticRows(databaseFile)[0];
    installDeleteGuards(databaseFile, [
      "flow_node_occurrence_batches",
      "flow_node_occurrences",
    ]);

    const outcomes = await Promise.allSettled([
      occurrences.applyPage(registration, occurrenceSuffixWithSuccessor()),
      occurrences.mark(registration, FlowNodeOccurrenceProjectionStatus.Gap),
    ]);

    assert.deepEqual(outcomes.map(({ status }) => status), ["fulfilled", "fulfilled"]);
    const image = await occurrences.get(registration.instance.processInstanceId);
    assert.equal(image?.headRevision, 3);
    assert.equal(image?.status, FlowNodeOccurrenceProjectionStatus.Gap);
    assert.equal(image?.occurrences.length, 2);
    assert.equal(image?.occurrences[0]?.terminal, "completed");
    assert.equal(image?.occurrences[1]?.terminal, null);
    assert.deepEqual(semanticRows(databaseFile)[0].slice(0, prefixBatches.length), prefixBatches);
  });
});

async function recordRegistration(instances: SqliteProcessInstanceRepository) {
  await instances.recordConfirmed({
    instance: occurrenceRegistration.instance,
    locator: occurrenceRegistration.locator,
  });
  const registration = await instances.getRegistration(
    occurrenceRegistration.instance.processInstanceId,
  );
  assert.ok(registration);
  return registration;
}

async function withRepositories(
  run: (owners: Readonly<{
    instances: SqliteProcessInstanceRepository;
    executions: SqliteExecutionPublicationRepository;
    occurrences: SqliteFlowNodeOccurrenceRepository;
    databaseFile: string;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-occurrence-store-"));
  const databaseFile = join(root, "operate.sqlite");
  const instances = new SqliteProcessInstanceRepository(databaseFile);
  const executions = new SqliteExecutionPublicationRepository(databaseFile);
  const occurrences = new SqliteFlowNodeOccurrenceRepository(databaseFile, executions);
  try {
    await run({ instances, executions, occurrences, databaseFile });
  } finally {
    occurrences.close();
    executions.close();
    instances.close();
    await rm(root, { recursive: true, force: true });
  }
}

function semanticRows(databaseFile: string): readonly [unknown[], unknown[]] {
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

function occurrenceSuffixWithSuccessor(): FlowNodeOccurrencePage {
  const page = occurrenceSecondPage();
  const batch = page.batches[0];
  const transition = batch?.transitions[0];
  assert.ok(batch);
  assert.ok(transition);
  const id = {
    processInstanceId: occurrenceRegistration.instance.processInstanceId,
    startRevision: 3,
    startIndex: 0,
  } as const;
  const started = {
    id,
    processId: occurrenceRegistration.instance.definition.processId,
    elementId: "Task_2",
    owner: occurrenceRootScope,
  } as const;
  return {
    ...page,
    batches: [{
      ...batch,
      transitions: [{
        ...transition,
        lifecycle: {
          started: [started],
          ended: transition.lifecycle.ended,
        },
      }],
    }],
    currentOpen: [{ ...started, startedAtEpochMs: batch.committedAtEpochMs }],
  };
}

function installDeleteGuards(databaseFile: string, tables: readonly string[]): void {
  const database = new DatabaseSync(databaseFile);
  try {
    for (const table of tables) {
      database.exec(`
        CREATE TRIGGER reject_delete_${table}
        BEFORE DELETE ON ${table}
        BEGIN
          SELECT RAISE(ABORT, 'accepted occurrence prefix was deleted');
        END
      `);
    }
  } finally {
    database.close();
  }
}
