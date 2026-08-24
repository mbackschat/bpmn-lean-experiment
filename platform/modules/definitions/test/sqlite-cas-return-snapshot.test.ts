import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  ConfirmedProcessInstanceState,
  DefinitionScheduleState,
  MessageStartPublicationState,
  SqliteConfirmedProcessInstanceRepository,
  SqliteDefinitionScheduleRepository,
  SqliteMessageStartPublicationRepository,
} from "@bpmn-lean/platform-definitions";

test("schedule CAS returns the row written even when a trigger immediately advances it", async () => {
  await withDatabaseFile("schedule-cas", async (databaseFile) => {
    const repository = new SqliteDefinitionScheduleRepository(databaseFile);
    try {
      await repository.reserve(scheduleRecord());
      createTrigger(databaseFile, `
        CREATE TRIGGER advance_schedule_after_cas
        AFTER UPDATE OF state ON definition_schedules
        WHEN NEW.schedule_id = 'race' AND NEW.state = 'creatingHost'
        BEGIN
          UPDATE definition_schedules SET state = 'scheduled'
          WHERE process_id = NEW.process_id
            AND version = NEW.version
            AND schedule_id = NEW.schedule_id;
        END
      `);

      const changed = await repository.compareAndSet(
        { processId: "Process_Timer", version: 1, scheduleId: "race" },
        DefinitionScheduleState.Creating,
        { state: DefinitionScheduleState.CreatingHost },
      );

      assert.equal(changed?.state, DefinitionScheduleState.CreatingHost);
      assert.equal(
        (await repository.get({
          processId: "Process_Timer",
          version: 1,
          scheduleId: "race",
        }))?.state,
        DefinitionScheduleState.Scheduled,
      );
    } finally {
      repository.close();
    }
  });
});

test("Message Start CAS returns the row written before a later state becomes visible", async () => {
  await withDatabaseFile("message-cas", async (databaseFile) => {
    const repository = new SqliteMessageStartPublicationRepository(databaseFile);
    try {
      await repository.reserve(messagePublication());
      createTrigger(databaseFile, `
        CREATE TRIGGER advance_message_after_cas
        AFTER UPDATE OF state ON message_start_publications
        WHEN NEW.publication_id = 'publication-race' AND NEW.state = 'starting'
        BEGIN
          UPDATE message_start_publications SET state = 'indeterminate'
          WHERE publication_id = NEW.publication_id;
        END
      `);

      const changed = await repository.compareAndSet(
        "publication-race",
        MessageStartPublicationState.Reserved,
        MessageStartPublicationState.Starting,
      );

      assert.equal(changed?.state, MessageStartPublicationState.Starting);
      assert.equal(
        (await repository.get("publication-race"))?.state,
        MessageStartPublicationState.Indeterminate,
      );
    } finally {
      repository.close();
    }
  });
});

test("confirmed-instance CAS returns its own transition instead of a later state", async () => {
  await withDatabaseFile("confirmed-cas", async (databaseFile) => {
    const repository = new SqliteConfirmedProcessInstanceRepository(databaseFile);
    try {
      await repository.reserveDirect({
        ...confirmedPublication,
        intent: {
          protocol: "bpmn-direct-start-v1",
          intentSha256: "2".repeat(64),
        },
        startCommandBytes: new TextEncoder().encode('{"initialVariables":[]}'),
      });
      createTrigger(databaseFile, `
        CREATE TRIGGER advance_confirmed_after_cas
        AFTER UPDATE OF state ON confirmed_process_instances
        WHEN NEW.process_instance_id = 'instance-race' AND NEW.state = 'starting'
        BEGIN
          UPDATE confirmed_process_instances SET state = 'indeterminate'
          WHERE process_instance_id = NEW.process_instance_id;
        END
      `);

      const changed = await repository.compareAndSetState(
        "instance-race",
        ConfirmedProcessInstanceState.Reserved,
        ConfirmedProcessInstanceState.Starting,
      );

      assert.equal(changed?.state, ConfirmedProcessInstanceState.Starting);
      assert.equal(
        (await repository.get("instance-race"))?.state,
        ConfirmedProcessInstanceState.Indeterminate,
      );
    } finally {
      repository.close();
    }
  });
});

async function withDatabaseFile(
  label: string,
  run: (databaseFile: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), `bpmn-lean-${label}-`));
  try {
    await run(join(root, "definitions.sqlite"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function createTrigger(databaseFile: string, sql: string): void {
  const database = new DatabaseSync(databaseFile);
  try {
    database.exec(sql);
  } finally {
    database.close();
  }
}

function scheduleRecord() {
  return {
    reference: {
      processId: "Process_Timer",
      version: 1,
      scheduleId: "race",
    },
    definition: definition("Process_Timer", "timer-source", "1"),
    timerStart: { startEventId: "TimerStart", durationMs: 1_000 },
    activationAt: "2026-08-17T12:00:00.000Z",
    dueAt: "2026-08-17T12:00:01.000Z",
    identity: {
      processInstanceId: "schedule-instance",
      hostScheduleId: "host-schedule",
      configuredWorkflowIdBase: "configured-schedule",
    },
  };
}

function messagePublication() {
  const messageStart = {
    startEventId: "MessageStart",
    channel: {
      kind: "operationMessage" as const,
      interfaceId: "Orders",
      interfaceOperationId: "SubmitOrder",
      messageId: "OrderSubmitted",
    },
  };
  return {
    publicationId: "publication-race",
    definition: {
      ...definition("Process_Message", "message-source", "a"),
      startCapabilities: { messageStarts: [messageStart], timerStarts: [] },
    },
    messageStart,
    identity: {
      processInstanceId: "message-instance",
      commandId: "message-command",
      workflowId: "message-workflow",
    },
    intent: {
      protocol: "message-start-v1",
      intentSha256: "b".repeat(64),
    },
  };
}

const confirmedPublication = {
  instance: {
    processInstanceId: "instance-race",
    definition: definition("Review_Process", "review-source", "c"),
  },
  locator: "bpmn-process-work-v1:private-address",
};

function definition(processId: string, sourceId: string, digest: string) {
  return {
    processId,
    version: 1,
    source: {
      kind: "bpmnSource" as const,
      id: sourceId,
      sha256: digest.repeat(64),
      byteLength: 42,
      declaredEncoding: null,
      decodedAs: "UTF-8" as const,
    },
    semanticProfile: "profile-1",
    startCapabilities: {
      messageStarts: [],
      timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
    },
  };
}
