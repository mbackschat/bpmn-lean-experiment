/**
 * Retained witnesses for the nested scope-control growth of the embedded completion profile (NSC-ADMIT-01 through
 * NSC-REFUSE-01), driven through the exact-bytes source path and the core's admission and closure. The oracle is the
 * capsule's separating-witness account: the open User Tasks after each command, and Process status. Every refusal is
 * paired with an admitted control that differs in one fact, so a gate that refused everything could not pass.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind, CommandOutcome, ObservationRequestKind, ProcessStatus, ScenarioDocumentKind, StimulusKind,
  applyStimulusWithTrace, initialState, nestedScopeControlCheckedAnalysis, nestedScopeControlProgramAnalysis, runScenario,
  semanticProcessClosureLimit, supportsSemanticProcessScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const semanticProfile = "cibseven-2.2.0-embedded-subprocess-completion-draft";
const instanceId = "nested-control";

async function model(name: string): Promise<string> {
  return readFile(new URL(`../../../scenarios/nested-embedded-scope-control/${name}.bpmn`, import.meta.url), "utf8");
}

async function compile(xml: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "nested-control", expectedSha256: undefined,
    semanticProfile, sourceOverlay: null, limits: semanticProcessTestLimits,
  });
}

async function admitted(xml: string): Promise<SemanticProcessProgram> {
  const result = await compile(xml);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

async function assertRefused(label: string, xml: string): Promise<void> {
  const result = await compile(xml);
  assert.equal(result.status, BpmnCompilationStatus.Rejected, `${label} was admitted`);
}

function complete(elementId: string, index: number): Stimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${index}-${elementId}`,
    taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues: [],
  };
}

type Step = Readonly<{ outcome: CommandOutcome; open: readonly string[]; status: ProcessStatus }>;

/** Runs Start and the named completions and returns, per command, its outcome and the open tasks after it. */
function journey(program: SemanticProcessProgram, completions: readonly string[]): readonly Step[] {
  const scenario = {
    kind: ScenarioDocumentKind.Scenario, id: "nested-control-journey", profile: program.identity.semanticProfile,
    bpmn: { id: program.identity.sourceId, relativePath: "nested-control.bpmn", sha256: program.identity.sourceSha256,
      sourceOverlay: program.identity.sourceOverlay },
    observations: [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults, ObservationRequestKind.ProcessStatus,
      ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks, ObservationRequestKind.OpenTimers,
      ObservationRequestKind.OpenEffects, ObservationRequestKind.Variables, ObservationRequestKind.EnabledInteractions,
      ObservationRequestKind.LogicalTime],
    provenance: { normativeRefs: [], cibRevision: "none", cibRefs: [] },
    stimuli: [
      { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId, initialVariables: [] },
      ...completions.map(complete),
    ],
  } as const satisfies Scenario;
  assert.equal(supportsSemanticProcessScenario(scenario, program), true);
  const trace = runScenario(scenario, program).trace;
  const steps: Step[] = [];
  trace.forEach((entry, index) => {
    if (entry.kind !== CanonicalObservationKind.Command) return;
    const state = trace.slice(index + 1).find(next => next.kind === CanonicalObservationKind.State);
    assert.ok(state?.kind === CanonicalObservationKind.State);
    steps.push({ outcome: entry.outcome, status: state.status,
      open: state.openUserTasks.map(({ id }) => id.elementId).toSorted() });
  });
  assert.equal(steps.length, completions.length + 1);
  return steps;
}

const sorted = (...ids: string[]): string[] => ids.map(id => `UserTask_${id}`).toSorted();

test("NSC-END-01 and NSC-QUIESCE-01: a nested terminal fork's first End completes neither its scope nor the root join", async () => {
  const program = await admitted(await model("employee-onboarding"));
  const steps = journey(program, ["UserTask_ConfirmStartDate", "UserTask_CreateMailbox", "UserTask_GrantVpn",
    "UserTask_AssignDesk", "UserTask_OrderEquipment", "UserTask_WelcomeMeeting"]);
  assert.deepEqual(steps.map(({ outcome }) => outcome), Array(7).fill(CommandOutcome.Committed));
  assert.deepEqual(steps[0]!.open, sorted("ConfirmStartDate", "OrderEquipment"));
  assert.deepEqual(steps[1]!.open, sorted("AssignDesk", "CreateMailbox", "GrantVpn", "OrderEquipment"));
  assert.deepEqual(steps[2]!.open, sorted("AssignDesk", "GrantVpn", "OrderEquipment"));
  assert.deepEqual(steps[3]!.open, sorted("AssignDesk", "OrderEquipment"));
  assert.deepEqual(steps[4]!.open, sorted("OrderEquipment"));
  assert.deepEqual(steps[5]!.open, sorted("WelcomeMeeting"));
  assert.deepEqual(steps[6]!, { outcome: CommandOutcome.Committed, open: [], status: ProcessStatus.Completed });
});

test("NSC-JOIN-01: reversed completion orders of the onboarding journey reach the same final observation", async () => {
  const program = await admitted(await model("employee-onboarding"));
  const reversed = journey(program, ["UserTask_OrderEquipment", "UserTask_ConfirmStartDate", "UserTask_AssignDesk",
    "UserTask_GrantVpn", "UserTask_CreateMailbox", "UserTask_WelcomeMeeting"]);
  assert.deepEqual(reversed[4]!.open, sorted("CreateMailbox"));
  assert.deepEqual(reversed[5]!.open, sorted("WelcomeMeeting"));
  assert.deepEqual(reversed.at(-1), { outcome: CommandOutcome.Committed, open: [], status: ProcessStatus.Completed });
});

test("NSC-ENTER-01 and NSC-OUTSIDE-01: the depth-three audit enters both evidence scopes in one closure and continues inside its parent", async () => {
  const program = await admitted(await model("internal-audit"));
  const steps = journey(program, ["UserTask_PlanFieldwork", "UserTask_DrawSample", "UserTask_InterviewStaff",
    "UserTask_ReviewFindings", "UserTask_SignOff", "UserTask_CloseAudit"]);
  assert.deepEqual(steps.map(({ outcome }) => outcome), Array(7).fill(CommandOutcome.Committed));
  assert.deepEqual(steps[0]!.open, sorted("PlanFieldwork"));
  assert.deepEqual(steps[1]!.open, sorted("DrawSample", "InterviewStaff"));
  assert.deepEqual(steps[2]!.open, sorted("InterviewStaff"));
  assert.deepEqual(steps[3]!.open, sorted("ReviewFindings"));
  // A wrong-parent continuation would open Close audit here instead of Sign off.
  assert.deepEqual(steps[4]!.open, sorted("SignOff"));
  assert.deepEqual(steps[5]!.open, sorted("CloseAudit"));
  assert.equal(steps[6]!.status, ProcessStatus.Completed);
});

test("NSC-REFUSE-01: an early completion before the join and a repeat after its scope completed are rejected unchanged", async () => {
  const program = await admitted(await model("internal-audit"));
  const steps = journey(program, ["UserTask_PlanFieldwork", "UserTask_ReviewFindings", "UserTask_DrawSample",
    "UserTask_DrawSample", "UserTask_InterviewStaff"]);
  assert.deepEqual(steps.map(({ outcome }) => outcome), [CommandOutcome.Committed, CommandOutcome.Committed,
    CommandOutcome.Rejected, CommandOutcome.Committed, CommandOutcome.Rejected, CommandOutcome.Committed]);
  assert.deepEqual(steps[2]!.open, sorted("DrawSample", "InterviewStaff"));
  assert.deepEqual(steps[4]!.open, sorted("InterviewStaff"));
  assert.deepEqual(steps[5]!.open, sorted("ReviewFindings"));
});

test("NSC-ADMIT-01 admits the audit at depth three and refuses a fourth nesting level", async () => {
  const audit = await model("internal-audit");
  await admitted(audit);
  const fourth = audit.replace(
    /<bpmn:userTask id="UserTask_DrawSample" name="Draw sample">([\s\S]*?)<\/bpmn:userTask>/,
    `<bpmn:subProcess id="SubProcess_Recount" name="Recount">$1
          <bpmn:startEvent id="StartEvent_Recount"><bpmn:outgoing>Flow_RecountStartToCount</bpmn:outgoing></bpmn:startEvent>
          <bpmn:userTask id="UserTask_Count" name="Count"><bpmn:incoming>Flow_RecountStartToCount</bpmn:incoming><bpmn:outgoing>Flow_CountToEnd</bpmn:outgoing></bpmn:userTask>
          <bpmn:endEvent id="EndEvent_Counted"><bpmn:incoming>Flow_CountToEnd</bpmn:incoming></bpmn:endEvent>
          <bpmn:sequenceFlow id="Flow_RecountStartToCount" sourceRef="StartEvent_Recount" targetRef="UserTask_Count"/>
          <bpmn:sequenceFlow id="Flow_CountToEnd" sourceRef="UserTask_Count" targetRef="EndEvent_Counted"/>
        </bpmn:subProcess>`)
    .replaceAll('targetRef="UserTask_DrawSample"', 'targetRef="SubProcess_Recount"')
    .replaceAll('sourceRef="UserTask_DrawSample"', 'sourceRef="SubProcess_Recount"');
  assert.notEqual(fourth, audit);
  await assertRefused("depth four", fourth);
});

test("NSC-ADMIT-01 refuses a terminal fork at the root and a task-free fork branch", async () => {
  const onboarding = await model("employee-onboarding");
  await admitted(onboarding);
  const taskFree = onboarding
    .replace('<bpmn:outgoing>Flow_PrepareForkToOrderEquipment</bpmn:outgoing>', '<bpmn:outgoing>Flow_PrepareForkToPrepareJoin</bpmn:outgoing>')
    .replace('<bpmn:incoming>Flow_OrderEquipmentToPrepareJoin</bpmn:incoming>', '<bpmn:incoming>Flow_PrepareForkToPrepareJoin</bpmn:incoming>')
    .replace(/<bpmn:userTask id="UserTask_OrderEquipment"[\s\S]*?<\/bpmn:userTask>/, "")
    .replace('<bpmn:sequenceFlow id="Flow_PrepareForkToOrderEquipment" sourceRef="Gateway_PrepareFork" targetRef="UserTask_OrderEquipment"/>', "")
    .replace('<bpmn:sequenceFlow id="Flow_OrderEquipmentToPrepareJoin" sourceRef="UserTask_OrderEquipment" targetRef="Gateway_PrepareJoin"/>',
      '<bpmn:sequenceFlow id="Flow_PrepareForkToPrepareJoin" sourceRef="Gateway_PrepareFork" targetRef="Gateway_PrepareJoin"/>');
  await assertRefused("task-free branch", taskFree);
  const rootTerminal = onboarding
    .replace('<bpmn:incoming>Flow_OrderEquipmentToPrepareJoin</bpmn:incoming>\n', "")
    .replace('<bpmn:sequenceFlow id="Flow_OrderEquipmentToPrepareJoin" sourceRef="UserTask_OrderEquipment" targetRef="Gateway_PrepareJoin"/>',
      '<bpmn:sequenceFlow id="Flow_OrderEquipmentToEquipped" sourceRef="UserTask_OrderEquipment" targetRef="EndEvent_Equipped"/>\n' +
      '    <bpmn:endEvent id="EndEvent_Equipped"><bpmn:incoming>Flow_OrderEquipmentToEquipped</bpmn:incoming></bpmn:endEvent>')
    .replace('<bpmn:outgoing>Flow_OrderEquipmentToPrepareJoin</bpmn:outgoing>', '<bpmn:outgoing>Flow_OrderEquipmentToEquipped</bpmn:outgoing>');
  await assertRefused("root terminal fork", rootTerminal);
});

/** A root Sub-Process whose body forks into `width` User Tasks: Start costs initiate, entry, fork and one arming each. */
function fanout(width: number, body = ""): string {
  const tasks = Array.from({ length: width }, (_, index) => `T${index}`);
  return `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:fanout">
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="S"/><bpmn:endEvent id="E"/>
    <bpmn:subProcess id="Work">
      <bpmn:startEvent id="WS"/><bpmn:parallelGateway id="Fork" gatewayDirection="Diverging"/>
      ${tasks.map(id => `<bpmn:userTask id="${id}"/><bpmn:endEvent id="E${id}"/>
      <bpmn:sequenceFlow id="F${id}" sourceRef="Fork" targetRef="${id}"/><bpmn:sequenceFlow id="G${id}" sourceRef="${id}" targetRef="E${id}"/>`).join("\n      ")}
      <bpmn:sequenceFlow id="FW" sourceRef="WS" targetRef="Fork"/>${body}
    </bpmn:subProcess>
    <bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="Work"/><bpmn:sequenceFlow id="F1" sourceRef="Work" targetRef="E"/>
  </bpmn:process>
</bpmn:definitions>`;
}

test("NSC-ADMIT-01 admits a Start closure of exactly the limit and refuses one step more, and the admitted one commits", async () => {
  const program = await admitted(fanout(5));
  assert.equal(nestedScopeControlProgramAnalysis(program), 8);
  assert.equal(journey(program, [])[0]!.outcome, CommandOutcome.Committed);
  await assertRefused("closure of nine", fanout(6));
});

test("NSC-ADMIT-01 refuses an Exclusive Gateway and a Service Task beside an otherwise admitted fan-out", async () => {
  await admitted(fanout(2));
  await assertRefused("Exclusive Gateway", fanout(2, `
      <bpmn:exclusiveGateway id="X"/>`).replace('targetRef="T1"/>', 'targetRef="X"/><bpmn:sequenceFlow id="FX" sourceRef="X" targetRef="T1"/>'));
  await assertRefused("Service Task", fanout(2).replace('<bpmn:userTask id="T1"/>', '<bpmn:serviceTask id="T1"/>'));
});

/** One root Sub-Process with the given child-body elements and flows. */
function scoped(body: string): string {
  return `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:scoped">
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="S"/><bpmn:endEvent id="E"/>
    <bpmn:subProcess id="Work"><bpmn:startEvent id="WS"/>${body}</bpmn:subProcess>
    <bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="Work"/><bpmn:sequenceFlow id="F1" sourceRef="Work" targetRef="E"/>
  </bpmn:process>
</bpmn:definitions>`;
}

const flow = (id: string, source: string, target: string): string =>
  `<bpmn:sequenceFlow id="${id}" sourceRef="${source}" targetRef="${target}"/>`;

test("NSC-ADMIT-01 composes the retained models' largest closures in both languages' inputs", async () => {
  for (const [name, bound] of [["employee-onboarding", 7], ["internal-audit", 5]] as const) {
    const compiled = await compile(await model(name));
    assert.ok(compiled.status === BpmnCompilationStatus.Accepted);
    assert.equal(nestedScopeControlProgramAnalysis(compiled.semanticProcess), bound, name);
    const { checkedProcess } = compiled;
    assert.equal(nestedScopeControlCheckedAnalysis({ ...checkedProcess, flows: checkedProcess.sequenceFlows }), bound, name);
  }
});

// The composed bound is computed from the topology alone; this compares it with the closures the core actually runs.
// Equal results at the bound show it is sufficient; an internal closure of exactly that length, and a changed result one
// step below it, show it is not loose. The first traced record is the command's own transition, not a closure step.
test("NSC-ADMIT-01: every retained journey runs each closure within its computed bound and reaches it", async () => {
  const journeys = [
    ["employee-onboarding", ["UserTask_ConfirmStartDate", "UserTask_CreateMailbox", "UserTask_GrantVpn",
      "UserTask_AssignDesk", "UserTask_OrderEquipment", "UserTask_WelcomeMeeting"]],
    ["employee-onboarding", ["UserTask_OrderEquipment", "UserTask_ConfirmStartDate", "UserTask_AssignDesk",
      "UserTask_GrantVpn", "UserTask_CreateMailbox", "UserTask_WelcomeMeeting"]],
    ["internal-audit", ["UserTask_PlanFieldwork", "UserTask_DrawSample", "UserTask_InterviewStaff",
      "UserTask_ReviewFindings", "UserTask_SignOff", "UserTask_CloseAudit"]],
    ["internal-audit", ["UserTask_PlanFieldwork", "UserTask_ReviewFindings", "UserTask_InterviewStaff",
      "UserTask_InterviewStaff", "UserTask_DrawSample", "UserTask_ReviewFindings", "UserTask_SignOff", "UserTask_CloseAudit"]],
  ] as const;
  for (const [name, completions] of journeys) {
    const program = await admitted(await model(name));
    const bound = nestedScopeControlProgramAnalysis(program);
    assert.ok(bound !== null && bound <= semanticProcessClosureLimit, name);
    const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
      instanceId, initialVariables: [] };
    let state = initialState;
    let longest = 0;
    let shortBoundDiffers = false;
    for (const stimulus of [start, ...completions.map(complete)]) {
      const atLimit = applyStimulusWithTrace(program, state, stimulus, semanticProcessClosureLimit);
      const atBound = applyStimulusWithTrace(program, state, stimulus, bound);
      const belowBound = applyStimulusWithTrace(program, state, stimulus, bound - 1);
      assert.deepEqual(atBound.result, atLimit.result, `${name} ${stimulus.commandId}`);
      assert.equal(atLimit.result.ambiguousInternalChoice, false, `${name} ${stimulus.commandId}`);
      shortBoundDiffers ||= belowBound.result.outcome !== atLimit.result.outcome;
      longest = Math.max(longest, atLimit.committedTransitions.length - 1);
      if (atLimit.result.outcome === CommandOutcome.Committed) state = atLimit.result.state;
    }
    assert.equal(longest, bound, name);
    assert.ok(shortBoundDiffers, name);
  }
});

test("a nested fork beside a sibling branch's arming forms one batch and both nested branches open", async () => {
  const program = await admitted(scoped(`<bpmn:parallelGateway id="Outer" gatewayDirection="Diverging"/>
      <bpmn:parallelGateway id="Inner" gatewayDirection="Diverging"/>
      <bpmn:userTask id="A"/><bpmn:userTask id="B"/><bpmn:userTask id="C"/>
      <bpmn:parallelGateway id="InnerJoin" gatewayDirection="Converging"/><bpmn:parallelGateway id="OuterJoin" gatewayDirection="Converging"/>
      <bpmn:endEvent id="WE"/>
      ${flow("W0", "WS", "Outer")}${flow("W1", "Outer", "Inner")}${flow("W2", "Outer", "C")}
      ${flow("W3", "Inner", "A")}${flow("W4", "Inner", "B")}${flow("W5", "A", "InnerJoin")}${flow("W6", "B", "InnerJoin")}
      ${flow("W7", "InnerJoin", "OuterJoin")}${flow("W8", "C", "OuterJoin")}${flow("W9", "OuterJoin", "WE")}`));
  const steps = journey(program, ["A", "C", "B"]);
  assert.deepEqual(steps[0]!.open, ["A", "B", "C"]);
  assert.deepEqual(steps.at(-1), { outcome: CommandOutcome.Committed, open: [], status: ProcessStatus.Completed });
});

test("NSC-ADMIT-01 refuses crossing blocks whose joins pair inputs of different forks, with every arity still valid", async () => {
  const gateways = `<bpmn:parallelGateway id="G1" gatewayDirection="Diverging"/><bpmn:parallelGateway id="G2" gatewayDirection="Diverging"/>
      <bpmn:parallelGateway id="J1" gatewayDirection="Converging"/><bpmn:parallelGateway id="J2" gatewayDirection="Converging"/>
      <bpmn:userTask id="A"/><bpmn:userTask id="B"/><bpmn:userTask id="C"/><bpmn:endEvent id="WE"/>`;
  const shared = `${flow("W0", "WS", "G1")}${flow("W1", "G1", "A")}${flow("W2", "G1", "G2")}${flow("W3", "G2", "B")}${flow("W4", "G2", "C")}`;
  await admitted(scoped(`${gateways}${shared}${flow("W5", "B", "J1")}${flow("W6", "C", "J1")}${flow("W7", "J1", "J2")}${flow("W8", "A", "J2")}${flow("W9", "J2", "WE")}`));
  await assertRefused("crossing blocks", scoped(`${gateways}${shared}${flow("W5", "A", "J1")}${flow("W6", "B", "J1")}${flow("W7", "J1", "J2")}${flow("W8", "C", "J2")}${flow("W9", "J2", "WE")}`));
});
