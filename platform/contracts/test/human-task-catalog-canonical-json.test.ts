import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  decodeCanonicalHumanTaskCatalogV1,
  serializeHumanTaskCatalogV1,
} from "@bpmn-lean/platform-contracts";

const catalog = {
  schemaVersion: "bpmn-lean-human-task-catalog/v1",
  processId: "Process_🚀",
  semanticProfile: "structured-human-work",
  sourceSha256: "b".repeat(64),
  tasks: [{
    elementId: "Review",
    description: " Review\nexactly. ",
    worklistPriority: 50,
    form: {
      schemaVersion: "bpmn-lean-structured-form/v1",
      fields: [{
        key: "confirmed",
        label: "Confirmed",
        helpText: null,
        defaultValue: null,
        visibleForActions: "all",
        requiredForActions: ["approve"],
        kind: "boolean",
      }],
      actions: [
        { id: "approve", label: "Approve", intent: "primary", resolutionValue: "approved" },
        { id: "abort", label: "Abort", intent: "destructive", resolutionValue: "aborted" },
      ],
      resolutionVariable: "resolution",
    },
  }],
} as const;

test("emits fixed canonical catalog bytes and revalidates the exact representation", () => {
  const bytes = serializeHumanTaskCatalogV1(catalog);
  const text = new TextDecoder().decode(bytes);
  const expected = String.raw`{"processId":"Process_🚀","schemaVersion":"bpmn-lean-human-task-catalog/v1","semanticProfile":"structured-human-work","sourceSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","tasks":[{"description":" Review\nexactly. ","elementId":"Review","form":{"actions":[{"id":"approve","intent":"primary","label":"Approve","resolutionValue":"approved"},{"id":"abort","intent":"destructive","label":"Abort","resolutionValue":"aborted"}],"fields":[{"defaultValue":null,"helpText":null,"key":"confirmed","kind":"boolean","label":"Confirmed","requiredForActions":["approve"],"visibleForActions":"all"}],"resolutionVariable":"resolution","schemaVersion":"bpmn-lean-structured-form/v1"},"worklistPriority":50}]}`;

  assert.equal(text, expected);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "8769144b10c5940d287bbb6fe3e280a19d90a81ea01119607cbfc188a0a37a10",
  );
  assert.deepEqual(decodeCanonicalHumanTaskCatalogV1(bytes), catalog);
});

test("rejects noncanonical bytes, duplicate keys, malformed Unicode, and unknown fields", () => {
  const canonical = new TextDecoder().decode(serializeHumanTaskCatalogV1(catalog));
  const mutations = [
    ` ${canonical}`,
    canonical.replace('{"processId":"Process_🚀","schemaVersion"', '{"schemaVersion":"bpmn-lean-human-task-catalog/v1","processId":"Process_🚀","schemaVersion"'),
    canonical.replace('{"processId":"Process_🚀"', '{"processId":"Process_🚀","processId":"Other"'),
    canonical.replace('{"processId":"Process_🚀"', '{"private":true,"processId":"Process_🚀"'),
    canonical.replace("Process_🚀", "Process_\\ud800"),
  ];

  for (const mutation of mutations) {
    assert.throws(
      () => decodeCanonicalHumanTaskCatalogV1(new TextEncoder().encode(mutation)),
      /canonical Human Task catalog/u,
    );
  }
});
