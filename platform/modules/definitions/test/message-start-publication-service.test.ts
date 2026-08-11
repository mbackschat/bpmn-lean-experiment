import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import type {
  PutMessageStartPublicationRequest,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionMessageStartHost,
} from "@bpmn-lean/platform-engine-gateway";
import {
  MessageStartPublicationConflictError,
  MessageStartPublicationDeliveryUnavailableError,
  MessageStartPublicationIntegrityError,
  MessageStartPublicationService,
  MessageStartPublicationState,
  SqliteMessageStartPublicationRepository,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionMetadata,
  DefinitionRepository,
  ExactArtifactStore,
  MessageStartPublicationHost,
  MessageStartPublicationHostRequest,
} from "@bpmn-lean/platform-definitions";

type GatewayHostIsLifecycleCompatible = DefinitionMessageStartHost extends
  MessageStartPublicationHost ? true : false;

test("accepts the gateway Message Start host without widening its closed result", () => {
  const compatible: GatewayHostIsLifecycleCompatible = true;
  assert.equal(compatible, true);
});

test("an ambiguous missing description is durable and never redispatches after restart", async () => {
  await withDatabase(async ({ databaseFile, artifacts, definitions }) => {
    const host = new RecordingHost();
    host.startBehavior = "throw";
    host.descriptionStatus = "missing";

    const firstRepository = new SqliteMessageStartPublicationRepository(databaseFile);
    const firstService = service(firstRepository, host, artifacts, definitions);
    const first = await firstService.put("ambiguous", request());
    assert.equal(first.created, true);
    assert.equal(first.publication.status, "indeterminate");
    assert.equal(first.publication.instance, null);
    assert.equal(host.starts, 1);
    firstRepository.close();

    const reopenedRepository = new SqliteMessageStartPublicationRepository(databaseFile);
    const reopenedService = service(
      reopenedRepository,
      host,
      artifacts,
      definitions,
    );
    const retried = await reopenedService.put("ambiguous", request());
    assert.equal(retried.created, false);
    assert.equal(retried.publication.status, "indeterminate");
    assert.equal(host.starts, 1);
    assert.equal(host.describes, 2);
    reopenedRepository.close();
  });
});

test("accepted is the only state exposing the reserved semantic instance", async () => {
  await withDatabase(async ({ databaseFile, artifacts, definitions }) => {
    const repository = new SqliteMessageStartPublicationRepository(databaseFile);
    const host = new RecordingHost();
    let observedStarting = false;
    host.onStart = () => {
      observedStarting = repository.get("accepted")?.state ===
        MessageStartPublicationState.Starting;
    };
    const sut = service(repository, host, artifacts, definitions);

    const first = await sut.put("accepted", request());
    const retried = await sut.put("accepted", request());

    assert.equal(observedStarting, true);
    assert.equal(host.starts, 1);
    assert.equal(first.created, true);
    assert.equal(first.publication.status, "accepted");
    assert.equal(first.publication.instance?.processInstanceId, "instance:accepted");
    assert.deepEqual(retried.publication, first.publication);
    assert.equal(retried.created, false);
    repository.close();
  });
});

test("snapshots exact host input again after asynchronous preparation", async () => {
  await withDatabase(async ({ databaseFile, artifacts, definitions }) => {
    const repository = new SqliteMessageStartPublicationRepository(databaseFile);
    const host = new RecordingHost();
    host.mutatePreparationRequest = true;
    const sut = service(repository, host, artifacts, definitions);

    await sut.put("snapshot", request());

    assert.equal(host.startedRequest?.bytes[0], 1);
    assert.equal(host.startedRequest?.definition.source.id, "message-source");
    assert.equal(
      host.startedRequest?.messageStart.channel.interfaceOperationId,
      "SubmitOrder",
    );
    repository.close();
  });
});

test("changed target reuse conflicts without changing or redispatching the accepted row", async () => {
  await withDatabase(async ({ databaseFile, artifacts, definitions }) => {
    const repository = new SqliteMessageStartPublicationRepository(databaseFile);
    const host = new RecordingHost();
    const sut = service(repository, host, artifacts, definitions);
    await sut.put("conflict", request());
    const changed: PutMessageStartPublicationRequest = {
      ...request(),
      messageStart: {
        ...messageStart(),
        channel: {
          ...messageStart().channel,
          interfaceOperationId: "ChangedOperation",
        },
      },
    };

    await assert.rejects(
      () => sut.put("conflict", changed),
      (error: unknown) => error instanceof MessageStartPublicationConflictError,
    );
    assert.equal(repository.get("conflict")?.state, MessageStartPublicationState.Accepted);
    assert.equal(host.starts, 1);
    repository.close();
  });
});

test("revalidation turns private drift in an accepted row into a stable integrity tombstone", async () => {
  await withDatabase(async ({ databaseFile, artifacts, definitions }) => {
    const firstRepository = new SqliteMessageStartPublicationRepository(databaseFile);
    await service(firstRepository, new RecordingHost(), artifacts, definitions)
      .put("drift", request());
    firstRepository.close();

    const database = new DatabaseSync(databaseFile);
    database.prepare(`
      UPDATE message_start_publications
      SET workflow_id = 'drifted-private-workflow'
      WHERE publication_id = 'drift'
    `).run();
    database.close();

    const repository = new SqliteMessageStartPublicationRepository(databaseFile);
    const sut = service(repository, new RecordingHost(), artifacts, definitions);
    await assert.rejects(
      () => sut.get("drift"),
      (error: unknown) => error instanceof MessageStartPublicationIntegrityError,
    );
    assert.equal(
      repository.get("drift")?.state,
      MessageStartPublicationState.IntegrityFailure,
    );
    await assert.rejects(
      () => sut.get("drift"),
      (error: unknown) => error instanceof MessageStartPublicationIntegrityError,
    );
    repository.close();
  });
});

test("pre-SDK constructor failure persists integrityFailure with zero Workflow calls", async () => {
  await withDatabase(async ({ databaseFile, artifacts, definitions }) => {
    const repository = new SqliteMessageStartPublicationRepository(databaseFile);
    const host = new RecordingHost();
    host.startBehavior = "integrityFailure";
    const sut = service(repository, host, artifacts, definitions);

    await assert.rejects(
      () => sut.put("constructor-failure", request()),
      (error: unknown) => error instanceof MessageStartPublicationIntegrityError,
    );
    assert.equal(host.sdkStarts, 0);
    assert.equal(
      repository.get("constructor-failure")?.state,
      MessageStartPublicationState.IntegrityFailure,
    );
    repository.close();
  });
});

test("accepted exact-definition disappearance becomes integrityFailure rather than not-found", async () => {
  await withDatabase(async ({
    databaseFile,
    artifacts,
    definitions,
    removeDefinition,
  }) => {
    const repository = new SqliteMessageStartPublicationRepository(databaseFile);
    const sut = service(repository, new RecordingHost(), artifacts, definitions);
    await sut.put("definition-drift", request());
    removeDefinition();

    await assert.rejects(
      () => sut.get("definition-drift"),
      (error: unknown) => error instanceof MessageStartPublicationIntegrityError,
    );
    assert.equal(
      repository.get("definition-drift")?.state,
      MessageStartPublicationState.IntegrityFailure,
    );
    repository.close();
  });
});

test("describe infrastructure failure preserves starting and returns an unavailable error", async () => {
  await withDatabase(async ({ databaseFile, artifacts, definitions }) => {
    const repository = new SqliteMessageStartPublicationRepository(databaseFile);
    const host = new RecordingHost();
    host.startBehavior = "throw";
    host.descriptionStatus = "unavailable";
    const sut = service(repository, host, artifacts, definitions);

    await assert.rejects(
      () => sut.put("unavailable", request()),
      (error: unknown) =>
        error instanceof MessageStartPublicationDeliveryUnavailableError,
    );
    assert.equal(
      repository.get("unavailable")?.state,
      MessageStartPublicationState.Starting,
    );
    assert.equal(host.starts, 1);
    repository.close();
  });
});

class RecordingHost implements MessageStartPublicationHost {
  starts = 0;
  sdkStarts = 0;
  describes = 0;
  startBehavior: "started" | "throw" | "integrityFailure" = "started";
  descriptionStatus: "matching" | "missing" | "divergent" | "unavailable" =
    "matching";
  onStart: (() => void) | null = null;
  mutatePreparationRequest = false;
  startedRequest: MessageStartPublicationHostRequest | null = null;

  async prepare(request: MessageStartPublicationHostRequest) {
    if (this.mutatePreparationRequest) {
      request.bytes.fill(9);
      Object.assign(request.definition.source, { id: "mutated-source" });
      Object.assign(request.messageStart.channel, {
        interfaceOperationId: "MutatedOperation",
      });
    }
    return {
      status: "admitted" as const,
      intent: {
        protocol: "message-start-v1",
        intentSha256: request.workflowId === expectedWorkflowId(request.processInstanceId)
          ? "1".repeat(64)
          : "2".repeat(64),
      },
    };
  }

  async start(request: MessageStartPublicationHostRequest) {
    this.starts += 1;
    this.startedRequest = request;
    this.onStart?.();
    switch (this.startBehavior) {
      case "started":
        this.sdkStarts += 1;
        return { status: "started" as const };
      case "integrityFailure":
        return { status: "integrityFailure" as const, evidence: "constructor failed" };
      case "throw":
        this.sdkStarts += 1;
        throw new Error("possibly transmitted");
      default:
        return assertNever(this.startBehavior);
    }
  }

  async describe() {
    this.describes += 1;
    return { status: this.descriptionStatus };
  }
}

function service(
  publications: SqliteMessageStartPublicationRepository,
  host: MessageStartPublicationHost,
  artifacts: ExactArtifactStore,
  definitions: DefinitionRepository,
): MessageStartPublicationService {
  return new MessageStartPublicationService({
    publications,
    host,
    artifacts,
    definitions,
    identities: {
      processInstanceId: (publicationId) => `instance:${publicationId}`,
      commandId: (publicationId) => `command:${publicationId}`,
      workflowId: expectedWorkflowId,
    },
  });
}

function expectedWorkflowId(processInstanceId: string): string {
  return `workflow:${processInstanceId}`;
}

async function withDatabase(
  run: (fixture: Readonly<{
    databaseFile: string;
    artifacts: ExactArtifactStore;
    definitions: DefinitionRepository;
    removeDefinition: () => void;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-publication-service-"));
  const databaseFile = join(root, "definitions.sqlite");
  const stored = definition();
  const bytes = Uint8Array.from({ length: stored.source.byteLength }, () => 1);
  const artifacts: ExactArtifactStore = {
    put: async () => ({ status: "stored" }),
    get: async (sha256) => sha256 === stored.source.sha256
      ? Uint8Array.from(bytes)
      : null,
  };
  let definitionAvailable = true;
  const definitions: DefinitionRepository = {
    allocateNext: () => stored,
    listLatest: () => [stored],
    listVersions: () => [stored],
    get: (reference) =>
      definitionAvailable &&
        reference.processId === stored.processId &&
        reference.version === stored.version
        ? structuredClone(stored)
        : null,
  };
  try {
    await run({
      databaseFile,
      artifacts,
      definitions,
      removeDefinition: () => {
        definitionAvailable = false;
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function definition(): DefinitionMetadata {
  return {
    processId: "Process_Message",
    version: 1,
    source: {
      kind: "bpmnSource",
      id: "message-source",
      sha256: "a".repeat(64),
      byteLength: 22,
      declaredEncoding: null,
      decodedAs: "UTF-8",
    },
    semanticProfile: "message-start-profile",
    startCapabilities: {
      messageStarts: [messageStart()],
      timerStarts: [],
    },
  };
}

function request(): PutMessageStartPublicationRequest {
  return {
    definition: { processId: "Process_Message", version: 1 },
    messageStart: messageStart(),
  };
}

function messageStart() {
  return {
    startEventId: "MessageStart",
    channel: {
      kind: "operationMessage" as const,
      interfaceId: "Orders",
      interfaceOperationId: "SubmitOrder",
      messageId: "OrderSubmitted",
    },
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported test variant: ${String(value)}`);
}
