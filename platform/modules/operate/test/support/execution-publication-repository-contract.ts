import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeCanonicalExecutionPublicationValue } from "@bpmn-lean/platform-contracts";

import {
  ExecutionPublicationProjectionStatus,
} from "@bpmn-lean/platform-operate";
import type {
  ExecutionPublicationRepository,
  ProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import {
  firstPage,
  failedPage,
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
  for (const message of [null, "", "échec 😀\u0000"]) {
    test(`${label} retains exact failed bytes through suffix, overlap and rebuild (${JSON.stringify(message)})`, async () => {
      const fixture = await create();
      try {
        const ordinal = await fixture.processes.recordConfirmed({
          instance: registration.instance, locator: registration.locator,
        });
        const exact = { ...registration, ordinal };
        const suffix = failedPage(message);
        await fixture.executions.applyPage(exact, firstPage(3));
        const accepted = await fixture.executions.applyPage(exact, suffix);
        assert.deepEqual(accepted.current, suffix.current);
        assert.deepEqual(await fixture.executions.applyPage(exact, suffix), accepted);
        const exported = await fixture.executions.export("Instance_1");
        assert.deepEqual(exported?.current, suffix.current);
        const bytes = serializeCanonicalExecutionPublicationValue(exported);
        await assert.rejects(fixture.executions.applyPage(exact, failedPage("changed")),
          { name: "ExecutionPublicationIntegrityError" });
        const current = suffix.current;
        if (current?.state.status !== "failed") assert.fail("failed fixture");
        const substituted = {
          ...suffix,
          current: {
            ...current,
            state: {
              ...current.state,
              failure: { ...current.state.failure, message: "substituted" },
            },
          },
        };
        assert.deepEqual(substituted.batches, suffix.batches);
        await assert.rejects(fixture.executions.applyPage(exact, substituted),
          { name: "ExecutionPublicationIntegrityError" });
        assert.deepEqual(serializeCanonicalExecutionPublicationValue(await fixture.executions.export("Instance_1")), bytes);
        await fixture.executions.mark(exact, ExecutionPublicationProjectionStatus.Gap);
        assert.equal(await fixture.executions.export("Instance_1"), null);
        await fixture.executions.replaceFromPages(exact, [firstPage(3), suffix]);
        assert.deepEqual(serializeCanonicalExecutionPublicationValue(await fixture.executions.export("Instance_1")), bytes);
      } finally {
        await fixture.dispose();
      }
    });
  }

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
      const source = firstPage();
      const substituted = {
        ...source,
        current: {
          ...source.current!,
          state: {
            ...source.current!.state,
            variables: [{ name: "changed", value: { kind: "string", value: "unexpected" } }] as const,
          },
        },
      };
      await assert.rejects(fixture.executions.applyPage(exactRegistration, substituted),
        { name: "ExecutionPublicationIntegrityError" });
      assert.deepEqual(await fixture.executions.get(registration.instance.processInstanceId), first);
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
