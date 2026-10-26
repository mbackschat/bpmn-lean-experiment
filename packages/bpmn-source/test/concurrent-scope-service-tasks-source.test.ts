/**
 * Retained witnesses of the concurrent scope Service Task family (CSE-ADMIT-01 through CSE-REFUSE-01), driven through
 * the exact-bytes source path and the core. The oracle is the capsule's separating-witness account: open User Tasks
 * and open effects, named by element and activation, and Process status after each command. Every source refusal is a
 * one-fact mutation of an admitted retained model, so a gate that refused everything could not pass.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind, CommandOutcome, EffectExecutionResultKind, ObservationRequestKind, ProcessStatus,
  ScenarioDocumentKind, SemanticOperationKind, StimulusKind, runScenario, supportsSemanticProcessScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";

import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";

const semanticProfile = "cibseven-2.2.0-embedded-subprocess-completion-draft";
const instanceId = "concurrent-scope-effects";
const directory = new URL("../../../scenarios/concurrent-scope-service-tasks/", import.meta.url);

const read = async (name: string): Promise<string> => readFile(new URL(name, directory), "utf8");

type Overlay = Readonly<{ id: string; sha256: string; bytes: Uint8Array }>;

async function overlay(name: string): Promise<Overlay> {
  const bytes = await readFile(new URL(`${name}.json`, directory));
  return { id: name, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}

async function compile(xml: string, sourceOverlay: Overlay | null) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "concurrent-scope-effects", expectedSha256: undefined,
    semanticProfile, sourceOverlay, limits: semanticProcessTestLimits,
  });
}

async function admitted(xml: string, sourceOverlay: Overlay | null): Promise<SemanticProcessProgram> {
  const result = await compile(xml, sourceOverlay);
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

async function assertRefused(label: string, xml: string, sourceOverlay: Overlay | null): Promise<void> {
  assert.equal((await compile(xml, sourceOverlay)).status, BpmnCompilationStatus.Rejected, `${label} was admitted`);
}

const supplier = async () => ({ xml: await read("supplier-screening.bpmn"), overlay: await overlay("supplier-screening-handlers") });
const claim = async () => ({ xml: await read("claim-intake.bpmn"), overlay: await overlay("claim-intake-handlers") });

/** One command of a journey: a User Task or an effect completion, addressed by element and activation. */
type Command = Readonly<{ task: string } | { effect: string }> & Readonly<{ activation?: number }>;

function stimulus(command: Command, index: number): Stimulus {
  const id = { processInstanceId: instanceId, elementId: "task" in command ? command.task : command.effect,
    activation: command.activation ?? 1 };
  return "task" in command
    ? { kind: StimulusKind.CompleteUserTaskInstance, commandId: `command-${index}`, taskId: id, submittedValues: [] }
    : { kind: StimulusKind.CompleteEffect, commandId: `command-${index}`, effectId: id,
      result: { kind: EffectExecutionResultKind.Success, localPatch: [] } };
}

type Step = Readonly<{ outcome: CommandOutcome; open: readonly string[]; status: ProcessStatus }>;

/** Runs Start and the commands; per command, its outcome and the open tasks and effects as `element#activation`. */
function journey(program: SemanticProcessProgram, commands: readonly Command[]): readonly Step[] {
  const scenario = {
    kind: ScenarioDocumentKind.Scenario, id: "concurrent-scope-effects-journey", profile: program.identity.semanticProfile,
    bpmn: { id: program.identity.sourceId, relativePath: "model.bpmn", sha256: program.identity.sourceSha256,
      sourceOverlay: program.identity.sourceOverlay },
    observations: [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults, ObservationRequestKind.ProcessStatus,
      ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks, ObservationRequestKind.OpenTimers,
      ObservationRequestKind.OpenEffects, ObservationRequestKind.Variables, ObservationRequestKind.EnabledInteractions,
      ObservationRequestKind.LogicalTime],
    provenance: { normativeRefs: [], cibRevision: "none", cibRefs: [] },
    stimuli: [
      { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId, initialVariables: [] },
      ...commands.map(stimulus),
    ],
  } as const satisfies Scenario;
  assert.equal(supportsSemanticProcessScenario(scenario, program), true);
  const trace = runScenario(scenario, program).trace;
  const steps: Step[] = [];
  trace.forEach((entry, index) => {
    if (entry.kind !== CanonicalObservationKind.Command) return;
    const state = trace.slice(index + 1).find(next => next.kind === CanonicalObservationKind.State);
    assert.ok(state?.kind === CanonicalObservationKind.State);
    steps.push({ outcome: entry.outcome, status: state.status, open: [
      ...state.openUserTasks.map(({ id }) => `${id.elementId}#${id.activation}`),
      ...state.openEffects.map(({ id }) => `${id.elementId}#${id.activation}`),
    ].toSorted() });
  });
  assert.equal(steps.length, commands.length + 1);
  return steps;
}

const open = (...ids: string[]): string[] => ids.toSorted();
const committed = (count: number) => Array<CommandOutcome>(count).fill(CommandOutcome.Committed);

test("CSE-ADMIT-01: both retained models compile with their overlays to Programs with one effect per Service Task", async () => {
  for (const [model, effects] of [[await supplier(), 3], [await claim(), 2]] as const) {
    const program = await admitted(model.xml, model.overlay);
    assert.equal(program.operations.filter(({ kind }) => kind === SemanticOperationKind.AwaitEffect).length, effects);
    assert.notEqual(program.identity.sourceOverlay, null);
  }
});

test("CSE-QUIESCE-01 and CSE-ISOLATE-01: the supplier join and the Sub-Process wait for both effects in either order", async () => {
  const { xml, overlay: handlers } = await supplier();
  const program = await admitted(xml, handlers);
  for (const [first, second] of [["ServiceTask_ScreenSanctions", "ServiceTask_VerifyBankAccount"],
    ["ServiceTask_VerifyBankAccount", "ServiceTask_ScreenSanctions"]] as const) {
    const steps = journey(program, [{ task: "UserTask_ReviewContract" }, { effect: first }, { effect: second },
      { task: "UserTask_ApproveSupplier" }, { effect: "ServiceTask_ActivateSupplier" }]);
    assert.deepEqual(steps.map(({ outcome }) => outcome), committed(6));
    assert.deepEqual(steps[0]!.open,
      open("ServiceTask_ScreenSanctions#1", "ServiceTask_VerifyBankAccount#1", "UserTask_ReviewContract#1"));
    assert.deepEqual(steps[1]!.open, open("ServiceTask_ScreenSanctions#1", "ServiceTask_VerifyBankAccount#1"));
    // A premature join would open Approve supplier beside the remaining effect.
    assert.deepEqual(steps[2]!.open, open(`${second}#1`));
    assert.deepEqual(steps[3]!.open, open("UserTask_ApproveSupplier#1"));
    // Activate supplier is armed only after Onboard completes.
    assert.deepEqual(steps[4]!.open, open("ServiceTask_ActivateSupplier#1"));
    assert.deepEqual(steps[5]!, { outcome: CommandOutcome.Committed, open: [], status: ProcessStatus.Completed });
  }
});

test("CSE-ARM-01 and CSE-ISOLATE-01: two live Assess occurrences own distinct Price damage effects", async () => {
  const { xml, overlay: handlers } = await claim();
  const program = await admitted(xml, handlers);
  const steps = journey(program, [{ effect: "ServiceTask_FetchPolicy" }, { task: "UserTask_CollectPoliceReport" },
    { effect: "ServiceTask_PriceDamage", activation: 2 }, { effect: "ServiceTask_PriceDamage", activation: 1 },
    { task: "UserTask_ConfirmAssessment", activation: 2 }, { task: "UserTask_ConfirmAssessment", activation: 1 },
    { task: "UserTask_SettleClaim" }]);
  assert.deepEqual(steps.map(({ outcome }) => outcome), committed(8));
  assert.deepEqual(steps[0]!.open, open("ServiceTask_FetchPolicy#1", "UserTask_CollectPoliceReport#1"));
  assert.deepEqual(steps[1]!.open, open("ServiceTask_PriceDamage#1", "UserTask_CollectPoliceReport#1"));
  assert.deepEqual(steps[2]!.open, open("ServiceTask_PriceDamage#1", "ServiceTask_PriceDamage#2"));
  // Completing activation 2 first leaves activation 1 open; a wrong-activation resolver would invert this.
  assert.deepEqual(steps[3]!.open, open("ServiceTask_PriceDamage#1", "UserTask_ConfirmAssessment#1"));
  assert.deepEqual(steps[4]!.open, open("UserTask_ConfirmAssessment#1", "UserTask_ConfirmAssessment#2"));
  assert.deepEqual(steps[5]!.open, open("UserTask_ConfirmAssessment#1"));
  // Settle claim appears only after both occurrences and Intake complete.
  assert.deepEqual(steps[6]!.open, open("UserTask_SettleClaim#1"));
  assert.equal(steps[7]!.status, ProcessStatus.Completed);
});

test("CSE-REFUSE-01: a stale and a never-armed effect completion are rejected with the state unchanged", async () => {
  const { xml, overlay: handlers } = await claim();
  const program = await admitted(xml, handlers);
  const steps = journey(program, [{ effect: "ServiceTask_FetchPolicy" }, { task: "UserTask_CollectPoliceReport" },
    { effect: "ServiceTask_PriceDamage", activation: 2 }, { effect: "ServiceTask_PriceDamage", activation: 2 },
    { effect: "ServiceTask_PriceDamage", activation: 3 }]);
  assert.deepEqual(steps.map(({ outcome }) => outcome), [...committed(4), CommandOutcome.Rejected, CommandOutcome.Rejected]);
  for (const step of steps.slice(3)) {
    assert.deepEqual(step.open, open("ServiceTask_PriceDamage#1", "UserTask_ConfirmAssessment#1"));
  }
});

test("CSE-ADMIT-01: each source mutation outside the admitted class is refused before start", async () => {
  const { xml, overlay: handlers } = await supplier();
  const screen = 'camunda:delegateExpression="${sanctionsScreening}" camunda:asyncBefore="true"';
  assert.equal(xml.split(screen).length, 2);
  await assertRefused("no overlay", xml, null);
  await assertRefused("no asyncBefore", xml.replace(screen, 'camunda:delegateExpression="${sanctionsScreening}"'), handlers);
  await assertRefused("asyncAfter", xml.replace(screen, `${screen} camunda:asyncAfter="true"`), handlers);
  await assertRefused("unbound delegate", xml.replace("${sanctionsScreening}", "${unknownHandler}"), handlers);
  await assertRefused("input mapping", xml.replace(`${screen}>`, `${screen}><bpmn:extensionElements><camunda:inputOutput>` +
    '<camunda:inputParameter name="supplier">acme</camunda:inputParameter></camunda:inputOutput></bpmn:extensionElements>'), handlers);
  await assertRefused("Script Task", xml.replace('<bpmn:userTask id="UserTask_ReviewContract" name="Review supplier contract">',
    '<bpmn:scriptTask id="UserTask_ReviewContract" name="Review supplier contract" scriptFormat="javascript">')
    .replace("</bpmn:userTask>\n      <bpmn:parallelGateway id=\"Gateway_ChecksJoin\"", "</bpmn:scriptTask>\n      <bpmn:parallelGateway id=\"Gateway_ChecksJoin\""),
  handlers);
  const credit = await readFile(new URL("../../../scenarios/concurrent-embedded-activations/credit-intake.bpmn", import.meta.url), "utf8");
  await admitted(credit, null);
  await assertRefused("overlay without a Service Task", credit, (await claim()).overlay);
});
