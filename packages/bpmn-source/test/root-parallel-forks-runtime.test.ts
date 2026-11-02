/**
 * The core journeys of the root Parallel forks proposal over the employee onboarding model: RPF-ROOT-01, RPF-WRITE-01 and
 * RPF-VALUE-01. Frame contents are runtime-only, so this test reads committed state directly; every expected value is
 * read off the proposal's witness-model account, not off a run.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, SemanticProfileId, StimulusKind, applyStimulus, initialState,
  isWellFormedRuntimeState, nestedScopePatchByteLimit,
} from "@bpmn-lean/semantic-core";
import type { BusinessValue, RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { map, text } from "./effect-data-fixture.ts";
import { patchOfSize } from "./exact-size-patch-fixture.ts";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const directory = new URL("../../../scenarios/root-parallel-forks/", import.meta.url);
const instanceId = "Onboarding_1";

async function onboarding(): Promise<SemanticProcessProgram> {
  const overlay = new Uint8Array(await readFile(new URL("employee-onboarding-overlay.json", directory)));
  const result = await compileBpmnToSemanticProcess({
    bytes: new Uint8Array(await readFile(new URL("employee-onboarding.bpmn", directory))), sourceId: "employee-onboarding",
    expectedSha256: undefined, semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: "employee-onboarding-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: semanticProcessTestLimits,
  });
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

const bind = (name: string, value: BusinessValue): VariableBinding => ({ name, value });
const employee = (department: string) => map(["department", text(department)], ["name", text("Grace")]);

function commit(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
  assert.equal(result.ambiguousInternalChoice, false, JSON.stringify(stimulus));
  assert.equal(isWellFormedRuntimeState(program, instanceId, result.state), true, JSON.stringify(stimulus));
  return result.state;
}

const userTask = (elementId: string, submittedValues: readonly VariableBinding[]): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`,
  taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues });

const laptopOrdered: Stimulus = { kind: StimulusKind.CompleteEffect, commandId: "effect-OrderLaptop",
  effectId: { processInstanceId: instanceId, elementId: "OrderLaptop", activation: 1 },
  result: { kind: EffectExecutionResultKind.Success,
    localPatch: [bind("stage", text("equipment-ordered")), bind("tag", text("LT-0042"))] } };

const openTasks = (state: RuntimeState) => state.userTaskWaits.map(({ id }) => id.elementId).sort();
const laptopArguments = (state: RuntimeState) =>
  state.effectWaits.find(({ id }) => id.elementId === "OrderLaptop")?.arguments;
const process = (state: RuntimeState) => state.variables.process.bindings;

async function started() {
  const program = await onboarding();
  const state = commit(program, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: "Process_EmployeeOnboarding", instanceId, initialVariables: [bind("employee", employee("Sales"))] });
  // RPF-ROOT-01: the root fork activates both branches in the Start step.
  assert.deepEqual(openTasks(state), ["ConfirmDocuments", "PrepareWorkstation"]);
  return { program, state };
}

const confirm = userTask("ConfirmDocuments", [bind("record", employee("Finance"))]);
const prepare = userTask("PrepareWorkstation", []);
const finalProcess = (stage: string) =>
  [bind("assetTag", text("LT-0042")), bind("employee", employee("Finance")), bind("onboardingStage", text(stage))];

// Journey one: the open Order laptop snapshot survives the sibling's later write (RPF-VALUE-01).
test("journey one keeps the armed laptop argument after Collect documents writes employee", async () => {
  const { program, state: opened } = await started();
  let state = commit(program, opened, prepare);
  assert.deepEqual(laptopArguments(state), [bind("employee", employee("Sales"))]);
  state = commit(program, state, confirm);
  assert.deepEqual(laptopArguments(state), [bind("employee", employee("Sales"))]);
  assert.deepEqual(process(state), [bind("employee", employee("Finance")), bind("onboardingStage", text("documents-filed"))]);
  // The join waits for the open branch.
  assert.deepEqual(openTasks(state), []);
  state = commit(program, state, laptopOrdered);
  assert.deepEqual(process(state), finalProcess("equipment-ordered"));
  assert.deepEqual(openTasks(state), ["HoldWelcomeMeeting"]);
});

// Journeys two and three: whichever root branch commits its onboardingStage write last wins (RPF-WRITE-01).
for (const documentsFirst of [true, false]) {
  test(`journey ${documentsFirst ? "two" : "three"} ends with the last committed onboardingStage write and joins once`,
    async () => {
      const { program, state: opened } = await started();
      let state = documentsFirst ? commit(program, opened, confirm) : opened;
      state = commit(program, state, prepare);
      assert.deepEqual(laptopArguments(state), [bind("employee", employee(documentsFirst ? "Finance" : "Sales"))]);
      state = commit(program, state, laptopOrdered);
      if (!documentsFirst) {
        assert.deepEqual(openTasks(state), ["ConfirmDocuments"]);
        state = commit(program, state, confirm);
      }
      assert.deepEqual(process(state), finalProcess(documentsFirst ? "equipment-ordered" : "documents-filed"));
      assert.deepEqual(openTasks(state), ["HoldWelcomeMeeting"]);
      state = commit(program, state, userTask("HoldWelcomeMeeting", []));
      assert.deepEqual(state.userTaskWaits, []);
      assert.deepEqual(state.effectWaits, []);
      assert.deepEqual(state.variables.scopes, []);
    });
}

test("RPF-VALUE-01 an over-allowance Confirm documents patch on one root branch changes nothing", async () => {
  const { program, state: opened } = await started();
  const state = commit(program, opened, prepare);
  const result = applyStimulus(program, state, userTask("ConfirmDocuments", patchOfSize("record", nestedScopePatchByteLimit + 1)));
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(result.state, state);
  const atAllowance = commit(program, state, userTask("ConfirmDocuments", patchOfSize("record", nestedScopePatchByteLimit)));
  assert.deepEqual(laptopArguments(atAllowance), [bind("employee", employee("Sales"))]);
});
