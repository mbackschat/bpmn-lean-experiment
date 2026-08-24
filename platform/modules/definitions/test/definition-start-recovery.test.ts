import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ArtifactPutStatus } from "@bpmn-lean/platform-artifact-store";
import {
  DefinitionStartDescriptionStatus,
  DefinitionStartStatus as EngineDefinitionStartStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionStartDescriptionResult,
  DefinitionVersionStarter,
} from "@bpmn-lean/platform-engine-gateway";
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
  PostgresqlDirectStartRecoveryStep,
} from "@bpmn-lean/platform-definitions";
import type {
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
      name: "DataObjectReference_InputItems",
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
    name: "DataObjectReference_InputItems",
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
