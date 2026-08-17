import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";

export type ProcessRepositoryContractFixture = Readonly<{
  repository: ProcessInstanceRepository;
  dispose: () => Promise<void>;
}>;

export function processPublication(
  processInstanceId: string,
  processId = "Process_Operate",
) {
  return {
    instance: {
      processInstanceId,
      definition: {
        processId,
        version: 1,
        source: {
          kind: "bpmnSource",
          id: `source-${processId}`,
          sha256: "a".repeat(64),
          byteLength: 7,
          declaredEncoding: null,
          decodedAs: "UTF-8",
        },
        semanticProfile: "profile-operate-postgresql",
        startCapabilities: { messageStarts: [], timerStarts: [] },
      },
    },
    locator: `locator:${processInstanceId}`,
  } as const;
}

export function registerProcessInstanceRepositoryContract(
  label: string,
  create: () => Promise<ProcessRepositoryContractFixture>,
): void {
  test(`${label} preserves exact retries, conflicts, filters, and stable pages`, async () => {
    const fixture = await create();
    try {
      const first = processPublication("instance-\u00001", "Process_\u0000A");
      const second = processPublication("instance-2", "Process_B");
      const caller = structuredClone(first);
      const recording = fixture.repository.recordConfirmed(caller);
      caller.instance.processInstanceId = "mutated-after-call";
      const firstOrdinal = await recording;
      assert.equal(
        await fixture.repository.recordConfirmed(first),
        firstOrdinal,
      );
      const secondOrdinal = await fixture.repository.recordConfirmed(second);
      assert.ok(secondOrdinal > firstOrdinal);
      await assert.rejects(
        fixture.repository.recordConfirmed({ ...first, locator: "changed" }),
        { name: "ProcessInstanceIdentityIntegrityError" },
      );
      assert.deepEqual(
        (await fixture.repository.search({ processId: "Process_\u0000A", limit: 10 }))
          .map(({ instance }) => instance.processInstanceId),
        ["instance-\u00001"],
      );
      assert.deepEqual(
        (await fixture.repository.search({
          beforeOrdinal: secondOrdinal,
          limit: 1,
        })).map(({ ordinal }) => ordinal),
        [firstOrdinal],
      );
      const retained = await fixture.repository.getRegistration("instance-\u00001");
      assert.equal(retained?.locator, first.locator);
      if (retained !== null) {
        Object.assign(retained.instance.definition.source, { id: "mutated-result" });
      }
      assert.equal(
        (await fixture.repository.getRegistration("instance-\u00001"))?.instance
          .definition.source.id,
        first.instance.definition.source.id,
      );
      assert.deepEqual(
        (await fixture.repository.listExactDefinitionVersion(first.instance.definition))
          .map(({ instance }) => instance.processInstanceId),
        ["instance-\u00001"],
      );
    } finally {
      await fixture.dispose();
    }
  });

  test(`${label} keeps closed observation absorbing and population cuts bounded`, async () => {
    const fixture = await create();
    try {
      const publication = processPublication("closed-instance");
      await fixture.repository.recordConfirmed(publication);
      await fixture.repository.recordObservation("closed-instance", "closed");
      await fixture.repository.recordObservation("closed-instance", "active");
      await fixture.repository.recordObservation("closed-instance", "indeterminate");
      assert.equal(
        (await fixture.repository.getRegistration("closed-instance"))?.observation,
        "closed",
      );
      assert.deepEqual(await fixture.repository.listNonclosed(1), []);
      await assert.rejects(
        fixture.repository.recordObservation("unknown-instance", "active"),
        { name: "ProcessInstanceIdentityIntegrityError" },
      );
    } finally {
      await fixture.dispose();
    }
  });
}
