import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID, CommandOutcome, ControlStateKind,
  EffectExecutionResultKind, SemanticOperationKind as Kind, SemanticProfileId,
  StimulusKind, VariableValueKind, applyInternalOperationStep, applyStimulus,
  initialState, isWellFormedRuntimeState, isWellFormedSemanticProcessProgram,
  profileAllowsProgramShape, supportsSemanticProcessExecution,
  type RuntimeState, type SemanticProcessProgram, type Stimulus,
} from "@bpmn-lean/semantic-core";
import { admittedInternalPrefix } from "../../semantic-core/test/internal-operation-prefix-fixture.ts";

type AdmissionModule = typeof import("../../semantic-core/src/semantic-command-admission.ts");
const { admit } = await import(new URL(
  "../../semantic-core/dist/semantic-command-admission.js", import.meta.url,
).href) as AdmissionModule;
type GraphModule = typeof import("../../semantic-core/src/semantic-process-graph-admission.ts");
const { isWellFormedSemanticProcessProgramGraph } = await import(new URL(
  "../../semantic-core/dist/semantic-process-graph-admission.js", import.meta.url,
).href) as GraphModule;

const instanceId = "CompensationSchedulingAdmission_1";
const compilation = await compileBpmnToSemanticProcess({
  bytes: await readFile(new URL("./fixtures/compensation-source-checkpoint.bpmn", import.meta.url)),
  sourceId: "compensation-scheduling-admission", expectedSha256: undefined, sourceOverlay: null,
  semanticProfile: COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
});
assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
if (compilation.status !== BpmnCompilationStatus.Accepted) throw new Error("source rejected");
const program = compilation.semanticProcess;
const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start",
  processId: program.processId, instanceId,
  initialVariables: [{ name: "Property_TravelDetails",
    value: { kind: VariableValueKind.String, value: "frozen itinerary" } }],
};

const entry = program.operations.find((op) => op.kind === Kind.EnterScope);
const join = program.operations.find((op) => op.kind === Kind.Synchronize);
const trigger = program.operations.find((op) => op.kind === Kind.TriggerCompensation);
assert.ok(entry?.kind === Kind.EnterScope && join?.kind === Kind.Synchronize &&
  trigger?.kind === Kind.TriggerCompensation);
const priorTask = program.operations.find((op) => op.kind === Kind.AwaitUserTask && op.output === entry.input);
const siblingTask = program.operations.find((op) => op.kind === Kind.AwaitUserTask && join.inputs.includes(op.output));
const childComplete = program.operations.find((op) => op.kind === Kind.CompleteScope && op.scopeId === entry.childScopeId);
assert.ok(priorTask?.kind === Kind.AwaitUserTask && siblingTask?.kind === Kind.AwaitUserTask &&
  childComplete?.kind === Kind.CompleteScope && childComplete.parentOutput !== null);

const childParentOutput = childComplete.parentOutput;
const startArmingIds = [priorTask.id, siblingTask.id].sort();

const widenings: ReadonlyArray<Readonly<{
  name: string; program: SemanticProcessProgram; frontier: readonly string[];
}>> = [
  {
    name: "child entry before its preceding task",
    program: { ...program, operations: program.operations.map((op) => {
      if (op.id === entry.id) return { ...entry, input: priorTask.input };
      if (op.id === priorTask.id) return { ...priorTask, input: priorTask.output, output: childParentOutput };
      if (op.id === childComplete.id) return { ...childComplete, parentOutput: priorTask.output };
      return op;
    }) },
    frontier: [entry.id, siblingTask.id],
  },
  {
    name: "Compensation trigger before the parallel join",
    program: { ...program, operations: program.operations.map((op) => {
      if (op.id === trigger.id) return { ...trigger, input: siblingTask.input, output: trigger.input };
      if (op.id === siblingTask.id) return { ...siblingTask, input: trigger.input };
      if (op.id === join.id) return { ...join, output: trigger.output };
      return op;
    }) },
    frontier: [trigger.id, priorTask.id],
  },
];

for (const widening of widenings) {
  test(`Compensation exact admission rejects ${widening.name} despite unchanged operation counts`, () => {
    const candidate = widening.program;
    assert.equal(profileAllowsProgramShape(program.identity.semanticProfile,
      candidate.operations, candidate.definitionScopes.length), true);
    assert.equal(isWellFormedSemanticProcessProgramGraph({
      // Select only the generic acyclic graph policy; this grants no User Task profile admission.
      semanticProfile: SemanticProfileId.UserTask, processId: candidate.processId,
      definitionScopes: candidate.definitionScopes, operationScopes: candidate.operationScopes,
      controlPlaceScopes: candidate.controlPlaceScopes,
      controlPlaceIds: candidate.controlPlaces.map(({ id }) => id), operations: candidate.operations,
    }, candidate.compensationEventSubProcessSnapshots?.targets ?? []), true);
    assert.equal(isWellFormedSemanticProcessProgram(candidate), false);
    assert.equal(supportsSemanticProcessExecution(start, candidate), false);
    const initiate = candidate.operations.find((op) => op.kind === Kind.Initiate);
    const split = candidate.operations.find((op) => op.kind === Kind.Duplicate);
    assert.ok(initiate !== undefined && split !== undefined);
    const frontier = admittedInternalPrefix(candidate, initialState, start,
      [initiate.id, split.id], widening.frontier);
    assert.equal(isWellFormedRuntimeState(candidate, instanceId, frontier), true);
  });
}

test("every retained Compensation completion path needs only ordinary Start arming as an internal batch", () => {
  assert.equal(supportsSemanticProcessExecution(start, program), true);
  const initial = inspectCommand(initialState, start);
  const terminals = { completed: 0, failed: 0 };
  visit(initial, 1);
  assert.deepEqual(terminals, { completed: 9, failed: 24 });

  function visit(state: RuntimeState, depth: number): void {
    assert.ok(depth <= 7, "the selected acyclic model has at most three task and three handler completions");
    switch (state.control.kind) {
      case ControlStateKind.Completed:
        terminals.completed++;
        return;
      case ControlStateKind.Failed:
        terminals.failed++;
        return;
      default:
        assert.equal(state.control.kind, ControlStateKind.Running);
    }
    const commands: Stimulus[] = state.userTaskWaits.map(({ id }) => ({
      kind: StimulusKind.CompleteUserTaskInstance, commandId: `task:${depth}:${id.elementId}`,
      taskId: id, submittedValues: [],
    }));
    for (const { id } of state.compensationHandlerEffectWaits ?? []) {
      for (const result of [
        { kind: EffectExecutionResultKind.Success, localPatch: [] },
        { kind: EffectExecutionResultKind.BpmnError, code: "undo-failed", message: null, localPatch: [] },
      ] as const) {
        commands.push({ kind: StimulusKind.CompleteEffect,
          commandId: `effect:${depth}:${id.elementId}:${result.kind}`, effectId: id, result });
      }
    }
    assert.ok(commands.length > 0, "every running stable state offers selected human or handler work");
    for (const command of commands) visit(inspectCommand(state, command), depth + 1);
  }
});

function inspectCommand(before: RuntimeState, stimulus: Stimulus): RuntimeState {
  const admitted = admit(program, before, stimulus);
  assert.equal(admitted.outcome, CommandOutcome.Committed);
  const actual = applyStimulus(program, before, stimulus);
  assert.equal(actual.outcome, CommandOutcome.Committed);
  inspectPrefix(admitted.state, 0);
  return actual.state;

  function inspectPrefix(state: RuntimeState, steps: number): void {
    assert.ok(steps <= 8, "internal exploration retains the production closure bound");
    assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
    const enabled = program.operations.map((op) => applyInternalOperationStep(program, op, state))
      .filter((step) => step !== null);
    if (enabled.length === 0) {
      assert.deepEqual(state, actual.state, "every complete internal order agrees with production closure");
      return;
    }
    if (enabled.length > 1) {
      assert.equal(stimulus.kind, StimulusKind.StartProcess);
      assert.deepEqual(enabled.map(({ operation }) => operation.id).sort(),
        startArmingIds);
      assert.ok(enabled.every(({ operation }) => operation.kind === Kind.AwaitUserTask));
    }
    for (const step of enabled) inspectPrefix(step.successor, steps + 1);
  }
}
