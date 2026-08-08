/**
 * Preserve-only admission: material the compiler retains without executing must not change execution.
 *
 * The contract under test is [the preserve-only admission proposal](../../../docs/PRESERVE-ONLY-ADMISSION-PROPOSAL.md).
 * Its oracle is the pair of registered sources below: `user-task-discovery-completion` carries no
 * notation and is admitted by the executed-only profile, and `user-task-preserved-notation` is the
 * same Process with a modeler's pool, lane, documentation, artifacts, and Diagram Interchange added.
 * The preserve-enabled profile must admit the second and reach the checked graph the first reaches.
 *
 * Equality is asserted on the execution projection, not on the checked graph, because
 * `CheckedProcessIdentity` carries `sourceSha256` and the two sources are different bytes by
 * construction. Digest fidelity is therefore asserted separately, so normalizing identity for the
 * comparison does not quietly stop anyone from checking it.
 *
 * The twin is a tracked hand-written source that predates the classifier rather than a stripped copy
 * the classifier produced, so agreement here is evidence about the classifier and not a restatement
 * of it.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type { BpmnCompilationResult } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";
import type { CheckedProcess } from "@bpmn-lean/semantic-core";

import {
  findModdleElement,
  importCompiledBpmnGraph,
  moddleElement,
  moddleElements,
} from "./compiled-moddle-graph.ts";
import type { ModdleElement } from "./compiled-moddle-graph.ts";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";
import type {
  PreservationCapability,
} from "../src/preserved-element-classification.ts";

type CompiledClassifier = Readonly<{
  preservedSubtreeRejections: (
    element: ModdleElement,
    locus: Readonly<{ segments: ReadonlyArray<string | number> }>,
    capability: PreservationCapability,
  ) => ReadonlyArray<unknown>;
  preservationCapability: (
    semanticProfile: string,
  ) => PreservationCapability | undefined;
}>;

/** Any locus: these cases read whether the subtree is preserved, never where a refusal landed. */
const anyLocus = { segments: ["definitions"] } as const;

/**
 * The classifier as built JavaScript, for the seeded-defect check only.
 *
 * The classifier is package-internal and stays that way: no consumer outside `@bpmn-lean/bpmn-source`
 * may reach it. The specifier is non-literal for the same reason [the compiled moddle
 * graph](./compiled-moddle-graph.ts) uses one — the repository-wide no-emit gate must not depend on
 * build output.
 */
async function importCompiledClassifier(): Promise<CompiledClassifier> {
  const specifier = new URL(
    "../dist/preserved-element-classification.js",
    import.meta.url,
  ).href;
  const loaded: unknown = await import(specifier);
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    !("preservedSubtreeRejections" in loaded) ||
    typeof loaded.preservedSubtreeRejections !== "function" ||
    !("preservationCapability" in loaded) ||
    typeof loaded.preservationCapability !== "function"
  ) {
    throw new TypeError("the compiled classifier does not export its contract");
  }
  return loaded as CompiledClassifier;
}

const preservedNotationSource = new URL(
  "../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const executedOnlyTwin = new URL(
  "../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);

async function compile(
  source: URL,
  sourceId: string,
  semanticProfile: string,
): Promise<BpmnCompilationResult> {
  return compileBpmnToSemanticProcess({
    bytes: await readFile(source),
    sourceId,
    expectedSha256: undefined,
    semanticProfile,
    limits: semanticProcessTestLimits,
  });
}

/** The checked graph with exact-source identity normalized away, and nothing else normalized. */
function executionProjection(
  checkedProcess: CheckedProcess,
): Omit<CheckedProcess, "identity"> & Readonly<{ semanticProfile: string }> {
  const { identity, ...execution } = checkedProcess;
  return { ...execution, semanticProfile: identity.semanticProfile };
}

test("admits a modeler's Diagram Interchange under the preserve-enabled profile", async () => {
  const admitted = await compile(
    preservedNotationSource,
    "preserved-notation-user-task",
    SemanticProfileId.UserTaskPreservedNotation,
  );

  assert.equal(
    admitted.status,
    BpmnCompilationStatus.Accepted,
    `preserved notation was rejected: ${JSON.stringify(admitted.diagnostics)}`,
  );
});

test("reaches the executed-only twin's execution projection", async () => {
  const [preserved, executedOnly] = await Promise.all([
    compile(
      preservedNotationSource,
      "preserved-notation-user-task",
      SemanticProfileId.UserTaskPreservedNotation,
    ),
    compile(
      executedOnlyTwin,
      "sequential-user-task-process",
      SemanticProfileId.UserTask,
    ),
  ]);
  assert.equal(preserved.status, BpmnCompilationStatus.Accepted);
  assert.equal(executedOnly.status, BpmnCompilationStatus.Accepted);
  assert.ok(preserved.checkedProcess !== undefined);
  assert.ok(executedOnly.checkedProcess !== undefined);

  const { semanticProfile: _preservedProfile, ...preservedExecution } =
    executionProjection(preserved.checkedProcess);
  const { semanticProfile: _executedProfile, ...executedExecution } =
    executionProjection(executedOnly.checkedProcess);
  assert.deepEqual(preservedExecution, executedExecution);

  assert.notEqual(
    preserved.checkedProcess.identity.sourceSha256,
    executedOnly.checkedProcess.identity.sourceSha256,
    "the two sources must retain distinct digests, or the comparison has nothing to normalize",
  );
});

test("lowers the preserved source to the executed-only twin's program", async () => {
  const [preserved, executedOnly] = await Promise.all([
    compile(
      preservedNotationSource,
      "preserved-notation-user-task",
      SemanticProfileId.UserTaskPreservedNotation,
    ),
    compile(
      executedOnlyTwin,
      "sequential-user-task-process",
      SemanticProfileId.UserTask,
    ),
  ]);
  assert.ok(preserved.semanticProcess !== undefined);
  assert.ok(executedOnly.semanticProcess !== undefined);

  // Projection equality does not imply program equality: lowering reads the checked graph, so a
  // defect between them would survive a checked-graph-only comparison. Identity is normalized here
  // for the same reason it is normalized above — the program carries the source digest too.
  const { identity: _preservedIdentity, ...preservedProgram } =
    preserved.semanticProcess;
  const { identity: _executedIdentity, ...executedProgram } =
    executedOnly.semanticProcess;
  assert.deepEqual(preservedProgram, executedProgram);
});

/**
 * BPMN declares `documentation` on `BaseElement`, so every executed node is a valid locus for it.
 *
 * Retaining it only on `Definitions` and `Process` would be a narrower account than the profile
 * advertises, and would reject the ordinary case of a modeler documenting a task. The retained text
 * must reach neither the checked graph nor the program, which the execution projection below asserts
 * against the same executed-only twin the notation-free comparison uses.
 */
const documentedLoci: ReadonlyArray<Readonly<{ name: string; find: string }>> = [
  { name: "a User Task", find: '<bpmn:userTask id="UserTask_Approve" name="Approve">' },
  { name: "a Start Event", find: '<bpmn:startEvent id="StartEvent_1">' },
  {
    name: "a Sequence Flow",
    find: '<bpmn:sequenceFlow id="Flow_StartToTask" sourceRef="StartEvent_1" targetRef="UserTask_Approve"/>',
  },
];

for (const { name, find } of documentedLoci) {
  test(`retains documentation on ${name} without executing it`, async () => {
    const admitted = await readFile(preservedNotationSource, "utf8");
    assert.ok(admitted.includes(find), `the fixture no longer contains ${find}`);
    const documented = find.endsWith("/>")
      ? admitted.replace(
          find,
          `${find.slice(0, -2)}><bpmn:documentation>Documented.</bpmn:documentation></bpmn:sequenceFlow>`,
        )
      : admitted.replace(find, `${find}<bpmn:documentation>Documented.</bpmn:documentation>`);

    const [preserved, executedOnly] = await Promise.all([
      compileBpmnToSemanticProcess({
        bytes: new TextEncoder().encode(documented),
        sourceId: "preserved-notation-documented",
        expectedSha256: undefined,
        semanticProfile: SemanticProfileId.UserTaskPreservedNotation,
        limits: semanticProcessTestLimits,
      }),
      compile(
        executedOnlyTwin,
        "sequential-user-task-process",
        SemanticProfileId.UserTask,
      ),
    ]);

    assert.equal(
      preserved.status,
      BpmnCompilationStatus.Accepted,
      `documentation was rejected: ${JSON.stringify(preserved.diagnostics)}`,
    );
    assert.ok(preserved.checkedProcess !== undefined);
    assert.ok(executedOnly.checkedProcess !== undefined);
    const { semanticProfile: _documented, ...documentedExecution } =
      executionProjection(preserved.checkedProcess);
    const { semanticProfile: _twin, ...twinExecution } = executionProjection(
      executedOnly.checkedProcess,
    );
    assert.deepEqual(documentedExecution, twinExecution);
  });
}

/**
 * Preserved types the registered fixture happens not to contain, one case each.
 *
 * The fixture carries Diagram Interchange, a Collaboration with one Participant, a Lane Set, an
 * Association, a Text Annotation, and Documentation, so the admission case above evidences those.
 * `MessageFlow`, `Group`, `BPMNLabelStyle`, and the `Font` it contains sit in the same preserved set
 * with nothing behind them, which is a capability the profile asserts rather than one it shows. Each
 * case asserts both halves of preservation at once: the source is admitted, and it still reaches the
 * executed-only twin's execution projection, so admission did not come from executing the construct.
 */
const admittedPerturbations: ReadonlyArray<
  Readonly<{ name: string; find: string; replace: string }>
> = [
  {
    name: "a message flow between two participants",
    find: "</bpmn:collaboration>",
    replace:
      '<bpmn:participant id="Participant_Requester" name="Requester"/>' +
      '<bpmn:messageFlow id="MessageFlow_1" sourceRef="Participant_Requester"' +
      ' targetRef="Participant_Reviewers"/></bpmn:collaboration>',
  },
  {
    name: "a group artifact",
    find: "<bpmn:textAnnotation",
    replace: '<bpmn:group id="Group_1"/><bpmn:textAnnotation',
  },
  {
    name: "a label style carrying a font",
    find: "</bpmndi:BPMNDiagram>",
    replace:
      '<bpmndi:BPMNLabelStyle id="BPMNLabelStyle_1">' +
      '<dc:Font name="Arial" size="8"/></bpmndi:BPMNLabelStyle></bpmndi:BPMNDiagram>',
  },
];

for (const { name, find, replace } of admittedPerturbations) {
  test(`retains ${name} without executing it`, async () => {
    const admitted = await readFile(preservedNotationSource, "utf8");
    assert.ok(admitted.includes(find), `the fixture no longer contains ${find}`);

    const [preserved, executedOnly] = await Promise.all([
      compileBpmnToSemanticProcess({
        bytes: new TextEncoder().encode(admitted.replace(find, replace)),
        sourceId: "preserved-notation-admitted-perturbation",
        expectedSha256: undefined,
        semanticProfile: SemanticProfileId.UserTaskPreservedNotation,
        limits: semanticProcessTestLimits,
      }),
      compile(
        executedOnlyTwin,
        "sequential-user-task-process",
        SemanticProfileId.UserTask,
      ),
    ]);

    assert.equal(
      preserved.status,
      BpmnCompilationStatus.Accepted,
      `${name} was rejected: ${JSON.stringify(preserved.diagnostics)}`,
    );
    assert.ok(preserved.checkedProcess !== undefined);
    assert.ok(executedOnly.checkedProcess !== undefined);
    const { semanticProfile: _preserved, ...preservedExecution } =
      executionProjection(preserved.checkedProcess);
    const { semanticProfile: _twin, ...twinExecution } = executionProjection(
      executedOnly.checkedProcess,
    );
    assert.deepEqual(preservedExecution, twinExecution);
  });
}

/**
 * The classifier must be sensitive to the exact defect it exists to prevent.
 *
 * A guard that only checks admitted sources cannot distinguish a correct classifier from one whose
 * preserved set has grown to swallow executable material, because both admit the same fixture. The
 * seeded capability below is that defect: it adds `bpmn:Process` to the preserved types, which is
 * what would let a second executable Process pass as retained notation.
 */
test("rejects a preserved set seeded with an executable type", async () => {
  const admitted = await readFile(preservedNotationSource, "utf8");
  const imported = await importCompiledBpmnGraph(
    admitted.replace(
      "</bpmn:definitions>",
      '<bpmn:process id="Process_Unrelated" isExecutable="true">' +
        '<bpmn:startEvent id="StartEvent_Unrelated"/></bpmn:process></bpmn:definitions>',
    ),
    semanticProcessTestLimits.parserDeadlineMs,
  );
  const secondProcess = findModdleElement(
    moddleElements(moddleElement(imported.rootElement, "definitions"), "rootElements"),
    "id",
    "Process_Unrelated",
  );

  const { preservedSubtreeRejections, preservationCapability } =
    await importCompiledClassifier();
  const honest = preservationCapability(
    SemanticProfileId.UserTaskPreservedNotation,
  );
  assert.ok(honest !== undefined);
  const preserved = (capability: PreservationCapability): boolean =>
    preservedSubtreeRejections(secondProcess, anyLocus, capability).length === 0;

  assert.equal(
    preserved(honest),
    false,
    "an executable Process must never classify as preserved",
  );

  // Seeding the container alone does not leak, and that is the recursive rule doing the work: the
  // Process still contains a Start Event no capability preserves. A flat preserved set would leak
  // here, which is why the rule is stated over the descendant set rather than over the type.
  assert.equal(
    preserved({
      ...honest,
      preservedTypes: new Set([...honest.preservedTypes, "bpmn:Process"]),
    }),
    false,
    "a preserved container must not swallow an unpreserved descendant",
  );

  assert.equal(
    preserved({
      ...honest,
      preservedTypes: new Set([
        ...honest.preservedTypes,
        "bpmn:Process",
        "bpmn:StartEvent",
      ]),
    }),
    true,
    "seeding the whole subtree must actually leak, or the checks above are vacuous",
  );
});

test("keeps the executed-only profile refusing preserved notation", async () => {
  const refused = await compile(
    preservedNotationSource,
    "preserved-notation-user-task",
    SemanticProfileId.UserTask,
  );

  assert.equal(
    refused.status,
    BpmnCompilationStatus.Rejected,
    "widening admission for one profile must not widen it for the executed-only profile",
  );
});

/**
 * Each case perturbs the admitted fixture at one point and must reject.
 *
 * Perturbing the admitted source keeps every other property of the file constant, so a rejection
 * here is attributable to the named construct rather than to some other difference between two
 * separately authored files.
 */
const refusedPerturbations: ReadonlyArray<
  Readonly<{ name: string; find: string; replace: string }>
> = [
  {
    name: "a preserved container holding a descendant that carries execution meaning",
    find: '<bpmn:participant id="Participant_Reviewers" name="Reviewers" processRef="Process_SequentialUserTask"/>',
    replace:
      '<bpmn:participant id="Participant_Reviewers" name="Reviewers" processRef="Process_SequentialUserTask">' +
      '<bpmn:participantMultiplicity minimum="1" maximum="5"/></bpmn:participant>',
  },
  {
    name: "a second executable Process no profile QName binds",
    find: "</bpmn:definitions>",
    replace:
      '<bpmn:process id="Process_Unrelated" isExecutable="true">' +
      '<bpmn:startEvent id="StartEvent_Unrelated"/></bpmn:process></bpmn:definitions>',
  },
  {
    name: "a foreign attribute on a preserved shape",
    find: '<bpmndi:BPMNShape id="StartEvent_1_di"',
    replace:
      '<bpmndi:BPMNShape xmlns:camunda="http://camunda.org/schema/1.0/bpmn"' +
      ' camunda:candidateGroups="managers" id="StartEvent_1_di"',
  },
  {
    name: "a Diagram Interchange reference with no target",
    find: 'bpmnElement="EndEvent_1"',
    replace: 'bpmnElement="NoSuchElement"',
  },
  // A resolvable reference to the wrong kind of element. `bpmn-moddle` resolves an IDREF by identity
  // alone and reports no warning, so before the reference rule all three of these compiled.
  {
    name: "a shape referring to a plane rather than a BPMN element",
    find: '<bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">',
    replace: '<bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="BPMNPlane_1">',
  },
  {
    name: "a participant referring to a User Task rather than a Process",
    find: 'processRef="Process_SequentialUserTask"',
    replace: 'processRef="UserTask_Approve"',
  },
  {
    name: "a lane referring to a Process rather than a flow node",
    find: "<bpmn:flowNodeRef>UserTask_Approve</bpmn:flowNodeRef>",
    replace: "<bpmn:flowNodeRef>Process_SequentialUserTask</bpmn:flowNodeRef>",
  },
  // The complete BPMN data family rejects for M1, declarations and associations alike.
  {
    name: "a Data Object declaration",
    find: "<bpmn:textAnnotation",
    replace:
      '<bpmn:dataObject id="DataObject_1" name="Request"/><bpmn:textAnnotation',
  },
  {
    name: "a Data Object reference",
    find: "<bpmn:textAnnotation",
    replace:
      '<bpmn:dataObjectReference id="DataObjectReference_1" dataObjectRef="DataObject_1"/>' +
      '<bpmn:dataObject id="DataObject_1" name="Request"/><bpmn:textAnnotation',
  },
  {
    name: "a data input association on an executed task",
    find: "<bpmn:incoming>Flow_StartToTask</bpmn:incoming>",
    replace:
      "<bpmn:incoming>Flow_StartToTask</bpmn:incoming>" +
      '<bpmn:dataInputAssociation id="DataInputAssociation_1"/>',
  },
];

for (const { name, find, replace } of refusedPerturbations) {
  test(`refuses ${name}`, async () => {
    const admitted = await readFile(preservedNotationSource, "utf8");
    assert.ok(admitted.includes(find), `the fixture no longer contains ${find}`);

    const refused = await compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(admitted.replace(find, replace)),
      sourceId: "preserved-notation-perturbation",
      expectedSha256: undefined,
      semanticProfile: SemanticProfileId.UserTaskPreservedNotation,
      limits: semanticProcessTestLimits,
    });

    assert.equal(refused.status, BpmnCompilationStatus.Rejected);
  });
}
