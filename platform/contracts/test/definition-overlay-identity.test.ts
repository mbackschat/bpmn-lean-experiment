import assert from "node:assert/strict";
import { test } from "node:test";
import { decodePublicProcessInstanceIdentity, executionPublicationIdentityForPublicProcessInstance, flowNodeOccurrencePublicationIdentityForPublicProcessInstance } from "@bpmn-lean/platform-contracts";

const overlay = { id: "same-🚀", sha256: "a".repeat(64) };
const instance = {
  processInstanceId: "instance",
  definition: {
    processId: "Process", version: 1,
    source: { kind: "bpmnSource", id: "source", sha256: "b".repeat(64), byteLength: 1, declaredEncoding: null, decodedAs: "UTF-8" },
    semanticProfile: "profile", startCapabilities: { messageStarts: [], timerStarts: [] }, sourceOverlay: overlay,
  },
} as const;

test("public version decoder requires explicit nullable overlay and both exact identity fields", () => {
  const decoded = decodePublicProcessInstanceIdentity(instance);
  assert.deepEqual(decoded.definition.sourceOverlay, overlay);
  const { sourceOverlay: omitted, ...withoutOverlay } = instance.definition;
  assert.throws(() => decodePublicProcessInstanceIdentity({ ...instance, definition: withoutOverlay }));
  for (const value of [{ id: overlay.id }, { ...overlay, sha256: "f" }, { ...overlay, bytes: [] }]) {
    assert.throws(() => decodePublicProcessInstanceIdentity({ ...instance, definition: { ...instance.definition, sourceOverlay: value } }));
  }
  assert.equal(decodePublicProcessInstanceIdentity({ ...instance, definition: { ...instance.definition, sourceOverlay: null } }).definition.sourceOverlay, null);
});

test("E1 and E2 expected publication identities preserve the retained overlay ID and digest", () => {
  for (const expected of [executionPublicationIdentityForPublicProcessInstance, flowNodeOccurrencePublicationIdentityForPublicProcessInstance]) {
    const exact = expected(instance);
    assert.deepEqual(exact.definition.sourceOverlay, overlay);
    const changed = expected({ ...instance, definition: { ...instance.definition, sourceOverlay: { ...overlay, sha256: "c".repeat(64) } } });
    assert.notDeepEqual(exact, changed);
    Object.assign(exact.definition.sourceOverlay ?? {}, { sha256: "d".repeat(64) });
    assert.deepEqual(instance.definition.sourceOverlay, overlay);
  }
});
