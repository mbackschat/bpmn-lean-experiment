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
