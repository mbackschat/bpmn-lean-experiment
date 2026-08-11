import assert from "node:assert/strict";
import { test } from "node:test";

import {
  messageStartPublicationCommandId,
  messageStartPublicationProcessInstanceId,
  messageStartPublicationWorkflowId,
} from "@bpmn-lean/platform-engine-gateway";

test("derives stable domain-separated private publication identities", () => {
  const publicationId = "publication/東京\u0000one";
  const processInstanceId = messageStartPublicationProcessInstanceId(publicationId);
  const commandId = messageStartPublicationCommandId(publicationId);

  assert.match(
    processInstanceId,
    /^bpmn-platform-message-start-instance-sha256:[0-9a-f]{64}$/u,
  );
  assert.match(
    commandId,
    /^bpmn-platform-message-start-command-sha256:[0-9a-f]{64}$/u,
  );
  assert.equal(
    processInstanceId,
    "bpmn-platform-message-start-instance-sha256:36e280f8901da3b07e39a6a4004a432c1d8c559feb0b15b7cfe48eea0ecb65c7",
  );
  assert.equal(
    commandId,
    "bpmn-platform-message-start-command-sha256:ef714496d2646a60cf27020eea0aacd43dc4b90a616acbc525fc18acadb2716d",
  );
  assert.notEqual(
    processInstanceId.split(":").at(-1),
    commandId.split(":").at(-1),
  );
  assert.equal(
    messageStartPublicationProcessInstanceId(publicationId),
    processInstanceId,
  );
  assert.equal(messageStartPublicationCommandId(publicationId), commandId);
  assert.notEqual(
    messageStartPublicationProcessInstanceId("publication/other"),
    processInstanceId,
  );
  for (const malformed of ["", "\ud800"] as const) {
    assert.throws(
      () => messageStartPublicationProcessInstanceId(malformed),
      /well-formed Unicode/u,
    );
    assert.throws(
      () => messageStartPublicationCommandId(malformed),
      /well-formed Unicode/u,
    );
  }
});

test("derives the Workflow address through the canonical Process address owner", () => {
  const processInstanceId = messageStartPublicationProcessInstanceId(
    "publication-one",
  );

  assert.equal(
    messageStartPublicationWorkflowId(processInstanceId),
    "bpmn-process-sha256:1505683603d865327feab09ba000de119f04700c185f76dfb4b2b91c18970a6b",
  );
  assert.match(
    messageStartPublicationWorkflowId(processInstanceId),
    /^bpmn-process-sha256:[0-9a-f]{64}$/u,
  );
  assert.throws(() => messageStartPublicationWorkflowId(""), /non-empty/u);
});
