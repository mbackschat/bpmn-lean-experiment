/**
 * CMCALL-ADMIT-01, CMCALL-AVAILABLE-01 and CMCALL-START-01 through the exact-bytes source path: the retained supplier
 * onboarding and travel request models compile as data-bearing embedded completion Programs with mapped Calls, and every
 * refusal differs from an admitted model in the one fact its label names, so a reader that refused every mapped Call, or
 * admitted every one, could not pass. The oracle is the concurrent mapped Calls specification's required and excluded scope.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CallDataKind, EffectMappingValuePolicy, SemanticOperationKind, StimulusKind, VariableValueKind,
  effectMappingValuePolicyForProgram,
} from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";
const { nestedScopeControlCheckedStartNames, nestedScopeControlProgramStartNames } = await import(
  new URL("../../semantic-core/dist/nested-scope-control-admission.js", import.meta.url).href) as
  typeof import("../../semantic-core/src/nested-scope-control-admission.ts");
const { scopeDataStimulusAdmitted } = await import(
  new URL("../../semantic-core/dist/scope-data-stimulus-admission.js", import.meta.url).href) as
  typeof import("../../semantic-core/src/scope-data-stimulus-admission.ts");

const semanticProfile = "cibseven-2.2.0-embedded-subprocess-completion-draft";
const directory = new URL("../../../scenarios/concurrent-mapped-calls/", import.meta.url);

const supplier = async (): Promise<string> => readFile(new URL("supplier-onboarding.bpmn", directory), "utf8");
const travel = async (): Promise<string> => readFile(new URL("travel-request.bpmn", directory), "utf8");

type Overlay = Readonly<{ id: string; sha256: string; bytes: Uint8Array }>;

async function facilityHandlers(): Promise<Overlay> {
  const bytes = await readFile(new URL("../concurrent-scope-data/facility-inspection-handlers.json", directory));
  return { id: "facility-inspection-handlers", sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

async function compile(xml: string, sourceOverlay: Overlay | null = null) {
  return compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "concurrent-mapped-calls",
    expectedSha256: undefined, semanticProfile, sourceOverlay, limits: semanticProcessTestLimits });
}

async function admitted(xml: string): Promise<SemanticProcessProgram> {
  const result = await compile(xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  const checked = result.checkedProcess;
  // The checked and Program analyses are independent transcriptions; each admitted model must agree on both.
  assert.deepEqual(nestedScopeControlCheckedStartNames({ ...checked, flows: checked.sequenceFlows }),
    nestedScopeControlProgramStartNames(result.semanticProcess));
  return result.semanticProcess;
}

function replaceOnce(xml: string, from: string, to: string): string {
  assert.equal(xml.split(from).length, 2, from);
  return xml.replace(from, to);
}

const string = (name: string, value: string): VariableBinding =>
  ({ name, value: { kind: VariableValueKind.String, value } });

const start = (initialVariables: readonly VariableBinding[]): Stimulus =>
  ({ kind: StimulusKind.StartProcess, commandId: "start", instanceId: "Instance_1", initialVariables } as Stimulus);

test("the retained supplier onboarding model is a data-bearing Program whose two Calls of one definition both map", async () => {
  const program = await admitted(await supplier());
  assert.equal(effectMappingValuePolicyForProgram(program), EffectMappingValuePolicy.BoundedString);
  const invocations = program.operations.flatMap(operation =>
    operation.kind === SemanticOperationKind.InvokeProcess ? [operation] : []);
  assert.deepEqual(invocations.map(({ calledProcessId, data }) => [calledProcessId, data.kind]), [
    ["Process_ExpertOpinion", CallDataKind.VariableMappings],
    ["Process_ExpertOpinion", CallDataKind.VariableMappings],
  ]);
  assert.deepEqual(nestedScopeControlProgramStartNames(program), ["supplierName"]);
});

test("CMCALL-START-01 admits a Call input source or output target at Start and refuses a called-only name", async () => {
  const program = await admitted(await supplier());
  assert.equal(scopeDataStimulusAdmitted(program, start([string("supplierName", "Acme")])), true);
  assert.equal(scopeDataStimulusAdmitted(program, start([])), false, "the required name");
  assert.equal(scopeDataStimulusAdmitted(program, start([string("dossier", "x"), string("supplierName", "Acme")])), false,
    "a called-only input target");
  assert.equal(scopeDataStimulusAdmitted(program, start([string("opinion", "x"), string("supplierName", "Acme")])), false,
    "a called-only output source");
  // Both Calls resolve `file` and `verdict` in their declaring Sub-Process frames, so neither is a Process name.
  assert.equal(scopeDataStimulusAdmitted(program, start([string("supplierName", "Acme"), string("verdict", "x")])), false,
    "a Call output target declared on the caller chain");
});

test("CMCALL-AVAILABLE-01: a sibling branch's Call output is a required Start name, but not after the join", async () => {
  const xml = await travel();
  const program = await admitted(xml);
  assert.deepEqual(nestedScopeControlProgramStartNames(program), ["approvedBudget"]);
  assert.equal(scopeDataStimulusAdmitted(program, start([])), false, "the Booking input reads a sibling's Call output");
  assert.equal(scopeDataStimulusAdmitted(program, start([string("approvedBudget", "1200")])), true,
    "an absent Call input source becomes a present null");
  assert.equal(scopeDataStimulusAdmitted(program,
    start([string("approvedBudget", "1200"), string("traveller", "Ada"), string("visaStatus", "open")])), true,
    "Call input sources and output targets landing at the Process");
  assert.equal(scopeDataStimulusAdmitted(program, start([string("approvedBudget", "1200"), string("budget", "x")])), false,
    "a name declared only by the Booking frame");

  const afterJoin = replaceOnce(replaceOnce(replaceOnce(xml,
    '<sequenceFlow id="Flow_ForkBooking" sourceRef="PreparationFork" targetRef="Booking" />', ""),
  '<sequenceFlow id="Flow_BookingDone" sourceRef="Booking" targetRef="PreparationJoin" />', ""),
  '<sequenceFlow id="Flow_PreparationJoined" sourceRef="PreparationJoin" targetRef="TravelArranged" />',
  '<sequenceFlow id="Flow_PreparationJoined" sourceRef="PreparationJoin" targetRef="Booking" />' +
    '<sequenceFlow id="Flow_BookingDone" sourceRef="Booking" targetRef="TravelArranged" />');
  assert.deepEqual(nestedScopeControlProgramStartNames(await admitted(afterJoin)), []);
});

test("an unmapped Call keeps every Start name allowed only when no Call maps", async () => {
  const xml = replaceOnce(await travel(), `<callActivity id="VisaCheck" name="Check visa" calledElement="Process_VisaCheck">
      <extensionElements>
        <camunda:in source="traveller" target="traveller" />
        <camunda:out source="visaDecision" target="visaStatus" />
      </extensionElements>
    </callActivity>`, '<callActivity id="VisaCheck" name="Check visa" calledElement="Process_VisaCheck" />');
  const program = await admitted(xml);
  assert.equal(scopeDataStimulusAdmitted(program, start([string("approvedBudget", "1200"), string("traveller", "Ada")])),
    true, "the mapped Call's input source beside an unmapped Call of another definition");
  assert.equal(scopeDataStimulusAdmitted(program, start([string("approvedBudget", "1200"), string("visaStatus", "x")])),
    false, "a name no mapped Call reads or writes");
  const unmappedOnly = replaceOnce(xml, `<callActivity id="BudgetCheck" name="Check budget" calledElement="Process_BudgetCheck">
      <extensionElements>
        <camunda:in source="traveller" target="traveller" />
        <camunda:out source="confirmedBudget" target="approvedBudget" />
      </extensionElements>
    </callActivity>`, '<callActivity id="BudgetCheck" name="Check budget" calledElement="Process_BudgetCheck" />');
  const unmapped = await admitted(unmappedOnly);
  assert.equal(scopeDataStimulusAdmitted(unmapped, start([string("approvedBudget", "1200"), string("destination", "x")])), true);
});

test("CMCALL-ADMIT-01 refuses each excluded placement, mix and mapping", async () => {
  const supplierXml = await supplier();
  const travelXml = await travel();
  const refusals: Record<string, string> = {
    "a mapped Call leading a Sub-Process body on a fork branch": replaceOnce(replaceOnce(supplierXml,
      '<sequenceFlow id="Flow_FinancialOpened" sourceRef="FinancialReviewOpened" targetRef="PrepareFinancialFile" />',
      '<sequenceFlow id="Flow_FinancialOpened" sourceRef="FinancialReviewOpened" targetRef="FinancialExpertOpinion" />'),
    '<sequenceFlow id="Flow_FinancialPrepared" sourceRef="PrepareFinancialFile" targetRef="FinancialExpertOpinion" />' +
      '\n      <sequenceFlow id="Flow_FinancialAnswered" sourceRef="FinancialExpertOpinion" targetRef="FinancialReviewClosed" />',
    '<sequenceFlow id="Flow_FinancialAnswered" sourceRef="FinancialExpertOpinion" targetRef="PrepareFinancialFile" />' +
      '<sequenceFlow id="Flow_FinancialPrepared" sourceRef="PrepareFinancialFile" targetRef="FinancialReviewClosed" />'),
    "a called Process invoked by a mapped and an unmapped Call": replaceOnce(supplierXml,
      `<callActivity id="ComplianceExpertOpinion" name="Ask compliance expert" calledElement="Process_ExpertOpinion">
        <extensionElements>
          <camunda:in source="file" target="screeningFile" />
          <camunda:out source="finding" target="verdict" />
        </extensionElements>
      </callActivity>`,
      '<callActivity id="ComplianceExpertOpinion" name="Ask compliance expert" calledElement="Process_ExpertOpinion" />'),
    "a fork straight into two Calls of one definition": replaceOnce(travelXml,
      'calledElement="Process_VisaCheck"', 'calledElement="Process_BudgetCheck"'),
    "a sourceExpression input": replaceOnce(travelXml, '<camunda:in source="traveller" target="traveller" />\n        <camunda:out source="visaDecision"',
      '<camunda:in sourceExpression="${traveller}" target="traveller" />\n        <camunda:out source="visaDecision"'),
    "a Call in a Sub-Process body with a fork": replaceOnce(supplierXml,
      '<sequenceFlow id="Flow_FinancialAnswered" sourceRef="FinancialExpertOpinion" targetRef="FinancialReviewClosed" />',
      '<parallelGateway id="FinancialFork" /><userTask id="FinancialNote" /><parallelGateway id="FinancialJoin" />' +
        '<sequenceFlow id="Flow_FinancialAnswered" sourceRef="FinancialExpertOpinion" targetRef="FinancialFork" />' +
        '<sequenceFlow id="Flow_FinancialForkA" sourceRef="FinancialFork" targetRef="FinancialNote" />' +
        '<sequenceFlow id="Flow_FinancialForkB" sourceRef="FinancialFork" targetRef="FinancialJoin" />' +
        '<sequenceFlow id="Flow_FinancialNoted" sourceRef="FinancialNote" targetRef="FinancialJoin" />' +
        '<sequenceFlow id="Flow_FinancialJoined" sourceRef="FinancialJoin" targetRef="FinancialReviewClosed" />'),
    "a Call inside a called Process": replaceOnce(travelXml,
      '<sequenceFlow id="Flow_VisaDecided" sourceRef="CheckVisa" targetRef="VisaChecked" />',
      '<callActivity id="NestedBudget" calledElement="Process_BudgetCheck"><extensionElements>' +
        '<camunda:in source="visaDecision" target="traveller" /></extensionElements></callActivity>' +
        '<sequenceFlow id="Flow_VisaDecided" sourceRef="CheckVisa" targetRef="NestedBudget" />' +
        '<sequenceFlow id="Flow_NestedBudget" sourceRef="NestedBudget" targetRef="VisaChecked" />'),
  };
  for (const [label, mutated] of Object.entries(refusals)) {
    assert.equal((await compile(mutated)).status, BpmnCompilationStatus.Rejected, label);
  }
});

test("CMCALL-ADMIT-01 refuses a Service Task beside a mapped Call", async () => {
  const xml = replaceOnce(await travel(), '<userTask id="BookTravel" name="Book travel" />',
    '<serviceTask id="BookTravel" name="Book travel" implementation="urn:bpmn-lean:effect-protocol:activity-v1" ' +
      'camunda:delegateExpression="${inspectionSummary}" camunda:asyncBefore="true" />');
  assert.equal((await compile(xml, await facilityHandlers())).status, BpmnCompilationStatus.Rejected);
});

test("CMCALL-ADMIT-01 refuses a mapped Call in a merge-target body and admits it after a join", async () => {
  // Sub-Process Work forks into two User Tasks that meet at `meet`, then runs Fix, whose body holds a User Task
  // and then `leaf`; an exclusive merge makes Fix a merge target, which two live occurrences can share. The called
  // Process is present only when `leaf` calls it, since an uncalled second Process would be a second entry.
  const region = (meet: "exclusiveGateway" | "parallelGateway", leaf: string, called: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_Region" targetNamespace="urn:test">
  <process id="Process_Region" isExecutable="true">
    <startEvent id="Started" />
    <subProcess id="Work"><startEvent id="WorkStart" /><parallelGateway id="WorkFork" />
      <userTask id="ReviewA" /><userTask id="ReviewB" /><${meet} id="WorkMeet" />
      <subProcess id="Fix"><startEvent id="FixStart" /><userTask id="FixTask" />${leaf}<endEvent id="FixEnd" />
        <sequenceFlow id="Flow_FixStart" sourceRef="FixStart" targetRef="FixTask" />
        <sequenceFlow id="Flow_FixTask" sourceRef="FixTask" targetRef="FixLeaf" />
        <sequenceFlow id="Flow_FixLeaf" sourceRef="FixLeaf" targetRef="FixEnd" /></subProcess>
      <endEvent id="WorkEnd" />
      <sequenceFlow id="Flow_WorkStart" sourceRef="WorkStart" targetRef="WorkFork" />
      <sequenceFlow id="Flow_ForkA" sourceRef="WorkFork" targetRef="ReviewA" />
      <sequenceFlow id="Flow_ForkB" sourceRef="WorkFork" targetRef="ReviewB" />
      <sequenceFlow id="Flow_ReviewA" sourceRef="ReviewA" targetRef="WorkMeet" />
      <sequenceFlow id="Flow_ReviewB" sourceRef="ReviewB" targetRef="WorkMeet" />
      <sequenceFlow id="Flow_Meet" sourceRef="WorkMeet" targetRef="Fix" />
      <sequenceFlow id="Flow_Fix" sourceRef="Fix" targetRef="WorkEnd" /></subProcess>
    <endEvent id="Ended" />
    <sequenceFlow id="Flow_Started" sourceRef="Started" targetRef="Work" />
    <sequenceFlow id="Flow_Done" sourceRef="Work" targetRef="Ended" />
  </process>${called}
</definitions>`;
  const budgetCheck = `
  <process id="Process_BudgetCheck" isExecutable="true">
    <startEvent id="BudgetStarted" /><userTask id="CheckBudget" /><endEvent id="BudgetEnded" />
    <sequenceFlow id="Flow_BudgetStarted" sourceRef="BudgetStarted" targetRef="CheckBudget" />
    <sequenceFlow id="Flow_BudgetChecked" sourceRef="CheckBudget" targetRef="BudgetEnded" />
  </process>`;
  const call = '<callActivity id="FixLeaf" calledElement="Process_BudgetCheck"><extensionElements>' +
    '<camunda:in source="traveller" target="traveller" /></extensionElements></callActivity>';
  await admitted(region("parallelGateway", call, budgetCheck));
  await admitted(region("exclusiveGateway", '<userTask id="FixLeaf" />', ""));
  assert.equal((await compile(region("exclusiveGateway", call, budgetCheck))).status, BpmnCompilationStatus.Rejected);
});

test("CMCALL-ADMIT-01 refuses a mapped Call in a Sub-Process body three levels deep", async () => {
  // `levels` Sub-Processes nested in a chain, the innermost body holding a User Task then the mapped Call.
  const deep = (levels: number): string => {
    let element = '<subProcess id="Level1"><startEvent id="Level1Start" /><userTask id="LeafTask" />' +
      '<callActivity id="LeafCall" calledElement="Process_BudgetCheck"><extensionElements>' +
      '<camunda:in source="traveller" target="traveller" /></extensionElements></callActivity><endEvent id="Level1End" />' +
      '<sequenceFlow id="Flow_Level1Start" sourceRef="Level1Start" targetRef="LeafTask" />' +
      '<sequenceFlow id="Flow_LeafTask" sourceRef="LeafTask" targetRef="LeafCall" />' +
      '<sequenceFlow id="Flow_LeafCall" sourceRef="LeafCall" targetRef="Level1End" /></subProcess>';
    for (let level = 2; level <= levels; level += 1) {
      const inner = `Level${level - 1}`;
      element = `<subProcess id="Level${level}"><startEvent id="Level${level}Start" />${element}` +
        `<endEvent id="Level${level}End" />` +
        `<sequenceFlow id="Flow_Level${level}Start" sourceRef="Level${level}Start" targetRef="${inner}" />` +
        `<sequenceFlow id="Flow_Level${level}End" sourceRef="${inner}" targetRef="Level${level}End" /></subProcess>`;
    }
    const outer = `Level${levels}`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_Deep" targetNamespace="urn:test">
  <process id="Process_Deep" isExecutable="true">
    <startEvent id="Started" />${element}
    <endEvent id="Ended" />
    <sequenceFlow id="Flow_Started" sourceRef="Started" targetRef="${outer}" />
    <sequenceFlow id="Flow_Done" sourceRef="${outer}" targetRef="Ended" />
  </process>
  <process id="Process_BudgetCheck" isExecutable="true">
    <startEvent id="BudgetStarted" /><userTask id="CheckBudget" /><endEvent id="BudgetEnded" />
    <sequenceFlow id="Flow_BudgetStarted" sourceRef="BudgetStarted" targetRef="CheckBudget" />
    <sequenceFlow id="Flow_BudgetChecked" sourceRef="CheckBudget" targetRef="BudgetEnded" />
  </process>
</definitions>`;
  };
  await admitted(deep(2));
  assert.equal((await compile(deep(3))).status, BpmnCompilationStatus.Rejected);
});
