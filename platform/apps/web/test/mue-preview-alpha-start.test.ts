import assert from "node:assert/strict";
import { test } from "node:test";

import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";

import {
  isMuePreviewAlphaDefinition,
  resolveMuePreviewAlphaStart,
} from "../src/mue-preview-alpha-start.ts";

const exactDefinition = {
  processId: "Process_SequentialMultiInstanceReview",
  version: 4,
  source: {
    kind: "bpmnSource",
    id: "sequential-multi-instance-review.bpmn",
    sha256: "982f77f7fcca2d01bd2357c11057c5fdb6aaf3b383ac351a93aa32ab1bbca3ff",
    byteLength: 4096,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "bpmn-2.0.2",
  sourceOverlay: null,
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const satisfies DeployedDefinitionVersion;

test("supplies the exact Alpha input only to the content-bound registered definition", () => {
  const preset = resolveMuePreviewAlphaStart(exactDefinition);

  assert.deepEqual(preset, {
    label: "MUE Preview Alpha input: contract, invoice, receipt",
    command: {
      initialVariables: [{
        name: "DataObject_InputItems",
        value: {
          kind: "stringList",
          value: ["contract", "invoice", "receipt"],
        },
      }],
    },
  });
});

test("does not infer the Alpha preset from the Process ID and profile without exact content", () => {
  assert.equal(resolveMuePreviewAlphaStart({
    ...exactDefinition,
    source: { ...exactDefinition.source, sha256: "a".repeat(64) },
  }), null);
});

test("does not infer the Alpha preset from exact content admitted under another profile", () => {
  assert.equal(resolveMuePreviewAlphaStart({
    ...exactDefinition,
    semanticProfile: "different-profile",
  }), null);
});

test("exposes one exact definition predicate for every Alpha-only surface", () => {
  // The standards profile admits every portable model, so the profile alone no longer singles out Alpha.
  assert.equal(isMuePreviewAlphaDefinition(exactDefinition), true);
  assert.equal(isMuePreviewAlphaDefinition({ ...exactDefinition, semanticProfile: "cibseven-2.2.0" }), false);
  assert.equal(isMuePreviewAlphaDefinition({ ...exactDefinition, processId: "Process_Other" }), false);
  assert.equal(
    isMuePreviewAlphaDefinition({ ...exactDefinition, source: { ...exactDefinition.source, sha256: "0".repeat(64) } }),
    false,
  );
});
