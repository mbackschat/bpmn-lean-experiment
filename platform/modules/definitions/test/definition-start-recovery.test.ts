import assert from "node:assert/strict";
import { test } from "node:test";

import { ArtifactPutStatus } from "@bpmn-lean/platform-artifact-store";
import {
  DefinitionStartStatus as EngineDefinitionStartStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionStartDescriptionResult,
  DefinitionVersionStarter,
} from "@bpmn-lean/platform-engine-gateway";
import {
  ConfirmedProcessInstancePublicationService,
  DefinitionStartIntegrityError,
  DefinitionStartService,
  DefinitionVersionStartStatus,
  InMemoryConfirmedProcessInstanceRepository,
} from "@bpmn-lean/platform-definitions";
import type {
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

  const result = await fixture.service.start(reference());

  assert.equal(result.status, DefinitionVersionStartStatus.Started);
  assert.equal(fixture.preparedStarts, 1);
  assert.equal(fixture.describes, 1);
});

test("restart reconciliation describes an uncertain direct start without redispatch", async () => {
  const fixture = createFixture("missing");

  await assert.rejects(
    fixture.service.start(reference()),
    (error: unknown) => error instanceof DefinitionStartIntegrityError,
  );
  fixture.setDescription("matching");
  await fixture.restartedService().reconcileAll();

  assert.equal(fixture.preparedStarts, 1);
  assert.equal(fixture.describes, 2);
});

function createFixture(initialDescription: "missing" | "matching") {
  let description = initialDescription;
  let preparedStarts = 0;
  let describes = 0;
  const publications = new ConfirmedProcessInstancePublicationService({
    repository: new InMemoryConfirmedProcessInstanceRepository(),
    operate: { recordProcessInstance: async () => undefined },
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
    allocateNext: (_metadata: NewDefinitionMetadata) => {
      throw new Error("deployment is outside this fixture");
    },
    listLatest: () => [structuredClone(definition)],
    listVersions: () => [structuredClone(definition)],
    get: (selected) =>
      selected.processId === definition.processId &&
        selected.version === definition.version
        ? structuredClone(definition)
        : null,
  };
}

function reference() {
  return { processId: definition.processId, version: definition.version };
}
