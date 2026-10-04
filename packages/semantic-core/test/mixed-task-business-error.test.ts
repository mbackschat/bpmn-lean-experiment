import assert from "node:assert/strict";
import test from "node:test";
import {
  CheckedNodeKind, CommandOutcome, EffectExecutionResultKind, EffectProtocol, MappingExpressionKind,
  FlowNodeOccurrenceTerminalKind, SemanticFlowNodeOccurrenceAnchorKind, SemanticTransitionKind,
  SemanticOperationKind as Op, SemanticOriginKind, SemanticProcessCompilerId, SemanticProcessKind,
  StimulusKind, VariableValueKind, applyStimulus, applyStimulusWithTrace, initialState, isWellFormedSemanticProcessProgram,
  mixedTaskControlCheckedGraph, replayCommittedTransitions,
} from "@bpmn-lean/semantic-core";
import type { SemanticOperation, SemanticProcessProgram, VariableBinding } from "@bpmn-lean/semantic-core";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";

const profile = "cibseven-2.2.0-mixed-task-business-error-draft";
const scalar = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });

function service(id: string, input: string, output: string, errorOutput: string): SemanticOperation {
  return { ...operationBase(id), kind: Op.AwaitEffect, input: `place:${input}`, output: `place:${output}`,
    effect: { elementId: id, descriptor: { protocol: EffectProtocol.Activity, operation: "invoiceValidator" },
      inputMappings: [{ target: "payload", expression: { kind: MappingExpressionKind.EnclosingVariable, name: "request" } }],
      outputMappings: [{ target: "decision", expression: { kind: MappingExpressionKind.LocalVariable, name: "result" } }] },
    bpmnErrorRoute: { code: "REVIEW", output: `place:${errorOutput}`, origin: {
      kind: SemanticOriginKind.BpmnElement, boundaryEventId: `${id}Boundary`, errorDefinitionId: `${id}Catch`,
      errorElementId: "ReviewError", sequenceFlowId: errorOutput } } };
}

function human(id: string, input: string, output: string): SemanticOperation {
  return { ...operationBase(id), kind: Op.AwaitUserTask, input: `place:${input}`, output: `place:${output}`,
    task: { elementId: id, name: null } };
}

function program(): SemanticProcessProgram {
  return rootScopedProgram({ kind: SemanticProcessKind.SemanticProcess,
    identity: { compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess, semanticProfile: profile,
      sourceId: "two-check-invoice", sourceSha256: "1".repeat(64), sourceOverlay: { id: "invoice-handlers", sha256: "2".repeat(64) } },
    processId: "Invoice", controlPlaces: ["begin", "end", "finish", "rejectA", "rejectB", "resumeA", "resumeB", "validatedA", "validatedB"].map(controlPlace),
    operations: [{ ...operationBase("Start"), kind: Op.Initiate, output: "place:begin" },
      service("CheckA", "begin", "validatedA", "rejectA"), service("CheckB", "validatedA", "validatedB", "rejectB"),
      human("RecoverA", "rejectA", "resumeA"), human("RecoverB", "rejectB", "resumeB"), human("Finalize", "validatedB", "finish"),
      { ...operationBase("Merge"), kind: Op.MergeExclusive, inputs: ["place:finish", "place:resumeA", "place:resumeB"], output: "place:end" },
      { ...operationBase("End"), kind: Op.ReachNoneEnd, input: "place:end" }] });
}

const start = { kind: StimulusKind.StartProcess, commandId: "start", processId: "Invoice", instanceId: "invoice-42",
  initialVariables: [scalar("request", "reviewed"), scalar("result", "parent-result")] } as const;

test("raw business Error IL admits shared Error declarations with task-owned routes", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program()), true);
});

test("success follows only normal continuations and admits an explicit null result", () => {
  const definition = program();
  let step = applyStimulus(definition, initialState, start);
  for (const task of ["CheckA", "CheckB"]) {
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.equal(step.state.effectWaits[0]?.id.elementId, task);
    step = applyStimulus(definition, step.state, { kind: StimulusKind.CompleteEffect, commandId: `success-${task}`,
      effectId: step.state.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success,
        localPatch: [{ name: "result", value: { kind: VariableValueKind.Null } }] } });
  }
  assert.equal(step.outcome, CommandOutcome.Committed);
  assert.deepEqual(step.state.userTaskWaits.map(wait => wait.id.elementId), ["Finalize"]);
  assert.deepEqual(step.state.effectWaits, []);
  assert.deepEqual(step.state.variables.activities, []);
});

test("business Error routes are unavailable under the previous mixed-task profile", () => {
  const definition = program();
  assert.equal(isWellFormedSemanticProcessProgram({ ...definition, identity: { ...definition.identity,
    semanticProfile: "cibseven-2.2.0-mixed-task-control-flow-draft" } }), false);
});

for (const rejectedTask of ["CheckA", "CheckB"]) {
  test(`a shared Error code follows only ${rejectedTask}'s attached route and maps local null`, () => {
    const definition = program();
    let step = applyStimulus(definition, initialState, start);
    assert.equal(step.outcome, CommandOutcome.Committed);
    if (rejectedTask === "CheckB") {
      step = applyStimulus(definition, step.state, { kind: StimulusKind.CompleteEffect, commandId: "first-success",
        effectId: step.state.effectWaits[0]!.id, result: { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "first-ok")] } });
      assert.equal(step.outcome, CommandOutcome.Committed);
    }
    assert.equal(step.state.effectWaits[0]?.id.elementId, rejectedTask);
    step = applyStimulus(definition, step.state, { kind: StimulusKind.CompleteEffect, commandId: "business-error",
      effectId: step.state.effectWaits[0]!.id,
      result: { kind: EffectExecutionResultKind.BpmnError, code: "REVIEW", message: "Correct the invoice", localPatch: [{ name: "result", value: { kind: VariableValueKind.Null } }] } });
    assert.equal(step.outcome, CommandOutcome.Committed);
    assert.deepEqual(step.state.userTaskWaits.map(wait => wait.id.elementId), [rejectedTask === "CheckA" ? "RecoverA" : "RecoverB"]);
    assert.deepEqual(step.state.effectWaits, []);
    assert.deepEqual(step.state.controlTokens, []);
    assert.deepEqual(step.state.variables.activities, []);
    assert.deepEqual(step.state.variables.process.bindings, [{ name: "decision", value: { kind: VariableValueKind.Null } }, ...start.initialVariables]);
  });
}

test("invalid Error results and local ownership preserve the entire predecessor", () => {
  const definition = program();
  const reached = applyStimulus(definition, initialState, start);
  assert.equal(reached.outcome, CommandOutcome.Committed);
  const command = { kind: StimulusKind.CompleteEffect, commandId: "result", effectId: reached.state.effectWaits[0]!.id,
    result: { kind: EffectExecutionResultKind.BpmnError, code: "REVIEW", message: null, localPatch: [scalar("result", "needs-review")] } } as const;
  for (const localPatch of [[], [scalar("extra", "x"), ...command.result.localPatch], [...command.result.localPatch, ...command.result.localPatch]]) {
    const refused = applyStimulus(definition, reached.state, { ...command, result: { ...command.result, localPatch } });
    assert.equal(refused.outcome, CommandOutcome.Rejected);
    assert.deepEqual(refused.state, reached.state);
  }
  const unmatched = applyStimulus(definition, reached.state, { ...command, result: { ...command.result, code: "OTHER" } });
  assert.equal(unmatched.outcome, CommandOutcome.Rejected);
  assert.deepEqual(unmatched.state, reached.state);
  for (const activities of [[], [...reached.state.variables.activities, ...reached.state.variables.activities]]) {
    const before = { ...reached.state, variables: { ...reached.state.variables, activities } };
    const refused = applyStimulus(definition, before, command);
    assert.equal(refused.outcome, CommandOutcome.Rejected);
    assert.deepEqual(refused.state, before);
  }
});

test("Error publications bind the submitted message and atomically cancel only the active service", () => {
  const definition = program();
  for (const task of ["CheckA", "CheckB"]) {
    let before = applyStimulus(definition, initialState, start).state;
    if (task === "CheckB") {
      before = applyStimulus(definition, before, { kind: StimulusKind.CompleteEffect, commandId: "first-success",
        effectId: before.effectWaits[0]!.id,
        result: { kind: EffectExecutionResultKind.Success, localPatch: [scalar("result", "ok")] } }).state;
    }
    for (const message of [null, "Correct the invoice"]) {
      const command = { kind: StimulusKind.CompleteEffect, commandId: "business-error",
        effectId: before.effectWaits[0]!.id,
        result: { kind: EffectExecutionResultKind.BpmnError, code: "REVIEW", message,
          localPatch: [{ name: "result", value: { kind: VariableValueKind.Null } }] } } as const;
      const traced = applyStimulusWithTrace(definition, before, command);
      assert.equal(traced.result.outcome, CommandOutcome.Committed);
      assert.deepEqual(traced.result, applyStimulus(definition, before, command));
      assert.equal(traced.committedTransitions.length, 2);
      assert.deepEqual(traced.committedTransitions[0]!.transition,
        { kind: SemanticTransitionKind.ExternalStimulus, stimulus: command });
      assert.equal(traced.flowNodeOccurrenceLifecycles.length, 2);
      const external = traced.flowNodeOccurrenceLifecycles[0]!;
      assert.deepEqual(external.started.map(({ elementId }) => elementId), [`${task}Boundary`]);
      assert.deepEqual(external.ended.filter(({ anchor }) => anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait),
        [{ anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Wait, id: command.effectId },
          terminal: FlowNodeOccurrenceTerminalKind.Cancelled }]);
      assert.deepEqual(traced.flowNodeOccurrenceLifecycles[1]!.started.map(({ elementId }) => elementId),
        [task === "CheckA" ? "RecoverA" : "RecoverB"]);
      assert.notEqual(traced.currentPositions, null);
      assert.deepEqual(replayCommittedTransitions(definition, before, traced.committedTransitions), traced.result.state);
    }
  }
});

test("invalid Error commands publish no transitions, lifecycles or speculative current positions", () => {
  const definition = program();
  const before = applyStimulus(definition, initialState, start).state;
  const command = { kind: StimulusKind.CompleteEffect, commandId: "refuse",
    effectId: before.effectWaits[0]!.id,
    result: { kind: EffectExecutionResultKind.BpmnError, code: "REVIEW", message: null,
      localPatch: [scalar("result", "needs-review")] } } as const;
  const commands = [
    { ...command, effectId: { ...command.effectId, activation: command.effectId.activation + 1 } },
    { ...command, effectId: { ...command.effectId, elementId: "CheckB" } },
    { ...command, result: { ...command.result, code: "OTHER" } },
    ...[[], [scalar("extra", "x"), ...command.result.localPatch], [...command.result.localPatch, ...command.result.localPatch]]
      .map(localPatch => ({ ...command, result: { ...command.result, localPatch } })),
  ];
  for (const rejected of commands) {
    assert.deepEqual(applyStimulusWithTrace(definition, before, rejected), {
      result: { outcome: CommandOutcome.Rejected, state: before, internalStepBoundExceeded: false, ambiguousInternalChoice: false },
      committedTransitions: [], flowNodeOccurrenceLifecycles: [], currentPositions: null,
    });
  }
});

test("raw IL refuses aliased Error declarations and conflicting shared codes", () => {
  const definition = program();
  assert.equal(isWellFormedSemanticProcessProgram(definition), true);
  for (const mutation of [
    { boundaryEventId: "CheckA" }, { errorDefinitionId: "CheckA" }, { errorElementId: "CheckA" },
    { boundaryEventId: "CheckBBoundary" }, { errorDefinitionId: "CheckBCatch" }, { errorElementId: "rejectA" },
    { sequenceFlowId: "rejectB" },
  ]) {
    const operations = definition.operations.map(operation => operation.kind === Op.AwaitEffect && operation.origin.elementId === "CheckA" && operation.bpmnErrorRoute !== null
      ? { ...operation, bpmnErrorRoute: { ...operation.bpmnErrorRoute, origin: { ...operation.bpmnErrorRoute.origin, ...mutation } } } : operation);
    assert.equal(isWellFormedSemanticProcessProgram({ ...definition, operations }), false, JSON.stringify(mutation));
  }
  const operations = definition.operations.map(operation => operation.kind === Op.AwaitEffect && operation.origin.elementId === "CheckA" && operation.bpmnErrorRoute !== null
    ? { ...operation, bpmnErrorRoute: { ...operation.bpmnErrorRoute, code: "CONFLICT" } } : operation);
  assert.equal(isWellFormedSemanticProcessProgram({ ...definition, operations }), false);
});

test("distinct Error declarations may share a code but route outputs cannot share a producer", () => {
  const definition = program();
  const separateErrors = definition.operations.map(operation => operation.kind === Op.AwaitEffect && operation.bpmnErrorRoute !== null
    ? { ...operation, bpmnErrorRoute: { ...operation.bpmnErrorRoute, origin: { ...operation.bpmnErrorRoute.origin,
      errorElementId: `${operation.effect.elementId}Error` } } } : operation);
  assert.equal(isWellFormedSemanticProcessProgram({ ...definition, operations: separateErrors }), true);
  for (const output of ["place:validatedA", "place:rejectB", "place:missing"]) {
    const operations = definition.operations.map(operation => operation.kind === Op.AwaitEffect && operation.effect.elementId === "CheckA" && operation.bpmnErrorRoute !== null
      ? { ...operation, bpmnErrorRoute: { ...operation.bpmnErrorRoute, output,
        origin: { ...operation.bpmnErrorRoute.origin, sequenceFlowId: output.slice("place:".length) } } } : operation);
    assert.equal(isWellFormedSemanticProcessProgram({ ...definition, operations }), false, output);
  }
});

test("checked Error edges require their exact attached task and consistent shared declaration", () => {
  const graph: Parameters<typeof mixedTaskControlCheckedGraph>[0] = {
    processId: "Invoice", definitionScopes: [{ id: "scope", parentScopeId: null, originElementId: "Invoice" }],
    nodes: [{ kind: CheckedNodeKind.NoneStartEvent, id: "Start" },
      ...["A", "B"].map(suffix => ({ kind: CheckedNodeKind.ServiceTask, id: `Check${suffix}`,
        descriptor: { protocol: EffectProtocol.Activity, operation: "invoiceValidator" }, inputMappings: [], outputMappings: [],
        bpmnErrorRoute: { boundaryEventId: `Boundary${suffix}`, boundaryEventName: null, attachedToRef: `Check${suffix}`,
          errorDefinitionId: `Catch${suffix}`, errorElementId: "ReviewError", errorName: "Review", code: "REVIEW", outputFlowId: `reject${suffix}` } } as const)),
      { kind: CheckedNodeKind.ExclusiveMerge, id: "Merge" }, { kind: CheckedNodeKind.NoneEndEvent, id: "End" }],
    flows: [["begin", "Start", "CheckA"], ["next", "CheckA", "CheckB"], ["success", "CheckB", "Merge"],
      ["rejectA", "BoundaryA", "Merge"], ["rejectB", "BoundaryB", "Merge"], ["finish", "Merge", "End"]]
      .map(([id, sourceId, targetId]) => ({ id: id!, sourceId: sourceId!, targetId: targetId!, condition: null })),
  };
  assert.equal(mixedTaskControlCheckedGraph(graph, profile), true);
  assert.equal(mixedTaskControlCheckedGraph({ ...graph, nodes: [...graph.nodes].reverse(), flows: [...graph.flows].reverse() }, profile), true);
  assert.equal(mixedTaskControlCheckedGraph(graph), false);
  for (const mutation of [{ attachedToRef: "CheckB" }, { errorName: "Different" }, { code: "OTHER" },
    { boundaryEventId: "BoundaryB" }, { errorDefinitionId: "CatchB" }, { errorElementId: "CheckA" }, { outputFlowId: "rejectB" }]) {
    const nodes = graph.nodes.map(node => node.kind === CheckedNodeKind.ServiceTask && node.id === "CheckA"
      ? { ...node, bpmnErrorRoute: { ...node.bpmnErrorRoute!, ...mutation } } : node);
    assert.equal(mixedTaskControlCheckedGraph({ ...graph, nodes }, profile), false, JSON.stringify(mutation));
  }
  for (const [id, sourceId, targetId] of [["incoming", "CheckA", "BoundaryA"], ["extra", "BoundaryA", "Merge"]]) {
    assert.equal(mixedTaskControlCheckedGraph({ ...graph, flows: [...graph.flows,
      { id: id!, sourceId: sourceId!, targetId: targetId!, condition: null }] }, profile), false);
  }
});
