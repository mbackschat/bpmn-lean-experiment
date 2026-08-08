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
  a12BoundaryErrorProfile,
  a12CreateDocumentProfile,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

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
 * `schemaLocation` and `type` carry no BPMN content and appear in 37% and 30% of the pinned MIWG
 * corpus respectively, so refusing them would refuse most conformant BPMN. `nil` empties an element
 * and is refused. The prefix is resolved against the document's own binding rather than matched by
 * spelling, so a document that binds `xsi` elsewhere gets no free pass.
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
 * It is profile-parameterized, so unlike the reference-target rule it cannot move above the dispatch
 * and each reader asks for its own consuming set. That makes omission possible, and it happened: the
 * two A12 readers called the rule nowhere, so `camunda:asyncBefore` on an A12 Start Event was accepted
 * and discarded, leaving a byte-identical program. `asyncBefore` is the seed below because it is an
 * asynchronous-continuation directive rather than cosmetic metadata, so discarding it changes what a
 * host would do.
 *
 * The Start Event is the perturbed locus on every path because no profile exempts it and no other rule
 * can refuse an otherwise valid Start Event carrying one extra attribute. The paired unperturbed
 * compilation below is what keeps that reasoning honest rather than assumed.
 */
const dispatchPaths: ReadonlyArray<
  Readonly<{ path: string; source: URL; semanticProfile: string; find: string }>
> = [
  {
    path: "the generic compiler",
    source: userTaskSource,
    semanticProfile: SemanticProfileId.UserTask,
    find: '<bpmn:startEvent id="StartEvent_1"',
  },
  {
    path: "the A12 CreateDocument reader",
    source: new URL(
      "../../../scenarios/create-document-data/process.bpmn",
      import.meta.url,
    ),
    semanticProfile: a12CreateDocumentProfile,
    find: '<bpmn:startEvent id="StartEvent_CreateDocument"',
  },
  {
    path: "the A12 boundary-error reader",
    source: new URL(
      "../../../scenarios/boundary-error/process.bpmn",
      import.meta.url,
    ),
    semanticProfile: a12BoundaryErrorProfile,
    find: '<bpmn:startEvent id="StartEvent_None"',
  },
  {
    path: "the Call Activity reader",
    source: callActivitySource,
    semanticProfile: SemanticProfileId.CalledProcessCallActivity,
    find: '<bpmn:startEvent id="CallerStart"',
  },
];

for (const { path, source, semanticProfile, find } of dispatchPaths) {
  test(`refuses an execution-affecting foreign attribute through ${path}`, async () => {
    const admitted = await readFile(source, "utf8");
    assert.ok(admitted.includes(find), `the source no longer contains ${find}`);

    const [unperturbed, perturbed] = await Promise.all([
      compileBpmnToSemanticProcess({
        bytes: new TextEncoder().encode(admitted),
        sourceId: "dispatch-path-unperturbed",
        expectedSha256: undefined,
        semanticProfile,
        limits: semanticProcessTestLimits,
      }),
      compileBpmnToSemanticProcess({
        bytes: new TextEncoder().encode(
          // Two of these sources already bind the prefix, and declaring it twice is a parser warning
          // that would refuse the file before this rule ran.
          (admitted.includes(camundaNamespaceDeclaration)
            ? admitted
            : admitted.replace(
              "<bpmn:definitions",
              `<bpmn:definitions ${camundaNamespaceDeclaration}`,
            ))
            .replace(find, `${find} camunda:asyncBefore="true"`),
        ),
        sourceId: "dispatch-path-foreign-attribute",
        expectedSha256: undefined,
        semanticProfile,
        limits: semanticProcessTestLimits,
      }),
    ]);

    // Anti-vacuity: a path whose own source is refused would reject the perturbation for free.
    assert.equal(
      unperturbed.status,
      BpmnCompilationStatus.Accepted,
      `the unperturbed source was refused: ${JSON.stringify(unperturbed.diagnostics)}`,
    );
    assert.equal(perturbed.status, BpmnCompilationStatus.Rejected);
    // The readers that admit one hand-selected shape report a document-level refusal, so the attribute
    // name is available only on the paths that classify. Both must at least name the reason.
    assert.ok(
      perturbed.diagnostics.some(({ code, element, evidence }) =>
        (code === BpmnSourceDiagnosticCode.UnconsumedForeignAttribute &&
          element?.subject === "camunda:asyncBefore") ||
        evidence.includes("foreign attribute")
      ),
      `the refusal does not name the foreign attribute: ${JSON.stringify(perturbed.diagnostics)}`,
    );
  });
}

/**
 * The A12 CreateDocument profile keeps admitting the vendor attributes its registered source carries.
 *
 * `modeler:executionPlatform`, its version sibling, and `camunda:versionTag` reach no projector, and
 * the profile exempts their whole `Definitions` and `Process` types rather than those exact names,
 * because exact-name matching needs expanded-name resolution that no profile declares yet. This case
 * exists so the exemption is a tested decision rather than an accident of where a count check happens
 * to bite, and so narrowing it later fails here rather than silently.
 */
test("keeps admitting the A12 vendor attributes no projector reads", async () => {
  const source = new URL(
    "../../../scenarios/create-document-data/process.bpmn",
    import.meta.url,
  );
  const admitted = await readFile(source, "utf8");
  for (const attribute of [
    'modeler:executionPlatform="Camunda Platform"',
    'camunda:versionTag="1.0"',
  ]) {
    assert.ok(admitted.includes(attribute), `the source no longer carries ${attribute}`);
  }

  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(admitted),
    sourceId: "a12-create-document-vendor-attributes",
    expectedSha256: undefined,
    semanticProfile: a12CreateDocumentProfile,
    limits: semanticProcessTestLimits,
  });

  assert.equal(
    result.status,
    BpmnCompilationStatus.Accepted,
    `the exempted vendor attributes were refused: ${JSON.stringify(result.diagnostics)}`,
  );
});

/**
 * The cost of that exemption, pinned in the direction that loses information.
 *
 * Exempting the whole `Definitions` type admits every foreign attribute there, not only the two
 * `modeler:*` names the registered source carries, so an execution directive at that one locus is
 * still accepted and discarded. This case asserts that acceptance deliberately: the residual is
 * recorded in [the implementation map](../../../docs/IMPLEMENTATION-MAP.md) rather than hidden, and
 * narrowing the exemption to expanded `namespace#localName` matching must fail here rather than
 * silently, because a green suite would otherwise be the only evidence that the locus was ever open.
 */
test("still discards a foreign attribute on the exempted A12 Definitions locus", async () => {
  const source = new URL(
    "../../../scenarios/create-document-data/process.bpmn",
    import.meta.url,
  );
  const admitted = await readFile(source, "utf8");
  const perturbed = admitted.replace(
    "<bpmn:definitions",
    '<bpmn:definitions camunda:asyncBefore="true"',
  );
  assert.notEqual(perturbed, admitted, "the perturbation matched nothing");

  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(perturbed),
    sourceId: "a12-create-document-definitions-locus",
    expectedSha256: undefined,
    semanticProfile: a12CreateDocumentProfile,
    limits: semanticProcessTestLimits,
  });

  assert.equal(
    result.status,
    BpmnCompilationStatus.Accepted,
    "this locus is a recorded exemption; a rejection here means the residual closed and the map, the classifier docstring, and this case all need correcting together",
  );
});
