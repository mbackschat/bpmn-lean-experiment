/**
 * Foreign attributes on executed elements must reject rather than be discarded.
 *
 * `bpmn-moddle` stores every unrecognized attribute in the non-enumerable `$attrs`, which
 * `Object.keys` does not report. The compiler's exact-key allowlists are built on `Object.keys`, so
 * before this suite a `camunda:assignee` on an admitted User Task compiled successfully and the
 * attribute vanished — the silent-omission failure the package README already claimed not to have.
 *
 * The oracle is the admitted scenario source with one attribute added. Every case below was observed
 * to be admitted before the classifier reached the executed partition, so each is a regression guard
 * for a defect that existed rather than a hypothetical one.
 *
 * The Service Task case is the opposite direction and is why the rule is *unconsumed* foreign
 * attributes rather than all of them: its projector reads exactly two `camunda` attributes and
 * refuses any other count, so those two are consumed evidence rather than discarded content.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  BpmnSourceDiagnosticCode,
  mappedBoundaryErrorServiceTaskProfile,
  mappedSuccessServiceTaskProfile,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import type {
  CompilationDispatchId,
} from "../src/compilation-dispatch.ts";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";
import { asRecord } from "./compilation-result-test-support.ts";

const camundaNamespaceDeclaration =
  'xmlns:camunda="http://camunda.org/schema/1.0/bpmn"';

async function compilePerturbed(
  source: URL,
  semanticProfile: string,
  perturb: (xml: string) => string,
): Promise<BpmnCompilationStatus> {
  const xml = await readFile(source, "utf8");
  const perturbed = perturb(xml);
  assert.notEqual(perturbed, xml, "the perturbation matched nothing");
  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(perturbed),
    sourceId: "foreign-attribute-perturbation",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });
  return result.status;
}

const userTaskSource = new URL(
  "../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);
const serviceTaskSource = new URL(
  "../../../scenarios/service-task-effect/process.bpmn",
  import.meta.url,
);
const callActivitySource = new URL(
  "./fixtures/call-activity-called-process.bpmn",
  import.meta.url,
);

const refusedAttributes: ReadonlyArray<
  Readonly<{ locus: string; find: string; attribute: string }>
> = [
  {
    locus: "a User Task",
    find: '<bpmn:userTask id="UserTask_Approve"',
    attribute: 'camunda:assignee="alice"',
  },
  {
    locus: "the executable Process",
    find: '<bpmn:process id="Process_SequentialUserTask"',
    attribute: 'camunda:historyTimeToLive="P1D"',
  },
  {
    locus: "a Sequence Flow",
    find: '<bpmn:sequenceFlow id="Flow_TaskToEnd"',
    attribute: 'camunda:foo="bar"',
  },
  {
    locus: "a Start Event",
    find: '<bpmn:startEvent id="StartEvent_1"',
    attribute: 'camunda:initiator="starter"',
  },
];

for (const { locus, find, attribute } of refusedAttributes) {
  test(`refuses an unconsumed foreign attribute on ${locus}`, async () => {
    const status = await compilePerturbed(
      userTaskSource,
      SemanticProfileId.UserTask,
      (xml) =>
        xml
          .replace("<bpmn:definitions", `<bpmn:definitions ${camundaNamespaceDeclaration}`)
          .replace(find, `${find} ${attribute}`),
    );

    assert.equal(status, BpmnCompilationStatus.Rejected);
  });
}

test("refuses an unconsumed foreign attribute inside a called Process", async () => {
  const status = await compilePerturbed(
    callActivitySource,
    SemanticProfileId.CalledProcessCallActivity,
    (xml) =>
      xml
        .replace("<bpmn:definitions", `<bpmn:definitions ${camundaNamespaceDeclaration}`)
        .replace("<bpmn:userTask", '<bpmn:userTask camunda:assignee="alice"'),
  );

  assert.equal(status, BpmnCompilationStatus.Rejected);
});

test("keeps admitting the Service Task attributes its projector consumes", async () => {
  const unperturbed = await readFile(serviceTaskSource);
  const result = await compileBpmnToSemanticProcess({
    bytes: unperturbed,
    sourceId: "service-task-effect",
    expectedSha256: undefined,
    semanticProfile: SemanticProfileId.ServiceTaskEffect,
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });

  assert.equal(
    result.status,
    BpmnCompilationStatus.Accepted,
    `a consumed foreign attribute must not reject: ${JSON.stringify(result.diagnostics)}`,
  );
});

/**
 * The XML Schema instance attributes are admitted deliberately, so each boundary gets a witness.
 *
 * They are admitted for two different reasons, and calling them all content-free would be false.
 * `schemaLocation` genuinely is: it tells a validating parser where to find a schema. `type` is not,
 * because it selects the element type the parser resolves, and is admitted instead on the ground that
 * the meaning it carries has already been applied and is visible in the resolved type. They appear in
 * 37% and 30% of the pinned MIWG corpus respectively, so refusing them would refuse most conformant
 * BPMN. `nil` empties an element and is refused. The prefix is resolved against the document's own
 * binding rather than matched by spelling, so a document that binds `xsi` elsewhere gets no free pass.
 */
test("admits a content-free XML Schema instance attribute", async () => {
  const xml = await readFile(userTaskSource, "utf8");
  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(
      xml.replace(
        "<bpmn:definitions",
        '<bpmn:definitions xsi:schemaLocation="http://www.omg.org/spec/BPMN/20100524/MODEL BPMN20.xsd"',
      ),
    ),
    sourceId: "schema-location",
    expectedSha256: undefined,
    semanticProfile: SemanticProfileId.UserTask,
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });

  assert.equal(
    result.status,
    BpmnCompilationStatus.Accepted,
    `xsi:schemaLocation was rejected: ${JSON.stringify(result.diagnostics)}`,
  );
});

test("refuses xsi:nil, which empties an element rather than describing it", async () => {
  const status = await compilePerturbed(
    userTaskSource,
    SemanticProfileId.UserTask,
    (xml) =>
      xml.replace('<bpmn:userTask id="UserTask_Approve"', '<bpmn:userTask xsi:nil="true" id="UserTask_Approve"'),
  );

  assert.equal(status, BpmnCompilationStatus.Rejected);
});

test("refuses a schema-instance attribute whose prefix the document binds elsewhere", async () => {
  const status = await compilePerturbed(
    userTaskSource,
    SemanticProfileId.UserTask,
    (xml) =>
      xml
        .replace(
          'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
          'xmlns:xsi="http://vendor.example/not-schema-instance"',
        )
        .replace(
          '<bpmn:userTask id="UserTask_Approve"',
          '<bpmn:userTask xsi:schemaLocation="anything" id="UserTask_Approve"',
        ),
  );

  assert.equal(status, BpmnCompilationStatus.Rejected);
});

test("refuses a third foreign attribute beside the two the Service Task consumes", async () => {
  const status = await compilePerturbed(
    serviceTaskSource,
    SemanticProfileId.ServiceTaskEffect,
    (xml) => xml.replace("<bpmn:serviceTask", '<bpmn:serviceTask camunda:foo="bar"'),
  );

  assert.equal(status, BpmnCompilationStatus.Rejected);
});

/**
 * The rule must reach every profile the compiler dispatches, not only the ones a fix touched.
 *
 * It is profile-parameterized, so unlike the reference-target rule its outcome cannot be one global
 * early rejection above dispatch: the generic reader must collect it with every other classification
 * finding. The registry owns that distinction and applies the selected policy before any reader can
 * omit it. Every selected reader must keep the registry-owned classifier in front of projection.
 *
 * The Start Event is the perturbed locus on every path because no profile exempts it and no other rule
 * can refuse an otherwise valid Start Event carrying one extra attribute. The paired unperturbed
 * compilation below is what keeps that reasoning honest rather than assumed.
 */
type DispatchFixture = Readonly<{
  path: string;
  source: URL;
  sourceId: string;
  semanticProfile: string;
  find: string;
  prepare?: (source: string) => string;
}>;

const dispatchFixtures = {
  generic: {
    path: "the generic compiler",
    source: new URL(
      "../../../scenarios/user-task-preserved-notation/process.bpmn",
      import.meta.url,
    ),
    sourceId: "preserved-notation-diagnostics",
    semanticProfile: SemanticProfileId.UserTaskPreservedNotation,
    find: '<bpmn:startEvent id="StartEvent_1"',
  },
  mappedSuccessServiceTask: {
    path: "the mapped-success reader",
    source: new URL(
      "../../../scenarios/mapped-success-service-task/process.bpmn",
      import.meta.url,
    ),
    sourceId: "mapped-success-service-task",
    semanticProfile: mappedSuccessServiceTaskProfile,
    find: '<bpmn:startEvent id="StartEvent_MappedSuccess"',
  },
  mappedBoundaryErrorServiceTask: {
    path: "the mapped-boundary-Error reader",
    source: new URL(
      "../../../scenarios/mapped-boundary-error-service-task/process.bpmn",
      import.meta.url,
    ),
    sourceId: "mapped-boundary-error-service-task",
    semanticProfile: mappedBoundaryErrorServiceTaskProfile,
    find: '<bpmn:startEvent id="StartEvent_MappedBoundaryError"',
  },
  callActivity: {
    path: "the Call Activity reader",
    source: callActivitySource,
    sourceId: "call-activity-test",
    semanticProfile: SemanticProfileId.CalledProcessCallActivity,
    find: '<bpmn:startEvent id="CallerStart"',
  },
  userTaskMetadata: {
    path: "the User Task metadata reader",
    source: new URL(
      "./fixtures/user-task-assignment-form-metadata.bpmn",
      import.meta.url,
    ),
    sourceId: "user-task-assignment-form-metadata",
    semanticProfile: "cibseven-2.2.0-user-task-assignment-form-metadata-draft",
    find: '<bpmn:startEvent id="StartEvent_1"',
  },
  sequentialMultiInstanceUserTask: {
    path: "the sequential Multi-Instance reader",
    source: new URL(
      "./fixtures/sequential-multi-instance-user-task.bpmn",
      import.meta.url,
    ),
    sourceId: "sequential-multi-instance-review",
    semanticProfile: SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
    find: '<bpmn:startEvent id="StartEvent_Review"',
  },
  parallelMultiInstanceUserTask: {
    path: "the parallel Multi-Instance reader",
    source: new URL(
      "./fixtures/sequential-multi-instance-user-task.bpmn",
      import.meta.url,
    ),
    sourceId: "parallel-multi-instance-review",
    semanticProfile: SemanticProfileId.ParallelMultiInstanceUserTask,
    find: '<bpmn:startEvent id="StartEvent_Review"',
    prepare: (source) => source
      .replace(
        "Definitions_SequentialMultiInstanceReview",
        "Definitions_ParallelMultiInstanceReview",
      )
      .replace(
        'targetNamespace="https://bpmn-lean.org/scenarios/sequential-multi-instance-review">',
        [
          'targetNamespace="https://bpmn-lean.org/scenarios/parallel-multi-instance-review"',
          '  expressionLanguage="urn:bpmn-lean:expression:simple-boolean:v1">',
        ].join("\n"),
      )
      .replace(
        "Process_SequentialMultiInstanceReview",
        "Process_ParallelMultiInstanceReview",
      )
      .replace('isSequential="true"', 'isSequential="false"')
      .replace(
        "      </bpmn:multiInstanceLoopCharacteristics>",
        [
          '        <bpmn:completionCondition xsi:type="bpmn:tFormalExpression">stringEquals(completionPolicy,"first")</bpmn:completionCondition>',
          "      </bpmn:multiInstanceLoopCharacteristics>",
        ].join("\n"),
      ),
  },
} as const satisfies Record<CompilationDispatchId, DispatchFixture>;

test("applies foreign-attribute admission through every registered compilation dispatch", async () => {
  const registrySpecifier = new URL(
    "../dist/compilation-dispatch.js",
    import.meta.url,
  ).href;
  const loaded: unknown = await import(registrySpecifier);
  assert.ok(loaded !== null && typeof loaded === "object");
  assert.ok("compilationDispatches" in loaded);
  const dispatches = loaded.compilationDispatches;
  assert.ok(Array.isArray(dispatches));
  const dispatchIds = dispatches.map((value) => asRecord(value)?.id);
  assert.deepEqual(
    dispatchIds,
    Object.keys(dispatchFixtures),
    "the registry and its complete-result fixture map must cover each other in declaration order",
  );

  for (const value of dispatches) {
    const dispatch = asRecord(value);
    assert.ok(dispatch !== undefined);
    const id = dispatch.id;
    assert.ok(typeof id === "string" && id in dispatchFixtures);
    const fixture = dispatchFixtures[id as CompilationDispatchId];
    const source = await readFile(fixture.source, "utf8");
    const admitted = "prepare" in fixture ? fixture.prepare(source) : source;
    assert.ok(admitted.includes(fixture.find), `the source no longer contains ${fixture.find}`);
    const withNamespace = admitted.includes(camundaNamespaceDeclaration)
      ? admitted
      : admitted.replace(
          "<bpmn:definitions",
          `<bpmn:definitions ${camundaNamespaceDeclaration}`,
        );
    const perturbed = withNamespace.replace(
      fixture.find,
      `${fixture.find} camunda:asyncBefore="true"`,
    );

    const [unperturbed, foreignAttribute] = await Promise.all([
      compileBpmnToSemanticProcess({
        bytes: new TextEncoder().encode(admitted),
        sourceId: fixture.sourceId,
        expectedSha256: undefined,
        semanticProfile: fixture.semanticProfile,
        sourceOverlay: null,
        limits: semanticProcessTestLimits,
      }),
      compileBpmnToSemanticProcess({
        bytes: new TextEncoder().encode(perturbed),
        sourceId: `${fixture.sourceId}-foreign-attribute`,
        expectedSha256: undefined,
        semanticProfile: fixture.semanticProfile,
        sourceOverlay: null,
        limits: semanticProcessTestLimits,
      }),
    ]);

    assert.equal(
      unperturbed.status,
      BpmnCompilationStatus.Accepted,
      `${fixture.path} rejected its registered neutral source`,
    );
    assert.equal(foreignAttribute.status, BpmnCompilationStatus.Rejected);
    assert.ok(foreignAttribute.diagnostics.some(
      ({ code }) => code === BpmnSourceDiagnosticCode.UnconsumedForeignAttribute,
    ));
  }
});
