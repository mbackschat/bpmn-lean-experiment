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
  current,
  firstPage,
  headOnlyPage,
  headPageWithoutCurrent,
  registration,
  secondPage,
} from "./execution-publication-fixture.ts";

test("re-reads a head without committed state to its bound, then classifies unavailable", async () => {
  await withService(
    [
      { kind: "available", page: headPageWithoutCurrent(firstPage()) },
      { kind: "available", page: headOnlyPage(2, false) },
      { kind: "available", page: headOnlyPage(2, false) },
    ],
    async ({ service, publications, calls, retryAttempts }) => {
      assert.deepEqual(
        await service.reconcile("Instance_1"),
        { kind: ExecutionPublicationReconciliationKind.Unavailable },
      );
      assert.deepEqual(calls.map((call) => (call as { afterRevision: number }).afterRevision), [0, 2, 2]);
      assert.deepEqual(retryAttempts, [1, 2]);
      const retained = await publications.get("Instance_1");
      assert.equal(retained?.status, ExecutionPublicationProjectionStatus.Unavailable);
      assert.equal(retained?.headRevision, 2);
      assert.deepEqual(retained?.batches, firstPage().batches);
      assert.equal(await publications.page("Instance_1", { afterRevision: 0 }), null);
    },
  );
});

test("re-reads a moving head until its committed state arrives", async () => {
  await withService(
    [
      { kind: "available", page: headPageWithoutCurrent(firstPage()) },
      { kind: "available", page: headOnlyPage(2, true) },
    ],
    async ({ service, retryAttempts }) => {
      const result = await service.reconcile("Instance_1");
      assert.equal(result.kind, ExecutionPublicationReconciliationKind.Available);
      if (result.kind !== ExecutionPublicationReconciliationKind.Available) return;
      assert.deepEqual(result.projection.current, current(2));
      assert.deepEqual(retryAttempts, [1]);
    },
  );
});

test("classifies an engine integrity failure as a gap", async () => {
  for (const method of ["reconcile", "rebuild"] as const) {
    await withService(
      [{ kind: "integrityFailure" }],
      async ({ service, publications }) => {
        assert.deepEqual(
          await service[method]("Instance_1"),
          { kind: ExecutionPublicationReconciliationKind.Gap },
          method,
        );
        assert.equal(
          (await publications.get("Instance_1"))?.status,
          ExecutionPublicationProjectionStatus.Gap,
          method,
        );
      },
    );
  }
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
        processInstanceId: "Instance_1",
        afterRevision: 0,
        limit: 100,
      }, {
        locator: "opaque-private-locator",
        definition: firstPage().definition,
        processInstanceId: "Instance_1",
        afterRevision: 2,
        limit: 100,
      }]);
    },
  );
});

test("classifies a malformed suffix as gap and keeps its page atomic", async () => {
  const source = secondPage();
  const batch = source.batches[0]!;
  const forged = {
    ...source,
    batches: [{ ...batch, transitions: [{ ...batch.transitions[0]!, revision: 4 }] }],
  };
  await withService(
    [
      { kind: "available", page: firstPage(3) },
      { kind: "available", page: forged },
    ],
    async ({ service, publications, calls }) => {
      assert.deepEqual(
        await service.reconcile("Instance_1"),
        { kind: ExecutionPublicationReconciliationKind.Gap },
      );
      assert.equal(calls.length, 2);
      const retained = await publications.get("Instance_1");
      assert.equal(retained?.headRevision, 2);
      assert.equal(retained?.status, ExecutionPublicationProjectionStatus.Gap);
      assert.equal(await publications.page("Instance_1", { afterRevision: 0 }), null);
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
        (await publications.get("Instance_1"))?.status,
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
      await publications.applyPage(registered, stalePage);
      const staleBytes = await retainedSemanticBytes(publications);
      setBeforeObserve(async () => {
        assert.equal(replaceCalls.length, 0);
        assert.deepEqual(await retainedSemanticBytes(publications), staleBytes);
      });

      const result = await service.rebuild("Instance_1");

      assert.equal(result.kind, ExecutionPublicationReconciliationKind.Available);
      assert.deepEqual(calls, [{
        locator: "opaque-private-locator",
        definition: firstPage().definition,
        processInstanceId: "Instance_1",
        afterRevision: 0,
        limit: 100,
      }, {
        locator: "opaque-private-locator",
        definition: firstPage().definition,
        processInstanceId: "Instance_1",
        afterRevision: 2,
        limit: 100,
      }]);
      assert.deepEqual(replaceCalls, [[firstPage(3), secondPage()]]);
      assert.notDeepEqual(await retainedSemanticBytes(publications), staleBytes);
      assert.deepEqual((await publications.get("Instance_1"))?.batches, [
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
      name: "engine integrity failure",
      result: { kind: "integrityFailure" },
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
        await publications.applyPage(registered, changedFirstPage(scenario.name));
        const staleBytes = await retainedSemanticBytes(publications);
        setBeforeObserve(async () => {
          assert.equal(replaceCalls.length, 0, scenario.name);
          assert.deepEqual(await retainedSemanticBytes(publications), staleBytes, scenario.name);
        });

        assert.deepEqual(
          await service.rebuild("Instance_1"),
          { kind: scenario.reconciliation },
          scenario.name,
        );
        assert.equal((await publications.get("Instance_1"))?.status, scenario.status);
        assert.deepEqual(await retainedSemanticBytes(publications), staleBytes, scenario.name);
        assert.deepEqual(replaceCalls, [], scenario.name);
        assert.deepEqual(retryAttempts, [], scenario.name);
      },
    );
  }
});

test("rebuild re-reads a head without committed state before replacing", async () => {
  await withService(
    [
      { kind: "available", page: headPageWithoutCurrent(firstPage()) },
      { kind: "available", page: headOnlyPage(2, true) },
    ],
    async ({ service, publications, replaceCalls, retryAttempts }) => {
      const result = await service.rebuild("Instance_1");
      assert.equal(result.kind, ExecutionPublicationReconciliationKind.Available);
      assert.deepEqual(replaceCalls, [[headPageWithoutCurrent(firstPage()), headOnlyPage(2, true)]]);
      assert.deepEqual(retryAttempts, [1]);
      assert.deepEqual((await publications.get("Instance_1"))?.current, current(2));
    },
  );
});

test("rebuild bounds a head without committed state and keeps retained state", async () => {
  await withService(
    [
      { kind: "available", page: headPageWithoutCurrent(firstPage()) },
      { kind: "available", page: headOnlyPage(2, false) },
      { kind: "available", page: headOnlyPage(2, false) },
    ],
    async ({
      service,
      publications,
      registered,
      calls,
      replaceCalls,
      retryAttempts,
    }) => {
      await publications.applyPage(registered, changedFirstPage("Flow_retained"));
      const staleBytes = await retainedSemanticBytes(publications);

      assert.deepEqual(
        await service.rebuild("Instance_1"),
        { kind: ExecutionPublicationReconciliationKind.Unavailable },
      );
      assert.deepEqual(calls.map((call) => (
        call as { afterRevision: number }
      ).afterRevision), [0, 2, 2]);
      assert.deepEqual(retryAttempts, [1, 2]);
      assert.deepEqual(replaceCalls, []);
      assert.equal(
        (await publications.get("Instance_1"))?.status,
        ExecutionPublicationProjectionStatus.Unavailable,
      );
      assert.deepEqual(await retainedSemanticBytes(publications), staleBytes);
    },
  );
});

async function withService(
  results: readonly unknown[],
  run: (context: Readonly<{
    service: ExecutionPublicationReconciliationService;
    publications: SqliteExecutionPublicationRepository;
    registered: NonNullable<Awaited<ReturnType<SqliteProcessInstanceRepository["getRegistration"]>>>;
    calls: unknown[];
    applyCalls: ExecutionPublicationPage[];
    replaceCalls: ExecutionPublicationPage[][];
    retryAttempts: number[];
    setBeforeObserve: (callback: () => Promise<void>) => void;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-execution-reconcile-"));
  const databaseFile = join(root, "operate.sqlite");
  const instances = new SqliteProcessInstanceRepository(databaseFile);
  const publications = new SqliteExecutionPublicationRepository(databaseFile);
  const calls: unknown[] = [];
  const applyCalls: ExecutionPublicationPage[] = [];
  const replaceCalls: ExecutionPublicationPage[][] = [];
  const retryAttempts: number[] = [];
  let beforeObserve: (() => Promise<void>) | undefined;
  let index = 0;
  try {
    await instances.recordConfirmed({
      instance: registration.instance,
      locator: registration.locator,
    });
    const registered = await instances.getRegistration("Instance_1");
    assert.ok(registered);
    const service = new ExecutionPublicationReconciliationService({
      registrations: instances,
      publications: {
        get: (processInstanceId) => publications.get(processInstanceId),
        applyPage: (value, page) => {
          applyCalls.push(structuredClone(page));
          return publications.applyPage(value, page);
        },
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
          await beforeObserve?.();
          const result = results[index];
          index += 1;
          if (result === undefined) throw new Error("unexpected gateway call");
          return structuredClone(result);
        },
      },
      currentReadAttempts: 3,
      beforeCurrentReread: async (attempt) => {
        retryAttempts.push(attempt);
      },
    });
    await run({
      service,
      publications,
      registered,
      calls,
      applyCalls,
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

function changedFirstPage(flow: string): ExecutionPublicationPage {
  const page = firstPage();
  const batch = page.batches[0]!;
  return {
    ...page,
    batches: [{
      ...batch,
      transitions: [batch.transitions[0]!, {
        ...batch.transitions[1]!,
        role: { kind: "arrive", flow },
      }],
    }],
  };
}

async function retainedSemanticBytes(
  publications: SqliteExecutionPublicationRepository,
): Promise<Uint8Array> {
  const retained = await publications.get("Instance_1");
  assert.ok(retained);
  return serializeCanonicalExecutionPublicationValue({
    identity: retained.identity,
    headRevision: retained.headRevision,
    producerHeadRevision: retained.producerHeadRevision,
    batches: retained.batches,
    current: retained.current,
  });
}
