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

  await service.recordProcessInstance(instance("instance-1", 1));

  assert.equal(repository.rows.length, 1);
  assert.equal(repository.rows[0]?.instance.processInstanceId, "instance-1");
});

test("pages newest-first with an opaque stable insertion boundary", () => {
  const repository = new MemoryRepository();
  const service = new ProcessInstanceSearchService(repository);
  repository.record(instance("oldest", 1));
  repository.record(instance("middle", 2));
  repository.record(instance("newest", 3));

  const first = service.searchProcessInstances({ limit: 2 });
  assert.deepEqual(
    first.instances.map(({ processInstanceId }) => processInstanceId),
    ["newest", "middle"],
  );
  assert.match(first.nextCursor ?? "", /^v1\.[A-Za-z0-9_-]+$/u);
  assert.notEqual(first.nextCursor, "2");
  if (first.nextCursor === null) {
    assert.fail("the first page must expose its older-row cursor");
  }

  repository.record(instance("inserted-between-pages", 4));
  const second = service.searchProcessInstances({
    cursor: first.nextCursor,
    limit: 2,
  });
  assert.deepEqual(
    second.instances.map(({ processInstanceId }) => processInstanceId),
    ["oldest"],
  );
  assert.equal(second.nextCursor, null);
});

test("applies exact filters and validates direct service input", () => {
  const repository = new MemoryRepository();
  const service = new ProcessInstanceSearchService(repository);
  repository.record(instance("first", 1, "Alpha", "a".repeat(64)));
  repository.record(instance("second", 2, "Beta", "b".repeat(64)));
  repository.record(instance("third", 2, "Alpha", "b".repeat(64)));

  assert.deepEqual(
    service.searchProcessInstances({ processId: "Alpha" }).instances.map(
      ({ processInstanceId }) => processInstanceId,
    ),
    ["third", "first"],
  );
  assert.deepEqual(
    service.searchProcessInstances({
      processInstanceId: "second",
      processId: "Beta",
      version: 2,
      sourceSha256: "b".repeat(64),
    }).instances.map(({ processInstanceId }) => processInstanceId),
    ["second"],
  );
  assert.throws(
    () => service.searchProcessInstances({ limit: 101 }),
    /limit must be an integer from 1 through 100/u,
  );
  assert.throws(
    () => service.searchProcessInstances({ sourceSha256: "B".repeat(64) }),
    /lowercase SHA-256/u,
  );
  assert.throws(
    () => service.searchProcessInstances({ cursor: "v1.not-an-ordinal" }),
    /cursor/u,
  );
});

class MemoryRepository implements ProcessInstanceRepository {
  readonly rows: StoredProcessInstance[] = [];

  record(candidate: PublicProcessInstanceIdentity): number {
    const ordinal = this.rows.length + 1;
    this.rows.push({ ordinal, instance: structuredClone(candidate) });
    return ordinal;
  }

  search(query: ProcessInstanceRepositoryQuery): ReadonlyArray<StoredProcessInstance> {
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
