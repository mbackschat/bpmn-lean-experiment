import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  requireCanonicalExecutionPublicationExport,
  serializeExecutionPublicationExport,
} from "../dist/index.js";
import {
  canonicalExportFixture,
  publicationContext,
} from "./semantic-publication-fixture.ts";

const expectedCanonicalBytes = Buffer.from(
  '{"batches":[{"commandId":"command-start","fromRevision":0,"throughRevision":1,"transitions":[{"logicalTimeMs":0,"positionDelta":{"consumedTokens":[],"enteredScopes":[],"exitedScopes":[],"producedTokens":[]},"revision":1,"transition":{"kind":"externalStimulus","stimulus":{"commandId":"command-start","initialVariables":[{"name":"note","value":{"kind":"string","value":"control:\\u0001 short:\\b\\f\\n\\r\\t quote:\\\" slash:\\\\ scalar:😀"}},{"name":"truth","value":{"kind":"boolean","value":true}}],"instanceId":"Instance_1","kind":"startProcess","processId":"Process_1"}}}]}],"current":{"controlTokens":[],"revision":1,"scopes":[],"state":{"activeWaits":[],"enabledInteractions":[],"instanceId":"Instance_1","kind":"state","logicalTimeMs":0,"openEffects":[],"openIncidents":[],"openMessageSubscriptions":[],"openTimers":[],"openUserTasks":[],"status":"running","variables":[{"name":"note","value":{"kind":"string","value":"control:\\u0001 short:\\b\\f\\n\\r\\t quote:\\\" slash:\\\\ scalar:😀"}},{"name":"truth","value":{"kind":"boolean","value":true}}]}},"definition":{"compiler":"bpmn-source-semantic-process","semanticProfile":"profile-publication","sourceId":"source-publication","sourceOverlay":null,"sourceSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"format":"bpmn-lean.execution-publication.v1","headRevision":1,"processId":"Process_1","processInstanceId":"Instance_1"}',
  "utf8",
);
const expectedSha256 = "58e6a78d11c535bf94981a2d24f1343b97bce9ff6208c85f6939fcf17ff62a64";

test("emits the independently fixed canonical UTF-8 bytes and SHA-256", () => {
  const actual = serializeExecutionPublicationExport(
    canonicalExportFixture(),
    publicationContext,
  );
  assert.deepEqual(actual, new Uint8Array(expectedCanonicalBytes));
  assert.equal(
    createHash("sha256").update(expectedCanonicalBytes).digest("hex"),
    expectedSha256,
  );
  assert.ok(new TextDecoder().decode(actual).includes(
    "control:\\u0001 short:\\b\\f\\n\\r\\t quote:\\\" slash:\\\\ scalar:\u{1f600}",
  ));
});

test("rejects every noncanonical byte and scalar category", () => {
  const canonical = serializeExecutionPublicationExport(
    canonicalExportFixture(),
    publicationContext,
  );
  assert.deepEqual(
    requireCanonicalExecutionPublicationExport(canonical, publicationContext),
    canonicalExportFixture(),
  );
  const text = new TextDecoder().decode(canonical);
  for (const changed of [
    Buffer.from(`\ufeff${text}`, "utf8"),
    Buffer.from(` ${text}`, "utf8"),
    Buffer.from(`${text}\n`, "utf8"),
    Buffer.from(reorderTopLevelBatchesAndCurrent(text), "utf8"),
  ]) {
    assert.throws(
      () => requireCanonicalExecutionPublicationExport(changed, publicationContext),
      /canonical execution publication export/,
    );
  }

  const surrogate = structuredClone(canonicalExportFixture());
  surrogate.processId = "Process_\ud800";
  assert.throws(
    () => serializeExecutionPublicationExport(surrogate, publicationContext),
    /malformed execution publication export|Unicode scalar/,
  );
  const unsafe = structuredClone(canonicalExportFixture());
  unsafe.headRevision = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(
    () => serializeExecutionPublicationExport(unsafe, publicationContext),
    /malformed execution publication export/,
  );
});

function reorderTopLevelBatchesAndCurrent(canonical: string): string {
  const currentStart = canonical.indexOf(',"current":');
  const definitionStart = canonical.indexOf(',"definition":');
  assert.ok(currentStart > 0 && definitionStart > currentStart);
  const batches = canonical.slice(1, currentStart);
  const current = canonical.slice(currentStart + 1, definitionStart);
  return `{${current},${batches}${canonical.slice(definitionStart)}}`;
}
