import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { CommandOutcome, ControlStateKind, EffectExecutionResultKind, SemanticOperationKind as Kind,
  SemanticProfileId, StimulusKind, TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID,
  applyInternalOperationStep, applyStimulus, initialState, isWellFormedRuntimeState,
  isWellFormedSemanticProcessProgram, projectOpenFlowNodeOccurrences, supportsSemanticProcessExecution,
  transactionCancellationProgramShape, type RuntimeState, type SemanticProcessProgram, type Stimulus, type StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import { admittedInternalPrefix } from "../../semantic-core/test/internal-operation-prefix-fixture.ts";

type AdmissionModule = typeof import("../../semantic-core/src/semantic-command-admission.ts");
const { admit } = await import(new URL("../../semantic-core/dist/semantic-command-admission.js", import.meta.url).href) as AdmissionModule;
type GraphModule = typeof import("../../semantic-core/src/semantic-process-graph-admission.ts");
const { isWellFormedSemanticProcessProgramGraph } = await import(new URL(
  "../../semantic-core/dist/semantic-process-graph-admission.js", import.meta.url).href) as GraphModule;
const xml = await readFile(new URL("./fixtures/transaction-cancellation.bpmn", import.meta.url), "utf8");
const instanceId = "transaction-scheduling";

async function compile(source: string): Promise<SemanticProcessProgram> {
  const result = await compileBpmnToSemanticProcess({ bytes: Buffer.from(source), sourceId: "transaction-scheduling",
    expectedSha256: undefined, sourceOverlay: null, semanticProfile: TRANSACTION_CANCELLATION_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 } });
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  if (result.status !== BpmnCompilationStatus.Accepted) assert.fail("Transaction grammar was rejected");
  return result.semanticProcess;
}

const start = (program: SemanticProcessProgram): StartProcessStimulus => ({ kind: StimulusKind.StartProcess,
  commandId: "start", processId: program.processId, instanceId, initialVariables: [] });

for (const ordinaryLength of [1, 2]) for (const cancelLength of [1, 2]) {
  for (let eligiblePosition = 1; eligiblePosition <= ordinaryLength; eligiblePosition++) {
    for (const renamed of [false, true]) {
      test(`Transaction ${ordinaryLength}/${cancelLength}, eligible=${eligiblePosition}, renamed=${renamed} has only the selected frontiers`, async () => {
        let source = xml;
        if (ordinaryLength === 1) source = source
          .replace('      <bpmn:userTask id="Task_Prepare" name="Prepare reservation" />\n', '')
          .replace('targetRef="Task_Prepare"', 'targetRef="End_Prepared"')
          .replace('      <bpmn:sequenceFlow id="Flow_Prepared" sourceRef="Task_Prepare" targetRef="End_Prepared" />\n', '');
        if (cancelLength === 2) source = source
          .replace('<bpmn:userTask id="Task_Withdraw"', '<bpmn:userTask id="Task_Confirm" /><bpmn:sequenceFlow id="Flow_Confirm" sourceRef="Task_Confirm" targetRef="End_Cancel" /><bpmn:userTask id="Task_Withdraw"')
          .replace('sourceRef="Task_Withdraw" targetRef="End_Cancel"', 'sourceRef="Task_Withdraw" targetRef="Task_Confirm"');
        if (eligiblePosition === 2) source = source.replace('attachedToRef="Task_Reserve"', 'attachedToRef="Task_Prepare"');
        if (renamed) source = source
          .replaceAll(/\b(?:Definitions|Process|Transaction|Start|Split|Task|End|Boundary|Cancel|Compensate|Association|Flow)_\w+/g,
            (id) => `Renamed_${id}`)
          .replace(/^(      <bpmn:sequenceFlow.*\n)+/m, (block) => block.trimEnd().split('\n').reverse().join('\n') + '\n');
        const program = await compile(source);
        const split = program.operations.find((op) => op.kind === Kind.Duplicate);
        assert.ok(split?.kind === Kind.Duplicate);
        const arms = program.operations.filter((op) => op.kind === Kind.AwaitUserTask && split.outputs.includes(op.input));
        assert.equal(arms.length, 2);
        const armingIds = arms.map((op) => op.id).sort();
        const terminalCounts = { completed: 0, failed: 0 };
        const reachedKinds = new Set<Kind>();
        let batches = 0;
        visit(inspect(initialState, start(program)), 0);
        assert.ok(terminalCounts.completed > 0 && terminalCounts.failed > 0);
        assert.ok(batches > 0);
        assert.ok(reachedKinds.has(Kind.CancelTransaction));
        assert.ok(reachedKinds.has(Kind.EnterScope));

        function visit(state: RuntimeState, depth: number): void {
          assert.ok(depth <= ordinaryLength + cancelLength + 2);
          switch (state.control.kind) {
            case ControlStateKind.Completed: terminalCounts.completed++; return;
            case ControlStateKind.Failed: terminalCounts.failed++; return;
            default: assert.equal(state.control.kind, ControlStateKind.Running);
          }
          const effects = state.compensationHandlerEffectWaits ?? [];
          if (effects.length > 0) {
            assert.equal(effects.length, 1);
            assert.equal(state.userTaskWaits.length, 0);
            assert.equal(state.compensationTriggers?.filter(({ lifecycle }) => lifecycle === "active").length, 1);
          } else assert.ok(state.userTaskWaits.length >= 1 && state.userTaskWaits.length <= 2);
          const stimuli: Stimulus[] = state.userTaskWaits.map(({ id }) => ({
            kind: StimulusKind.CompleteUserTaskInstance, commandId: `task:${depth}:${id.elementId}`,
            taskId: id, submittedValues: [] }));
          for (const { id } of effects) for (const result of [
            { kind: EffectExecutionResultKind.Success, localPatch: [] },
            { kind: EffectExecutionResultKind.BpmnError, code: "release-failed", message: null, localPatch: [] },
          ] as const) stimuli.push({ kind: StimulusKind.CompleteEffect,
            commandId: `effect:${depth}:${result.kind}`, effectId: id, result });
          for (const stimulus of stimuli) visit(inspect(state, stimulus), depth + 1);
        }

        function inspect(before: RuntimeState, stimulus: Stimulus): RuntimeState {
          const admitted = admit(program, before, stimulus);
          assert.equal(admitted.outcome, CommandOutcome.Committed);
          const actual = applyStimulus(program, before, stimulus);
          assert.equal(actual.outcome, CommandOutcome.Committed);
          prefix(admitted.state, 0);
          return actual.state;

          function prefix(state: RuntimeState, depth: number): void {
            assert.ok(depth <= 8);
            assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
            assert.ok(projectOpenFlowNodeOccurrences(program, state) !== null);
            const enabled = program.operations.map((op) => applyInternalOperationStep(program, op, state))
              .filter((step) => step !== null);
            enabled.forEach(({ operation }) => reachedKinds.add(operation.kind));
            if (enabled.length === 0) assert.deepEqual(state, actual.state);
            if (enabled.length > 1) {
              batches++;
              assert.equal(stimulus.kind, StimulusKind.StartProcess);
              assert.deepEqual(enabled.map(({ operation }) => operation.id).sort(), armingIds);
              assert.ok(enabled.every(({ operation }) => operation.kind === Kind.AwaitUserTask));
            }
            for (const step of enabled) prefix(step.successor, depth + 1);
          }
        }
      });
    }
  }
}

test("complete Transaction admission rejects a same-cardinality Cancel-before-wait mixed frontier", async () => {
  const program = await compile(xml);
  const cancel = program.operations.find((op) => op.kind === Kind.CancelTransaction);
  const withdraw = program.operations.find((op) => op.kind === Kind.AwaitUserTask && op.task.elementId === "Task_Withdraw");
  const ack = program.operations.find((op) => op.kind === Kind.AwaitUserTask && op.task.elementId === "Task_Acknowledge");
  const root = program.definitionScopes.find(({ parentScopeId }) => parentScopeId === null);
  assert.ok(cancel?.kind === Kind.CancelTransaction && withdraw?.kind === Kind.AwaitUserTask &&
    ack?.kind === Kind.AwaitUserTask && root);
  const candidate: SemanticProcessProgram = { ...program,
    operations: program.operations.map((op) => {
      switch (op.id) {
        case cancel.id: return { ...cancel, input: withdraw.input };
        case withdraw.id: return { ...withdraw, input: cancel.output };
        case ack.id: return { ...ack, input: withdraw.output };
        default: return op;
      }
    }),
    operationScopes: program.operationScopes.map((owner) => owner.operationId === withdraw.id
      ? { ...owner, scopeId: root.id } : owner),
    controlPlaceScopes: program.controlPlaceScopes.map((owner) => owner.controlPlaceId === withdraw.output
      ? { ...owner, scopeId: root.id } : owner),
  };
  assert.equal(transactionCancellationProgramShape(candidate.operations, candidate.definitionScopes.length), true);
  assert.equal(isWellFormedSemanticProcessProgramGraph({ semanticProfile: SemanticProfileId.UserTask,
    processId: candidate.processId, definitionScopes: candidate.definitionScopes,
    operationScopes: candidate.operationScopes, controlPlaceScopes: candidate.controlPlaceScopes,
    controlPlaceIds: candidate.controlPlaces.map(({ id }) => id), operations: candidate.operations }, []), true);
  assert.equal(isWellFormedSemanticProcessProgram(candidate), false);
  assert.equal(supportsSemanticProcessExecution(start(candidate), candidate), false);
  const prefix = [Kind.Initiate, Kind.EnterScope, Kind.Duplicate].map((kind) => {
    const op = candidate.operations.find((op) => op.kind === kind);
    assert.ok(op);
    return op.id;
  });
  const state = admittedInternalPrefix(candidate, initialState, start(candidate), prefix,
    [cancel.id, "operation:Task_Reserve"]);
  assert.equal(isWellFormedRuntimeState(candidate, instanceId, state), true);
});
