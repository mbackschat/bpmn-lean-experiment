import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ExecutionPublicationProjectionStatus,
  ExecutionPublicationReconciliationKind,
  ExecutionPublicationReconciliationService,
  SqliteExecutionPublicationRepository,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type {
  ExecutionPublicationResult,
} from "@bpmn-lean/platform-contracts";

import {
  firstPage,
  registration,
  secondPage,
} from "./execution-publication-fixture.ts";

test("retries only notReady to its bound without persisting a gap", async () => {
  await withService(
    [
      { kind: "notReady" },
      { kind: "notReady" },
      { kind: "notReady" },
    ],
    async ({ service, publications, calls, retryAttempts }) => {
      assert.deepEqual(
        await service.reconcile("Instance_1"),
        { kind: ExecutionPublicationReconciliationKind.NotReady },
      );
      assert.equal(calls.length, 3);
      assert.deepEqual(retryAttempts, [1, 2]);
      assert.equal(publications.get("Instance_1"), null);
    },
  );
});

test("continues from the committed boundary until a complete producer head is local", async () => {
  await withService(
    [
      { kind: "available", page: firstPage(3) },
      { kind: "available", page: secondPage() },
    ],
    async ({ service, calls }) => {
      const result = await service.reconcile("Instance_1");
      assert.equal(result.kind, ExecutionPublicationReconciliationKind.Available);
      assert.deepEqual(calls, [{
        locator: "opaque-private-locator",
        definition: firstPage().definition,
        processId: "Process_1",
        processInstanceId: "Instance_1",
        afterRevision: 0,
        limit: 100,
      }, {
        locator: "opaque-private-locator",
        definition: firstPage().definition,
        processId: "Process_1",
        processInstanceId: "Instance_1",
        afterRevision: 2,
        limit: 100,
      }]);
    },
  );
});

test("classifies a forged positive-cursor delta as gap and keeps its page atomic", async () => {
  const source = secondPage();
  const batch = source.batches[0]!;
  const record = batch.transitions[0]!;
  const forged = {
    ...source,
    batches: [{
      ...batch,
      transitions: [{
        ...record,
        positionDelta: {
          ...record.positionDelta,
          consumedTokens: [{
            sequenceFlowId: "Flow_1",
            owner: source.current!.controlTokens[0]!.owner,
            multiplicity: 1,
          }],
        },
      }],
    }],
  };
  await withService(
    [
      { kind: "available", page: firstPage(3) },
      { kind: "available", page: forged },
    ] as unknown as ExecutionPublicationResult[],
    async ({ service, publications }) => {
      assert.deepEqual(
        await service.reconcile("Instance_1"),
        { kind: ExecutionPublicationReconciliationKind.Gap },
      );
      const retained = publications.get("Instance_1");
      assert.equal(retained?.headRevision, 2);
      assert.equal(retained?.status, ExecutionPublicationProjectionStatus.Gap);
      assert.equal(publications.page("Instance_1", { afterRevision: 0 }), null);
    },
  );
});

test("maps a missing confirmed producer to unavailable rather than public absence", async () => {
  await withService(
    [{ kind: "notFound" }],
    async ({ service, publications }) => {
      assert.deepEqual(
        await service.reconcile("Instance_1"),
        { kind: ExecutionPublicationReconciliationKind.Unavailable },
      );
      assert.equal(
        publications.get("Instance_1")?.status,
        ExecutionPublicationProjectionStatus.Unavailable,
      );
      assert.deepEqual(
        await service.reconcile("unknown-instance"),
        { kind: ExecutionPublicationReconciliationKind.NotFound },
      );
    },
  );
});

async function withService(
  results: readonly ExecutionPublicationResult[],
  run: (context: Readonly<{
    service: ExecutionPublicationReconciliationService;
    publications: SqliteExecutionPublicationRepository;
    calls: unknown[];
    retryAttempts: number[];
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-execution-reconcile-"));
  const databaseFile = join(root, "operate.sqlite");
  const instances = new SqliteProcessInstanceRepository(databaseFile);
  const publications = new SqliteExecutionPublicationRepository(databaseFile);
  const calls: unknown[] = [];
  const retryAttempts: number[] = [];
  let index = 0;
  try {
    instances.recordConfirmed({
      instance: registration.instance,
      locator: registration.locator,
    });
    const service = new ExecutionPublicationReconciliationService({
      registrations: instances,
      publications,
      gateway: {
        async observe(request) {
          calls.push(structuredClone(request));
          const result = results[index];
          index += 1;
          if (result === undefined) throw new Error("unexpected gateway call");
          return structuredClone(result);
        },
      },
      notReadyAttempts: 3,
      beforeNotReadyRetry: async (attempt) => {
        retryAttempts.push(attempt);
      },
    });
    await run({ service, publications, calls, retryAttempts });
  } finally {
    publications.close();
    instances.close();
    await rm(root, { recursive: true, force: true });
  }
}
