/**
 * Retained witnesses for concurrent embedded activations in the embedded completion profile (CEA-ADMIT-01 through
 * CEA-REFUSE-01), driven through the exact-bytes source path and the core's admission and closure. The oracle is the
 * capsule's separating-witness account: the open User Tasks, named by element and activation, after each command, and
 * Process status. Every refusal is paired with an admitted control, so a gate that refused everything could not pass.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind, CommandOutcome, ObservationRequestKind, ProcessStatus, ScenarioDocumentKind, StimulusKind,
  applyStimulusWithTrace, initialState, nestedScopeControlCheckedAnalysis, nestedScopeControlProgramAnalysis,
  replayCommittedTransitions, runScenario, runtimeStateDefects,
  semanticProcessClosureLimit, supportsSemanticProcessScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const semanticProfile = "cibseven-2.2.0-embedded-subprocess-completion-draft";
const instanceId = "concurrent-activations";

async function model(name: string): Promise<string> {
  return readFile(new URL(`../../../scenarios/concurrent-embedded-activations/${name}.bpmn`, import.meta.url), "utf8");
}

async function compile(xml: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "concurrent-activations", expectedSha256: undefined,
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

/** `Task#2` completes activation 2 of `UserTask_Task`. */
function complete(task: string, index: number): Stimulus {
  const [name, activation = "1"] = task.split("#");
  return {
    kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${index}-${task}`,
    taskId: { processInstanceId: instanceId, elementId: `UserTask_${name}`, activation: Number(activation) },
    submittedValues: [],
  };
}

type Step = Readonly<{ outcome: CommandOutcome; open: readonly string[]; status: ProcessStatus }>;

/** Runs Start and the named completions and returns, per command, its outcome and the open tasks after it. */
function journey(program: SemanticProcessProgram, completions: readonly string[]): readonly Step[] {
  const scenario = {
    kind: ScenarioDocumentKind.Scenario, id: "concurrent-activations-journey", profile: program.identity.semanticProfile,
    bpmn: { id: program.identity.sourceId, relativePath: "concurrent-activations.bpmn", sha256: program.identity.sourceSha256,
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
      open: state.openUserTasks.map(({ id }) => `${id.elementId.slice("UserTask_".length)}#${id.activation}`).toSorted() });
  });
  assert.equal(steps.length, completions.length + 1);
  return steps;
}

const open = (...tasks: string[]): string[] => tasks.toSorted();

const auditJourney = ["ReviewControls", "ReviewPayments", "FixFinding#2", "VerifyFix", "FixFinding#2", "ReportFinding",
  "FixFinding", "VerifyFix#2", "ReportFinding#2", "CloseAudit"] as const;

test("CEA-MERGE-01, CEA-OCCUR-01 and CEA-ISOLATE-01: each review opens its own Remediation and finishing one leaves the other", async () => {
  const program = await admitted(await model("audit-remediation"));
  const steps = journey(program, auditJourney);
  assert.deepEqual(steps[0]!.open, open("ReviewControls#1", "ReviewPayments#1"));
  // A join would open no Fix finding here; deduplication would open only one after both reviews.
  assert.deepEqual(steps[1]!.open, open("FixFinding#1", "ReviewPayments#1"));
  assert.deepEqual(steps[2]!.open, open("FixFinding#1", "FixFinding#2"));
  assert.deepEqual(steps[3]!.open, open("FixFinding#1", "VerifyFix#1"));
  // Completing the second Remediation must leave the first one's Fix finding open and Close audit absent.
  assert.deepEqual(steps[4]!.open, open("FixFinding#1", "ReportFinding#1"));
  assert.deepEqual(steps[6]!.open, open("FixFinding#1"));
  assert.deepEqual(steps[7]!.open, open("VerifyFix#2"));
  assert.deepEqual(steps[8]!.open, open("ReportFinding#2"));
  assert.deepEqual(steps[9]!.open, open("CloseAudit#1"));
  assert.deepEqual(steps[10]!, { outcome: CommandOutcome.Committed, open: [], status: ProcessStatus.Completed });
});

test("CEA-REFUSE-01: a repeated completion of a finished Fix finding is rejected while the other Fix finding is open", async () => {
  const program = await admitted(await model("audit-remediation"));
  const steps = journey(program, auditJourney);
  assert.deepEqual(steps.map(({ outcome }) => outcome), [...Array(5).fill(CommandOutcome.Committed),
    CommandOutcome.Rejected, ...Array(5).fill(CommandOutcome.Committed)]);
  assert.deepEqual(steps[5]!.open, steps[4]!.open);
});

test("CEA-QUIESCE-01: three concurrent Assess occurrences complete in reverse order before Decide opens", async () => {
  const program = await admitted(await model("credit-intake"));
  const steps = journey(program, ["OpenApplication", "CheckIdentity", "CheckAddress", "CheckIncome",
    "ScoreApplicant#3", "ScoreApplicant#2", "ScoreApplicant#1", "Decide"]);
  assert.deepEqual(steps.map(({ outcome }) => outcome), Array(9).fill(CommandOutcome.Committed));
  assert.deepEqual(steps[1]!.open, open("CheckAddress#1", "CheckIdentity#1", "CheckIncome#1"));
  assert.deepEqual(steps[4]!.open, open("ScoreApplicant#1", "ScoreApplicant#2", "ScoreApplicant#3"));
  assert.deepEqual(steps[5]!.open, open("ScoreApplicant#1", "ScoreApplicant#2"));
  assert.deepEqual(steps[6]!.open, open("ScoreApplicant#1"));
  assert.deepEqual(steps[7]!.open, open("Decide#1"));
  assert.deepEqual(steps[8]!.status, ProcessStatus.Completed);
});

test("CEA-MERGE-01: reversed arrival and completion orders of the audit reach the same final observation", async () => {
  const program = await admitted(await model("audit-remediation"));
  const steps = journey(program, ["ReviewPayments", "ReviewControls", "FixFinding", "FixFinding#2", "VerifyFix",
    "VerifyFix#2", "ReportFinding#2", "ReportFinding", "CloseAudit"]);
  assert.deepEqual(steps.map(({ outcome }) => outcome), Array(10).fill(CommandOutcome.Committed));
  assert.deepEqual(steps[5]!.open, open("ReportFinding#1", "VerifyFix#2"));
  assert.deepEqual(steps.at(-1), { outcome: CommandOutcome.Committed, open: [], status: ProcessStatus.Completed });
});

test("CEA-ADMIT-01 admits a merge region in a depth-two body", async () => {
  await admitted(await model("claim-escalation"));
});

// The composed bound is computed from the topology alone; this compares it with the closures the core actually runs.
// Equal results at the bound show it is sufficient; an internal closure of exactly that length, and a changed result one
// step below it, show it is not loose. The first traced record is the command's own transition, not a closure step.
test("CEA-ADMIT-01: every retained journey runs each closure within its computed bound and reaches it", async () => {
  const journeys = [
    ["audit-remediation", auditJourney, 5],
    ["credit-intake", ["OpenApplication", "CheckIdentity", "CheckAddress", "CheckIncome", "ScoreApplicant#3",
      "ScoreApplicant#2", "ScoreApplicant#1", "Decide"], 5],
  ] as const;
  for (const [name, completions, expected] of journeys) {
    const program = await admitted(await model(name));
    const bound = nestedScopeControlProgramAnalysis(program);
    assert.equal(bound, expected, name);
    const compiled = await compile(await model(name));
    assert.ok(compiled.status === BpmnCompilationStatus.Accepted);
    const { checkedProcess } = compiled;
    assert.equal(nestedScopeControlCheckedAnalysis({ ...checkedProcess, flows: checkedProcess.sequenceFlows }), bound, name);
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
      // A committed command whose canonical trace failed to project would publish no transition at all.
      if (atLimit.result.outcome === CommandOutcome.Committed) {
        assert.ok(atLimit.committedTransitions.length > 0, `${name} ${stimulus.commandId} trace`);
        // Replay must re-select each recorded owner rather than the unique occurrence of a definition.
        assert.deepEqual(replayCommittedTransitions(program, state, atLimit.committedTransitions), atLimit.result.state,
          `${name} ${stimulus.commandId} replay`);
        // CEA-OCCUR-01's executable reachability lane: the extended RSI-BOUND-01 holds on every committed prefix.
        assert.deepEqual(runtimeStateDefects(program, instanceId, atLimit.result.state), [], `${name} ${stimulus.commandId} defects`);
      }
      shortBoundDiffers ||= belowBound.result.outcome !== atLimit.result.outcome;
      longest = Math.max(longest, atLimit.committedTransitions.length - 1);
      if (atLimit.result.outcome === CommandOutcome.Committed) state = atLimit.result.state;
    }
    assert.equal(longest, bound, name);
    assert.ok(shortBoundDiffers, name);
  }
});

/** One root Sub-Process `Work` with the given child-body elements and flows, followed by the root End. */
function scoped(body: string, root = ""): string {
  return `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:scoped">
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="S"/><bpmn:endEvent id="E"/>
    <bpmn:subProcess id="Work"><bpmn:startEvent id="WS"/>${body}</bpmn:subProcess>
    <bpmn:sequenceFlow id="F0" sourceRef="S" targetRef="Work"/><bpmn:sequenceFlow id="F1" sourceRef="Work" targetRef="E"/>${root}
  </bpmn:process>
</bpmn:definitions>`;
}

const flow = (id: string, source: string, target: string): string =>
  `<bpmn:sequenceFlow id="${id}" sourceRef="${source}" targetRef="${target}"/>`;

/** A serial Sub-Process `id` whose body runs the given User Tasks, or `inner` instead of them when supplied. */
function target(id: string, tasks: readonly string[], inner?: string): string {
  const chain = [`${id}S`, ...tasks, `${id}E`];
  return `<bpmn:subProcess id="${id}"><bpmn:startEvent id="${id}S"/>${tasks.map(task => `<bpmn:userTask id="${task}"/>`).join("")}
    <bpmn:endEvent id="${id}E"/>${inner ?? chain.slice(1).map((next, index) => flow(`${id}f${index}`, chain[index]!, next)).join("")}</bpmn:subProcess>`;
}

/** A merge region inside `Work`: fork into `branches`, merge, the target Sub-Process `T`, then the body End `WE`. */
function region(branches: readonly string[], targetBody: string = target("T", ["Fix"]), extra = ""): string {
  return `<bpmn:parallelGateway id="Fork" gatewayDirection="Diverging"/>
      <bpmn:exclusiveGateway id="Merge" gatewayDirection="Converging"/>${branches.map(id => `<bpmn:userTask id="${id}"/>`).join("")}
      ${targetBody}<bpmn:endEvent id="WE"/>${flow("W0", "WS", "Fork")}
      ${branches.map((id, index) => `${flow(`Wb${index}`, "Fork", id)}${flow(`Wm${index}`, id, "Merge")}`).join("")}
      ${flow("Wt", "Merge", "T")}${flow("We", "T", "WE")}${extra}`;
}

test("CEA-ADMIT-01 admits the minimal region and refuses its excluded neighbours", async () => {
  await admitted(scoped(region(["A", "B"])));
  await assertRefused("Parallel Gateway inside the merge target", scoped(region(["A", "B"], target("T", ["X", "Y"],
    `<bpmn:parallelGateway id="TF" gatewayDirection="Diverging"/><bpmn:parallelGateway id="TJ" gatewayDirection="Converging"/>
    ${flow("t0", "TS", "TF")}${flow("t1", "TF", "X")}${flow("t2", "TF", "Y")}${flow("t3", "X", "TJ")}${flow("t4", "Y", "TJ")}${flow("t5", "TJ", "TE")}`))));
  await assertRefused("Sub-Process inside the merge target", scoped(region(["A", "B"], target("T", [],
    `${target("Inner", ["Fix"])}${flow("t0", "TS", "Inner")}${flow("t1", "Inner", "TE")}`))));
  await assertRefused("Service Task in a branch", scoped(region(["A", "B"]).replace('<bpmn:userTask id="B"/>', '<bpmn:serviceTask id="B"/>')));
  await assertRefused("fork output straight into the merge", scoped(region(["A"], undefined, flow("Wd", "Fork", "Merge"))));
});

test("CEA-ADMIT-01 refuses a partial merge, a merge fed by two forks, a conditional merge flow and a root-body region", async () => {
  await assertRefused("partial merge", scoped(region(["A", "B"], undefined,
    `<bpmn:userTask id="C"/><bpmn:endEvent id="CE"/>${flow("Wc", "Fork", "C")}${flow("Wce", "C", "CE")}`)));
  const twoForks = region(["A", "B"]).replace(flow("Wb1", "Fork", "B"),
    `<bpmn:parallelGateway id="Fork2" gatewayDirection="Diverging"/><bpmn:userTask id="C"/><bpmn:endEvent id="CE"/>
    ${flow("Wb1", "Fork", "Fork2")}${flow("W2a", "Fork2", "B")}${flow("W2b", "Fork2", "C")}${flow("W2c", "C", "CE")}`);
  await assertRefused("merge fed by two forks", scoped(twoForks));
  await assertRefused("conditional merge flow", scoped(region(["A", "B"]).replace(flow("Wt", "Merge", "T"),
    `<bpmn:sequenceFlow id="Wt" sourceRef="Merge" targetRef="T"><bpmn:conditionExpression>\${true}</bpmn:conditionExpression></bpmn:sequenceFlow>`)));
  const rootRegion = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:root">
  <bpmn:process id="P" isExecutable="true"><bpmn:startEvent id="WS"/>${region(["A", "B"])}</bpmn:process>
</bpmn:definitions>`;
  await assertRefused("root-body region", rootRegion);
});

test("CEA-ADMIT-01 refuses a merge region in a depth-three body and a weighted task count over 128", async () => {
  const deep = scoped(`<bpmn:subProcess id="L2"><bpmn:startEvent id="L2S"/><bpmn:subProcess id="L3"><bpmn:startEvent id="WS3"/>
    ${region(["A", "B"]).replaceAll('"WS"', '"WS3"').replaceAll('"WE"', '"WE3"')}</bpmn:subProcess><bpmn:endEvent id="L2E"/>
    ${flow("l0", "L2S", "L3")}${flow("l1", "L3", "L2E")}</bpmn:subProcess><bpmn:endEvent id="WE"/>${flow("w0", "WS", "L2")}${flow("w1", "L2", "WE")}`);
  await assertRefused("depth-three region", deep);
  const many = Array.from({ length: 64 }, (_, index) => `Fix${index}`);
  await admitted(scoped(region(["A", "B"], target("T", many.slice(0, 63)))));
  await assertRefused("weighted count of 130", scoped(region(["A", "B"], target("T", many))));
});
