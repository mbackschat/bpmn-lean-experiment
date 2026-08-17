import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
} from "@bpmn-lean/platform-contracts";
import {
  ExecutionPublicationProjectionStatus,
  FlowNodeOccurrenceProjectionStatus,
  OperatePostgresqlRecoveryFamily,
  PostgresqlExecutionPublicationRepository,
  PostgresqlFlowNodeOccurrenceRepository,
  PostgresqlOperateRecoveryCandidateSource,
  PostgresqlProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type {
  OperateProcessRegistration,
} from "@bpmn-lean/platform-operate";
import type {
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  PostgresqlExecutionRecoveryStep,
} from "@bpmn-lean/platform-operate";
import {
  PostgresqlFlowNodeOccurrenceRecoveryStep,
} from "@bpmn-lean/platform-operate";
import {
  PostgresqlOperateRecoveryFailureCode,
  PostgresqlOperateRecoveryFenceError,
  PostgresqlOperateRecoveryRetryReason,
  PostgresqlOperateRecoveryStepKind,
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
  test("PostgreSQL Operate recovery steps require the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createOperateTestRuntime(baseUrl, "operate-recovery-steps", 12);

  before(async () => {
    await migrateOperateDatabase(baseUrl);
  });

  after(async () => {
    await runtime.close();
  });

  test("execution preparation is read-only and applies one page outside the gateway call", async () => {
    await resetOperateDatabase(runtime);
    const exactRegistration = await register(runtime);
    const repository = new PostgresqlExecutionPublicationRepository(runtime);
    let gatewayCalls = 0;
    let transactionCalls = 0;
    const step = new PostgresqlExecutionRecoveryStep({
      runtime: countTransactions(runtime, () => transactionCalls += 1),
      gateway: {
        observe: async (request) => {
          gatewayCalls += 1;
          assert.equal(transactionCalls, 0);
          assert.equal(request.afterRevision, 0);
          return { kind: ExecutionPublicationResultKind.Available, page: firstPage(3) };
        },
      },
    });

    const prepared = await step.prepare(candidateKey(exactRegistration));
    assertComplete(prepared);
    assert.equal(gatewayCalls, 1);
    assert.equal(transactionCalls, 0);
    assert.equal(await repository.get(registration.instance.processInstanceId), null);

    await runtime.transaction(async (session) => await prepared.apply(session));
    const first = await repository.get(registration.instance.processInstanceId);
    assert.equal(first?.headRevision, 2);
    assert.equal(first?.producerHeadRevision, 3);
    assert.equal(first?.status, ExecutionPublicationProjectionStatus.Healthy);
    const candidates = new PostgresqlOperateRecoveryCandidateSource(runtime);
    assert.deepEqual(
      textKeys(await candidates.listCandidateKeys(
        OperatePostgresqlRecoveryFamily.CommittedExecution,
        10,
      )),
      [registration.instance.processInstanceId],
    );

    const next = new PostgresqlExecutionRecoveryStep({
      runtime,
      gateway: {
        observe: async (request) => {
          gatewayCalls += 1;
          assert.equal(request.afterRevision, 2);
          return { kind: ExecutionPublicationResultKind.Available, page: secondPage() };
        },
      },
    });
    const preparedNext = await next.prepare(candidateKey(exactRegistration));
    assertComplete(preparedNext);
    await runtime.transaction(async (session) => await preparedNext.apply(session));
    assert.equal((await repository.get(registration.instance.processInstanceId))?.headRevision, 3);
    assert.equal(gatewayCalls, 2);
  });

  test("execution apply rejects a lost expected cursor while the legacy mark would regress it", async () => {
    await resetOperateDatabase(runtime);
    const exactRegistration = await register(runtime);
    const repository = new PostgresqlExecutionPublicationRepository(runtime);
    await repository.applyPage(exactRegistration, firstPage());
    const step = new PostgresqlExecutionRecoveryStep({
      runtime,
      gateway: {
        observe: async () => ({
          kind: ExecutionPublicationResultKind.Available,
          page: secondPage(),
        }),
      },
    });
    const workerA = await step.prepare(candidateKey(exactRegistration));
    const workerB = await step.prepare(candidateKey(exactRegistration));
    assertComplete(workerA);
    assertComplete(workerB);

    await runtime.transaction(async (session) => await workerB.apply(session));
    await assert.rejects(
      runtime.transaction(async (session) => await workerA.apply(session)),
      PostgresqlOperateRecoveryFenceError,
    );
    const retained = await repository.get(registration.instance.processInstanceId);
    assert.equal(retained?.headRevision, 3);
    assert.equal(retained?.status, ExecutionPublicationProjectionStatus.Healthy);

    await repository.mark(exactRegistration, ExecutionPublicationProjectionStatus.Gap);
    assert.equal(
      (await repository.get(registration.instance.processInstanceId))?.status,
      ExecutionPublicationProjectionStatus.Gap,
      "the old unfenced mark directly demonstrates the downgrade the prepared step avoids",
    );
  });

  test("execution apply participates in caller rollback without retaining a suffix", async () => {
    await resetOperateDatabase(runtime);
    const exactRegistration = await register(runtime);
    const repository = new PostgresqlExecutionPublicationRepository(runtime);
    const prepared = await new PostgresqlExecutionRecoveryStep({
      runtime,
      gateway: {
        observe: async () => ({
          kind: ExecutionPublicationResultKind.Available,
          page: firstPage(),
        }),
      },
    }).prepare(candidateKey(exactRegistration));
    assertComplete(prepared);
    await assert.rejects(runtime.transaction(async (session) => {
      await prepared.apply(session);
      throw new Error("force rollback after prepared apply");
    }), /force rollback/u);
    assert.equal(await repository.get(registration.instance.processInstanceId), null);
    assert.equal(await countExecutionBatches(runtime), 0);
  });

  test("execution stale, terminal, retry, and failure results never write classifications", async () => {
    await resetOperateDatabase(runtime);
    let gatewayCalls = 0;
    const gateway = {
      observe: async () => {
        gatewayCalls += 1;
        return { kind: ExecutionPublicationResultKind.NotReady };
      },
    };
    const step = new PostgresqlExecutionRecoveryStep({ runtime, gateway });
    const stale = await step.prepare(new TextEncoder().encode("missing"));
    assertComplete(stale);
    await runtime.transaction(async (session) => await stale.apply(session));
    assert.equal(gatewayCalls, 0);

    const exactRegistration = await register(runtime);
    await closeRegistration(runtime, exactRegistration);
    const terminal = await step.prepare(candidateKey(exactRegistration));
    assertComplete(terminal);
    assert.equal(gatewayCalls, 0);

    await resetOperateDatabase(runtime);
    const active = await register(runtime);
    const outcomes = [
      {
        value: { kind: ExecutionPublicationResultKind.NotReady },
        kind: PostgresqlOperateRecoveryStepKind.Retry,
        detail: PostgresqlOperateRecoveryRetryReason.ProducerNotReady,
      },
      {
        value: { kind: ExecutionPublicationResultKind.Unavailable },
        kind: PostgresqlOperateRecoveryStepKind.Retry,
        detail: PostgresqlOperateRecoveryRetryReason.GatewayUnavailable,
      },
      {
        value: { kind: ExecutionPublicationResultKind.Gap },
        kind: PostgresqlOperateRecoveryStepKind.Fail,
        detail: PostgresqlOperateRecoveryFailureCode.ProducerGap,
      },
      {
        value: { kind: ExecutionPublicationResultKind.NotFound },
        kind: PostgresqlOperateRecoveryStepKind.Fail,
        detail: PostgresqlOperateRecoveryFailureCode.ImpossibleAuthority,
      },
      {
        value: { kind: "future" },
        kind: PostgresqlOperateRecoveryStepKind.Fail,
        detail: PostgresqlOperateRecoveryFailureCode.DecoderDivergence,
      },
    ] as const;
    for (const expected of outcomes) {
      const result = await new PostgresqlExecutionRecoveryStep({
        runtime,
        gateway: { observe: async () => expected.value },
      }).prepare(candidateKey(active));
      assert.equal(result.kind, expected.kind);
      assert.equal("apply" in result, false);
      assert.equal(
        result.kind === PostgresqlOperateRecoveryStepKind.Retry
          ? result.reason
          : result.kind === PostgresqlOperateRecoveryStepKind.Fail
          ? result.code
          : null,
        expected.detail,
      );
    }
    assert.equal(
      await new PostgresqlExecutionPublicationRepository(runtime)
        .get(registration.instance.processInstanceId),
      null,
    );

    const repository = new PostgresqlExecutionPublicationRepository(runtime);
    await repository.mark(active, ExecutionPublicationProjectionStatus.Gap);
    let retainedGapGatewayCalls = 0;
    const retainedGap = await new PostgresqlExecutionRecoveryStep({
      runtime,
      gateway: {
        observe: async () => {
          retainedGapGatewayCalls += 1;
          return { kind: ExecutionPublicationResultKind.NotReady };
        },
      },
    }).prepare(candidateKey(active));
    assert.equal(retainedGap.kind, PostgresqlOperateRecoveryStepKind.Fail);
    assert.equal(
      retainedGap.kind === PostgresqlOperateRecoveryStepKind.Fail
        ? retainedGap.code
        : null,
      PostgresqlOperateRecoveryFailureCode.ProducerGap,
    );
    assert.equal("apply" in retainedGap, false);
    assert.equal(retainedGapGatewayCalls, 0);
    await runtime.query({
      text: `
        DELETE FROM bpmn_platform.operate_execution_publications
        WHERE process_instance_id = $1
      `,
      values: [candidateKey(active)],
    });

    await repository.applyPage(active, firstPage());
    await runtime.query({
      text: `
        UPDATE bpmn_platform.operate_execution_publications
        SET identity_json = '{}'
        WHERE process_instance_id = $1
      `,
      values: [candidateKey(active)],
    });
    let corruptGatewayCalls = 0;
    const corrupt = await new PostgresqlExecutionRecoveryStep({
      runtime,
      gateway: {
        observe: async () => {
          corruptGatewayCalls += 1;
          return { kind: ExecutionPublicationResultKind.NotReady };
        },
      },
    }).prepare(candidateKey(active));
    assert.equal(corrupt.kind, PostgresqlOperateRecoveryStepKind.Fail);
    assert.equal(
      corrupt.kind === PostgresqlOperateRecoveryStepKind.Fail ? corrupt.code : null,
      PostgresqlOperateRecoveryFailureCode.StoredCorruption,
    );
    assert.equal(corruptGatewayCalls, 0);
  });

  test("occurrence preparation makes zero gateway calls until complete healthy E1 exists", async () => {
    let gatewayCalls = 0;
    const gateway = {
      observe: async () => {
        gatewayCalls += 1;
        return {
          kind: FlowNodeOccurrencePublicationResultKind.Available,
          page: occurrenceFirstPage(),
        };
      },
    };

    await resetOperateDatabase(runtime);
    let exactRegistration = await register(runtime);
    let result = await new PostgresqlFlowNodeOccurrenceRecoveryStep({ runtime, gateway })
      .prepare(candidateKey(exactRegistration));
    assertRetry(result, PostgresqlOperateRecoveryRetryReason.ExecutionAuthorityNotReady);

    const executions = new PostgresqlExecutionPublicationRepository(runtime);
    await executions.applyPage(exactRegistration, firstPage());
    const occurrences = new PostgresqlFlowNodeOccurrenceRepository(runtime);
    await occurrences.mark(exactRegistration, FlowNodeOccurrenceProjectionStatus.Gap);
    result = await new PostgresqlFlowNodeOccurrenceRecoveryStep({ runtime, gateway })
      .prepare(candidateKey(exactRegistration));
    assert.equal(result.kind, PostgresqlOperateRecoveryStepKind.Fail);
    assert.equal(
      result.kind === PostgresqlOperateRecoveryStepKind.Fail ? result.code : null,
      PostgresqlOperateRecoveryFailureCode.ProducerGap,
    );
    assert.equal("apply" in result, false);
    assert.equal(gatewayCalls, 0);
    await runtime.query({
      text: `
        UPDATE bpmn_platform.operate_execution_publications
        SET status = 'gap'
        WHERE process_instance_id = $1
      `,
      values: [candidateKey(exactRegistration)],
    });
    result = await new PostgresqlFlowNodeOccurrenceRecoveryStep({ runtime, gateway })
      .prepare(candidateKey(exactRegistration));
    assertRetry(result, PostgresqlOperateRecoveryRetryReason.ExecutionAuthorityNotReady);

    await runtime.query({
      text: `
        UPDATE bpmn_platform.operate_execution_publications
        SET identity_json = '{}'
        WHERE process_instance_id = $1
      `,
      values: [candidateKey(exactRegistration)],
    });
    result = await new PostgresqlFlowNodeOccurrenceRecoveryStep({ runtime, gateway })
      .prepare(candidateKey(exactRegistration));
    assert.equal(result.kind, PostgresqlOperateRecoveryStepKind.Fail);
    assert.equal(
      result.kind === PostgresqlOperateRecoveryStepKind.Fail ? result.code : null,
      PostgresqlOperateRecoveryFailureCode.StoredCorruption,
    );

    await resetOperateDatabase(runtime);
    exactRegistration = await register(runtime);
    await new PostgresqlExecutionPublicationRepository(runtime)
      .applyPage(exactRegistration, firstPage(3));
    result = await new PostgresqlFlowNodeOccurrenceRecoveryStep({ runtime, gateway })
      .prepare(candidateKey(exactRegistration));
    assertRetry(result, PostgresqlOperateRecoveryRetryReason.ExecutionAuthorityNotReady);
    assert.equal(gatewayCalls, 0);
  });

  test("occurrence recovery applies one E1-authorized page and fences a stale worker", async () => {
    await resetOperateDatabase(runtime);
    const exactRegistration = await register(runtime);
    const executions = new PostgresqlExecutionPublicationRepository(runtime);
    await executions.applyPage(exactRegistration, firstPage(3));
    await executions.applyPage(exactRegistration, secondPage());
    const occurrences = new PostgresqlFlowNodeOccurrenceRepository(runtime);
    const firstStep = new PostgresqlFlowNodeOccurrenceRecoveryStep({
      runtime,
      gateway: {
        observe: async (request) => {
          assert.equal(request.afterRevision, 0);
          return {
            kind: FlowNodeOccurrencePublicationResultKind.Available,
            page: occurrenceFirstPage(3),
          };
        },
      },
    });
    const preparedFirst = await firstStep.prepare(candidateKey(exactRegistration));
    assertComplete(preparedFirst);
    assert.equal(await occurrences.get(registration.instance.processInstanceId), null);
    await runtime.transaction(async (session) => await preparedFirst.apply(session));
    assert.deepEqual(
      pickOccurrence(await occurrences.get(registration.instance.processInstanceId)),
      { status: FlowNodeOccurrenceProjectionStatus.Healthy, head: 2, producer: 3 },
    );

    const nextStep = new PostgresqlFlowNodeOccurrenceRecoveryStep({
      runtime,
      gateway: {
        observe: async (request) => {
          assert.equal(request.afterRevision, 2);
          return {
            kind: FlowNodeOccurrencePublicationResultKind.Available,
            page: occurrenceSecondPage(),
          };
        },
      },
    });
    const workerA = await nextStep.prepare(candidateKey(exactRegistration));
    const workerB = await nextStep.prepare(candidateKey(exactRegistration));
    assertComplete(workerA);
    assertComplete(workerB);
    await runtime.transaction(async (session) => await workerB.apply(session));
    await assert.rejects(
      runtime.transaction(async (session) => await workerA.apply(session)),
      PostgresqlOperateRecoveryFenceError,
    );
    assert.deepEqual(
      pickOccurrence(await occurrences.get(registration.instance.processInstanceId)),
      { status: FlowNodeOccurrenceProjectionStatus.Healthy, head: 3, producer: 3 },
    );
  });

  test("occurrence apply rollback retains neither header nor suffix", async () => {
    await resetOperateDatabase(runtime);
    const exactRegistration = await register(runtime);
    const executions = new PostgresqlExecutionPublicationRepository(runtime);
    await executions.applyPage(exactRegistration, firstPage());
    const occurrences = new PostgresqlFlowNodeOccurrenceRepository(runtime);
    const prepared = await new PostgresqlFlowNodeOccurrenceRecoveryStep({
      runtime,
      gateway: {
        observe: async () => ({
          kind: FlowNodeOccurrencePublicationResultKind.Available,
          page: occurrenceFirstPage(),
        }),
      },
    }).prepare(candidateKey(exactRegistration));
    assertComplete(prepared);
    await assert.rejects(runtime.transaction(async (session) => {
      await prepared.apply(session);
      throw new Error("force occurrence rollback");
    }), /occurrence rollback/u);
    assert.equal(await occurrences.get(registration.instance.processInstanceId), null);
    assert.equal(await countOccurrenceBatches(runtime), 0);
  });
}

async function register(
  runtime: PostgresqlRuntime,
): Promise<OperateProcessRegistration> {
  const ordinal = await new PostgresqlProcessInstanceRepository(runtime).recordConfirmed({
    instance: registration.instance,
    locator: registration.locator,
  });
  return { ...registration, ordinal };
}

async function closeRegistration(
  runtime: PostgresqlRuntime,
  exactRegistration: OperateProcessRegistration,
): Promise<void> {
  await runtime.query({
    text: `
      UPDATE bpmn_platform.operate_process_instances
      SET observation = 'closed'
      WHERE process_instance_id = $1
    `,
    values: [candidateKey(exactRegistration)],
  });
}

function candidateKey(exactRegistration: OperateProcessRegistration): Uint8Array {
  return new TextEncoder().encode(exactRegistration.instance.processInstanceId);
}

function textKeys(keys: readonly Uint8Array[]): readonly string[] {
  return keys.map((key) => new TextDecoder().decode(key));
}

function countTransactions(
  runtime: PostgresqlRuntime,
  increment: () => void,
): PostgresqlRuntime {
  return {
    query: async (query) => await runtime.query(query),
    transaction: async (run) => {
      increment();
      return await runtime.transaction(run);
    },
    withDedicatedSession: async (run) => await runtime.withDedicatedSession(run),
    databaseClockEpochMs: async () => await runtime.databaseClockEpochMs(),
    close: async () => await runtime.close(),
  };
}

function assertComplete(
  result: Awaited<ReturnType<PostgresqlExecutionRecoveryStep["prepare"]>>,
): asserts result is Extract<typeof result, { kind: "complete" }> {
  assert.equal(result.kind, PostgresqlOperateRecoveryStepKind.Complete);
}

function assertRetry(
  result: Awaited<ReturnType<PostgresqlExecutionRecoveryStep["prepare"]>>,
  reason: string,
): void {
  assert.equal(result.kind, PostgresqlOperateRecoveryStepKind.Retry);
  assert.equal("reason" in result ? result.reason : null, reason);
}

async function countExecutionBatches(runtime: PostgresqlRuntime): Promise<number> {
  const result = await runtime.query({
    text: "SELECT count(*)::text AS count FROM bpmn_platform.operate_execution_publication_batches",
  });
  return Number(result.rows[0]?.count);
}

async function countOccurrenceBatches(runtime: PostgresqlRuntime): Promise<number> {
  const result = await runtime.query({
    text: "SELECT count(*)::text AS count FROM bpmn_platform.operate_flow_node_occurrence_batches",
  });
  return Number(result.rows[0]?.count);
}

function pickOccurrence(
  image: Awaited<ReturnType<PostgresqlFlowNodeOccurrenceRepository["get"]>>,
): Readonly<{ status: string | undefined; head: number | undefined; producer: number | null | undefined }> {
  return {
    status: image?.status,
    head: image?.headRevision,
    producer: image?.producerHeadRevision,
  };
}
