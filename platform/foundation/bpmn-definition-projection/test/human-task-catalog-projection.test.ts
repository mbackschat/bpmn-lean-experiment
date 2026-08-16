import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { projectHumanTaskCatalog } from "../dist/index.js";

const sourcePath = new URL(
  "../../../../scenarios/expense-exception-review/process.bpmn",
  import.meta.url,
);
const semanticProfile = "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function project(sourceXml: string) {
  return projectHumanTaskCatalog(sourceXml, {
    processId: "Process_ExpenseExceptionReview",
    semanticProfile,
    sourceSha256: sha256(sourceXml),
  });
}

test("projects the exact supported Rendering into a source-bound Human Task catalog", async () => {
  const sourceXml = await readFile(sourcePath, "utf8");

  const result = await project(sourceXml);

  assert.equal(result.kind, "catalog");
  if (result.kind !== "catalog") return;
  assert.equal(result.catalog.processId, "Process_ExpenseExceptionReview");
  assert.equal(result.catalog.semanticProfile, semanticProfile);
  assert.equal(result.catalog.sourceSha256, sha256(sourceXml));
  assert.deepEqual(result.catalog.tasks.map(({ elementId }) => elementId), [
    "ReviewException",
  ]);
  assert.equal(result.catalog.tasks[0]?.description, "Review the expense exception and choose a resolution.");
  assert.equal(result.catalog.tasks[0]?.worklistPriority, 80);
  assert.equal(result.provenance.kind, "exactBpmnSource");
});

test("rejects duplicate JSON keys without accepting JSON.parse last-write behavior", async () => {
  const sourceXml = await readFile(sourcePath, "utf8");
  const mutations = [
    sourceXml.replace(
      '"worklistPriority":80',
      '"worklistPriority":80,"worklistPriority":50',
    ),
    sourceXml.replace(
      '"worklistPriority":80',
      '"worklistPriority":80,"remoteForm":"https://example.invalid/form"',
    ),
  ];

  for (const mutation of mutations) {
    assert.equal((await project(mutation)).kind, "invalid");
  }
});

test("rejects project form child content and wrong Documentation shape", async () => {
  const sourceXml = await readFile(sourcePath, "utf8");
  const mutations = [
    sourceXml.replace(
      "</bpmnLean:structuredForm>",
      "<bpmnLean:child/></bpmnLean:structuredForm>",
    ),
    sourceXml.replace(
      "<bpmn:documentation>",
      '<bpmn:documentation textFormat="text/html">',
    ),
    sourceXml.replace(
      "</bpmn:documentation>",
      "<bpmn:text>child</bpmn:text></bpmn:documentation>",
    ),
  ];

  for (const mutation of mutations) {
    assert.equal((await project(mutation)).kind, "invalid");
  }
});

test("defaults priority to 50 and preserves structured User Tasks in source order", async () => {
  const sourceXml = await readFile(sourcePath, "utf8");
  const originalTask = sourceXml.match(/    <bpmn:userTask id="ReviewException"[\s\S]*?    <\/bpmn:userTask>/u)?.[0];
  assert.ok(originalTask);
  const secondTask = originalTask
    .replace('id="ReviewException"', 'id="ReviewExceptionSecond"')
    .replace('id="ReviewExceptionRendering"', 'id="ReviewExceptionSecondRendering"')
    .replace('"worklistPriority":80,', "");
  const mutation = sourceXml.replace(originalTask, `${originalTask}\n${secondTask}`);

  const result = await project(mutation);

  assert.equal(result.kind, "catalog");
  if (result.kind !== "catalog") return;
  assert.deepEqual(
    result.catalog.tasks.map(({ elementId, worklistPriority }) => ({ elementId, worklistPriority })),
    [
      { elementId: "ReviewException", worklistPriority: 80 },
      { elementId: "ReviewExceptionSecond", worklistPriority: 50 },
    ],
  );
});

test("fails closed on wrong source bindings and duplicate UserTask IDs", async () => {
  const sourceXml = await readFile(sourcePath, "utf8");
  const digest = sha256(sourceXml);
  const bindings = [
    { processId: "WrongProcess", semanticProfile, sourceSha256: digest },
    { processId: "Process_ExpenseExceptionReview", semanticProfile: "wrong-profile", sourceSha256: digest },
    { processId: "Process_ExpenseExceptionReview", semanticProfile, sourceSha256: "0".repeat(64) },
  ];
  for (const binding of bindings) {
    assert.equal((await projectHumanTaskCatalog(sourceXml, binding)).kind, "invalid");
  }

  const originalTask = sourceXml.match(/    <bpmn:userTask id="ReviewException"[\s\S]*?    <\/bpmn:userTask>/u)?.[0];
  assert.ok(originalTask);
  const duplicate = sourceXml.replace(originalTask, `${originalTask}\n${originalTask}`);
  assert.equal((await project(duplicate)).kind, "invalid");
});

test("does not accept misplaced forms, attributes, arbitrary descendants, or CIB formData", async () => {
  const sourceXml = await readFile(sourcePath, "utf8");
  const projectElement = sourceXml.match(/          <bpmnLean:structuredForm>[\s\S]*?<\/bpmnLean:structuredForm>/u)?.[0];
  assert.ok(projectElement);
  const mutations = [
    sourceXml.replace("<bpmnLean:structuredForm>", '<bpmnLean:structuredForm mode="remote">'),
    sourceXml.replace(
      "</bpmnLean:structuredForm>",
      "</bpmnLean:structuredForm><bpmnLean:unknown/>",
    ),
    sourceXml
      .replace(projectElement, "")
      .replace(
        "<bpmn:documentation>",
        `<bpmn:extensionElements>${projectElement.trim()}</bpmn:extensionElements>\n      <bpmn:documentation>`,
      ),
  ];
  for (const mutation of mutations) {
    assert.equal((await project(mutation)).kind, "invalid");
  }

  const cibOnly = sourceXml.replace(
    projectElement,
    '<c7:formData><c7:formField id="legacy" type="string"/></c7:formData>',
  );
  assert.equal((await project(cibOnly)).kind, "absent");
});
