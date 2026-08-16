import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ProcessInstanceSearchService,
} from "@bpmn-lean/platform-operate";
import type {
  ProcessInstanceRepository,
  ProcessInstanceRepositoryQuery,
  StoredProcessInstance,
} from "@bpmn-lean/platform-operate";
import type {
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

test("records through the structural async publisher contract", async () => {
  const repository = new MemoryRepository();
  const service = new ProcessInstanceSearchService(repository);

  await service.recordConfirmedProcessInstance(publication(instance("instance-1", 1)));

  assert.equal(repository.rows.length, 1);
  assert.equal(repository.rows[0]?.instance.processInstanceId, "instance-1");
});

test("pages newest-first with an opaque stable insertion boundary", async () => {
  const repository = new MemoryRepository();
  const service = new ProcessInstanceSearchService(repository);
  await repository.recordConfirmed(publication(instance("oldest", 1)));
  await repository.recordConfirmed(publication(instance("middle", 2)));
  await repository.recordConfirmed(publication(instance("newest", 3)));

  const first = await service.searchProcessInstances({ limit: 2 });
  assert.deepEqual(
    first.instances.map(({ processInstanceId }) => processInstanceId),
    ["newest", "middle"],
  );
  assert.match(first.nextCursor ?? "", /^v1\.[A-Za-z0-9_-]+$/u);
  assert.notEqual(first.nextCursor, "2");
  if (first.nextCursor === null) {
    assert.fail("the first page must expose its older-row cursor");
  }

  await repository.recordConfirmed(publication(instance("inserted-between-pages", 4)));
  const second = await service.searchProcessInstances({
    cursor: first.nextCursor,
    limit: 2,
  });
  assert.deepEqual(
    second.instances.map(({ processInstanceId }) => processInstanceId),
    ["oldest"],
  );
  assert.equal(second.nextCursor, null);
});

test("applies exact filters and validates direct service input", async () => {
  const repository = new MemoryRepository();
  const service = new ProcessInstanceSearchService(repository);
  await repository.recordConfirmed(publication(instance("first", 1, "Alpha", "a".repeat(64))));
  await repository.recordConfirmed(publication(instance("second", 2, "Beta", "b".repeat(64))));
  await repository.recordConfirmed(publication(instance("third", 2, "Alpha", "b".repeat(64))));

  assert.deepEqual(
    (await service.searchProcessInstances({ processId: "Alpha" })).instances.map(
      ({ processInstanceId }) => processInstanceId,
    ),
    ["third", "first"],
  );
  assert.deepEqual(
    (await service.searchProcessInstances({
      processInstanceId: "second",
      processId: "Beta",
      version: 2,
      sourceSha256: "b".repeat(64),
    })).instances.map(({ processInstanceId }) => processInstanceId),
    ["second"],
  );
  await assert.rejects(
    () => service.searchProcessInstances({ limit: 101 }),
    /limit must be an integer from 1 through 100/u,
  );
  await assert.rejects(
    () => service.searchProcessInstances({ sourceSha256: "B".repeat(64) }),
    /lowercase SHA-256/u,
  );
  await assert.rejects(
    () => service.searchProcessInstances({ cursor: "v1.not-an-ordinal" }),
    /cursor/u,
  );
});

class MemoryRepository implements ProcessInstanceRepository {
  readonly rows: Array<StoredProcessInstance & {
    locator: string;
    observation: "active" | "closed" | "indeterminate";
  }> = [];

  async recordConfirmed(candidate: Readonly<{
    instance: PublicProcessInstanceIdentity;
    locator: string;
  }>): Promise<number> {
    const ordinal = this.rows.length + 1;
    this.rows.push({
      ordinal,
      instance: structuredClone(candidate.instance),
      locator: candidate.locator,
      observation: "active",
    });
    return ordinal;
  }

  async getRegistration(processInstanceId: string) {
    return structuredClone(this.rows.find(({ instance: value }) =>
      value.processInstanceId === processInstanceId
    ) ?? null);
  }

  async listNonclosed(limit: number) {
    return structuredClone(this.rows.filter(({ observation }) =>
      observation !== "closed"
    ).slice(0, limit));
  }

  async listExactDefinitionVersion(definition: PublicProcessInstanceIdentity["definition"]) {
    return structuredClone(this.rows.filter(({ instance }) =>
      JSON.stringify(instance.definition) === JSON.stringify(definition)
    ).sort((left, right) => left.ordinal - right.ordinal).slice(0, 101));
  }

  async recordObservation(
    processInstanceId: string,
    observation: "active" | "closed" | "indeterminate",
  ): Promise<void> {
    const row = this.rows.find(({ instance: value }) =>
      value.processInstanceId === processInstanceId
    );
    if (row === undefined) throw new Error("unknown registration");
    row.observation = observation;
  }

  async search(
    query: ProcessInstanceRepositoryQuery,
  ): Promise<ReadonlyArray<StoredProcessInstance>> {
    return this.rows.toReversed().filter(({ ordinal, instance: candidate }) =>
      (query.beforeOrdinal === undefined || ordinal < query.beforeOrdinal) &&
      (query.processInstanceId === undefined ||
        candidate.processInstanceId === query.processInstanceId) &&
      (query.processId === undefined ||
        candidate.definition.processId === query.processId) &&
      (query.version === undefined || candidate.definition.version === query.version) &&
      (query.sourceSha256 === undefined ||
        candidate.definition.source.sha256 === query.sourceSha256)
    ).slice(0, query.limit).map((row) => structuredClone(row));
  }
}

function publication(instanceValue: PublicProcessInstanceIdentity) {
  return {
    instance: instanceValue,
    locator: `bpmn-process-work-v1:${instanceValue.processInstanceId}`,
  };
}

function instance(
  processInstanceId: string,
  version: number,
  processId = "Process_Search",
  sha256 = "a".repeat(64),
): PublicProcessInstanceIdentity {
  return {
    processInstanceId,
    definition: {
      processId,
      version,
      source: {
        kind: "bpmnSource",
        id: `source-${version}`,
        sha256,
        byteLength: 21,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "search-profile",
      startCapabilities: {
        messageStarts: [],
        timerStarts: [],
      },
    },
  };
}
