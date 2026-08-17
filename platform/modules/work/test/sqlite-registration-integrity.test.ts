import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { SqliteWorkRepository } from "@bpmn-lean/platform-work";

test("an exact duplicate confirmed registration is retained", async () => {
  await withRepository(async (repository) => {
    const publication = confirmedPublication("duplicate");
    await repository.recordConfirmedProcessInstance(publication);
    await repository.recordConfirmedProcessInstance(structuredClone(publication));
    assert.deepEqual(await repository.listProcessRegistrations(), [{
      ...publication,
      observation: "indeterminate",
    }]);
  });
});

test("a delayed active observation cannot reopen closed Work", async () => {
  await assertClosedAbsorbs("active");
});

test("a delayed indeterminate observation cannot reopen closed Work", async () => {
  await assertClosedAbsorbs("indeterminate");
});

async function assertClosedAbsorbs(
  delayed: "active" | "indeterminate",
): Promise<void> {
  await withRepository(async (repository) => {
    const publication = confirmedPublication(delayed);
    await repository.recordConfirmedProcessInstance(publication);
    await repository.recordObservation(publication.instance.processInstanceId, "closed");
    await repository.recordObservation(publication.instance.processInstanceId, delayed);
    assert.equal((await repository.listProcessRegistrations())[0]!.observation, "closed");
  });
}

async function withRepository(
  run: (repository: SqliteWorkRepository) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-work-registration-"));
  const repository = new SqliteWorkRepository(join(root, "work.sqlite"));
  try {
    await run(repository);
  } finally {
    await repository.close();
    await rm(root, { recursive: true, force: true });
  }
}

function confirmedPublication(processInstanceId: string) {
  return {
    instance: {
      processInstanceId,
      definition: {
        processId: "Registration_Process",
        version: 1,
        source: {
          kind: "bpmnSource" as const,
          id: "registration.bpmn",
          sha256: "a".repeat(64),
          byteLength: 42,
          declaredEncoding: null,
          decodedAs: "UTF-8" as const,
        },
        semanticProfile: "profile-1",
        startCapabilities: { messageStarts: [], timerStarts: [] },
      },
    },
    locator: `locator:${processInstanceId}`,
  };
}
