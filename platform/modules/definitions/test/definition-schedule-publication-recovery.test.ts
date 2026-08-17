import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ConfirmedProcessInstancePublicationService,
  DefinitionScheduleService,
  DefinitionScheduleState,
  InMemoryConfirmedProcessInstanceRepository,
  SqliteDefinitionScheduleRepository,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionMetadata,
  DefinitionScheduleHost,
  ExactArtifactStore,
  NewDefinitionScheduleRecord,
} from "@bpmn-lean/platform-definitions";

test("restart republishes a stored started Schedule after confirmation persistence failed", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-schedule-publication-recovery-"));
  const databaseFile = join(root, "definitions.sqlite");
  const initial = new SqliteDefinitionScheduleRepository(databaseFile);
  const record = scheduleRecord();
  const confirmedPublications: string[] = [];
  try {
    await initial.reserve(record);
    await initial.compareAndSet(
      record.reference,
      DefinitionScheduleState.Creating,
      { state: DefinitionScheduleState.CreatingHost },
    );
    await initial.compareAndSet(
      record.reference,
      DefinitionScheduleState.CreatingHost,
      {
        state: DefinitionScheduleState.Started,
        executionWorkflowId: "execution-workflow",
        firstRunId: "first-run",
      },
    );
    await initial.markCleanupComplete(
      record.reference,
      DefinitionScheduleState.Started,
    );
    initial.close();

    const reopened = new SqliteDefinitionScheduleRepository(databaseFile);
    try {
      const confirmedInstances = new ConfirmedProcessInstancePublicationService({
        repository: new InMemoryConfirmedProcessInstanceRepository(),
        operate: { recordConfirmedProcessInstance: async () => undefined },
        work: {
          recordConfirmedProcessInstance: async ({ instance }) => {
            confirmedPublications.push(instance.processInstanceId);
          },
        },
      });
      await new DefinitionScheduleService({
        artifacts: unusedArtifacts(),
        definitions: {
          allocateNext: async () => record.definition,
          listLatest: async () => [record.definition],
          listVersions: async () => [record.definition],
          get: async () => record.definition,
        },
        schedules: reopened,
        host: unusedHost(),
        identities: {
          processInstanceId: () => "unused-instance",
          hostScheduleId: () => "unused-host",
          configuredWorkflowIdBase: () => "unused-workflow",
        },
        now: () => 0,
        confirmedInstances,
        locators: {
          canonicalLocator: () => "unused-canonical",
          scheduleExecutionLocator: (workflowId) => `locator:${workflowId}`,
        },
      }).reconcileAll();
      assert.deepEqual(confirmedPublications, [record.identity.processInstanceId]);
    } finally {
      reopened.close();
    }
  } finally {
    if (initial.isOpen) initial.close();
    await rm(root, { recursive: true, force: true });
  }
});

function scheduleRecord(): NewDefinitionScheduleRecord {
  const definition: DefinitionMetadata = {
    processId: "Process_Timer",
    version: 1,
    source: {
      kind: "bpmnSource",
      id: "timer.bpmn",
      sha256: "a".repeat(64),
      byteLength: 1,
      declaredEncoding: null,
      decodedAs: "UTF-8",
    },
    semanticProfile: "timer-profile",
    startCapabilities: {
      messageStarts: [],
      timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
    },
  };
  return {
    reference: { processId: definition.processId, version: 1, scheduleId: "schedule" },
    definition,
    timerStart: { startEventId: "TimerStart", durationMs: 1_000 },
    activationAt: "2026-08-17T10:00:00.000Z",
    dueAt: "2026-08-17T10:00:01.000Z",
    identity: {
      processInstanceId: "schedule-instance",
      hostScheduleId: "host-schedule",
      configuredWorkflowIdBase: "workflow-base",
    },
  };
}

function unusedArtifacts(): ExactArtifactStore {
  return {
    put: async () => {
      throw new Error("recovery must not write artifacts");
    },
    get: async () => {
      throw new Error("clean terminal recovery must not read artifacts");
    },
  };
}

function unusedHost(): DefinitionScheduleHost {
  return {
    validateDefinition: async () => {
      throw new Error("terminal recovery must not validate");
    },
    createOrCompare: async () => {
      throw new Error("terminal recovery must not create");
    },
    inspect: async () => {
      throw new Error("terminal recovery must not inspect");
    },
    pause: async () => {
      throw new Error("terminal recovery must not pause");
    },
    delete: async () => {
      throw new Error("clean terminal recovery must not delete");
    },
  };
}
