import assert from "node:assert/strict";
import { test } from "node:test";

import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";

import {
  isMuePreviewAlphaProfile,
  muePreviewAlphaSemanticProfile,
  resolveMuePreviewAlphaStart,
} from "../src/mue-preview-alpha-start.ts";

const exactDefinition = {
  processId: "Process_SequentialMultiInstanceReview",
  version: 4,
  source: {
    kind: "bpmnSource",
    id: "sequential-multi-instance-review.bpmn",
    sha256: "9161c134984d42a04cd57d5ea161938a774705be2e955ade5302d5dde2afa6f4",
    byteLength: 4096,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const satisfies DeployedDefinitionVersion;

test("supplies the exact Alpha input only to the content-bound registered definition", () => {
  const preset = resolveMuePreviewAlphaStart(exactDefinition);

  assert.deepEqual(preset, {
    label: "MUE Preview Alpha input: contract, invoice, receipt",
    command: {
      initialVariables: [{
        name: "DataObjectReference_InputItems",
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

test("exposes one exact profile predicate for every Alpha-only surface", () => {
  assert.equal(isMuePreviewAlphaProfile(muePreviewAlphaSemanticProfile), true);
  assert.equal(
    isMuePreviewAlphaProfile("bpmn-2.0.2-parallel-multi-instance-user-task-draft"),
    false,
  );
});
