import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  MessageStartPublicationIntegrityError,
  MessageStartPublicationState,
  SqliteMessageStartPublicationRepository,
} from "@bpmn-lean/platform-definitions";
import type {
  MessageStartPublicationRecord,
  NewMessageStartPublicationRecord,
} from "@bpmn-lean/platform-definitions";

test("round-trips an immutable exact-definition publication snapshot", async () => {
  await withRepository(async (repository) => {
    const candidate = record("publication-1", 1);
    assert.equal(repository.reserve(candidate).inserted, true);
    Object.assign(candidate.definition.source, { id: "mutated-after-reserve" });
    Object.assign(candidate.messageStart.channel, { messageId: "mutated" });

    const stored = repository.get("publication-1");
    assert.equal(stored?.definition.source.id, "message-source");
    assert.deepEqual(stored?.definition.startCapabilities, {
      messageStarts: [messageStart()],
      timerStarts: [],
    });
    assert.deepEqual(stored?.messageStart, messageStart());
    assert.deepEqual(stored?.identity, {
      processInstanceId: "instance-1",
      commandId: "command-1",
      workflowId: "workflow-1",
    });
    assert.deepEqual(stored?.intent, {
      protocol: "message-start-v1",
      intentSha256: "1".repeat(64),
    });
    assert.equal(stored?.state, MessageStartPublicationState.Reserved);
  });
});

test("enforces independent uniqueness for every generated private identity", async () => {
  await withRepository(async (repository) => {
    repository.reserve(record("first", 1));
    const collisions = [
      { processInstanceId: "instance-1", commandId: "command-2", workflowId: "workflow-2" },
      { processInstanceId: "instance-2", commandId: "command-1", workflowId: "workflow-2" },
      { processInstanceId: "instance-2", commandId: "command-2", workflowId: "workflow-1" },
    ] as const;
    for (const identity of collisions) {
      const duplicate = record("second", 2);
      Object.assign(duplicate.identity, identity);
      assert.throws(
        () => repository.reserve(duplicate),
        (error: unknown) => error instanceof MessageStartPublicationIntegrityError,
      );
    }
    assert.equal(repository.get("second"), null);
  });
});

test("persists the closed lifecycle and refuses stale or dispatch-restoring CAS", async () => {
  await withRepository(async (repository) => {
    repository.reserve(record("lifecycle", 1));
    assert.equal(
      repository.compareAndSet(
        "lifecycle",
        MessageStartPublicationState.Starting,
        MessageStartPublicationState.Accepted,
      ),
      null,
    );
    assert.equal(
      repository.compareAndSet(
        "lifecycle",
        MessageStartPublicationState.Reserved,
        MessageStartPublicationState.Starting,
      )?.state,
      MessageStartPublicationState.Starting,
    );
    assert.equal(
      repository.compareAndSet(
        "lifecycle",
        MessageStartPublicationState.Starting,
        MessageStartPublicationState.Indeterminate,
      )?.state,
      MessageStartPublicationState.Indeterminate,
    );
    assert.throws(
      () => repository.compareAndSet(
        "lifecycle",
        MessageStartPublicationState.Indeterminate,
        MessageStartPublicationState.Reserved,
      ),
      /illegal Message Start publication transition/u,
    );
    assert.equal(
      repository.compareAndSet(
        "lifecycle",
        MessageStartPublicationState.Indeterminate,
        MessageStartPublicationState.Accepted,
      )?.state,
      MessageStartPublicationState.Accepted,
    );
    assert.equal(
      repository.compareAndSet(
        "lifecycle",
        MessageStartPublicationState.Accepted,
        MessageStartPublicationState.IntegrityFailure,
      )?.state,
      MessageStartPublicationState.IntegrityFailure,
    );
    assert.deepEqual(repository.listForReconciliation(), []);
  });
});

test("reopen preserves starting and indeterminate rows without making them dispatchable", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-publication-reopen-"));
  const databaseFile = join(root, "definitions.sqlite");
  try {
    const first = new SqliteMessageStartPublicationRepository(databaseFile);
    first.reserve(record("starting", 1));
    first.compareAndSet(
      "starting",
      MessageStartPublicationState.Reserved,
      MessageStartPublicationState.Starting,
    );
    first.reserve(record("indeterminate", 2));
    first.compareAndSet(
      "indeterminate",
      MessageStartPublicationState.Reserved,
      MessageStartPublicationState.Starting,
    );
    first.compareAndSet(
      "indeterminate",
      MessageStartPublicationState.Starting,
      MessageStartPublicationState.Indeterminate,
    );
    first.close();

    const reopened = new SqliteMessageStartPublicationRepository(databaseFile);
    try {
      assert.deepEqual(
        reopened.listForReconciliation().map(({ publicationId, state }) => ({
          publicationId,
          state,
        })),
        [
          { publicationId: "indeterminate", state: MessageStartPublicationState.Indeterminate },
          { publicationId: "starting", state: MessageStartPublicationState.Starting },
        ],
      );
      assert.equal(
        reopened.compareAndSet(
          "starting",
          MessageStartPublicationState.Reserved,
          MessageStartPublicationState.Starting,
        ),
        null,
      );
    } finally {
      reopened.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function withRepository(
  run: (repository: SqliteMessageStartPublicationRepository) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-publications-"));
  const repository = new SqliteMessageStartPublicationRepository(
    join(root, "definitions.sqlite"),
  );
  try {
    await run(repository);
  } finally {
    if (repository.isOpen) {
      repository.close();
    }
    await rm(root, { recursive: true, force: true });
  }
}

function record(
  publicationId: string,
  identity: number,
): NewMessageStartPublicationRecord {
  return {
    publicationId,
    definition: definition(),
    messageStart: messageStart(),
    identity: {
      processInstanceId: `instance-${identity}`,
      commandId: `command-${identity}`,
      workflowId: `workflow-${identity}`,
    },
    intent: {
      protocol: "message-start-v1",
      intentSha256: String(identity).repeat(64),
    },
  };
}

function definition(): MessageStartPublicationRecord["definition"] {
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

function messageStart(): MessageStartPublicationRecord["messageStart"] {
  return {
    startEventId: "MessageStart",
    channel: {
      kind: "operationMessage",
      interfaceId: "Orders",
      interfaceOperationId: "SubmitOrder",
      messageId: "OrderSubmitted",
    },
  };
}
