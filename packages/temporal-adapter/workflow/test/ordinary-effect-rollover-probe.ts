import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mock, test } from "node:test";
import * as sdk from "@temporalio/workflow";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { EffectExecutionResultKind, StimulusKind, VariableValueKind, projectOpenEffects } from "@bpmn-lean/semantic-core";
import { bpmnWorkflowChainPatchId, bpmnWorkflowChainCapacityExhaustedFailureType, productionBpmnWorkflowInitialHostInput } from "@bpmn-lean/temporal-protocol";
import type { EffectActivityResult, EffectRequest } from "@bpmn-lean/temporal-protocol";
import type { registerWorkflowCommandIngress } from "../src/workflow-command-ingress.js";
import type { WorkflowChainSuccessorArguments } from "../src/workflow-chain-continuation.js";
import { profile, source, prepareSource, sourceOverlay, parallelBodySource } from "../../../bpmn-source/test/sequential-scope-source-fixture.ts";

type Ingress = Parameters<typeof registerWorkflowCommandIngress>[0];
let ingress: Ingress;
let runId = "effect-drain";
let historyLength = 1;
let historySize = 0;
let phase = 0;
let successor: WorkflowChainSuccessorArguments | undefined;
const continued = new Error("captured Continue-As-New");
let activity = Promise.withResolvers<EffectActivityResult>();
const requests: EffectRequest[] = [];

mock.module("@temporalio/workflow", { cache: false, exports: {
  ...Object.fromEntries(Object.entries(sdk).filter(([name]) => name !== "default")),
  patched: (id: string) => id === bpmnWorkflowChainPatchId,
  workflowInfo: () => ({ runId, firstExecutionRunId: "effect-drain", workflowId: "effect-drain",
    taskQueue: "effect-drain", historyLength, historySize, continueAsNewSuggested: false }),
  setHandler: () => undefined,
  allHandlersFinished: () => true,
  continueAsNew: async (...args: WorkflowChainSuccessorArguments) => { successor = args; throw continued; },
  condition: async (predicate: () => boolean) => {
    if (predicate()) return;
    assert.equal(historySize, 0, "history reservation must roll over before starting or waiting for Activities");
    switch (phase++) {
      case 0: {
        assert.equal(requests.length, 1);
        historyLength = 8_000;
        const task = ingress.currentState().userTaskWaits.find(wait => wait.id.elementId === "Branch0");
        assert.ok(task);
        const command = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "enable-later-effect", taskId: task.id,
          submittedValues: [{ name: "reviewStatus", value: { kind: VariableValueKind.String, value: "approved" } }] } as const;
        assert.equal(ingress.reserveStimulus(command), true);
        ingress.acceptedStimuli.push(command);
        ingress.pendingStimuli.push(command);
        break;
      }
      case 1:
        assert.equal(ingress.currentFence(), "rollover");
        assert.equal(projectOpenEffects(ingress.currentState()).length, 2);
        assert.equal(requests.length, 1, "the Workflow must fence a newly enabled effect before draining its sibling");
        activity.resolve({ kind: EffectExecutionResultKind.Success,
          localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "accepted" } }] });
        break;
      default: assert.fail("unexpected host wait after the drain");
    }
    for (let turn = 0; !predicate() && turn < 32; turn++) await Promise.resolve();
    assert.equal(predicate(), true, "bounded deterministic callback drain must wake the Workflow");
  },
  CancellationScope: class {
    run<T>(body: () => Promise<T>): Promise<T> { return body(); }
    cancel(): void {}
  },
} });
mock.module(new URL("../dist/workflow-command-ingress.js", import.meta.url), { cache: false, exports: {
  registerWorkflowCommandIngress: (options: Ingress) => { ingress = options; },
} });

const { runBpmnProcessWithHostEffects }: typeof import("../src/workflow-implementation.js") =
  await import(new URL("../dist/workflow-implementation.js", import.meta.url).href);
const { ActivationDrain }: typeof import("../src/activation-tagged-readiness.js") =
  await import(new URL("../dist/activation-tagged-readiness.js", import.meta.url).href);

for (const [label, size, issued, phases, remainingElement] of [
  ["drains issued work", 0, 1, 2, "LaterValidate"],
  ["reserves the frontier before issuing work", 7.5 * 1024 * 1024, 0, 0, "Validate"],
] as const) test(`the production loop ${label}`, async () => {
  runId = "effect-drain"; historyLength = 1; historySize = size; phase = 0; successor = undefined;
  requests.length = 0; activity = Promise.withResolvers<EffectActivityResult>();
  const base = prepareSource(await readFile(source, "utf8"));
  const service = base.match(/<serviceTask id="Validate"[\s\S]*?<\/serviceTask>/u)?.[0];
  assert.ok(service);
  const xml = parallelBodySource(base, 3, true).replace('<userTask id="Branch0" />',
    '<userTask id="Branch0" />' + service.replace('id="Validate"', 'id="LaterValidate"') +
    '<sequenceFlow id="AfterReview" sourceRef="Branch0" targetRef="LaterValidate" />')
    .replace('id="Done0" sourceRef="Branch0"', 'id="Done0" sourceRef="LaterValidate"');
  const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml), sourceId: "effect-drain",
    expectedSha256: undefined, semanticProfile: profile, sourceOverlay: sourceOverlay(),
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 } });
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Expected admitted repeated body");
  const program = compiled.semanticProcess;
  await assert.rejects(runBpmnProcessWithHostEffects({ kind: StimulusKind.StartProcess, commandId: "start",
    processId: program.processId, instanceId: "effect-drain", initialVariables: [
      { name: "items", value: { kind: VariableValueKind.StringList, value: ["A", "B"] } }] }, program,
    async () => { assert.fail("No Timer belongs to this body"); },
    request => { requests.push(request); return activity.promise; }, ActivationDrain.Required,
    productionBpmnWorkflowInitialHostInput()), error => error === continued);
  assert.ok(successor);
  assert.deepEqual(successor[3], ingress.currentState());
  assert.equal(requests.length, issued);
  assert.equal(phase, phases);
  const remaining = projectOpenEffects(ingress.currentState());
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]!.id.elementId, remainingElement);
  if (size > 0) {
    const carried = successor;
    successor = undefined;
    runId = "effect-drain-successor";
    historySize = 9.5 * 1024 * 1024;
    await assert.rejects(runBpmnProcessWithHostEffects(carried[0], carried[1],
      async () => { assert.fail("No Timer belongs to this body"); },
      request => { requests.push(request); return activity.promise; }, ActivationDrain.Required,
      carried[2], carried[3], carried[4], carried[5], carried[6]),
    error => error instanceof sdk.ApplicationFailure && error.type === bpmnWorkflowChainCapacityExhaustedFailureType);
    assert.equal(successor, undefined, "an unfit fresh Run must refuse instead of continuing again");
    assert.equal(requests.length, 0);
  }
});
