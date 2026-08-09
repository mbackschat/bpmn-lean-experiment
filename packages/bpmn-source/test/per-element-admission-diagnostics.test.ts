/**
 * Per-element admission diagnostics: a rejected source must tell its author which elements failed.
 *
 * The contract under test is D3 of [the preserve-only admission
 * proposal](../../../docs/PRESERVE-ONLY-ADMISSION-SPEC.md). Its oracle is the registered
 * preserve-enabled fixture perturbed at one point per case, so a diagnostic here is attributable to
 * the named construct rather than to some other difference between two separately authored files.
 *
 * The claim is bounded to the **classification** lane — which parsed material is executed, preserved,
 * or rejected — exactly as D3 scopes it. Structural rejections stated over the checked graph rather
 * than over the parsed tree, such as arity and connectivity, keep a document-level diagnostic and
 * carry no element; those cases are not about one element and naming one would be a false location.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnAdmissionCapability,
  BpmnCompilationStatus,
  BpmnSourceDiagnosticCode,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  BpmnCompilationResult,
  BpmnSourceDiagnostic,
} from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const preservedNotationSource = new URL(
  "../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const mappedSuccessSource = new URL(
  "../../../scenarios/mapped-success-service-task/process.bpmn",
  import.meta.url,
);
const mappedBoundaryErrorSource = new URL(
  "../../../scenarios/mapped-boundary-error-service-task/process.bpmn",
  import.meta.url,
);
const callActivitySource = new URL(
  "./fixtures/call-activity-called-process.bpmn",
  import.meta.url,
);
const embeddedSubProcessSource = new URL(
  "../../../scenarios/embedded-subprocess-completion/process.bpmn",
  import.meta.url,
);

type CompilationCase = Readonly<{
  id: string;
  source: URL;
  sourceId: string;
  semanticProfile: string;
  perturb?: (source: string) => string;
}>;

const baselineCases = [
  {
    id: "generic-accepted",
    source: preservedNotationSource,
    sourceId: "preserved-notation-diagnostics",
    semanticProfile: SemanticProfileId.UserTaskPreservedNotation,
  },
  {
    id: "mapped-success-accepted",
    source: mappedSuccessSource,
    sourceId: "mapped-success-service-task",
    semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
  },
  {
    id: "mapped-boundary-error-accepted",
    source: mappedBoundaryErrorSource,
    sourceId: "mapped-boundary-error-service-task",
    semanticProfile: SemanticProfileId.MappedBoundaryErrorServiceTask,
  },
  {
    id: "call-activity-accepted",
    source: callActivitySource,
    sourceId: "call-activity-test",
    semanticProfile: SemanticProfileId.CalledProcessCallActivity,
  },
  {
    id: "boundary-error-cancel-activity-false",
    source: mappedBoundaryErrorSource,
    sourceId: "mapped-boundary-error-service-task-cancel-activity-false",
    semanticProfile: SemanticProfileId.MappedBoundaryErrorServiceTask,
    perturb: (source: string) => source.replace(
      'attachedToRef="MappedBoundaryEffectTask"',
      'attachedToRef="MappedBoundaryEffectTask" cancelActivity="false"',
    ),
  },
  {
    id: "call-activity-unqualified-called-element",
    source: callActivitySource,
    sourceId: "call-activity-unqualified-called-element",
    semanticProfile: SemanticProfileId.CalledProcessCallActivity,
    perturb: (source: string) => source.replace(
      'calledElement="tns:CalledProcess"',
      'calledElement="CalledProcess"',
    ),
  },
  {
    id: "mapped-success-extra-input-parameter",
    source: mappedSuccessSource,
    sourceId: "mapped-success-extra-input-parameter",
    semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
    perturb: (source: string) => source.replace(
      "</camunda:inputOutput>",
      '<camunda:inputParameter name="extra">value</camunda:inputParameter></camunda:inputOutput>',
    ),
  },
  {
    id: "generic-checked-graph-refusal",
    source: preservedNotationSource,
    sourceId: "generic-checked-graph-refusal",
    semanticProfile: SemanticProfileId.UserTaskPreservedNotation,
    perturb: (source: string) => source.replace(
      "<bpmn:userTask",
      '<bpmn:startEvent id="StartEvent_2"><bpmn:outgoing>Flow_SecondStart</bpmn:outgoing></bpmn:startEvent>' +
        '<bpmn:sequenceFlow id="Flow_SecondStart" sourceRef="StartEvent_2" targetRef="UserTask_Approve"/><bpmn:userTask',
    ),
  },
] as const satisfies ReadonlyArray<CompilationCase>;

async function compilePerturbed(
  perturb: (admitted: string) => string,
): Promise<BpmnCompilationResult> {
  const admitted = await readFile(preservedNotationSource, "utf8");
  const perturbed = perturb(admitted);
  assert.notEqual(perturbed, admitted, "the perturbation matched nothing in the fixture");
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(perturbed),
    sourceId: "preserved-notation-diagnostics",
    expectedSha256: undefined,
    semanticProfile: SemanticProfileId.UserTaskPreservedNotation,
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });
}

async function rejectionDiagnostics(
  perturb: (admitted: string) => string,
): Promise<ReadonlyArray<BpmnSourceDiagnostic>> {
  const rejected = await compilePerturbed(perturb);
  assert.equal(
    rejected.status,
    BpmnCompilationStatus.Rejected,
    "the perturbation was admitted, so the diagnostics below would be vacuous",
  );
  return rejected.diagnostics;
}

async function compileCase(entry: CompilationCase): Promise<BpmnCompilationResult> {
  const original = await readFile(entry.source, "utf8");
  const source = entry.perturb === undefined ? original : entry.perturb(original);
  if (entry.perturb !== undefined) {
    assert.notEqual(source, original, `baseline perturbation matched nothing: ${entry.id}`);
  }
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(source),
    sourceId: entry.sourceId,
    expectedSha256: undefined,
    semanticProfile: entry.semanticProfile,
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });
}

const locatedPropertyCases = [
  {
    ...baselineCases[0],
    marker: "<bpmn:outgoing>Flow_StartToTask</bpmn:outgoing>",
    id: "StartEvent_1",
    path: "definitions/rootElements[1]/flowElements[0]",
  },
  {
    ...baselineCases[1],
    marker: "<bpmn:outgoing>Flow_StartToMappedSuccess</bpmn:outgoing>",
    id: "StartEvent_MappedSuccess",
    path: "definitions/rootElements[0]/flowElements[0]",
  },
  {
    ...baselineCases[2],
    marker: "<bpmn:outgoing>Flow_StartToMappedBoundaryEffect</bpmn:outgoing>",
    id: "StartEvent_MappedBoundaryError",
    path: "definitions/rootElements[1]/flowElements[0]",
  },
  {
    ...baselineCases[3],
    marker: "<bpmn:outgoing>Flow_Caller_Start_Call</bpmn:outgoing>",
    id: "CallerStart",
    path: "definitions/rootElements[0]/flowElements[0]",
  },
] as const;

test("locates an unsupported own property in every compiler dispatch", async () => {
  for (const entry of locatedPropertyCases) {
    const result = await compileCase({
      ...entry,
      perturb: (source) => source.replace(
        entry.marker,
        `${entry.marker}<bpmn:extensionElements/>`,
      ),
    });
    assert.deepEqual(result.diagnostics, [{
      code: BpmnSourceDiagnosticCode.UnsupportedProperty,
      element: {
        id: entry.id,
        type: "bpmn:StartEvent",
        containmentPath: entry.path,
        subject: "extensionElements",
        requiredCapability: BpmnAdmissionCapability.PreserveProperty,
      },
      evidence: `bpmn:StartEvent at ${entry.path} carries property extensionElements, which the selected profile neither executes nor preserves.`,
    }], entry.id);
    assert.equal(result.checkedProcess, undefined);
    assert.equal(result.semanticProcess, undefined);
  }
});

test("classifies an embedded Sub-Process property before its shape gate", async () => {
  const original = await readFile(embeddedSubProcessSource, "utf8");
  const source = original.replace(
    '<bpmn:subProcess id="SubProcess_Work">',
    '<bpmn:subProcess id="SubProcess_Work"><bpmn:extensionElements/>',
  );
  assert.notEqual(source, original);
  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(source),
    sourceId: "embedded-subprocess-property-diagnostics",
    expectedSha256: undefined,
    semanticProfile: "cibseven-2.2.0-embedded-subprocess-completion-draft",
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });

  assert.deepEqual(result.diagnostics, [{
    code: BpmnSourceDiagnosticCode.UnsupportedProperty,
    element: {
      id: "SubProcess_Work",
      type: "bpmn:SubProcess",
      containmentPath: "definitions/rootElements[0]/flowElements[1]",
      subject: "extensionElements",
      requiredCapability: BpmnAdmissionCapability.PreserveProperty,
    },
    evidence: "bpmn:SubProcess at definitions/rootElements[0]/flowElements[1] carries property extensionElements, which the selected profile neither executes nor preserves.",
  }]);
  assert.equal(result.checkedProcess, undefined);
  assert.equal(result.semanticProcess, undefined);
});

const scriptTask = (id: string) => `<bpmn:scriptTask id="${id}" name="Compute"/>`;

test("names the unsupported executable node rather than the preserved notation", async () => {
  const diagnostics = await rejectionDiagnostics((admitted) =>
    admitted.replace("<bpmn:textAnnotation", `${scriptTask("ScriptTask_1")}<bpmn:textAnnotation`)
  );

  assert.deepEqual(
    diagnostics.map(({ code, element }) => ({
      code,
      id: element?.id,
      type: element?.type,
      subject: element?.subject,
      requiredCapability: element?.requiredCapability,
    })),
    [
      {
        code: BpmnSourceDiagnosticCode.UnsupportedElementType,
        id: "ScriptTask_1",
        type: "bpmn:ScriptTask",
        subject: null,
        requiredCapability: BpmnAdmissionCapability.ExecuteElementType,
      },
    ],
  );
  // The whole point of preserve-only admission is that the modeler's Diagram Interchange is not the
  // complaint. A diagnostic set that also named the DI would be the pre-classifier behavior wearing a
  // per-element shape.
  assert.equal(
    diagnostics.some(({ element }) => element?.type?.startsWith("bpmndi:") === true),
    false,
  );
});

test("locates a rejected element that carries no id", async () => {
  const diagnostics = await rejectionDiagnostics((admitted) =>
    admitted.replace("<bpmn:textAnnotation", "<bpmn:scriptTask/><bpmn:textAnnotation")
  );

  const [only] = diagnostics;
  assert.equal(diagnostics.length, 1);
  assert.equal(only?.element?.id, null, "Semantic.xsd declares id optional, so this must be null");
  assert.equal(only?.element?.type, "bpmn:ScriptTask");
  assert.match(
    only?.element?.containmentPath ?? "",
    /^definitions\/rootElements\[\d+\]\/flowElements\[\d+\]$/u,
    "an element with no id is locatable only by containment, so the path must resolve it",
  );
});

test("enumerates every rejected element rather than the first", async () => {
  const diagnostics = await rejectionDiagnostics((admitted) =>
    admitted.replace(
      "<bpmn:textAnnotation",
      `${scriptTask("ScriptTask_1")}${scriptTask("ScriptTask_2")}${scriptTask("ScriptTask_3")}<bpmn:textAnnotation`,
    )
  );

  assert.deepEqual(
    diagnostics.map(({ element }) => element?.id),
    ["ScriptTask_1", "ScriptTask_2", "ScriptTask_3"],
  );
});

test("collects classification results across loci, not only within one gate", async () => {
  const diagnostics = await rejectionDiagnostics((admitted) =>
    admitted
      .replace("<bpmn:textAnnotation", `${scriptTask("ScriptTask_1")}<bpmn:textAnnotation`)
      .replace(
        '<bpmndi:BPMNShape id="StartEvent_1_di"',
        '<bpmndi:BPMNShape xmlns:camunda="http://camunda.org/schema/1.0/bpmn"' +
          ' camunda:candidateGroups="managers" id="StartEvent_1_di"',
      )
  );

  assert.deepEqual(
    [...new Set(diagnostics.map(({ code }) => code))].sort(),
    [
      BpmnSourceDiagnosticCode.UnconsumedForeignAttribute,
      BpmnSourceDiagnosticCode.UnsupportedElementType,
    ].sort(),
    "an author fixing one locus must not have to recompile to discover the next",
  );
});

test("normalizes each parser warning into its own record", async () => {
  const diagnostics = await rejectionDiagnostics((admitted) =>
    admitted
      .replace('bpmnElement="StartEvent_1"', 'bpmnElement="Missing_1"')
      .replace('bpmnElement="UserTask_Approve"', 'bpmnElement="Missing_2"')
      .replace('bpmnElement="EndEvent_1"', 'bpmnElement="Missing_3"')
      .replace('bpmnElement="TextAnnotation_1"', 'bpmnElement="Missing_4"')
  );

  assert.equal(
    diagnostics.length,
    4,
    "a file with four malformed constructs must tell its author about four",
  );
  assert.deepEqual(
    diagnostics.map(({ code, element }) => ({
      code,
      id: element?.id,
      subject: element?.subject,
    })),
    [
      "StartEvent_1_di",
      "UserTask_Approve_di",
      "EndEvent_1_di",
      "TextAnnotation_1_di",
    ].map((id) => ({
      code: BpmnSourceDiagnosticCode.ParserWarning,
      id,
      subject: "bpmnElement",
    })),
    "the parser reports the referring element, so a normalized warning must carry it",
  );
});

test("names the foreign attribute the profile does not consume", async () => {
  const diagnostics = await rejectionDiagnostics((admitted) =>
    admitted.replace(
      '<bpmndi:BPMNShape id="StartEvent_1_di"',
      '<bpmndi:BPMNShape xmlns:camunda="http://camunda.org/schema/1.0/bpmn"' +
        ' camunda:candidateGroups="managers" id="StartEvent_1_di"',
    )
  );

  assert.deepEqual(
    diagnostics.map(({ code, element }) => ({
      code,
      id: element?.id,
      subject: element?.subject,
      requiredCapability: element?.requiredCapability,
    })),
    [
      {
        code: BpmnSourceDiagnosticCode.UnconsumedForeignAttribute,
        id: "StartEvent_1_di",
        subject: "camunda:candidateGroups",
        requiredCapability: BpmnAdmissionCapability.ConsumeForeignAttribute,
      },
    ],
  );
});

test("names the reference property whose target is the wrong type", async () => {
  const diagnostics = await rejectionDiagnostics((admitted) =>
    admitted.replace(
      '<bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">',
      '<bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="BPMNPlane_1">',
    )
  );

  assert.deepEqual(
    diagnostics.map(({ code, element }) => ({
      code,
      id: element?.id,
      subject: element?.subject,
      requiredCapability: element?.requiredCapability,
    })),
    [
      {
        code: BpmnSourceDiagnosticCode.ReferenceTargetTypeMismatch,
        id: "StartEvent_1_di",
        subject: "bpmnElement",
        // No capability admits a reference to the wrong kind of element: the source is malformed
        // rather than beyond this profile, so widening the profile would not help its author.
        requiredCapability: null,
      },
    ],
  );
});

test("names the own property the profile neither executes nor preserves", async () => {
  const diagnostics = await rejectionDiagnostics((admitted) =>
    admitted.replace(
      "<bpmn:documentation>Approval of one incoming request.</bpmn:documentation>",
      "<bpmn:extensionElements/>",
    )
  );

  assert.deepEqual(
    diagnostics.map(({ code, element }) => ({
      code,
      id: element?.id,
      type: element?.type,
      subject: element?.subject,
      requiredCapability: element?.requiredCapability,
    })),
    [
      {
        code: BpmnSourceDiagnosticCode.UnsupportedProperty,
        id: "Process_SequentialUserTask",
        type: "bpmn:Process",
        subject: "extensionElements",
        requiredCapability: BpmnAdmissionCapability.PreserveProperty,
      },
    ],
  );
});

/**
 * Eight refused siblings, which is enough for the index to reach two digits.
 *
 * The fixture's Process already declares five flow elements, so these occupy `flowElements[5]`
 * through `[12]`. That range is the discriminator: comparing the rendered paths as text would order
 * `flowElements[10]` before `flowElements[5]`, so a defined ordering has to compare array indices as
 * numbers. Fewer siblings would leave the two orderings indistinguishable.
 */
const eightRefusedSiblings = Array.from(
  { length: 8 },
  (_, index) => scriptTask(`ScriptTask_${index}`),
).join("");

test("orders by containment path with array indices compared as numbers", async () => {
  const diagnostics = await rejectionDiagnostics((admitted) =>
    admitted.replace("<bpmn:textAnnotation", `${eightRefusedSiblings}<bpmn:textAnnotation`)
  );

  assert.deepEqual(
    diagnostics.map(({ element }) => element?.containmentPath),
    Array.from(
      { length: 8 },
      (_, index) => `definitions/rootElements[1]/flowElements[${index + 5}]`,
    ),
  );
});

test("reports the same list for the same bytes, ordered and deduplicated", async () => {
  // Two different classification rules at two loci. The reference-target rule is deliberately absent
  // from this fixture: it decides a malformed source rather than a profile boundary, so it blocks
  // above the dispatch beside the parser warnings and is never collected with classification records.
  const perturb = (admitted: string): string =>
    admitted
      .replace("<bpmn:textAnnotation", `${scriptTask("ScriptTask_2")}<bpmn:textAnnotation`)
      .replace("<bpmn:startEvent", `${scriptTask("ScriptTask_1")}<bpmn:startEvent`)
      .replace(
        '<bpmndi:BPMNShape id="StartEvent_1_di"',
        '<bpmndi:BPMNShape xmlns:camunda="http://camunda.org/schema/1.0/bpmn"' +
          ' camunda:candidateGroups="managers" id="StartEvent_1_di"',
      );

  const [first, second] = await Promise.all([
    rejectionDiagnostics(perturb),
    rejectionDiagnostics(perturb),
  ]);

  assert.deepEqual(first, second, "an identical source must yield an identical, storable list");
  // The ordering is by containment path, not by position in the file: `diagrams` precedes
  // `rootElements` because the property names compare that way. That is the property the contract
  // states, and it is what makes two stored lists comparable no matter which rule produced a record.
  assert.deepEqual(
    first.map(({ code, element }) => [
      code,
      element?.containmentPath,
      element?.subject,
    ]),
    [
      [
        BpmnSourceDiagnosticCode.UnconsumedForeignAttribute,
        "definitions/diagrams[0]/plane/planeElement[2]",
        "camunda:candidateGroups",
      ],
      [
        BpmnSourceDiagnosticCode.UnsupportedElementType,
        "definitions/rootElements[1]/flowElements[0]",
        null,
      ],
      [
        BpmnSourceDiagnosticCode.UnsupportedElementType,
        "definitions/rootElements[1]/flowElements[6]",
        null,
      ],
    ],
  );
});

/**
 * The rejections stated over the checked graph keep a document-level diagnostic.
 *
 * A second Start Event flowing into the same User Task is a graph every element of which the profile
 * executes: each type is supported, every reference resolves, and the refusal is about the shape of
 * the whole — two start nodes, and a task with two incoming Flows. Naming an element there would be
 * a location the compiler cannot justify, so this case pins the boundary of the per-element claim
 * rather than asserting the absence of a feature.
 */
test("carries no element on a rejection stated over the checked graph", async () => {
  const diagnostics = await rejectionDiagnostics((admitted) =>
    admitted.replace(
      "<bpmn:userTask",
      '<bpmn:startEvent id="StartEvent_2">' +
        "<bpmn:outgoing>Flow_SecondStart</bpmn:outgoing></bpmn:startEvent>" +
        '<bpmn:sequenceFlow id="Flow_SecondStart" sourceRef="StartEvent_2"' +
        ' targetRef="UserTask_Approve"/><bpmn:userTask',
    )
  );

  assert.deepEqual(
    diagnostics.map(({ code, element }) => ({ code, element })),
    [
      {
        code: BpmnSourceDiagnosticCode.UnsupportedModel,
        element: null,
      },
    ],
  );
});

test("carries no element on a document-level rejection", async () => {
  const rejected = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode("<not-bpmn/>"),
    sourceId: "preserved-notation-diagnostics",
    expectedSha256: undefined,
    semanticProfile: SemanticProfileId.UserTaskPreservedNotation,
    sourceOverlay: null,
    limits: { maxBytes: 4, parserDeadlineMs: semanticProcessTestLimits.parserDeadlineMs },
  });

  assert.equal(rejected.status, BpmnCompilationStatus.Rejected);
  assert.deepEqual(
    rejected.diagnostics.map(({ code, element }) => ({ code, element })),
    [{ code: BpmnSourceDiagnosticCode.SourceTooLarge, element: null }],
  );
});
