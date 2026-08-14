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
  ExecutionPublicationPage,
} from "@bpmn-lean/platform-contracts";
import { serializeCanonicalExecutionPublicationValue } from "@bpmn-lean/platform-contracts";

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
    ],
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

test("rebuild ignores retained state and replaces it only after the authoritative head is complete", async () => {
  const stalePage = changedFirstPage("stale-command");
  await withService(
    [
      { kind: "available", page: firstPage(3) },
      { kind: "available", page: secondPage() },
    ],
    async ({
      service,
      publications,
      registered,
      calls,
      replaceCalls,
      setBeforeObserve,
    }) => {
      publications.applyPage(registered, stalePage);
      const staleBytes = retainedSemanticBytes(publications);
      setBeforeObserve(() => {
        assert.equal(replaceCalls.length, 0);
        assert.deepEqual(retainedSemanticBytes(publications), staleBytes);
      });

      const result = await service.rebuild("Instance_1");

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
      assert.deepEqual(replaceCalls, [[firstPage(3), secondPage()]]);
      assert.notDeepEqual(retainedSemanticBytes(publications), staleBytes);
      assert.deepEqual(publications.get("Instance_1")?.batches, [
        ...firstPage(3).batches,
        ...secondPage().batches,
      ]);
    },
  );
});

test("late rebuild failures classify the stale image without retaining partial pages", async () => {
  const malformed = {
    ...secondPage(),
    requestedAfterRevision: 1,
  } as unknown as ExecutionPublicationPage;
  const cases = [
    {
      name: "producer gap",
      result: { kind: "gap" },
      status: ExecutionPublicationProjectionStatus.Gap,
      reconciliation: ExecutionPublicationReconciliationKind.Gap,
    },
    {
      name: "malformed page",
      result: { kind: "available", page: malformed },
      status: ExecutionPublicationProjectionStatus.Gap,
      reconciliation: ExecutionPublicationReconciliationKind.Gap,
    },
    {
      name: "producer unavailable",
      result: { kind: "unavailable" },
      status: ExecutionPublicationProjectionStatus.Unavailable,
      reconciliation: ExecutionPublicationReconciliationKind.Unavailable,
    },
    {
      name: "positive-cursor notReady",
      result: { kind: "notReady" },
      status: ExecutionPublicationProjectionStatus.Gap,
      reconciliation: ExecutionPublicationReconciliationKind.Gap,
    },
  ] as const;

  for (const scenario of cases) {
    await withService(
      [
        { kind: "available", page: firstPage(3) },
        scenario.result,
      ],
      async ({
        service,
        publications,
        registered,
        replaceCalls,
        retryAttempts,
        setBeforeObserve,
      }) => {
        publications.applyPage(registered, changedFirstPage(scenario.name));
        const staleBytes = retainedSemanticBytes(publications);
        setBeforeObserve(() => {
          assert.equal(replaceCalls.length, 0, scenario.name);
          assert.deepEqual(retainedSemanticBytes(publications), staleBytes, scenario.name);
        });

        assert.deepEqual(
          await service.rebuild("Instance_1"),
          { kind: scenario.reconciliation },
          scenario.name,
        );
        assert.equal(publications.get("Instance_1")?.status, scenario.status);
        assert.deepEqual(retainedSemanticBytes(publications), staleBytes, scenario.name);
        assert.deepEqual(replaceCalls, [], scenario.name);
        assert.deepEqual(retryAttempts, [], scenario.name);
      },
    );
  }
});

test("rebuild bounds notReady at revision zero without touching retained state", async () => {
  await withService(
    [{ kind: "notReady" }, { kind: "notReady" }, { kind: "notReady" }],
    async ({
      service,
      publications,
      registered,
      calls,
      replaceCalls,
      retryAttempts,
    }) => {
      publications.applyPage(registered, changedFirstPage("retained-command"));
      const staleBytes = retainedSemanticBytes(publications);

      assert.deepEqual(
        await service.rebuild("Instance_1"),
        { kind: ExecutionPublicationReconciliationKind.NotReady },
      );
      assert.deepEqual(calls.map((call) => (
        call as { afterRevision: number }
      ).afterRevision), [0, 0, 0]);
      assert.deepEqual(retryAttempts, [1, 2]);
      assert.deepEqual(replaceCalls, []);
      assert.equal(
        publications.get("Instance_1")?.status,
        ExecutionPublicationProjectionStatus.Healthy,
      );
      assert.deepEqual(retainedSemanticBytes(publications), staleBytes);
    },
  );
});

async function withService(
  results: readonly unknown[],
  run: (context: Readonly<{
    service: ExecutionPublicationReconciliationService;
    publications: SqliteExecutionPublicationRepository;
    registered: NonNullable<ReturnType<SqliteProcessInstanceRepository["getRegistration"]>>;
    calls: unknown[];
    replaceCalls: ExecutionPublicationPage[][];
    retryAttempts: number[];
    setBeforeObserve: (callback: () => void) => void;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-execution-reconcile-"));
  const databaseFile = join(root, "operate.sqlite");
  const instances = new SqliteProcessInstanceRepository(databaseFile);
  const publications = new SqliteExecutionPublicationRepository(databaseFile);
  const calls: unknown[] = [];
  const replaceCalls: ExecutionPublicationPage[][] = [];
  const retryAttempts: number[] = [];
  let beforeObserve: (() => void) | undefined;
  let index = 0;
  try {
    instances.recordConfirmed({
      instance: registration.instance,
      locator: registration.locator,
    });
    const registered = instances.getRegistration("Instance_1");
    assert.ok(registered);
    const service = new ExecutionPublicationReconciliationService({
      registrations: instances,
      publications: {
        get: (processInstanceId) => publications.get(processInstanceId),
        applyPage: (value, page) => publications.applyPage(value, page),
        replaceFromPages: (value, pages) => {
          replaceCalls.push([...structuredClone(pages)]);
          return publications.replaceFromPages(value, pages);
        },
        mark: (value, status) => publications.mark(value, status),
        page: (processInstanceId, request) => publications.page(processInstanceId, request),
        export: (processInstanceId) => publications.export(processInstanceId),
      },
      gateway: {
        async observe(request) {
          calls.push(structuredClone(request));
          beforeObserve?.();
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
    await run({
      service,
      publications,
      registered,
      calls,
      replaceCalls,
      retryAttempts,
      setBeforeObserve(callback) {
        beforeObserve = callback;
      },
    });
  } finally {
    publications.close();
    instances.close();
    await rm(root, { recursive: true, force: true });
  }
}

function changedFirstPage(operationId: string): ExecutionPublicationPage {
  const page = firstPage();
  const batch = page.batches[0]!;
  const operation = batch.transitions[1]!;
  assert.equal(operation.transition.kind, "internalOperation");
  return {
    ...page,
    batches: [{
      ...batch,
      transitions: [batch.transitions[0]!, {
        ...operation,
        transition: { ...operation.transition, operationId },
      }],
    }],
  };
}

function retainedSemanticBytes(
  publications: SqliteExecutionPublicationRepository,
): Uint8Array {
  const retained = publications.get("Instance_1");
  assert.ok(retained);
  return serializeCanonicalExecutionPublicationValue({
    identity: retained.identity,
    headRevision: retained.headRevision,
    producerHeadRevision: retained.producerHeadRevision,
    lastLogicalTimeMs: retained.lastLogicalTimeMs,
    controlTokens: retained.controlTokens,
    scopes: retained.scopes,
    batches: retained.batches,
    current: retained.current,
  });
}
