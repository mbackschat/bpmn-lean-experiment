import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandOutcome, ControlStateKind, EffectExecutionResultKind, SemanticOperationKind, SemanticTransitionKind,
  StimulusKind, VariableValueKind, applyStimulusWithTrace, initialState, projectOpenFlowNodeOccurrences,
  replayCommittedTransitions, requireCompleteFlowNodeOccurrenceLifecycles, supportsSemanticProcessExecution } from "@bpmn-lean/semantic-core";
import type { RuntimeState, ScopeOccurrenceId, Stimulus, TracedCommandResult } from "@bpmn-lean/semantic-core";
import { assertJourneyExecutionCounts } from "./parallel-scope-journey-accounting.ts";
import { parallelCommandInputs } from "./parallel-scope-command-fixture.ts";

for (const { count, program, start } of (await parallelCommandInputs({ parentPrelude: true })).filter(input => input.count === 0 || input.count === 2)) {
  test(`private parallel ${count}-body parent approval and validation precede entry exactly once`, () => {
    assert.equal(supportsSemanticProcessExecution(start, program), false);
    const entry = program.operations.find(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
    const service = program.operations.find(operation => operation.kind === SemanticOperationKind.AwaitEffect && operation.origin.elementId === "ValidateBatch");
    assert.ok(entry?.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
    assert.ok(service?.kind === SemanticOperationKind.AwaitEffect);
    const initiation = program.operations.find(operation => operation.kind === SemanticOperationKind.Initiate);
    const approvalOperation = program.operations.find(operation => operation.kind === SemanticOperationKind.AwaitUserTask && operation.origin.elementId === "ApproveBatch");
    assert.ok(initiation?.kind === SemanticOperationKind.Initiate);
    assert.ok(approvalOperation?.kind === SemanticOperationKind.AwaitUserTask);
    assert.equal(initiation.output, approvalOperation.input);
    assert.equal(approvalOperation.output, service.input);
    assert.equal(service.output, entry.input);
    const path = [initiation, approvalOperation, service];
    let parentStep = 0, entered = false;
    let root: ScopeOccurrenceId | undefined;
    const checkedPrefixes = new Set<string>();
    const credit = (prefix: RuntimeState, expectedPort: string | null) => {
      assert.equal(prefix.control.kind, ControlStateKind.Running);
      assert.deepEqual(prefix.scopeOccurrences, [{ id: root, parent: null }], "pre-entry retains only the exact root");
      assert.deepEqual(prefix.activityOccurrences, []);
      assert.deepEqual(prefix.variables.scopes, []);
      assert.deepEqual(prefix.parallelScopeControllers ?? [], []);
      assert.equal(prefix.initiationPending, expectedPort === null, "pending initiation has no issued parent credit");
      const coordinates = [
        ...prefix.controlTokens.map(token => ({ owner: token.owner, port: token.placeId, count: token.multiplicity })),
        ...[...prefix.userTaskWaits, ...prefix.effectWaits].map(wait => ({ owner: wait.owner, port: wait.output, count: 1 })),
      ];
      for (const coordinate of coordinates) assert.ok(Number.isSafeInteger(coordinate.count) && coordinate.count > 0);
      assert.equal(coordinates.reduce((total, coordinate) => total + coordinate.count, 0),
        prefix.initiationPending ? 0 : 1, "pre-entry continuation credit total");
      for (const coordinate of coordinates) {
        assert.deepEqual(coordinate.owner, root, "credit belongs to exact root");
        assert.equal(coordinate.port, expectedPort, "declared parent continuation port");
      }
    };
    const originalCollection = start.initialVariables.filter(binding => binding.name === entry.collectionName);
    const traces: TracedCommandResult[] = [];
    let state: RuntimeState = initialState;
    const commit = (stimulus: Stimulus) => {
      const traced = applyStimulusWithTrace(program, state, stimulus);
      assert.equal(traced.result.outcome, CommandOutcome.Committed, stimulus.commandId);
      assert.equal(traced.result.internalStepBoundExceeded, false);
      assert.deepEqual(replayCommittedTransitions(program, state, traced.committedTransitions), traced.result.state);
      const open = projectOpenFlowNodeOccurrences(program, state);
      assert.ok(open);
      assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(program,
        open.map(occurrence => ({ ...occurrence, attachedHandlers: [] })), stimulus.commandId,
        traced.committedTransitions, traced.flowNodeOccurrenceLifecycles));
      for (const [index, record] of traced.committedTransitions.entries()) {
        if (entered) break;
        const prefix = replayCommittedTransitions(program, state, traced.committedTransitions.slice(0, index + 1));
        assert.ok(prefix, "actual committed prefix replays");
        if (record.transition.kind === SemanticTransitionKind.InternalOperation && !entered) {
          if (record.transition.operationId === entry.id) {
            assert.equal(parentStep, path.length, "entry follows the entire declared parent sequence");
            entered = true;
          } else {
            assert.equal(record.transition.operationId, path[parentStep]?.id, "actual parent phase follows declared source path");
            parentStep++;
          }
        }
        if (!entered) {
          root ??= prefix.scopeOccurrences.find(scope => scope.parent === null)?.id;
          assert.ok(root);
          const port = parentStep === 0 ? null : path[parentStep - 1]!.output;
          credit(prefix, port);
          checkedPrefixes.add(`${parentStep}:${record.transition.kind}`);
          if (parentStep === 0) {
            const extra = { ...prefix, controlTokens: [{ owner: root, placeId: initiation.output, multiplicity: 1 }] };
            assert.notDeepEqual(extra, prefix);
            assert.throws(() => credit(extra, null), /continuation credit total/);
          }
          if (prefix.userTaskWaits.length === 1) {
            const wait = prefix.userTaskWaits[0]!;
            const foreign = { ...prefix, userTaskWaits: [{ ...wait, owner: { ...wait.owner, activation: wait.owner.activation + 1 } }] };
            const wrongPort = { ...prefix, userTaskWaits: [{ ...wait, output: initiation.output }] };
            assert.notDeepEqual(foreign, prefix);
            assert.notDeepEqual(wrongPort, prefix);
            assert.throws(() => credit(foreign, port), /credit belongs to exact root/);
            assert.throws(() => credit(wrongPort, port), /declared parent continuation port/);
          }
        }
      }
      state = traced.result.state;
      assert.deepEqual(state.variables.process.bindings.filter(binding => binding.name === entry.collectionName),
        originalCollection, "every admitted command preserves the exact Start collection");
      traces.push(traced);
      assertJourneyExecutionCounts(program, traces);
    };
    const refuse = (stimulus: Stimulus) => {
      const rejected = applyStimulusWithTrace(program, state, stimulus);
      assert.equal(rejected.result.outcome, CommandOutcome.Rejected);
      assert.deepEqual(rejected.result.state, state);
      assert.deepEqual(rejected.committedTransitions, []);
      assert.deepEqual(rejected.flowNodeOccurrenceLifecycles, []);
    };
    const entries = () => traces.flatMap(trace => trace.committedTransitions).filter(record =>
      record.transition.kind === SemanticTransitionKind.InternalOperation &&
      record.transition.operationKind === SemanticOperationKind.EnterParallelMultiInstanceScope);
    const beforeEntry = () => {
      assert.equal(state.control.kind, ControlStateKind.Running);
      assert.equal(state.scopeOccurrences.length, 1);
      assert.equal(state.activityOccurrences.length, 0);
      assert.deepEqual(state.parallelScopeControllers ?? [], []);
      assert.deepEqual(state.variables.scopes, []);
      assert.equal(entries().length, 0);
    };
    commit(start);
    assert.equal(state.userTaskWaits.length, 1);
    assert.equal(state.userTaskWaits[0]!.id.elementId, "ApproveBatch");
    beforeEntry();
    assert.equal(state.userTaskWaits[0]!.output, service.input, "approval wait owns the validation input credit");
    const approval = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "approve-batch",
      taskId: state.userTaskWaits[0]!.id, submittedValues: [] } as const;
    for (const value of [{ kind: VariableValueKind.StringList, value: [] },
      { kind: VariableValueKind.String, value: "replacement" }, { kind: VariableValueKind.Null }] as const)
      refuse({ ...approval, commandId: `protected-approval-${value.kind}`, submittedValues: [
        { name: entry.collectionName, value }] });
    commit(approval);
    assert.equal(state.userTaskWaits.length, 0);
    assert.equal(state.effectWaits.length, 1);
    assert.equal(state.effectWaits[0]!.id.elementId, "ValidateBatch");
    beforeEntry();
    assert.equal(state.effectWaits[0]!.output, entry.input, "validation wait owns the exact entry input credit");
    refuse({ ...approval, commandId: "stale-approval" });
    for (const kind of [SemanticOperationKind.AwaitUserTask, SemanticOperationKind.AwaitEffect]) {
      const traceIndex = traces.findIndex(trace => trace.committedTransitions.some(record =>
        record.transition.kind === SemanticTransitionKind.InternalOperation && record.transition.operationKind === kind));
      const trace = traces[traceIndex]!;
      const record = trace.committedTransitions.find(record => record.transition.kind === SemanticTransitionKind.InternalOperation && record.transition.operationKind === kind)!;
      assert.ok(record.transition.kind === SemanticTransitionKind.InternalOperation);
      const duplicate = traces.map((value, index) => index === traceIndex ? { ...value,
        committedTransitions: [...value.committedTransitions, record],
        flowNodeOccurrenceLifecycles: [...value.flowNodeOccurrenceLifecycles, { started: [], ended: [] }] } : value);
      assert.throws(() => assertJourneyExecutionCounts(program, duplicate), /parent operation fired twice/);
      for (const [patch, message] of [
        [{ owner: { ...record.transition.owner, activation: record.transition.owner.activation + 1 } }, /exact root occurrence/],
        [{ operationId: "undeclared-parent-operation" }, /exact operation declaration/],
        [{ operationKind: SemanticOperationKind.Duplicate }, /declared operation kind/],
      ] as const) {
        const corrupted = traces.map((value, index) => index === traceIndex ? { ...value,
          committedTransitions: value.committedTransitions.map(value => value === record ? { ...record, transition: { ...record.transition, ...patch } } : value) } : value);
        assert.throws(() => assertJourneyExecutionCounts(program, corrupted), message);
      }
    }

    const validation = { kind: StimulusKind.CompleteEffect, commandId: "validate-batch",
      effectId: state.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success,
        localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "approved" } }] } } as const;
    refuse({ ...validation, commandId: "missing-result", result: { kind: EffectExecutionResultKind.Success, localPatch: [] } });
    for (const name of [entry.collectionName, "unmapped"])
      refuse({ ...validation, commandId: `undeclared-result-${name}`, result: {
        kind: EffectExecutionResultKind.Success,
        localPatch: [...validation.result.localPatch,
          { name, value: { kind: VariableValueKind.String, value: "replacement" } } as const]
          .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
      } });
    commit(validation);
    assert.equal(entries().length, 1);
    assert.equal(state.variables.scopes.length, count);
    assert.equal(state.activityOccurrences.length, count === 0 ? 0 : 1);
    assert.deepEqual(state.variables.process.bindings.find(binding => binding.name === "batchValidation")?.value,
      { kind: VariableValueKind.String, value: "approved" });
    refuse({ ...validation, commandId: "stale-validation" });
    while (state.control.kind !== ControlStateKind.Completed) {
      assert.ok(traces.length < 12, "bounded zero/two-body serial journey reaches terminal");
      const task = state.userTaskWaits[0], effect = state.effectWaits[0];
      if (task !== undefined) commit({ kind: StimulusKind.CompleteUserTaskInstance, commandId: `human-${traces.length}`,
        taskId: task.id, submittedValues: [] });
      else if (effect !== undefined) commit({ kind: StimulusKind.CompleteEffect, commandId: `service-${traces.length}`,
        effectId: effect.id, result: validation.result });
      else assert.fail("running journey has no actual external work");
    }
    assert.equal(entries().length, 1);
    assert.deepEqual([...checkedPrefixes].sort(), [
      `0:${SemanticTransitionKind.ExternalStimulus}`, `1:${SemanticTransitionKind.InternalOperation}`,
      `2:${SemanticTransitionKind.ExternalStimulus}`, `2:${SemanticTransitionKind.InternalOperation}`,
      `3:${SemanticTransitionKind.ExternalStimulus}`, `3:${SemanticTransitionKind.InternalOperation}`,
    ].sort(), "all admission, token and blocked-wait prefixes are checked");
    assert.deepEqual(state.variables.scopes, []);
    assert.deepEqual(state.activityOccurrences, []);
    const internal = traces.flatMap(trace => trace.committedTransitions).flatMap(record =>
      record.transition.kind === SemanticTransitionKind.InternalOperation ? [record.transition] : []);
    assert.equal(internal.filter(record => record.operationKind === SemanticOperationKind.Initiate).length, 1);
    assert.equal(internal.filter(record => record.operationKind === SemanticOperationKind.CompleteScope).length, 1);
    assert.equal(internal.at(-1)!.operationKind, SemanticOperationKind.CompleteScope);
  });
}
