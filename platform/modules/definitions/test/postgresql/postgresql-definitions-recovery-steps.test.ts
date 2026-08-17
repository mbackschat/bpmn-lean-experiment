import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { PostgresqlExactArtifactStore } from "@bpmn-lean/platform-artifact-store";
import {
  PostgresqlConfirmedProcessInstanceRepository,
  PostgresqlDefinitionScheduleRepository,
  PostgresqlMessageStartPublicationRepository,
} from "@bpmn-lean/platform-definitions";
import { runPostgresqlMigrations } from "@bpmn-lean/platform-postgresql-runtime/migrations";

import {
  PostgresqlConfirmedRegistrationRecoveryStep,
} from "../../dist/postgresql-confirmed-registration-recovery-step.js";
import {
  PostgresqlDefinitionScheduleRecoveryStep,
} from "../../dist/postgresql-definition-schedule-recovery-step.js";
import {
  PostgresqlDefinitionsRecoveryIntermediateResult,
  PostgresqlDefinitionsRecoveryStepKind,
} from "../../dist/postgresql-definitions-recovery-step.js";
import { PostgresqlDirectStartRecoveryStep } from "../../dist/postgresql-direct-start-recovery-step.js";
import {
  PostgresqlMessageStartRecoveryStep,
} from "../../dist/postgresql-message-start-recovery-step.js";
import {
  apply,
  applyIntermediateFence,
  confirmedKey,
  confirmedPublication,
  continueIntermediate,
  createTestRuntime,
  directKey,
  directReservation,
  messageKey,
  messageRecord,
  registered,
  registrationCounts,
  resetDatabase,
  scheduleKey,
  scheduleRecord,
  seedDefinition,
  subscriber,
} from "./support/definitions-recovery-step-fixture.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL Definitions recovery steps require the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createTestRuntime(baseUrl);
  const artifacts = new PostgresqlExactArtifactStore(runtime);

  before(async () => {
    await runPostgresqlMigrations({
      connectionString: baseUrl,
      migrationDirectories: [
        fileURLToPath(
          new URL("../../../../foundation/artifact-store/migrations", import.meta.url),
        ),
        fileURLToPath(new URL("../../migrations", import.meta.url)),
        fileURLToPath(new URL("../../../operate/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../work/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../foundation/audit/migrations", import.meta.url)),
        fileURLToPath(
          new URL("../../../../foundation/recovery-runtime/migrations", import.meta.url),
        ),
      ],
    });
  });

  after(async () => {
    await runtime.close();
  });

  test("direct recovery fences dispatch ownership and ignores a stale callback", async () => {
    await resetDatabase(runtime);
    const definition = await seedDefinition(runtime, artifacts);
    const repository = new PostgresqlConfirmedProcessInstanceRepository(runtime);
    const processInstanceId = "direct\u0000😀";
    await repository.reserveDirect(directReservation(processInstanceId, definition));
    let startCalls = 0;
    let describeCalls = 0;
    const recovery = new PostgresqlDirectStartRecoveryStep({
      runtime,
      host: {
        start: async () => {
          startCalls += 1;
          throw new Error("accepted response was lost");
        },
        describe: async () => {
          describeCalls += 1;
          return { status: "matching" };
        },
      },
    });

    const dispatch = await recovery.prepare(directKey(processInstanceId));
    assert.equal(dispatch.kind, PostgresqlDefinitionsRecoveryStepKind.Intermediate);
    assert.equal(startCalls, 0);
    assert.equal(describeCalls, 0);
    assert.equal((await repository.get(processInstanceId))?.state, "reserved");
    const lost = dispatch;
    assert.equal((await repository.get(processInstanceId))?.state, "reserved");
    const responseLost = await continueIntermediate(runtime, dispatch);
    assert.equal(responseLost.kind, PostgresqlDefinitionsRecoveryStepKind.Retry);
    assert.equal(startCalls, 1);
    assert.equal((await repository.get(processInstanceId))?.state, "starting");

    const observed = await recovery.prepare(directKey(processInstanceId));
    assert.equal(startCalls, 1);
    assert.equal(describeCalls, 1);
    assert.equal((await repository.get(processInstanceId))?.state, "starting");
    await apply(runtime, observed);
    assert.equal((await repository.get(processInstanceId))?.state, "confirmed");
    assert.equal(
      await applyIntermediateFence(runtime, lost),
      PostgresqlDefinitionsRecoveryIntermediateResult.LeaseLost,
    );
    assert.equal((await repository.get(processInstanceId))?.state, "confirmed");
    assert.equal(startCalls, 1);
  });

  test("confirmed delivery inserts both exact subscribers and acknowledges atomically", async () => {
    await resetDatabase(runtime);
    const definition = await seedDefinition(runtime, artifacts);
    const confirmed = new PostgresqlConfirmedProcessInstanceRepository(runtime);
    const publication = confirmedPublication("confirmed\u0000😀", definition);
    await confirmed.confirm(publication);
    const calls: string[] = [];
    const recovery = new PostgresqlConfirmedRegistrationRecoveryStep({
      runtime,
      operate: subscriber("operate", calls),
      work: subscriber("work", calls),
    });

    const step = await recovery.prepare(confirmedKey(publication.instance.processInstanceId));
    assert.deepEqual(calls, []);
    assert.equal((await confirmed.get(publication.instance.processInstanceId))?.operatePending, true);
    await apply(runtime, step);
    assert.deepEqual(calls, ["operate", "work"]);
    assert.deepEqual(await registrationCounts(runtime), { operate: 1, work: 1 });
    assert.deepEqual(await confirmed.get(publication.instance.processInstanceId), {
      ...publication,
      intent: null,
      state: "confirmed",
      operatePending: false,
      workPending: false,
    });

    const rollback = confirmedPublication("rollback", definition);
    await confirmed.confirm(rollback);
    const failing = new PostgresqlConfirmedRegistrationRecoveryStep({
      runtime,
      operate: subscriber("operate", []),
      work: {
        recordConfirmedProcessInstance: async () => {
          throw new Error("injected Work failure");
        },
      },
    });
    const rollbackStep = await failing.prepare(confirmedKey("rollback"));
    await assert.rejects(apply(runtime, rollbackStep), /injected Work failure/u);
    assert.equal(await registered(runtime, "operate", "rollback"), false);
    assert.equal((await confirmed.get("rollback"))?.operatePending, true);
  });

  test("Schedule recovery separates host work from fenced state and publication", async () => {
    await resetDatabase(runtime);
    const definition = await seedDefinition(runtime, artifacts);
    const schedules = new PostgresqlDefinitionScheduleRepository(runtime);
    const confirmed = new PostgresqlConfirmedProcessInstanceRepository(runtime);
    const record = scheduleRecord(definition, "schedule\u0000😀", "scheduled-instance");
    await schedules.reserve(record);
    let createCalls = 0;
    let deleteCalls = 0;
    const recovery = new PostgresqlDefinitionScheduleRecoveryStep({
      runtime,
      artifacts,
      host: {
        createOrCompare: async () => {
          createCalls += 1;
          return { phase: "pending", paused: false };
        },
        inspect: async () => ({ phase: "pending", paused: false }),
        pause: async () => ({ phase: "pending", paused: true }),
        delete: async () => {
          deleteCalls += 1;
        },
      },
      locators: { scheduleExecutionLocator: (id) => `schedule:${id}` },
    });

    const dispatch = await recovery.prepare(scheduleKey(record));
    assert.equal(createCalls, 0);
    assert.equal((await schedules.get(record.reference))?.state, "creating");
    await apply(runtime, dispatch);
    assert.equal((await schedules.get(record.reference))?.state, "creatingHost");

    const observed = await recovery.prepare(scheduleKey(record));
    assert.equal(createCalls, 1);
    assert.equal((await schedules.get(record.reference))?.state, "creatingHost");
    await apply(runtime, observed);
    assert.equal((await schedules.get(record.reference))?.state, "scheduled");
    await schedules.compareAndSet(record.reference, "scheduled", {
      state: "started",
      executionWorkflowId: "execution\u0000😀",
      firstRunId: "run\u0000😀",
    });

    const lostCleanup = await recovery.prepare(scheduleKey(record));
    assert.equal(deleteCalls, 1);
    assert.equal((await schedules.get(record.reference))?.cleanupComplete, false);
    assert.equal(await confirmed.get(record.identity.processInstanceId), null);
    void lostCleanup;
    const cleanup = await recovery.prepare(scheduleKey(record));
    assert.equal(deleteCalls, 2);
    await apply(runtime, cleanup);
    assert.equal((await schedules.get(record.reference))?.cleanupComplete, true);
    assert.equal(
      (await confirmed.get(record.identity.processInstanceId))?.state,
      "confirmed",
    );
  });

  test("Message Start recovery never redispatches and accepted repair performs zero host calls", async () => {
    await resetDatabase(runtime);
    const definition = await seedDefinition(runtime, artifacts);
    const publications = new PostgresqlMessageStartPublicationRepository(runtime);
    const confirmed = new PostgresqlConfirmedProcessInstanceRepository(runtime);
    const record = messageRecord(definition, "message\u0000😀", "message-instance");
    await publications.reserve(record);
    let hostCalls = 0;
    const recovery = new PostgresqlMessageStartRecoveryStep({
      runtime,
      artifacts,
      host: {
        start: async (request) => {
          hostCalls += 1;
          assert.equal(
            new TextDecoder().decode(request.bytes),
            "lease-fenced recovery definition",
          );
          assert.equal(request.definition.processId, definition.processId);
          assert.deepEqual(request.expectedIntent, record.intent);
          return { status: "started" };
        },
        describe: async () => {
          hostCalls += 1;
          return { status: "matching" };
        },
      },
      locators: { canonicalLocator: (id) => `message:${id}` },
    });

    const dispatch = await recovery.prepare(messageKey(record.publicationId));
    assert.equal(hostCalls, 0);
    assert.equal((await publications.get(record.publicationId))?.state, "reserved");
    const started = await continueIntermediate(runtime, dispatch);
    assert.equal(hostCalls, 1);
    assert.equal((await publications.get(record.publicationId))?.state, "starting");
    assert.equal(await confirmed.get(record.identity.processInstanceId), null);
    await apply(runtime, started);
    assert.equal((await publications.get(record.publicationId))?.state, "accepted");
    assert.equal((await confirmed.get(record.identity.processInstanceId))?.state, "confirmed");
    assert.equal(
      await applyIntermediateFence(runtime, dispatch),
      PostgresqlDefinitionsRecoveryIntermediateResult.LeaseLost,
    );
    assert.equal(hostCalls, 1);

    await runtime.query({
      text: "DELETE FROM bpmn_platform.confirmed_process_instances WHERE process_instance_id = $1",
      values: [Buffer.from(record.identity.processInstanceId, "utf8")],
    });
    const beforeAcceptedRepair = hostCalls;
    let acceptedArtifactReads = 0;
    const acceptedRecovery = new PostgresqlMessageStartRecoveryStep({
      runtime,
      artifacts: {
        get: async () => {
          acceptedArtifactReads += 1;
          throw new Error("accepted recovery must not read artifacts");
        },
        put: async () => {
          throw new Error("accepted recovery must not write artifacts");
        },
      },
      host: {
        start: async () => {
          throw new Error("accepted recovery must not start Product 1");
        },
        describe: async () => {
          throw new Error("accepted recovery must not describe Product 1");
        },
      },
      locators: { canonicalLocator: (id) => `message:${id}` },
    });
    const acceptedRepair = await acceptedRecovery.prepare(
      messageKey(record.publicationId),
    );
    assert.equal(hostCalls, beforeAcceptedRepair);
    assert.equal(acceptedArtifactReads, 0);
    assert.equal(await confirmed.get(record.identity.processInstanceId), null);
    await apply(runtime, acceptedRepair);
    assert.equal((await confirmed.get(record.identity.processInstanceId))?.state, "confirmed");

    const lostRecord = messageRecord(
      definition,
      "message-response-lost",
      "message-response-lost-instance",
    );
    await publications.reserve(lostRecord);
    let lostStarts = 0;
    let lostDescribes = 0;
    const lostRecovery = new PostgresqlMessageStartRecoveryStep({
      runtime,
      artifacts,
      host: {
        start: async () => {
          lostStarts += 1;
          throw new Error("accepted response was lost");
        },
        describe: async () => {
          lostDescribes += 1;
          return { status: "matching" };
        },
      },
      locators: { canonicalLocator: (id) => `message:${id}` },
    });
    const lostDispatch = await lostRecovery.prepare(
      messageKey(lostRecord.publicationId),
    );
    const unavailable = await continueIntermediate(runtime, lostDispatch);
    assert.equal(unavailable.kind, PostgresqlDefinitionsRecoveryStepKind.Retry);
    assert.equal(lostStarts, 1);
    assert.equal(lostDescribes, 0);
    assert.equal((await publications.get(lostRecord.publicationId))?.state, "starting");
    const described = await lostRecovery.prepare(messageKey(lostRecord.publicationId));
    assert.equal(lostStarts, 1);
    assert.equal(lostDescribes, 1);
    await apply(runtime, described);
    assert.equal((await publications.get(lostRecord.publicationId))?.state, "accepted");
  });
}
