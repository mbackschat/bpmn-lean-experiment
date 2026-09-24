import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  detectExecutableBpmnCapabilities,
} from "./executable-model-capabilities.ts";
import { artifactCases, normativeArtifactCases } from "./contract-artifact-cases.ts";
import { enginePopulationScenarioRelativePaths } from "./engine-population-artifacts.ts";
import { requireExecutableModelCorpusManifest } from "./executable-model-corpus-manifest.ts";
import { CibCapabilityEvidenceKind, mvpBpmnCapabilities } from "../model-corpus/mvp-capabilities.ts";

const compensationCapabilityIds = ["compensationBoundaryEvent", "compensationEventSubProcess", "compensationHandlerServiceTask", "compensationIntermediateThrowEvent"];

test("inventories the retained Compensation graph without ordinary handler claims", async () => {
  const xml = await readFile(new URL("../scenarios/compensation/travel-cancellation.bpmn", import.meta.url), "utf8");
  const capabilities = detectExecutableBpmnCapabilities(xml);
  assert.deepEqual(capabilities.filter((id) => id.startsWith("compensation")), compensationCapabilityIds);
  assert.equal(capabilities.includes("serviceTask"), false);
  assert.deepEqual(capabilities, [...compensationCapabilityIds, "embeddedSubProcess", "noneEndEvent", "noneStartEvent", "parallelGateway", "process", "sequenceFlow", "userTask"].sort());
  assert.deepEqual(detectExecutableBpmnCapabilities(xml.replaceAll("ReserveHotel", "ReserveRoom").replaceAll("GroundTravel", "Transfers").replaceAll('name="Confirm travel insurance"', 'name="Unrelated display label"')), capabilities);
  assert.deepEqual(detectExecutableBpmnCapabilities(xml.replaceAll('isForCompensation="true"', 'isForCompensation="1"')), capabilities);
});

const dormantCompensation = `<bpmn:subProcess triggeredByEvent="true">
  <bpmn:startEvent><bpmn:compensateEventDefinition /></bpmn:startEvent>
  <bpmn:serviceTask implementation="urn:bpmn-lean:effect:compensation-single-effect-v1" />
  <bpmn:endEvent />
</bpmn:subProcess>`;

test("dormant Compensation bodies do not claim ordinary starts, effects or embedded scopes", () => {
  const xml = `<bpmn:process><bpmn:subProcess>${dormantCompensation}</bpmn:subProcess></bpmn:process>`;
  for (const input of [xml, xml.replace('triggeredByEvent="true"', 'triggeredByEvent="1"')]) {
    assert.deepEqual(detectExecutableBpmnCapabilities(input), ["compensationEventSubProcess", "compensationHandlerServiceTask", "embeddedSubProcess", "process"]);
  }
});

test("refuses unclassified dormant, standalone and unrelated Compensation markers", async () => {
  const source = await readFile(new URL("../scenarios/compensation/travel-cancellation.bpmn", import.meta.url), "utf8");
  for (const xml of [
    source.replace('compensateEventDefinition id="Compensate_UndoGroundTravel"', 'messageEventDefinition id="Compensate_UndoGroundTravel"'),
    `<bpmn:process><bpmn:serviceTask isForCompensation="true" /></bpmn:process>`,
    `<bpmn:process><bpmn:serviceTask isForCompensation="1" /></bpmn:process>`,
    `<bpmn:process><bpmn:startEvent><bpmn:compensateEventDefinition /></bpmn:startEvent></bpmn:process>`,
    source.replace('attachedToRef="Task_ReserveHotel"', 'attachedToRef="SubProcess_ArrangeGroundTravel"'),
    source.replace('id="Compensate_Global"', 'id="Compensate_Global" activityRef="Task_ReserveHotel"'),
    source.replace('id="Compensate_Global"', 'id="Compensate_Global" waitForCompletion="false"'),
    source.replace('id="Task_ReserveHotel" name=', 'id="Task_ReserveHotel" isForCompensation="true" name='),
    `<bpmn:process>${dormantCompensation}</bpmn:process>`,
    `<bpmn:process><bpmn:subProcess>${dormantCompensation.replace("bpmn:serviceTask", "bpmn:scriptTask")}</bpmn:subProcess></bpmn:process>`,
  ]) assert.throws(() => detectExecutableBpmnCapabilities(xml), /unclassified executable BPMN/u);
});

test("the actual registered source union equals the catalog and remains covered by retained models", async () => {
  const manifest = requireExecutableModelCorpusManifest(JSON.parse(await readFile(new URL("../model-corpus/manifest.json", import.meta.url), "utf8")));
  const registeredSources = new Set<string>();
  for (const artifact of [...artifactCases, ...normativeArtifactCases]) {
    const scenario = JSON.parse(await readFile(new URL(`../${artifact.scenarioRelativePath}`, import.meta.url), "utf8"));
    registeredSources.add(scenario.bpmn.relativePath);
  }
  for (const relativePath of enginePopulationScenarioRelativePaths) {
    const scenario = JSON.parse(await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"));
    for (const definition of scenario.definitions) registeredSources.add(definition.relativePath);
  }
  const detected = new Set<string>();
  for (const relativePath of registeredSources) {
    for (const capability of detectExecutableBpmnCapabilities(await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"))) detected.add(capability);
  }
  const retained = new Set<string>();
  for (const model of manifest.models) {
    if (model.source.kind !== "retainedScenario") continue;
    for (const capability of detectExecutableBpmnCapabilities(await readFile(new URL(`../${model.source.bpmnRelativePath}`, import.meta.url), "utf8"))) retained.add(capability);
  }
  assert.deepEqual([...detected].sort(), mvpBpmnCapabilities.map(({ id }) => id).sort());
  assert.deepEqual([...retained].sort(), [...detected].sort());
  for (const id of compensationCapabilityIds) {
    const row = mvpBpmnCapabilities.find((entry) => entry.id === id);
    assert.ok(row);
    assert.equal(row.cibEvidence.kind, CibCapabilityEvidenceKind.NotSelected);
  }
});

test("the retained travel model binds exact source, profile and engine scenario without a browser claim", async () => {
  const manifest = requireExecutableModelCorpusManifest(JSON.parse(await readFile(new URL("../model-corpus/manifest.json", import.meta.url), "utf8")));
  const model = manifest.models.find(({ id }) => id === "confirmed-travel-cancellation");
  assert.ok(model?.source.kind === "retainedScenario");
  const source = await readFile(new URL(`../${model.source.bpmnRelativePath}`, import.meta.url));
  const scenario = JSON.parse(await readFile(new URL(`../${model.source.scenarioRelativePath}`, import.meta.url), "utf8"));
  assert.equal(model.source.sha256, createHash("sha256").update(source).digest("hex"));
  assert.equal(model.source.sha256, scenario.bpmn.sha256);
  assert.equal(model.source.bpmnRelativePath, scenario.bpmn.relativePath);
  assert.equal(model.profile, scenario.profile);
  assert.equal(model.pipelineCaseId, scenario.id);
  assert.equal(model.pipelineCaseId, "compensation-success-b-c-a");
  assert.equal(model.admission.kind, "accepted");
  assert.equal(model.product2.kind, "notCatalogReady");
  assert.ok(model.businessPurpose !== null && model.businessPurpose.length >= 20);
});

test("distinguishes composed Activity data from each one-direction User Task profile", async () => {
  for (const [family, expected] of [
    ["activity-data-input-user-task", "directDataInputUserTask"],
    ["activity-data-output-user-task", "directDataOutputUserTask"],
    ["activity-data-input-output-user-task", "directDataInputOutputUserTask"],
  ] as const) {
    const xml = await readFile(new URL(`../scenarios/${family}/process.bpmn`, import.meta.url), "utf8");
    const capabilities = detectExecutableBpmnCapabilities(xml);
    assert.equal(capabilities.includes("userTask"), true);
    assert.deepEqual(capabilities.filter((id) => id.startsWith("directData")), [expected]);
  }
});

test("distinguishes Timer Start from an Intermediate Catch Timer", () => {
  const timerStart = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Start" isExecutable="true">
        <bpmn:startEvent id="Start"><bpmn:timerEventDefinition /></bpmn:startEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);
  const timerCatch = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Catch" isExecutable="true">
        <bpmn:intermediateCatchEvent id="Catch"><bpmn:timerEventDefinition /></bpmn:intermediateCatchEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);

  assert.ok(timerStart.includes("timerStartEvent"));
  assert.ok(!timerStart.includes("intermediateCatchTimerEvent"));
  assert.ok(timerCatch.includes("intermediateCatchTimerEvent"));
  assert.ok(!timerCatch.includes("timerStartEvent"));
});

test("distinguishes a payload-bearing Message catch from a payload-free catch", () => {
  const payloadCatch = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Payload" isExecutable="true">
        <bpmn:intermediateCatchEvent id="Catch_Payload">
          <bpmn:dataOutput id="Payload" />
          <bpmn:dataOutputAssociation>
            <bpmn:sourceRef>Payload</bpmn:sourceRef>
            <bpmn:targetRef>StoredPayload</bpmn:targetRef>
          </bpmn:dataOutputAssociation>
          <bpmn:outputSet><bpmn:dataOutputRefs>Payload</bpmn:dataOutputRefs></bpmn:outputSet>
          <bpmn:messageEventDefinition />
        </bpmn:intermediateCatchEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);
  const payloadFreeCatch = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_PayloadFree" isExecutable="true">
        <bpmn:intermediateCatchEvent id="Catch_PayloadFree">
          <bpmn:messageEventDefinition />
        </bpmn:intermediateCatchEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);

  assert.equal(payloadCatch.includes("messagePayloadCatchEvent"), true);
  assert.equal(
    payloadFreeCatch.includes("messagePayloadCatchEvent"),
    false,
  );
  assert.throws(
    () => detectExecutableBpmnCapabilities(`
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:process id="Process_PartialPayload" isExecutable="true">
          <bpmn:intermediateCatchEvent id="Catch_PartialPayload">
            <bpmn:dataOutput id="Payload" />
            <bpmn:messageEventDefinition />
          </bpmn:intermediateCatchEvent>
        </bpmn:process>
      </bpmn:definitions>
    `),
    /unclassified executable BPMN Message Catch Event payload mediation/u,
  );
});

test("classifies the complete single-key Message correlation shape", () => {
  const capabilities = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:correlationProperty id="CorrelationProperty_Reference">
        <bpmn:correlationPropertyRetrievalExpression messageRef="Message_Confirmed">
          <bpmn:messagePath>payload</bpmn:messagePath>
        </bpmn:correlationPropertyRetrievalExpression>
      </bpmn:correlationProperty>
      <bpmn:process id="Process_Correlation" isExecutable="true">
        <bpmn:intermediateCatchEvent id="Catch_Initial">
          <bpmn:messageEventDefinition messageRef="Message_Confirmed" />
        </bpmn:intermediateCatchEvent>
        <bpmn:intermediateCatchEvent id="Catch_Confirmed">
          <bpmn:messageEventDefinition messageRef="Message_Confirmed" />
        </bpmn:intermediateCatchEvent>
        <bpmn:correlationSubscription correlationKeyRef="CorrelationKey_Reference">
          <bpmn:correlationPropertyBinding correlationPropertyRef="CorrelationProperty_Reference">
            <bpmn:dataPath>property:Property_Reference</bpmn:dataPath>
          </bpmn:correlationPropertyBinding>
        </bpmn:correlationSubscription>
      </bpmn:process>
      <bpmn:collaboration id="Collaboration_Correlation">
        <bpmn:conversation id="Conversation_Correlation">
          <bpmn:correlationKey id="CorrelationKey_Reference">
            <bpmn:correlationPropertyRef>CorrelationProperty_Reference</bpmn:correlationPropertyRef>
          </bpmn:correlationKey>
        </bpmn:conversation>
      </bpmn:collaboration>
    </bpmn:definitions>
  `);

  assert.equal(capabilities.includes("messageKeyCorrelation"), true);
  assert.throws(
    () => detectExecutableBpmnCapabilities(`
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:correlationProperty id="CorrelationProperty_Reference" />
        <bpmn:process id="Process_PartialCorrelation" isExecutable="true" />
      </bpmn:definitions>
    `),
    /unclassified executable BPMN Message key-correlation shape/u,
  );
  assert.throws(
    () => detectExecutableBpmnCapabilities(`
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:correlationProperty id="CorrelationProperty_Reference">
          <bpmn:correlationPropertyRetrievalExpression messageRef="Message_Confirmed">
            <bpmn:messagePath>payload</bpmn:messagePath>
          </bpmn:correlationPropertyRetrievalExpression>
        </bpmn:correlationProperty>
        <bpmn:process id="Process_Correlation" isExecutable="true">
          <bpmn:correlationSubscription correlationKeyRef="CorrelationKey_Reference">
            <bpmn:correlationPropertyBinding correlationPropertyRef="CorrelationProperty_Reference">
              <bpmn:dataPath>property:Property_Reference</bpmn:dataPath>
            </bpmn:correlationPropertyBinding>
          </bpmn:correlationSubscription>
        </bpmn:process>
        <bpmn:collaboration id="Collaboration_Correlation">
          <bpmn:conversation id="Conversation_Correlation">
            <bpmn:correlationKey id="CorrelationKey_Reference">
              <bpmn:correlationPropertyRef>CorrelationProperty_Reference</bpmn:correlationPropertyRef>
            </bpmn:correlationKey>
          </bpmn:conversation>
        </bpmn:collaboration>
      </bpmn:definitions>
    `),
    /unclassified executable BPMN Message key-correlation shape/u,
  );
});

test("distinguishes boundary variants by interruption and attached element", () => {
  const capabilities = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Boundaries" isExecutable="true">
        <bpmn:userTask id="Review" />
        <bpmn:subProcess id="WorkPackage" />
        <bpmn:boundaryEvent id="Reminder" attachedToRef="Review" cancelActivity="false">
          <bpmn:timerEventDefinition />
        </bpmn:boundaryEvent>
        <bpmn:boundaryEvent id="Deadline" attachedToRef="WorkPackage">
          <bpmn:timerEventDefinition />
        </bpmn:boundaryEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);

  assert.ok(capabilities.includes("nonInterruptingUserTaskBoundaryTimerEvent"));
  assert.ok(capabilities.includes("interruptingSubProcessBoundaryTimerEvent"));
  assert.ok(!capabilities.includes("interruptingUserTaskBoundaryTimerEvent"));
});

test("distinguishes interrupting and repeatable Message boundaries on a User Task", () => {
  const interrupting = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Withdrawal" isExecutable="true">
        <bpmn:userTask id="Review" />
        <bpmn:boundaryEvent id="Withdrawal" attachedToRef="Review">
          <bpmn:messageEventDefinition />
        </bpmn:boundaryEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);

  assert.ok(
    interrupting.includes("interruptingUserTaskBoundaryMessageEvent"),
  );
  const repeatable = detectExecutableBpmnCapabilities(`
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:process id="Process_Reminder" isExecutable="true">
          <bpmn:userTask id="Review" />
          <bpmn:boundaryEvent
            id="Reminder"
            attachedToRef="Review"
            cancelActivity="false">
            <bpmn:messageEventDefinition />
          </bpmn:boundaryEvent>
        </bpmn:process>
      </bpmn:definitions>
    `);
  assert.ok(repeatable.includes("nonInterruptingUserTaskBoundaryMessageEvent"));
  assert.ok(!repeatable.includes("interruptingUserTaskBoundaryMessageEvent"));
});

test("distinguishes recurring Timer handlers from one-shot handlers at both Activity loci", () => {
  for (const [host, oneShot, recurring] of [
    ["userTask", "nonInterruptingUserTaskBoundaryTimerEvent", "recurringUserTaskBoundaryTimerEvent"],
    ["subProcess", "nonInterruptingSubProcessBoundaryTimerEvent", "recurringSubProcessBoundaryTimerEvent"],
  ] as const) {
    const xml = `<bpmn:definitions><bpmn:process id="Process" isExecutable="true">
      <bpmn:${host} id="Host" />
      <bpmn:boundaryEvent id="Reminder" attachedToRef="Host" cancelActivity="false">
        <bpmn:timerEventDefinition><bpmn:timeCycle>R/PT1S</bpmn:timeCycle></bpmn:timerEventDefinition>
      </bpmn:boundaryEvent>
    </bpmn:process></bpmn:definitions>`;
    for (const input of [xml, xml.replace('cancelActivity="false"', 'cancelActivity="0"')]) {
      const capabilities = detectExecutableBpmnCapabilities(input);
      assert.ok(capabilities.includes(recurring));
      assert.ok(!capabilities.includes(oneShot));
    }
    const once = detectExecutableBpmnCapabilities(xml.replace("<bpmn:timeCycle>R/PT1S</bpmn:timeCycle>", "<bpmn:timeDuration>PT1S</bpmn:timeDuration>"));
    assert.ok(once.includes(oneShot));
    assert.ok(!once.includes(recurring));
    assert.throws(() => detectExecutableBpmnCapabilities(xml.replace('cancelActivity="false"', 'cancelActivity="true"')), /recurring/);
  }
});

test("classifies only an explicitly declared Multi-Instance User Task mode", () => {
  const sequential = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Sequential" isExecutable="true">
        <bpmn:userTask id="Review">
          <bpmn:multiInstanceLoopCharacteristics isSequential="true" />
        </bpmn:userTask>
      </bpmn:process>
    </bpmn:definitions>
  `);

  assert.ok(sequential.includes("userTask"));
  assert.ok(sequential.includes("sequentialMultiInstanceUserTask"));
  const parallel = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Parallel" isExecutable="true">
        <bpmn:userTask id="Review">
          <bpmn:multiInstanceLoopCharacteristics isSequential="false" />
        </bpmn:userTask>
      </bpmn:process>
    </bpmn:definitions>
  `);
  assert.ok(parallel.includes("userTask"));
  assert.ok(parallel.includes("parallelMultiInstanceUserTask"));
  assert.ok(!parallel.includes("sequentialMultiInstanceUserTask"));
});

test("classifies the interrupting Timer by its sequential Multi-Instance host", () => {
  const capabilities = detectExecutableBpmnCapabilities(`
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="Process_Deadline" isExecutable="true">
        <bpmn:userTask id="Review">
          <bpmn:multiInstanceLoopCharacteristics isSequential="true" />
        </bpmn:userTask>
        <bpmn:boundaryEvent id="Deadline" attachedToRef="Review">
          <bpmn:timerEventDefinition />
        </bpmn:boundaryEvent>
      </bpmn:process>
    </bpmn:definitions>
  `);

  assert.ok(
    capabilities.includes(
      "interruptingSequentialMultiInstanceBoundaryTimerEvent",
    ),
  );
  assert.ok(!capabilities.includes("interruptingUserTaskBoundaryTimerEvent"));
  assert.throws(
    () => detectExecutableBpmnCapabilities(`
      <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:process id="Process_Reminder" isExecutable="true">
          <bpmn:userTask id="Review">
            <bpmn:multiInstanceLoopCharacteristics isSequential="true" />
          </bpmn:userTask>
          <bpmn:boundaryEvent
            id="Reminder"
            attachedToRef="Review"
            cancelActivity="false">
            <bpmn:timerEventDefinition />
          </bpmn:boundaryEvent>
        </bpmn:process>
      </bpmn:definitions>
    `),
    /unclassified executable BPMN non-interrupting sequential Multi-Instance boundary Timer/u,
  );
});
