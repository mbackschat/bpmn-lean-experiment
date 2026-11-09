import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  decodeCanonicalExecutionPublicationExport,
  serializeExecutionPublicationExport,
} from "@bpmn-lean/platform-contracts";

import {
  completedState,
  executionPublicationExport,
  instanceFailure,
  publicationIdentity,
} from "./execution-publication-fixture.ts";

/** The canonical decoder wraps every refusal, so a test names the refusal it wants through `cause`. */
function causedBy(message: RegExp): (error: unknown) => boolean {
  return (error) => error instanceof TypeError && message.test(String((error.cause as Error | undefined)?.message));
}

test("emits fixed canonical bytes and SHA without whitespace or a trailing newline", () => {
  const bytes = serializeExecutionPublicationExport(
    executionPublicationExport(),
    publicationIdentity,
  );
  const text = new TextDecoder().decode(bytes);
  const fixedByteOracle = String.raw`{"batches":[{"commandId":"start-publication","fromRevision":0,"throughRevision":3,"transitions":[{"element":"StartEvent_1","owner":0,"revision":1,"role":{"input":"start","kind":"input"},"sourceType":"startEvent"},{"element":"UserTask_Review","owner":0,"revision":2,"role":{"flow":"Flow_Start","kind":"arrive"},"sourceType":"userTask"},{"element":null,"owner":0,"revision":3,"role":{"kind":"idle","scope":0},"sourceType":null}]}],"current":{"revision":3,"state":{"instanceId":"process-instance-1","kind":"state","logicalTimeMs":0,"openWaits":[{"definition":null,"detail":{"assignee":null,"candidateGroups":["reviewers"],"candidateUsers":[],"dueDate":null,"followUpDate":null,"formFields":[],"formKey":null,"inputs":[],"kind":"userTask","name":"Review","priority":null},"id":{"activation":1,"elementId":"UserTask_Review","processInstanceId":"process-instance-1"},"input":"command"}],"scopes":[],"status":"running","variables":[{"name":"alpha","value":{"kind":"boolean","value":true}},{"name":"control\u0001","value":{"kind":"string","value":"line\n\"🚀\\"}}]}},"definition":{"profile":"cib-seven-2.2.0:publication-test","ref":{"definitionKey":"PublicationProcess","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","version":7},"sourceOverlay":null},"format":"bpmn-lean.execution-publication","headRevision":3,"processInstanceId":"process-instance-1"}`;
  assert.equal(text, fixedByteOracle);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "86e7bfa202cacc6508886d54ca1416f94f05c5f9b78a1a338b67da5bdb230825",
  );
  assert.deepEqual(
    decodeCanonicalExecutionPublicationExport(bytes, publicationIdentity),
    executionPublicationExport(),
  );
});

test("rejects scalar, spacing, and trailing-byte mutations", () => {
  const bytes = serializeExecutionPublicationExport(
    executionPublicationExport(),
    publicationIdentity,
  );
  const text = new TextDecoder().decode(bytes);
  const mutations = [
    new TextEncoder().encode(text.replace("line\\n", "line\\u000a")),
    new TextEncoder().encode(text.replace("{\"batches\":", "{ \"batches\":")),
    new TextEncoder().encode(text.replace("\"fromRevision\":0,\"throughRevision\":3", "\"throughRevision\":3,\"fromRevision\":0")),
    new Uint8Array([...bytes, 0x0a]),
  ];
  for (const mutation of mutations) {
    assert.throws(
      () => decodeCanonicalExecutionPublicationExport(mutation, publicationIdentity),
      /canonical/u,
    );
  }
});

test("refuses to emit or accept bytes for another identity or a retired format", () => {
  const publication = executionPublicationExport();
  const other = { ...publicationIdentity, processInstanceId: "other-instance" };
  assert.throws(() => serializeExecutionPublicationExport(publication, other), /Process-instance identity/u);
  assert.throws(
    () => serializeExecutionPublicationExport({ ...publication, format: "bpmn-lean.execution-publication.v1" }, publicationIdentity),
    /unknown format/u,
  );
  const bytes = serializeExecutionPublicationExport(publication, publicationIdentity);
  assert.throws(
    () => decodeCanonicalExecutionPublicationExport(bytes, other),
    causedBy(/Process-instance identity does not match/u),
  );
  const retired = new TextEncoder().encode(
    new TextDecoder().decode(bytes).replace("bpmn-lean.execution-publication", "bpmn-lean.execution-publication.v1"),
  );
  assert.throws(
    () => decodeCanonicalExecutionPublicationExport(retired, publicationIdentity),
    causedBy(/unknown format/u),
  );
});

test("preserves the exact failure bytes of a failed state", () => {
  const publication = {
    ...executionPublicationExport(),
    current: { revision: 3, state: { ...completedState, status: "failed", failure: instanceFailure } },
  };
  const bytes = serializeExecutionPublicationExport(publication, publicationIdentity);
  const exactFailure = '"failure":{"code":"serviceFailure","message":"","occurrence":{"activation":1,"elementId":"ServiceTask_Charge","processInstanceId":"process-instance-1"},"related":[]}';
  assert.ok(new TextDecoder().decode(bytes).includes(exactFailure));
  assert.deepEqual(decodeCanonicalExecutionPublicationExport(bytes, publicationIdentity), publication);
});
