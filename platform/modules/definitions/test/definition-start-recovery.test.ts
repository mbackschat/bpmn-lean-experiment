import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ArtifactPutStatus } from "@bpmn-lean/platform-artifact-store";
import {
  BpmnEngineGateway,
  BpmnProcessWorkGateway,
  DefinitionCompilationStatus,
  DefinitionRegistrationStatus,
  DefinitionStartDescriptionStatus,
  DefinitionStartStatus as EngineDefinitionStartStatus,
  ProcessWorkObservationStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionStartDescriptionResult,
  DefinitionVersionStarter,
  EngineHostRuntime,
} from "@bpmn-lean/platform-engine-gateway";
import { createMemoryEngineHostRuntime } from "@bpmn-lean/platform-engine-gateway/testing";
import {
  ConfirmedProcessInstancePublicationService,
  ConfirmedProcessInstanceState,
  DefinitionStartIntegrityError,
  DefinitionStartService,
  DefinitionVersionStartStatus,
  InMemoryConfirmedProcessInstanceRepository,
  SqliteConfirmedProcessInstanceRepository,
} from "@bpmn-lean/platform-definitions";
import {
  PostgresqlDefinitionsRecoveryIntermediateResult,
  PostgresqlDefinitionsRecoveryStepKind,
  PostgresqlDirectStartRecoveryStep,
} from "@bpmn-lean/platform-definitions";
import type {
  ConfirmedProcessInstanceRecord,
  ConfirmedProcessInstanceReservationResult,
  DirectProcessInstanceReservation,
  DefinitionMetadata,
  DefinitionRepository,
  ExactArtifactStore,
  NewDefinitionMetadata,
} from "@bpmn-lean/platform-definitions";

const source = new TextEncoder().encode("direct start recovery");
const definition: DefinitionMetadata = {
  processId: "Process_Direct_Recovery",
  version: 1,
  source: {
    kind: "bpmnSource",
    id: "direct-recovery-source",
    sha256: "c".repeat(64),
    byteLength: source.byteLength,
    declaredEncoding: null,
    decodedAs: "UTF-8",
  },
  semanticProfile: "direct-recovery-profile",
  startCapabilities: { messageStarts: [], timerStarts: [] },
  sourceOverlay: null,
};

test("recovers a lost direct-start response by describing without redispatch", async () => {
  const fixture = createFixture("matching");

  const result = await fixture.service.start(reference(), { initialVariables: [] });

  assert.equal(result.status, DefinitionVersionStartStatus.Started);
  assert.equal(fixture.preparedStarts, 1);
  assert.equal(fixture.describes, 1);
});

test("restart reconciliation describes an uncertain direct start without redispatch", async () => {
  const fixture = createFixture("missing");

  await assert.rejects(
    fixture.service.start(reference(), { initialVariables: [] }),
    (error: unknown) => error instanceof DefinitionStartIntegrityError,
  );
  fixture.setDescription("matching");
  await fixture.restartedService().reconcileAll();

  assert.equal(fixture.preparedStarts, 1);
  assert.equal(fixture.describes, 2);
});

test("restart dispatches one durable reserved direct start and never redispatches starting", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-reserved-direct-recovery-"));
  const databaseFile = join(root, "definitions.sqlite");
  const reservation = {
    instance: {
      processInstanceId: "reserved-direct-instance",
      definition: {
        processId: definition.processId,
        version: definition.version,
        source: structuredClone(definition.source),
        semanticProfile: definition.semanticProfile,
        startCapabilities: { messageStarts: [], timerStarts: [] },
        sourceOverlay: null,
      },
    },
    locator: "private-reserved-direct-locator",
    intent: {
      protocol: "bpmn-direct-start-v1",
      intentSha256: "e".repeat(64),
    },
    startCommandBytes: new TextEncoder().encode('{"initialVariables":[]}'),
  } as const;
  let starts = 0;
  let describes = 0;
  try {
    const initial = new SqliteConfirmedProcessInstanceRepository(databaseFile);
    await initial.reserveDirect(reservation);
    initial.close();

    const reopened = new SqliteConfirmedProcessInstanceRepository(databaseFile);
    const publications = new ConfirmedProcessInstancePublicationService({
      repository: reopened,
      operate: { recordConfirmedProcessInstance: async () => undefined },
      work: { recordConfirmedProcessInstance: async () => undefined },
    });
    const starter: DefinitionVersionStarter = {
      prepareDefinitionVersion: async () => {
        throw new Error("restart must use the durable reservation");
      },
      startPreparedDefinitionVersion: async (request) => {
        starts += 1;
        return {
          status: EngineDefinitionStartStatus.Started,
          source: structuredClone(definition.source),
          definition: {
          sourceOverlay: null,
            processId: definition.processId,
            semanticProfile: definition.semanticProfile,
          },
          processInstanceId: request.processInstanceId,
        };
      },
      describeDefinitionVersionStart: async () => {
        describes += 1;
        return {
          status: "matching" as DefinitionStartDescriptionResult["status"],
        };
      },
      startDefinitionVersion: async () => {
        throw new Error("legacy single-call direct start must not be used");
      },
    };
    const service = new DefinitionStartService(
      starter,
      artifactStore(),
      definitionRepository(),
      () => "unused-restart-id",
      publications,
    );

    await service.reconcileProcessInstance(reservation.instance.processInstanceId);
    await service.reconcileAll();

    assert.equal(starts, 1);
    assert.equal(describes, 0);
    assert.equal(
      (await reopened.get(reservation.instance.processInstanceId))?.state,
      ConfirmedProcessInstanceState.Confirmed,
    );
    reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restart dispatches the exact command captured before a caller mutation", async () => {
  const repository = new CrashAfterDirectReservationRepository();
  const dispatchedVariables: unknown[] = [];
  const publications = new ConfirmedProcessInstancePublicationService({
    repository,
    operate: { recordConfirmedProcessInstance: async () => undefined },
    work: { recordConfirmedProcessInstance: async () => undefined },
  });
  const starter: DefinitionVersionStarter = {
    prepareDefinitionVersion: async (request) => ({
      status: EngineDefinitionStartStatus.Admitted,
      source: structuredClone(definition.source),
      definition: {
      sourceOverlay: null,
        processId: definition.processId,
        semanticProfile: definition.semanticProfile,
      },
      processInstanceId: request.processInstanceId,
      locator: "captured-command-locator",
      intent: {
        protocol: "bpmn-direct-start-v1",
        intentSha256: "9".repeat(64),
      },
    }),
    startPreparedDefinitionVersion: async (request) => {
      dispatchedVariables.push(structuredClone(request.initialVariables));
      return {
        status: EngineDefinitionStartStatus.Started,
        source: structuredClone(definition.source),
        definition: {
        sourceOverlay: null,
          processId: definition.processId,
          semanticProfile: definition.semanticProfile,
        },
        processInstanceId: request.processInstanceId,
      };
    },
    describeDefinitionVersionStart: async () => {
      throw new Error("a reserved recovery must dispatch before describe");
    },
    startDefinitionVersion: async () => {
      throw new Error("legacy single-call direct start must not be used");
    },
  };
  const dependencies = [
    starter,
    artifactStore(),
    definitionRepository(),
    () => "captured-command-instance",
    publications,
  ] as const;
  const mutableCommand = {
    initialVariables: [{
      name: "DataObject_InputItems",
      value: {
        kind: "stringList" as const,
        value: ["contract", "invoice", "receipt"],
      },
    }],
  };

  const interrupted = new DefinitionStartService(...dependencies).start(
    reference(),
    mutableCommand,
  );
  mutableCommand.initialVariables[0]!.value.value[0] = "mutated-after-capture";
  await assert.rejects(interrupted, /simulated crash after durable reservation/u);

  await new DefinitionStartService(...dependencies).reconcileProcessInstance(
    "captured-command-instance",
  );

  assert.deepEqual(dispatchedVariables, [[{
    name: "DataObject_InputItems",
    value: {
      kind: "stringList",
      value: ["contract", "invoice", "receipt"],
    },
  }]]);
});

test("composition obtains the artifact-validating direct recovery host", async () => {
  let starts = 0;
  let describes = 0;
  const starter: DefinitionVersionStarter = {
    prepareDefinitionVersion: async () => {
      throw new Error("recovery must not prepare the retained intent again");
    },
    startPreparedDefinitionVersion: async (request) => {
      starts += 1;
      assert.deepEqual(request.bytes, source);
      return {
        status: EngineDefinitionStartStatus.Started,
        source: structuredClone(definition.source),
        definition: {
        sourceOverlay: null,
          processId: definition.processId,
          semanticProfile: definition.semanticProfile,
        },
        processInstanceId: request.processInstanceId,
      };
    },
    describeDefinitionVersionStart: async () => {
      describes += 1;
      return { status: DefinitionStartDescriptionStatus.Matching };
    },
    startDefinitionVersion: async () => {
      throw new Error("legacy start must not be used");
    },
  };
  const service = new DefinitionStartService(
    starter,
    artifactStore(),
    definitionRepository(),
    () => "unused",
    new ConfirmedProcessInstancePublicationService({
      repository: new InMemoryConfirmedProcessInstanceRepository(),
      operate: { recordConfirmedProcessInstance: async () => undefined },
      work: { recordConfirmedProcessInstance: async () => undefined },
    }),
  );
  const host = service.directStartRecoveryHost();
  const reservation = {
    instance: {
      processInstanceId: "composition-instance",
      definition: structuredClone(definition),
    },
    locator: "composition-locator",
    intent: {
      protocol: "bpmn-direct-start-v1",
      intentSha256: "e".repeat(64),
    },
    startCommandBytes: new TextEncoder().encode('{"initialVariables":[]}'),
  };

  assert.deepEqual(await host.start(reservation), { status: "started" });
  assert.deepEqual(await host.describe(reservation), { status: "matching" });
  assert.equal(starts, 1);
  assert.equal(describes, 1);
  assert.ok(new PostgresqlDirectStartRecoveryStep({ runtime: {} as never, host }));
});

// The recovery worker polls fresh rows while the live start is still in flight, before or after the host committed it,
// so its pass over the engine's own intent must leave that start's verdict to the start.
for (const hold of ["beforeHostStart", "afterHostCommit"] as const) {
  test(`recovery observing a live engine start held ${hold} leaves it to commit as started`, async () => {
    const engine = await engineStartFixture();
    const held = holdStart(engine.processes, hold);
    const service = engine.service(held.processes, () => "live-engine-instance");

    const live = service.start(engine.reference, { initialVariables: [] });
    await held.reached;
    const step = new PostgresqlDirectStartRecoveryStep({
      runtime: recoveryRuntime(engine.repository),
      host: engine.service(engine.processes, () => "unused").directStartRecoveryHost(),
    });
    await runRecoveryStep(step, engine.repository, "live-engine-instance");
    assert.notEqual(
      (await engine.repository.get("live-engine-instance"))?.state,
      ConfirmedProcessInstanceState.IntegrityFailure,
    );
    held.release();

    assert.equal((await live).status, DefinitionVersionStartStatus.Started);
    assert.equal(
      (await engine.repository.get("live-engine-instance"))?.state,
      ConfirmedProcessInstanceState.Confirmed,
    );
  });
}

test("recovery dispatches a reserved engine start the crashed API left behind", async () => {
  const engine = await engineStartFixture(new CrashAfterDirectReservationRepository());
  await assert.rejects(
    engine.service(engine.processes, () => "crashed-engine-instance")
      .start(engine.reference, { initialVariables: [] }),
    /simulated crash after durable reservation/u,
  );
  const step = new PostgresqlDirectStartRecoveryStep({
    runtime: recoveryRuntime(engine.repository),
    host: engine.service(engine.processes, () => "unused").directStartRecoveryHost(),
  });

  await runRecoveryStep(step, engine.repository, "crashed-engine-instance");

  assert.equal(
    (await engine.repository.get("crashed-engine-instance"))?.state,
    ConfirmedProcessInstanceState.Confirmed,
  );
  const work = new BpmnProcessWorkGateway(engine.host);
  assert.equal((await work.observeOpenWork({
    locator: work.canonicalLocator("crashed-engine-instance"),
    hostingProcessInstanceId: "crashed-engine-instance",
  })).status, ProcessWorkObservationStatus.Open);
});

test("recovery leaves an intent the engine does not compute to the engine's refusal", async () => {
  const engine = await engineStartFixture();
  await engine.repository.reserveDirect({
    instance: { processInstanceId: "foreign-intent-instance", definition: structuredClone(engine.stored) },
    locator: "foreign-intent-locator",
    intent: { protocol: "foreign-start-protocol", intentSha256: "e".repeat(64) },
    startCommandBytes: new TextEncoder().encode('{"initialVariables":[]}'),
  });
  const step = new PostgresqlDirectStartRecoveryStep({
    runtime: recoveryRuntime(engine.repository),
    host: engine.service(engine.processes, () => "unused").directStartRecoveryHost(),
  });

  await runRecoveryStep(step, engine.repository, "foreign-intent-instance");

  assert.equal(
    (await engine.repository.get("foreign-intent-instance"))?.state,
    ConfirmedProcessInstanceState.IntegrityFailure,
  );
  const work = new BpmnProcessWorkGateway(engine.host);
  assert.equal((await work.observeOpenWork({
    locator: work.canonicalLocator("foreign-intent-instance"),
    hostingProcessInstanceId: "foreign-intent-instance",
  })).status, ProcessWorkObservationStatus.Unknown);
});

type EngineProcesses = EngineHostRuntime["host"]["processes"];

/** A real engine gateway on the in-process host, with one stored version registered and the platform's own lifecycle. */
async function engineStartFixture(
  repository: InMemoryConfirmedProcessInstanceRepository = new InMemoryConfirmedProcessInstanceRepository(),
) {
  const bytes = new Uint8Array(await readFile(new URL(
    "../../../../scenarios/user-task-preserved-notation/process.bpmn",
    import.meta.url,
  )));
  const runtime = createMemoryEngineHostRuntime({ taskQueue: "direct-recovery-engine", now: () => 1_000 });
  const limits = { maxSourceBytes: 1_048_576, parserDeadlineMs: 1_000 } as const;
  const profileRelations = (profile: string) => profile === "direct-recovery-standard" ? [] : null;
  const registrar = new BpmnEngineGateway({ ...limits, host: runtime.host, profileRelations });
  const compiled = await registrar.compileDefinition({
    bytes,
    sourceId: "direct-recovery-engine-source",
    expectedSha256: undefined,
    semanticProfile: "direct-recovery-standard",
  });
  if (compiled.status !== DefinitionCompilationStatus.Accepted) {
    throw new Error("the witness model must compile");
  }
  const stored: DefinitionMetadata = {
    processId: compiled.definition.processId,
    version: 1,
    source: structuredClone(compiled.source),
    semanticProfile: compiled.definition.semanticProfile,
    startCapabilities: structuredClone(compiled.startCapabilities),
    sourceOverlay: null,
  };
  const registered = await registrar.registerDefinitionVersion({
    bytes,
    sourceId: stored.source.id,
    expectedSha256: stored.source.sha256,
    semanticProfile: stored.semanticProfile,
    expectedProcessId: stored.processId,
    version: stored.version,
  });
  if (registered.status !== DefinitionRegistrationStatus.Registered) {
    throw new Error("the witness version must register");
  }
  const publications = new ConfirmedProcessInstancePublicationService({
    repository,
    operate: { recordConfirmedProcessInstance: async () => undefined },
    work: { recordConfirmedProcessInstance: async () => undefined },
  });
  return {
    repository,
    host: runtime.host,
    processes: runtime.host.processes,
    stored,
    reference: { processId: stored.processId, version: stored.version },
    service: (processes: EngineProcesses, processInstanceId: () => string) =>
      new DefinitionStartService(
        new BpmnEngineGateway({ ...limits, host: { ...runtime.host, processes }, profileRelations }),
        {
          put: async () => ({ status: ArtifactPutStatus.Stored }),
          get: async () => Uint8Array.from(bytes),
        },
        {
          allocateNext: async () => {
            throw new Error("deployment is outside this fixture");
          },
          listLatest: async () => [structuredClone(stored)],
          listVersions: async () => [structuredClone(stored)],
          get: async () => structuredClone(stored),
        },
        processInstanceId,
        publications,
      ),
  };
}

/**
 * The live start held open at `hold`: before the host saw it, or after the host committed it while its answer, as the
 * Temporal client's settle Update, is still on its way.
 */
function holdStart(processes: EngineProcesses, hold: "beforeHostStart" | "afterHostCommit") {
  let reach!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held: EngineProcesses = {
    start: async (request) => {
      if (hold === "beforeHostStart") {
        reach();
        await released;
        return await processes.start(request);
      }
      const result = await processes.start(request);
      reach();
      await released;
      return result;
    },
    command: (workflowId, stimulus) => processes.command(workflowId, stimulus),
    deliver: (workflowId, stimulus) => processes.deliver(workflowId, stimulus),
    observation: (workflowId) => processes.observation(workflowId),
    hostView: (workflowId) => processes.hostView(workflowId),
    publication: (workflowId, afterRevision, limit) => processes.publication(workflowId, afterRevision, limit),
    describe: (workflowId) => processes.describe(workflowId),
  };
  return { processes: held, reached, release };
}

/**
 * The recovery worker's reads and fenced compare-and-set over the in-memory rows: the SELECT the step reads a row with
 * and the UPDATE its transition applies, as `applyConfirmedRecoveryState` issues them.
 */
function recoveryRuntime(repository: InMemoryConfirmedProcessInstanceRepository) {
  const decoder = new TextDecoder();
  return {
    query: async ({ text, values }: { text: string; values: readonly unknown[] }) => {
      if (/^\s*SELECT \* FROM bpmn_platform\.confirmed_process_instances/u.test(text)) {
        const record = await repository.get(decoder.decode(values[0] as Uint8Array));
        return record === null ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{
          process_instance_id: Buffer.from(record.instance.processInstanceId),
          public_instance_json: JSON.stringify(record.instance),
          work_locator: Buffer.from(record.locator),
          direct_intent_json: JSON.stringify(record.intent),
          direct_start_command: record.startCommandBytes === null ? null : Buffer.from(record.startCommandBytes),
          state: record.state,
          operate_pending: record.operatePending,
          work_pending: record.workPending,
        }] };
      }
      if (/^\s*UPDATE bpmn_platform\.confirmed_process_instances/u.test(text)) {
        const updated = await repository.compareAndSetState(
          decoder.decode(values[1] as Uint8Array),
          values[2] as ConfirmedProcessInstanceRecord["state"],
          values[0] as ConfirmedProcessInstanceRecord["state"],
        );
        return { rowCount: updated === null ? 0 : 1, rows: [] };
      }
      throw new Error(`the witness runtime does not answer ${text}`);
    },
  } as never;
}

/** One recovery-worker pass over the item, its intermediates applied while owned as `handleDefinitionsRecoveryStep` does. */
async function runRecoveryStep(
  step: PostgresqlDirectStartRecoveryStep,
  repository: InMemoryConfirmedProcessInstanceRepository,
  processInstanceId: string,
): Promise<void> {
  const session = recoveryRuntime(repository);
  let result = await step.prepare(new TextEncoder().encode(JSON.stringify([processInstanceId])));
  while (result.kind === PostgresqlDefinitionsRecoveryStepKind.Intermediate) {
    if (await result.applyWhileOwned(session) !== PostgresqlDefinitionsRecoveryIntermediateResult.Applied) return;
    result = await result.continue();
  }
  if (result.kind !== PostgresqlDefinitionsRecoveryStepKind.Complete) {
    throw new Error(`the recovery step answered ${result.kind}`);
  }
  await result.apply(session);
}

function createFixture(initialDescription: "missing" | "matching") {
  let description = initialDescription;
  let preparedStarts = 0;
  let describes = 0;
  const publications = new ConfirmedProcessInstancePublicationService({
    repository: new InMemoryConfirmedProcessInstanceRepository(),
    operate: { recordConfirmedProcessInstance: async () => undefined },
    work: { recordConfirmedProcessInstance: async () => undefined },
  });
  const starter: DefinitionVersionStarter = {
    prepareDefinitionVersion: async (request) => ({
      status: EngineDefinitionStartStatus.Admitted,
      source: structuredClone(definition.source),
      definition: {
      sourceOverlay: null,
        processId: definition.processId,
        semanticProfile: definition.semanticProfile,
      },
      processInstanceId: request.processInstanceId,
      locator: "private-direct-recovery-locator",
      intent: {
        protocol: "bpmn-direct-start-v1",
        intentSha256: "f".repeat(64),
      },
    }),
    startPreparedDefinitionVersion: async () => {
      preparedStarts += 1;
      throw new Error("host accepted but its response was lost");
    },
    describeDefinitionVersionStart: async () => {
      describes += 1;
      return {
        status: description as DefinitionStartDescriptionResult["status"],
      };
    },
    startDefinitionVersion: async () => {
      throw new Error("legacy single-call direct start must not be used");
    },
  };
  const dependencies = [
    starter,
    artifactStore(),
    definitionRepository(),
    () => "direct-recovery-instance",
    publications,
  ] as const;
  return {
    service: new DefinitionStartService(...dependencies),
    restartedService: () => new DefinitionStartService(...dependencies),
    setDescription: (next: "missing" | "matching") => {
      description = next;
    },
    get preparedStarts() {
      return preparedStarts;
    },
    get describes() {
      return describes;
    },
  };
}

function artifactStore(): ExactArtifactStore {
  return {
    put: async () => ({ status: ArtifactPutStatus.Stored }),
    get: async () => Uint8Array.from(source),
  };
}

function definitionRepository(): DefinitionRepository {
  return {
    allocateNext: async (_metadata: NewDefinitionMetadata) => {
      throw new Error("deployment is outside this fixture");
    },
    listLatest: async () => [structuredClone(definition)],
    listVersions: async () => [structuredClone(definition)],
    get: async (selected) =>
      selected.processId === definition.processId &&
        selected.version === definition.version
        ? structuredClone(definition)
        : null,
  };
}

function reference() {
  return { processId: definition.processId, version: definition.version };
}

class CrashAfterDirectReservationRepository
  extends InMemoryConfirmedProcessInstanceRepository {
  #failReservation = true;

  override async reserveDirect(
    reservation: DirectProcessInstanceReservation,
  ): Promise<ConfirmedProcessInstanceReservationResult> {
    const result = await super.reserveDirect(reservation);
    if (this.#failReservation) {
      this.#failReservation = false;
      throw new Error("simulated crash after durable reservation");
    }
    return result;
  }
}
