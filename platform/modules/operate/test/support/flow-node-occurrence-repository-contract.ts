import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FlowNodeOccurrenceProjectionStatus,
} from "@bpmn-lean/platform-operate";
import type {
  ExecutionPublicationRepository,
  FlowNodeOccurrenceRepository,
  ProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import {
  firstPage,
  secondPage,
} from "../execution-publication-fixture.ts";
import {
  occurrenceFirstPage,
  occurrenceRegistration,
  occurrenceSecondPage,
} from "../flow-node-occurrence-fixture.ts";

export type OccurrenceRepositoryContractFixture = Readonly<{
  processes: ProcessInstanceRepository;
  executions: ExecutionPublicationRepository;
  occurrences: FlowNodeOccurrenceRepository;
  dispose: () => Promise<void>;
}>;

export function registerFlowNodeOccurrenceRepositoryContract(
  label: string,
  create: () => Promise<OccurrenceRepositoryContractFixture>,
): void {
  test(`${label} accepts aligned suffixes and only closes an exact open occurrence`, async () => {
    const fixture = await create();
    try {
      const ordinal = await fixture.processes.recordConfirmed({
        instance: occurrenceRegistration.instance,
        locator: occurrenceRegistration.locator,
      });
      const registration = { ...occurrenceRegistration, ordinal };
      await fixture.executions.applyPage(registration, firstPage());
      await assert.rejects(
        fixture.occurrences.applyPage(registration, occurrenceSecondPage()),
        { name: "FlowNodeOccurrenceIntegrityError" },
      );
      assert.equal(
        await fixture.occurrences.get(registration.instance.processInstanceId),
        null,
      );
      const first = await fixture.occurrences.applyPage(
        registration,
        occurrenceFirstPage(),
      );
      assert.deepEqual(
        await fixture.occurrences.applyPage(registration, occurrenceFirstPage()),
        first,
      );
      await fixture.executions.applyPage(registration, secondPage());
      const terminal = await fixture.occurrences.applyPage(
        registration,
        occurrenceSecondPage(),
      );
      assert.equal(terminal.headRevision, 3);
      assert.equal(terminal.occurrences[0]?.terminal, "completed");
      assert.deepEqual(terminal.currentOpen, []);
    } finally {
      await fixture.dispose();
    }
  });

  test(`${label} rebuilds explicitly and retains honest unhealthy status`, async () => {
    const fixture = await create();
    try {
      const ordinal = await fixture.processes.recordConfirmed({
        instance: occurrenceRegistration.instance,
        locator: occurrenceRegistration.locator,
      });
      const registration = { ...occurrenceRegistration, ordinal };
      await fixture.executions.replaceFromPages(
        registration,
        [firstPage(), secondPage()],
      );
      const first = occurrenceFirstPage();
      const second = occurrenceSecondPage();
      const rebuilt = await fixture.occurrences.replaceFromPages(
        registration,
        [{
          ...first,
          pageThroughRevision: 3,
          headRevision: 3,
          batches: [...first.batches, ...second.batches],
          currentOpen: [],
        }],
      );
      assert.equal(rebuilt.headRevision, 3);
      await fixture.occurrences.mark(
        registration,
        FlowNodeOccurrenceProjectionStatus.Gap,
      );
      assert.equal(
        (await fixture.occurrences.get(registration.instance.processInstanceId))
          ?.status,
        FlowNodeOccurrenceProjectionStatus.Gap,
      );
    } finally {
      await fixture.dispose();
    }
  });
}
