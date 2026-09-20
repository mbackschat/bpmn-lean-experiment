import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, applyInternalOperationStep, applyStimulusWithTrace, initialState,
  isWellFormedSemanticProcessProgram, runtimeStateDefects, StimulusKind,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { admittedInternalPrefix } from "../../semantic-core/test/internal-operation-prefix-fixture.ts";

import {
  compileSemanticProcessFixture,
  semanticProcessTestLimits,
} from "./semantic-process-compilation-test-support.ts";

const fixtureUrl = new URL(
  "../../../scenarios/embedded-subprocess-completion/process.bpmn",
  import.meta.url,
);
const semanticProfile =
  "cibseven-2.2.0-embedded-subprocess-completion-draft";

const { evaluateStimulusWithSelectedSteps } = await import(
  new URL("../../semantic-core/dist/semantic-process-runtime.js", import.meta.url).href
) as typeof import("../../semantic-core/src/semantic-process-runtime.ts");
const { deriveInternalRegionalPreparation } = await import(
  new URL("../../semantic-core/dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../../semantic-core/src/internal-transition-regional-preparation.ts");
const { deriveInternalTransitionPreparation } = await import(
  new URL("../../semantic-core/dist/internal-transition-batch.js", import.meta.url).href
) as typeof import("../../semantic-core/src/internal-transition-batch.ts");
const { internalTransitionStateFootprintsAreIndependent } = await import(
  new URL("../../semantic-core/dist/internal-transition-footprint.js", import.meta.url).href
) as typeof import("../../semantic-core/src/internal-transition-footprint.ts");

async function compileFrontier(xml: string) {
  const compiled = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: "admitted-frontier",
    expectedSha256: undefined, semanticProfile, sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });
  assert.ok(compiled.status === BpmnCompilationStatus.Accepted);
  const program = compiled.semanticProcess;
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  const start = {
    kind: StimulusKind.StartProcess, commandId: "frontier-start",
    processId: program.processId, instanceId: "frontier-instance", initialVariables: [],
  } as const;
  return { program, start };
}

function stepAt(program: SemanticProcessProgram, state: RuntimeState, id: string) {
  const operation = program.operations.find((candidate) => candidate.id === id);
  assert.ok(operation !== undefined);
  const step = applyInternalOperationStep(program, operation, state);
  assert.ok(step !== null, `operation ${id} must be enabled`);
  assert.deepEqual(runtimeStateDefects(program, "frontier-instance", step.successor), []);
  return step;
}

test("an admitted regional pair reached by delaying arming is absent from actual closure batches", async () => {
  const { program, start } = await compileFrontier(`
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs" targetNamespace="urn:frontier">
  <bpmn:process id="Root" isExecutable="true">
    <bpmn:startEvent id="Start"/>
    <bpmn:parallelGateway id="Fork" gatewayDirection="Diverging"/>
    <bpmn:subProcess id="Scope">
      <bpmn:startEvent id="ChildStart"/>
      <bpmn:endEvent id="EndChild"/>
      <bpmn:sequenceFlow id="F7" sourceRef="ChildStart" targetRef="EndChild"/>
    </bpmn:subProcess>
    <bpmn:userTask id="AfterScope"/><bpmn:userTask id="FollowUp"/><bpmn:userTask id="Peer"/>
    <bpmn:endEvent id="EndA"/><bpmn:endEvent id="EndB"/>
    <bpmn:sequenceFlow id="F0" sourceRef="Start" targetRef="Fork"/>
    <bpmn:sequenceFlow id="F1" sourceRef="Fork" targetRef="Scope"/>
    <bpmn:sequenceFlow id="F2" sourceRef="Scope" targetRef="AfterScope"/>
    <bpmn:sequenceFlow id="F3" sourceRef="AfterScope" targetRef="FollowUp"/>
    <bpmn:sequenceFlow id="F4" sourceRef="FollowUp" targetRef="EndA"/>
    <bpmn:sequenceFlow id="F5" sourceRef="Fork" targetRef="Peer"/>
    <bpmn:sequenceFlow id="F6" sourceRef="Peer" targetRef="EndB"/>
  </bpmn:process>
</bpmn:definitions>`);
  const forked = admittedInternalPrefix(program, initialState, start,
    ["operation:Start", "operation:Fork"], ["operation:Scope", "operation:Peer"]);
  const entered = stepAt(program, forked, "operation:Scope").successor;
  const counterfactual = stepAt(program, entered, "operation:EndChild").successor;
  const completion = stepAt(program, counterfactual, "operation:complete-scope:scope:Scope");
  const arming = stepAt(program, counterfactual, "operation:Peer");
  assert.ok(completion.operation.kind === SemanticOperationKind.CompleteScope);
  assert.equal(program.operations.filter((operation) =>
    applyInternalOperationStep(program, operation, counterfactual) !== null).length, 2);
  const regional = deriveInternalRegionalPreparation(program, counterfactual, completion.operation);
  const ordinary = deriveInternalTransitionPreparation(program, counterfactual, arming);
  assert.ok(regional !== null && ordinary !== null);
  assert.equal(internalTransitionStateFootprintsAreIndependent(regional.footprint, ordinary.footprint), true);
  assert.deepEqual(deriveInternalRegionalPreparation(program, arming.successor, completion.operation), regional);
  assert.deepEqual(deriveInternalTransitionPreparation(program, completion.successor, arming), ordinary);
  assert.deepEqual(stepAt(program, completion.successor, arming.operation.id).successor,
    stepAt(program, arming.successor, completion.operation.id).successor);

  const actual = evaluateStimulusWithSelectedSteps(program, initialState, start);
  assert.equal(actual.result.outcome, CommandOutcome.Committed);
  assert.deepEqual(actual.selectedInternalBatches.map((batch) => batch.map(({ operation }) => operation.kind)), [
    [SemanticOperationKind.Initiate], [SemanticOperationKind.Duplicate],
    [SemanticOperationKind.AwaitUserTask, SemanticOperationKind.EnterScope],
    [SemanticOperationKind.ReachNoneEnd], [SemanticOperationKind.CompleteScope],
    [SemanticOperationKind.AwaitUserTask],
  ]);
});

test("an admitted End arrival and task arming commute in state but start rolls back", async () => {
  const xml = (await readFile(fixtureUrl, "utf8"))
    .replace(/\s*<bpmn:(incoming|outgoing)>[^<]*<\/bpmn:\1>/gu, "")
    .replace('sourceRef="Gateway_ChildFork" targetRef="UserTask_ChildA"',
      'sourceRef="Gateway_ChildFork" targetRef="EndEvent_ChildA"')
    .replace('sourceRef="UserTask_ChildA" targetRef="EndEvent_ChildA"',
      'sourceRef="UserTask_ChildA" targetRef="EndEvent_ChildB"')
    .replace('sourceRef="UserTask_ChildB" targetRef="EndEvent_ChildB"',
      'sourceRef="UserTask_ChildB" targetRef="UserTask_ChildA"');
  const { program, start } = await compileFrontier(xml);
  const frontier = admittedInternalPrefix(program, initialState, start,
    ["operation:StartEvent_Outer", "operation:SubProcess_Work", "operation:Gateway_ChildFork"],
    ["operation:EndEvent_ChildA", "operation:UserTask_ChildB"]);
  const end = stepAt(program, frontier, "operation:EndEvent_ChildA");
  const task = stepAt(program, frontier, "operation:UserTask_ChildB");
  assert.deepEqual(stepAt(program, end.successor, task.operation.id).successor,
    stepAt(program, task.successor, end.operation.id).successor);
  const actual = applyStimulusWithTrace(program, initialState, start);
  assert.equal(actual.result.outcome, CommandOutcome.RolledBack);
  assert.equal(actual.result.ambiguousInternalChoice, true);
  assert.equal(actual.result.internalStepBoundExceeded, false);
  assert.deepEqual(actual.result.state, initialState);
  assert.deepEqual(actual.committedTransitions, []);
  assert.deepEqual(actual.flowNodeOccurrenceLifecycles, []);
  const original = await compileFrontier(await readFile(fixtureUrl, "utf8"));
  assert.equal(applyStimulusWithTrace(original.program, initialState, original.start).result.outcome,
    CommandOutcome.Committed);
});

function operationOfKind<Kind extends SemanticOperationKind>(
  operations: ReadonlyArray<SemanticOperation>,
  kind: Kind,
): Extract<SemanticOperation, { kind: Kind }> {
  const found = operations.find((candidate) => candidate.kind === kind);
  assert.ok(found !== undefined, `the program has no ${kind} operation`);
  return found as Extract<SemanticOperation, { kind: Kind }>;
}

test("preserves one embedded definition scope and lowers normal completion", async () => {
  const result = await compileSemanticProcessFixture(
    fixtureUrl,
    "embedded-subprocess-completion-process",
    semanticProfile,
  );

  assert.deepEqual(result.checkedProcess.definitionScopes, [
    {
      id: "scope:Process_EmbeddedSubProcess",
      parentScopeId: null,
      originElementId: "Process_EmbeddedSubProcess",
    },
    {
      id: "scope:SubProcess_Work",
      parentScopeId: "scope:Process_EmbeddedSubProcess",
      originElementId: "SubProcess_Work",
    },
  ]);
  assert.deepEqual(
    result.semanticProcess.operations.map(({ kind }) => kind),
    [
      SemanticOperationKind.ReachNoneEnd,
      SemanticOperationKind.ReachNoneEnd,
      SemanticOperationKind.ReachNoneEnd,
      SemanticOperationKind.Duplicate,
      SemanticOperationKind.Initiate,
      SemanticOperationKind.EnterScope,
      SemanticOperationKind.AwaitUserTask,
      SemanticOperationKind.AwaitUserTask,
      SemanticOperationKind.AwaitUserTask,
      SemanticOperationKind.CompleteScope,
      SemanticOperationKind.CompleteScope,
    ],
  );
  assert.deepEqual(
    operationOfKind(
      result.semanticProcess.operations,
      SemanticOperationKind.EnterScope,
    ),
    {
      id: "operation:SubProcess_Work",
      kind: SemanticOperationKind.EnterScope,
      origin: { kind: "bpmnElement", elementId: "SubProcess_Work" },
      input: "place:Flow_OuterStartToScope",
      childEntry: "place:Flow_ChildStartToFork",
      childScopeId: "scope:SubProcess_Work",
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.filter(
      ({ kind }) => kind === SemanticOperationKind.CompleteScope,
    ),
    [
      {
        id: "operation:complete-scope:scope:Process_EmbeddedSubProcess",
        kind: SemanticOperationKind.CompleteScope,
        origin: {
          kind: "bpmnElement",
          elementId: "Process_EmbeddedSubProcess",
        },
        scopeId: "scope:Process_EmbeddedSubProcess",
        parentOutput: null,
      },
      {
        id: "operation:complete-scope:scope:SubProcess_Work",
        kind: SemanticOperationKind.CompleteScope,
        origin: { kind: "bpmnElement", elementId: "SubProcess_Work" },
        scopeId: "scope:SubProcess_Work",
        parentOutput: "place:Flow_ScopeToAfter",
      },
    ],
  );
});

test("embedded scope lowering is independent of child and flow declaration order", async () => {
  const original = await compileSemanticProcessFixture(
    fixtureUrl,
    "embedded-subprocess-completion-process",
    semanticProfile,
  );
  const xml = new TextDecoder().decode(await readFile(fixtureUrl));
  const taskA = `      <bpmn:userTask id="UserTask_ChildA" name="Child A">
        <bpmn:incoming>Flow_ChildForkToA</bpmn:incoming>
        <bpmn:outgoing>Flow_ChildAToEnd</bpmn:outgoing>
      </bpmn:userTask>`;
  const taskB = `      <bpmn:userTask id="UserTask_ChildB" name="Child B">
        <bpmn:incoming>Flow_ChildForkToB</bpmn:incoming>
        <bpmn:outgoing>Flow_ChildBToEnd</bpmn:outgoing>
      </bpmn:userTask>`;
  const permuted = swapExact(
    swapExact(
      swapExact(
        xml,
        "        <bpmn:outgoing>Flow_ChildForkToA</bpmn:outgoing>",
        "        <bpmn:outgoing>Flow_ChildForkToB</bpmn:outgoing>",
      ),
      taskA,
      taskB,
    ),
    '      <bpmn:sequenceFlow id="Flow_ChildForkToA" sourceRef="Gateway_ChildFork" targetRef="UserTask_ChildA"/>',
    '      <bpmn:sequenceFlow id="Flow_ChildForkToB" sourceRef="Gateway_ChildFork" targetRef="UserTask_ChildB"/>',
  );
  const reordered = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(permuted),
    sourceId: "embedded-subprocess-completion-permuted",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits: semanticProcessTestLimits,
  });

  assert.equal(reordered.status, BpmnCompilationStatus.Accepted);
  if (reordered.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("permuted embedded Sub-Process was rejected");
  }
  assert.deepEqual(
    reordered.semanticProcess.operations,
    original.semanticProcess.operations,
  );
  assert.deepEqual(
    reordered.semanticProcess.operationScopes,
    original.semanticProcess.operationScopes,
  );
  assert.deepEqual(
    reordered.semanticProcess.controlPlaceScopes,
    original.semanticProcess.controlPlaceScopes,
  );
});

test("rejects event scope and cross-scope flow variants", async () => {
  const xml = new TextDecoder().decode(await readFile(fixtureUrl));
  const variants = [
    xml.replace(
      '<bpmn:subProcess id="SubProcess_Work">',
      '<bpmn:subProcess id="SubProcess_Work" triggeredByEvent="true">',
    ),
    xml.replace(
      'sourceRef="SubProcess_Work" targetRef="UserTask_AfterScope"',
      'sourceRef="UserTask_ChildA" targetRef="UserTask_AfterScope"',
    ),
  ];

  for (const variant of variants) {
    const result = await compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(variant),
      sourceId: "embedded-subprocess-negative",
      expectedSha256: undefined,
      semanticProfile,
      sourceOverlay: null,
      limits: semanticProcessTestLimits,
    });
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});

function swapExact(source: string, left: string, right: string): string {
  assert.equal(source.includes(left), true);
  assert.equal(source.includes(right), true);
  const marker = "__BPMN_LEAN_DECLARATION_SWAP__";
  assert.equal(source.includes(marker), false);
  return source.replace(left, marker).replace(right, left).replace(marker, right);
}
