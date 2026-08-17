import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ExecutionPublicationProjectionStatus,
} from "@bpmn-lean/platform-operate";
import type {
  ExecutionPublicationRepository,
  ProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import {
  firstPage,
  registration,
  secondPage,
} from "../execution-publication-fixture.ts";

export type ExecutionRepositoryContractFixture = Readonly<{
  processes: ProcessInstanceRepository;
  executions: ExecutionPublicationRepository;
  dispose: () => Promise<void>;
}>;

export function registerExecutionPublicationRepositoryContract(
  label: string,
  create: () => Promise<ExecutionRepositoryContractFixture>,
): void {
  test(`${label} accepts only an exact contiguous suffix and preserves its prefix`, async () => {
    const fixture = await create();
    try {
      const ordinal = await fixture.processes.recordConfirmed({
        instance: registration.instance,
        locator: registration.locator,
      });
      const exactRegistration = { ...registration, ordinal };
      await assert.rejects(
        fixture.executions.applyPage(exactRegistration, secondPage()),
        { name: "ExecutionPublicationIntegrityError" },
      );
      assert.equal(
        await fixture.executions.get(registration.instance.processInstanceId),
        null,
      );
      const first = await fixture.executions.applyPage(
        exactRegistration,
        firstPage(),
      );
      assert.deepEqual(
        await fixture.executions.applyPage(exactRegistration, firstPage()),
        first,
      );
      const complete = await fixture.executions.applyPage(
        exactRegistration,
        secondPage(),
      );
      assert.equal(complete.headRevision, 3);
      assert.deepEqual(complete.batches.slice(0, 1), first.batches);
      assert.equal(
        (await fixture.executions.page(registration.instance.processInstanceId, {
          afterRevision: 2,
          limit: 1,
        }))?.pageThroughRevision,
        3,
      );
      assert.equal(
        (await fixture.executions.export(registration.instance.processInstanceId))
          ?.headRevision,
        3,
      );
    } finally {
      await fixture.dispose();
    }
  });

  test(`${label} suppresses unhealthy reads and reserves replacement for explicit rebuild`, async () => {
    const fixture = await create();
    try {
      const ordinal = await fixture.processes.recordConfirmed({
        instance: registration.instance,
        locator: registration.locator,
      });
      const exactRegistration = { ...registration, ordinal };
      const rebuilt = await fixture.executions.replaceFromPages(
        exactRegistration,
        [firstPage(), secondPage()],
      );
      assert.equal(rebuilt.headRevision, 3);
      await fixture.executions.mark(
        exactRegistration,
        ExecutionPublicationProjectionStatus.Unavailable,
      );
      assert.equal(
        await fixture.executions.page(registration.instance.processInstanceId, {
          afterRevision: 0,
        }),
        null,
      );
      assert.equal(
        await fixture.executions.export(registration.instance.processInstanceId),
        null,
      );
      assert.equal(
        (await fixture.executions.get(registration.instance.processInstanceId))?.status,
        ExecutionPublicationProjectionStatus.Unavailable,
      );
    } finally {
      await fixture.dispose();
    }
  });
}
