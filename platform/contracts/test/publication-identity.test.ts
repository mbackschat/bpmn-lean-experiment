import assert from "node:assert/strict";
import test from "node:test";

import {
  publicationIdentityForPublicProcessInstance,
  requirePublicationIdentity,
  samePublicationIdentity,
} from "@bpmn-lean/platform-contracts";

import { publicationIdentity } from "./execution-publication-fixture.ts";

const instance = {
  processInstanceId: "process-instance-1",
  definition: {
    processId: "PublicationProcess",
    version: 7,
    source: {
      kind: "bpmnSource",
      id: "publication-🚀.bpmn",
      sha256: "a".repeat(64),
      byteLength: 42,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "cib-seven-2.2.0:publication-test",
    startCapabilities: { messageStarts: [], timerStarts: [] },
    sourceOverlay: null,
  },
} as const;

test("derives the engine's definition reference from the exact public Process instance", () => {
  assert.deepEqual(publicationIdentityForPublicProcessInstance(instance), publicationIdentity);
});

test("compares identities by definition key, version, digest, profile, overlay and instance", () => {
  const { definition } = publicationIdentity;
  const overlay = { id: "overlay", sha256: "c".repeat(64) };
  assert.equal(samePublicationIdentity(publicationIdentity, { ...publicationIdentity, definition: { ...definition } }), true);
  const different = [
    { ...publicationIdentity, processInstanceId: "other-instance" },
    { ...publicationIdentity, definition: { ...definition, ref: { ...definition.ref, definitionKey: "Other" } } },
    { ...publicationIdentity, definition: { ...definition, ref: { ...definition.ref, version: 8 } } },
    { ...publicationIdentity, definition: { ...definition, ref: { ...definition.ref, sha256: "b".repeat(64) } } },
    { ...publicationIdentity, definition: { ...definition, profile: "other" } },
    { ...publicationIdentity, definition: { ...definition, sourceOverlay: overlay } },
  ];
  for (const candidate of different) {
    assert.equal(samePublicationIdentity(publicationIdentity, candidate), false);
    assert.equal(samePublicationIdentity(candidate, publicationIdentity), false);
  }
  const overlaid = { ...publicationIdentity, definition: { ...definition, sourceOverlay: overlay } };
  assert.equal(samePublicationIdentity(overlaid, { ...overlaid, definition: { ...definition, sourceOverlay: { ...overlay } } }), true);
  assert.equal(samePublicationIdentity(overlaid, { ...overlaid, definition: { ...definition, sourceOverlay: { ...overlay, id: "other" } } }), false);
  assert.equal(samePublicationIdentity(overlaid, { ...overlaid, definition: { ...definition, sourceOverlay: { ...overlay, sha256: "d".repeat(64) } } }), false);
});

test("requires the exact identity shape", () => {
  assert.deepEqual(requirePublicationIdentity(publicationIdentity, "identity"), publicationIdentity);
  const { definition } = publicationIdentity;
  const rejected: Array<[unknown, RegExp]> = [
    [{ ...publicationIdentity, processId: "PublicationProcess" }, /public fields/u],
    [{ definition }, /public fields/u],
    [{ ...publicationIdentity, processInstanceId: "" }, /must not be empty/u],
    [{ ...publicationIdentity, definition: { ...definition, ref: { ...definition.ref, sha256: "A".repeat(64) } } }, /lowercase SHA-256/u],
    [{ ...publicationIdentity, definition: { ...definition, ref: { ...definition.ref, sha256: "a".repeat(63) } } }, /lowercase SHA-256/u],
    [{ ...publicationIdentity, definition: { ...definition, ref: { ...definition.ref, version: 0 } } }, /positive safe integer/u],
    [{ ...publicationIdentity, definition: { ...definition, ref: { ...definition.ref, version: 1.5 } } }, /positive safe integer/u],
    [{ ...publicationIdentity, definition: { ...definition, profile: "" } }, /must not be empty/u],
    [{ ...publicationIdentity, definition: { ...definition, sourceOverlay: undefined } }, /must be an object/u],
    [{ ...publicationIdentity, definition: { ...definition, sourceOverlay: { id: "", sha256: "a".repeat(64) } } }, /must not be empty/u],
    [{ ...publicationIdentity, definition: { ...definition, sourceOverlay: { id: "overlay", sha256: "xyz" } } }, /lowercase SHA-256/u],
    [{ ...publicationIdentity, definition: { ...definition, compiler: "bpmn-source-semantic-process" } }, /public fields/u],
    [null, /must be an object/u],
  ];
  for (const [candidate, message] of rejected) {
    assert.throws(() => requirePublicationIdentity(candidate, "identity"), message);
  }
});
