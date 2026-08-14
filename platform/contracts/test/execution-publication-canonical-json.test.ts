import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  decodeCanonicalExecutionPublicationExport,
  serializeExecutionPublicationExport,
} from "@bpmn-lean/platform-contracts";

import {
  executionPublicationExport,
  publicationIdentity,
} from "./execution-publication-fixture.ts";

test("emits fixed canonical bytes and SHA without whitespace or a trailing newline", () => {
  const bytes = serializeExecutionPublicationExport(
    executionPublicationExport(),
    publicationIdentity,
  );
  const text = new TextDecoder().decode(bytes);
  const fixedByteOracle = String.raw`{"batches":[{"commandId":"start-publication","fromRevision":0,"throughRevision":1,"transitions":[{"logicalTimeMs":0,"positionDelta":{"consumedTokens":[],"enteredScopes":[{"bpmnElementId":"PublicationProcess","id":{"activation":1,"definitionScopeId":"scope-process","processInstanceId":"process-instance-1"},"parent":null}],"exitedScopes":[],"producedTokens":[]},"revision":1,"transition":{"kind":"externalStimulus","stimulus":{"commandId":"start-publication","initialVariables":[{"name":"alpha","value":{"kind":"boolean","value":true}},{"name":"control\u0001","value":{"kind":"string","value":"line\n\"🚀\\"}}],"instanceId":"process-instance-1","kind":"startProcess","processId":"PublicationProcess"}}}]}],"current":{"controlTokens":[],"revision":1,"scopes":[{"bpmnElementId":"PublicationProcess","id":{"activation":1,"definitionScopeId":"scope-process","processInstanceId":"process-instance-1"},"parent":null}],"state":{"activeWaits":[],"enabledInteractions":[],"instanceId":"process-instance-1","kind":"state","logicalTimeMs":0,"openEffects":[],"openIncidents":[],"openMessageSubscriptions":[],"openTimers":[],"openUserTasks":[],"status":"running","variables":[{"name":"alpha","value":{"kind":"boolean","value":true}},{"name":"control\u0001","value":{"kind":"string","value":"line\n\"🚀\\"}}]}},"definition":{"compiler":"bpmn-source-semantic-process","semanticProfile":"cib-seven-2.2.0:publication-test","sourceId":"publication-🚀.bpmn","sourceOverlay":null,"sourceSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"format":"bpmn-lean.execution-publication.v1","headRevision":1,"processId":"PublicationProcess","processInstanceId":"process-instance-1"}`;
  assert.equal(text, fixedByteOracle);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "2f715583c52a1f9077bb8787bb95dd2778421035b7395045bb9eb189723c53cf",
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
    new Uint8Array([...bytes, 0x0a]),
  ];
  for (const mutation of mutations) {
    assert.throws(
      () => decodeCanonicalExecutionPublicationExport(mutation, publicationIdentity),
      /canonical/u,
    );
  }
});
