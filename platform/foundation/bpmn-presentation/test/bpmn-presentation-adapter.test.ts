import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BPMN_AUTO_LAYOUT_EFFECTIVE_GENERATOR_SHA256,
  BpmnAutoLayoutPresentationAdapter,
} from "../dist/index.js";
import { runLayoutWorker } from "../dist/layout-worker-client.js";

const metadataSourcePath = new URL(
  "../../../../scenarios/user-task-assignment-form-metadata/process.bpmn",
  import.meta.url,
);
const callActivitySourcePath = new URL(
  "../../../../scenarios/called-process-call-activity/process.bpmn",
  import.meta.url,
);
const preservedNotationSourcePath = new URL(
  "../../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("binds the complete output-affecting layout and parser graph", () => {
  const exactGeneratorIdentity = [
    "bpmn-presentation-adapter-epoch@1",
    "bpmn-auto-layout@1.3.0",
    "bpmn-moddle@10.0.0",
    "moddle@8.2.0",
    "moddle-xml@12.1.0",
    "min-dash@5.1.0",
    "saxen@11.1.0",
    "",
  ].join("\n");
  assert.equal(
    BPMN_AUTO_LAYOUT_EFFECTIVE_GENERATOR_SHA256,
    sha256(exactGeneratorIdentity),
  );
});

function insertBeforeProcessEnd(sourceXml: string, xml: string): string {
  return sourceXml.replace("  </bpmn:process>", `${xml}\n  </bpmn:process>`);
}

test("refuses the two-root Call Activity instead of returning partial DI", async () => {
  const sourceXml = await readFile(callActivitySourcePath, "utf8");
  const adapter = new BpmnAutoLayoutPresentationAdapter();

  await assert.rejects(
    adapter.generate(sourceXml, "CallerProcess"),
    /exactly one root Process/u,
  );
});

test("generates self-contained DI for the exact M3 metadata source without changing source bytes", async () => {
  const sourceXml = await readFile(metadataSourcePath, "utf8");
  const adapter = new BpmnAutoLayoutPresentationAdapter();

  assert.deepEqual(
    await adapter.resolveSourceDiagram(sourceXml, "Process_UserTaskMetadata"),
    { kind: "absent" },
  );

  const generated = await adapter.generate(
    sourceXml,
    "Process_UserTaskMetadata",
  );

  assert.match(generated.diagramInterchangeXml, /^<bpmndi:BPMNDiagram\b/u);
  assert.match(
    generated.diagramInterchangeXml,
    /xmlns:bpmndi="http:\/\/www\.omg\.org\/spec\/BPMN\/20100524\/DI"/u,
  );
  assert.match(
    generated.diagramInterchangeXml,
    /xmlns:dc="http:\/\/www\.omg\.org\/spec\/DD\/20100524\/DC"/u,
  );
  assert.match(
    generated.diagramInterchangeXml,
    /xmlns:di="http:\/\/www\.omg\.org\/spec\/DD\/20100524\/DI"/u,
  );
  assert.equal(
    generated.diagramInterchangeSha256,
    sha256(generated.diagramInterchangeXml),
  );
  assert.deepEqual(generated.provenance, {
    kind: "generated",
    generatorId: "bpmn-auto-layout",
    generatorVersion: "1.3.0",
    effectiveGeneratorSha256: BPMN_AUTO_LAYOUT_EFFECTIVE_GENERATOR_SHA256,
  });
  assert.ok(Object.isFrozen(generated));
  assert.ok(Object.isFrozen(generated.provenance));

  const presentationXml = await adapter.validateGeneratedComposition(
    sourceXml,
    "Process_UserTaskMetadata",
    generated.diagramInterchangeXml,
  );
  assert.equal(
    presentationXml.replace(generated.diagramInterchangeXml, ""),
    sourceXml,
  );
  assert.deepEqual(
    await adapter.resolveSourceDiagram(
      presentationXml,
      "Process_UserTaskMetadata",
    ),
    { kind: "source" },
  );
  assert.equal(
    presentationXml.indexOf(generated.diagramInterchangeXml),
    sourceXml.lastIndexOf("</bpmn:definitions>"),
  );
});

test("source DI resolves the selected Process when another root has its own diagram", async () => {
  const sourceXml = await readFile(metadataSourcePath, "utf8");
  const adapter = new BpmnAutoLayoutPresentationAdapter();
  const generated = await adapter.generate(sourceXml, "Process_UserTaskMetadata");
  const selectedPresentation = await adapter.validateGeneratedComposition(
    sourceXml,
    "Process_UserTaskMetadata",
    generated.diagramInterchangeXml,
  );
  const secondRoot = [
    '<bpmn:process id="Process_Other" isExecutable="true">',
    '<bpmn:startEvent id="Other_Start" />',
    "</bpmn:process>",
    '<bpmndi:BPMNDiagram xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
    ' xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
    ' xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Other_Diagram">',
    '<bpmndi:BPMNPlane id="Other_Plane" bpmnElement="Process_Other">',
    '<bpmndi:BPMNShape id="Other_Start_Shape" bpmnElement="Other_Start">',
    '<dc:Bounds x="100" y="100" width="36" height="36" />',
    "</bpmndi:BPMNShape>",
    "</bpmndi:BPMNPlane>",
    "</bpmndi:BPMNDiagram>",
  ].join("");
  const withTwoRootDiagrams = selectedPresentation.replace(
    "</bpmn:definitions>",
    `${secondRoot}</bpmn:definitions>`,
  );

  assert.deepEqual(
    await adapter.resolveSourceDiagram(
      withTwoRootDiagrams,
      "Process_UserTaskMetadata",
    ),
    { kind: "source" },
  );
});

test("source DI resolves a runtime-renamed Process through its exact Collaboration participant", async () => {
  const sourceXml = await readFile(preservedNotationSourcePath, "utf8");
  const runtimeProcessId = "Process_Runtime_Review_42";
  const runtimeSource = sourceXml.replaceAll(
    "Process_SequentialUserTask",
    runtimeProcessId,
  );
  const adapter = new BpmnAutoLayoutPresentationAdapter();

  assert.deepEqual(
    await adapter.resolveSourceDiagram(runtimeSource, runtimeProcessId),
    { kind: "source" },
  );
  await assert.rejects(
    adapter.generate(runtimeSource, runtimeProcessId),
    /Collaborations/u,
  );

  const foreignProcess = runtimeSource
    .replace(
      `<bpmn:process id="${runtimeProcessId}"`,
      `<bpmn:process id="Process_Foreign" isExecutable="true"/>\n  <bpmn:process id="${runtimeProcessId}"`,
    )
    .replace(
      `processRef="${runtimeProcessId}"`,
      'processRef="Process_Foreign"',
    );
  assert.equal(
    (await adapter.resolveSourceDiagram(foreignProcess, runtimeProcessId)).kind,
    "unusable",
  );

  const duplicateParticipant = runtimeSource.replace(
    '<bpmn:participant id="Participant_Reviewers" name="Reviewers"',
    `<bpmn:participant id="Participant_Duplicate" processRef="${runtimeProcessId}"/>\n    <bpmn:participant id="Participant_Reviewers" name="Reviewers"`,
  );
  const duplicateResolution = await adapter.resolveSourceDiagram(
    duplicateParticipant,
    runtimeProcessId,
  );
  assert.equal(duplicateResolution.kind, "unusable");
  if (duplicateResolution.kind === "unusable") {
    assert.match(duplicateResolution.evidence, /exactly one Participant/u);
  }

  const withoutParticipantShape = runtimeSource.replace(
    /\s*<bpmndi:BPMNShape id="Participant_Reviewers_di"[\s\S]*?<\/bpmndi:BPMNShape>/u,
    "",
  );
  const missingShapeResolution = await adapter.resolveSourceDiagram(
    withoutParticipantShape,
    runtimeProcessId,
  );
  assert.equal(missingShapeResolution.kind, "unusable");
  if (missingShapeResolution.kind === "unusable") {
    assert.match(missingShapeResolution.evidence, /Participant.*BPMNShape/u);
  }

  const withSecondCandidatePlane = runtimeSource.replace(
    "</bpmn:definitions>",
    [
      '<bpmndi:BPMNDiagram id="BPMNDiagram_Direct">',
      `<bpmndi:BPMNPlane id="BPMNPlane_Direct" bpmnElement="${runtimeProcessId}"/>`,
      "</bpmndi:BPMNDiagram>",
      "</bpmn:definitions>",
    ].join(""),
  );
  assert.equal(
    (await adapter.resolveSourceDiagram(withSecondCandidatePlane, runtimeProcessId)).kind,
    "unusable",
  );
});

test("reports existing incomplete DI as unusable and never generates over it", async () => {
  const sourceXml = await readFile(metadataSourcePath, "utf8");
  const incompleteDi = [
    '<bpmndi:BPMNDiagram xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
    ' xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
    ' xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Diagram_1">',
    '<bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_UserTaskMetadata" />',
    "</bpmndi:BPMNDiagram>",
  ].join("");
  const withIncompleteDi = sourceXml.replace(
    "</bpmn:definitions>",
    `${incompleteDi}</bpmn:definitions>`,
  );
  const adapter = new BpmnAutoLayoutPresentationAdapter();

  const resolution = await adapter.resolveSourceDiagram(
    withIncompleteDi,
    "Process_UserTaskMetadata",
  );
  assert.equal(resolution.kind, "unusable");
  await assert.rejects(
    adapter.generate(withIncompleteDi, "Process_UserTaskMetadata"),
    /source BPMN DI is unusable/u,
  );
});

test("fails closed for every construct outside the generated-layout slice", async () => {
  const sourceXml = await readFile(metadataSourcePath, "utf8");
  const adapter = new BpmnAutoLayoutPresentationAdapter();
  const excludedProcessContent = [
    '<bpmn:callActivity id="Unsupported_Call" />',
    '<bpmn:subProcess id="Unsupported_SubProcess" />',
    '<bpmn:group id="Unsupported_Group" />',
    '<bpmn:textAnnotation id="Unsupported_Annotation"><bpmn:text>note</bpmn:text></bpmn:textAnnotation>',
    '<bpmn:association id="Unsupported_Association" sourceRef="StartEvent_1" targetRef="UserTask_Approve" />',
    '<bpmn:dataObject id="Unsupported_Data" />',
  ];

  for (const excluded of excludedProcessContent) {
    await assert.rejects(
      adapter.generate(insertBeforeProcessEnd(sourceXml, `    ${excluded}`), "Process_UserTaskMetadata"),
      /does not support/u,
      excluded,
    );
  }

  const collaboration = sourceXml.replace(
    "</bpmn:definitions>",
    '  <bpmn:collaboration id="Unsupported_Collaboration" />\n</bpmn:definitions>',
  );
  await assert.rejects(
    adapter.generate(collaboration, "Process_UserTaskMetadata"),
    /Collaborations/u,
  );
});

test("rejects non-self-contained generated DI and terminates a genuinely stalled worker", async () => {
  const sourceXml = await readFile(metadataSourcePath, "utf8");
  const adapter = new BpmnAutoLayoutPresentationAdapter();
  const generated = await adapter.generate(
    sourceXml,
    "Process_UserTaskMetadata",
  );
  const unbound = generated.diagramInterchangeXml.replace(
    / xmlns:bpmndi="[^"]+"/u,
    "",
  );

  await assert.rejects(
    adapter.validateGeneratedComposition(
      sourceXml,
      "Process_UserTaskMetadata",
      unbound,
    ),
    /namespace/u,
  );
  const startedAt = performance.now();
  await assert.rejects(
    runLayoutWorker(
      sourceXml,
      20,
      4_194_304,
      new URL("./stalled-worker.ts", import.meta.url),
    ),
    /deadline/u,
  );
  assert.ok(performance.now() - startedAt < 1_000);
});
