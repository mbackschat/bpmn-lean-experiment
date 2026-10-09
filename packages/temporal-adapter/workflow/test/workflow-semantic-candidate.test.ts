import assert from "node:assert/strict";
import test from "node:test";

import {
  ScenarioStepKind,
  CommandOutcome,
  ControlStateKind,
  EffectExecutionResultKind,
  StimulusKind,
  SemanticOperationKind,
  SemanticTransitionKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  FlowNodeOccurrenceTerminalKind,
  VariableValueKind,
  applyStimulusWithTrace,
  advanceScenario,
  initialState,
  projectEffectTransportMaterial,
  projectOpenEffects,
  replayCommittedTransitions,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { ScenarioStep, Stimulus, RuntimeState, SemanticProcessProgram, UnnumberedCommittedTransitionRecord, UnnumberedFlowNodeOccurrenceDelta } from "@bpmn-lean/semantic-core";
import {
  EffectActivityCapacityPreflightKind,
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
  WorkflowChainBudgetKind,
  assessTemporalHostCapability,
  effectTransportKey,
  preflightEffectActivityRequest,
  preflightEffectActivityResult,
  requireBpmnWorkflowContinuationStateV1,
  requireWorkflowChainCanonicalByteBudget,
  requireWorkflowChainInitialArgumentBudgets,
  workflowChainCanonicalUtf8ByteLength,
} from "@bpmn-lean/temporal-protocol";
import {
  WorkflowSemanticCandidatePreflightKind,
  createCommandPublicationState,
  integrateCommandPublication,
  preflightWorkflowSemanticCandidate,
  recordCommandPublicationOutcome,
} from "@bpmn-lean/temporal-workflow";

import {
  publicationCompletion,
  publicationProcessInstanceId,
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";
import { parallelCommandInputs } from "../../../bpmn-source/test/parallel-scope-command-fixture.ts";

test("accepts exact canonical state and paired-publication byte boundaries", () => {
  const candidate = startCandidate();
  const limits = exactLimits(candidate);

  assert.deepEqual(
    preflightWorkflowSemanticCandidate(candidate, limits),
    {
      kind: WorkflowSemanticCandidatePreflightKind.Ready,
      observedStateBytes: limits.committedRuntimeStateBytes,
      observedPublicationBatchBytes: limits.publicationBatchBytes,
    },
  );
});

test("refuses a multibyte state candidate before mutating any retained fact", () => {
  const candidate = startCandidate();
  const before = structuredClone(candidate);
  const oversized: typeof candidate = {
    ...candidate,
    state: {
      ...candidate.state,
      variables: {
        ...candidate.state.variables,
        process: {
          bindings: [{
            name: "payload",
            value: { kind: VariableValueKind.String, value: "€" },
          }],
        },
      },
    },
  };
  const observedValue = workflowChainCanonicalUtf8ByteLength(oversized.state);

  assert.deepEqual(
    preflightWorkflowSemanticCandidate(oversized, {
      committedRuntimeStateBytes: observedValue - 1,
      publicationBatchBytes: exactLimits(candidate).publicationBatchBytes,
    }),
    {
      kind: WorkflowSemanticCandidatePreflightKind.CapacityExceeded,
      failure: {
        budget: WorkflowChainBudgetKind.CommittedRuntimeStateBytes,
        configuredBound: observedValue - 1,
        observedValue,
      },
    },
  );
  assert.deepEqual(candidate, before);
});

test("refuses an oversized paired batch before either publication advances", () => {
  const candidate = startCandidate();
  const limits = exactLimits(candidate);

  assert.deepEqual(
    preflightWorkflowSemanticCandidate(candidate, {
      ...limits,
      publicationBatchBytes: limits.publicationBatchBytes - 1,
    }),
    {
      kind: WorkflowSemanticCandidatePreflightKind.CapacityExceeded,
      failure: {
        budget: WorkflowChainBudgetKind.PublicationBatchBytes,
        configuredBound: limits.publicationBatchBytes - 1,
        observedValue: limits.publicationBatchBytes,
      },
    },
  );
});

test("measures only the new paired batch and rejects asymmetric publication growth", () => {
  const first = startCandidate();
  const completion = publicationCompletion("UserTask_A");
  const step = advanceScenario(publicationProgram, first.state, completion);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) {
    assert.fail("completion did not reach a committed stable state");
  }
  const integrated = integrateCommandPublication(
    publicationProgram,
    first.publication,
    completion,
    step,
    () => 2_000,
  );
  const publication = recordCommandPublicationOutcome(
    integrated,
    completion,
    step.observations,
  );
  const candidate = {
    state: step.state,
    publicationBefore: first.publication,
    publication,
  };
  const limits = exactLimits(candidate);

  assert.equal(
    preflightWorkflowSemanticCandidate(candidate, limits).kind,
    WorkflowSemanticCandidatePreflightKind.Ready,
  );
  assert.ok(
    workflowChainCanonicalUtf8ByteLength(publication) >
      limits.publicationBatchBytes,
  );
  assert.throws(
    () => preflightWorkflowSemanticCandidate({
      ...candidate,
      publication: {
        ...publication,
        flowNodeOccurrences: first.publication.flowNodeOccurrences,
      },
    }, limits),
    /paired publication candidate advanced asymmetrically/u,
  );
});

test("permits lowered limits but never raises a production ceiling", () => {
  const candidate = startCandidate();
  const limits = exactLimits(candidate);

  assert.throws(
    () => preflightWorkflowSemanticCandidate(candidate, {
      ...limits,
      publicationBatchBytes: 64 * 1_024 + 1,
    }),
    /publicationBatchBytes limit exceeds production/u,
  );
});

function startCandidate() {
  const step = advanceScenario(publicationProgram, initialState, publicationStart);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) {
    assert.fail("publication Start did not reach a committed stable state");
  }
  const publicationBefore = createCommandPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  const integrated = integrateCommandPublication(
    publicationProgram,
    publicationBefore,
    publicationStart,
    step,
    () => 1_000,
  );
  const publication = recordCommandPublicationOutcome(
    integrated,
    publicationStart,
    step.observations,
  );
  return { state: step.state, publicationBefore, publication };
}

function exactLimits(candidate: ReturnType<typeof startCandidate>) {
  const execution = candidate.publication.execution.batches.at(-1);
  const flowNodeOccurrences =
    candidate.publication.flowNodeOccurrences.batches.at(-1);
  assert.ok(execution !== undefined && flowNodeOccurrences !== undefined);
  return {
    committedRuntimeStateBytes:
      workflowChainCanonicalUtf8ByteLength(candidate.state),
    publicationBatchBytes: workflowChainCanonicalUtf8ByteLength({
      execution,
      flowNodeOccurrences,
    }),
  };
}

type CommittedStep = Extract<ScenarioStep, { kind: ScenarioStepKind.Committed }>;
function parallelStep(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): CommittedStep {
  const traced = applyStimulusWithTrace(program, state, stimulus);
  assert.equal(traced.result.outcome, CommandOutcome.Committed, stimulus.commandId);
  assert.equal(traced.result.internalStepBoundExceeded || traced.result.ambiguousInternalChoice, false, stimulus.commandId);
  assert.deepEqual(replayCommittedTransitions(program, state, traced.committedTransitions), traced.result.state);
  const step = advanceScenario(program, state, stimulus);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) assert.fail("Expected private committed scenario step");
  assert.deepEqual(step.state, traced.result.state);
  assert.deepEqual(step.publication?.transitions, traced.committedTransitions);
  assert.deepEqual(step.flowNodeOccurrenceLifecycles, traced.flowNodeOccurrenceLifecycles);
  return step;
}

function alteredStep(step: CommittedStep, index: number, record: UnnumberedCommittedTransitionRecord,
  lifecycle: UnnumberedFlowNodeOccurrenceDelta): CommittedStep {
  assert.ok(step.publication && step.flowNodeOccurrenceLifecycles);
  const records = step.publication.transitions.map((entry, at) => at === index ? record : entry);
  const lifecycles = step.flowNodeOccurrenceLifecycles.map((entry, at) => at === index ? lifecycle : entry);
  return { ...step, publication: { ...step.publication, transitions: [records[0]!, ...records.slice(1)] },
    flowNodeOccurrenceLifecycles: [lifecycles[0]!, ...lifecycles.slice(1)] };
}

for (const count of [0, 1, 16]) test(`private parallel numbered publication binds ${count} exact entered bodies`, async () => {
  const { program, start } = (await parallelCommandInputs()).find(input => input.count === count)!;
  const before = createCommandPublicationState(program, start.instanceId);
  const step = parallelStep(program, initialState, start);
  const publish = (candidate = step) => integrateCommandPublication(program, before, start, candidate, () => 1_000);
  const valid = publish();
  assert.equal(valid.flowNodeOccurrences.retainedOpen.filter(entry => entry.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Scope).length, count);
  assert.ok(step.publication && step.flowNodeOccurrenceLifecycles);
  const index = step.publication.transitions.findIndex(record => record.transition.kind === SemanticTransitionKind.InternalOperation &&
    record.transition.operationKind === SemanticOperationKind.EnterParallelMultiInstanceScope);
  assert.ok(index >= 0);
  const record = step.publication.transitions[index]!;
  const lifecycle = step.flowNodeOccurrenceLifecycles[index]!;
  assert.equal(lifecycle.started.length, count);
  if (count === 0) {
    const unrelated = step.flowNodeOccurrenceLifecycles.flatMap(delta => delta.started)[0]!;
    assert.throws(() => publish(alteredStep(step, index, record, { ...lifecycle, started: [unrelated] })));
    return;
  }
  const scope = record.positionDelta.enteredScopes[0]!;
  const occurrence = lifecycle.started[0]!;
  const wrongOwner = { ...occurrence.owner, activation: occurrence.owner.activation + 1 };
  const mutations: CommittedStep[] = [
    alteredStep(step, index, record, { ...lifecycle, started: lifecycle.started.slice(1) }),
    alteredStep(step, index, record, { ...lifecycle, started: [...lifecycle.started, occurrence] }),
    alteredStep(step, index, record, { ...lifecycle, started: [{ ...occurrence, owner: wrongOwner }, ...lifecycle.started.slice(1)] }),
    alteredStep(step, index, record, { ...lifecycle, started: [{ ...occurrence, anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Scope,
      id: { ...scope.id, activation: scope.id.activation + 100 } } }, ...lifecycle.started.slice(1)] }),
    ...[
      [...record.positionDelta.enteredScopes, scope],
      [{ ...scope, parent: wrongOwner }, ...record.positionDelta.enteredScopes.slice(1)],
      [{ ...scope, id: { ...scope.id, definitionScopeId: occurrence.owner.definitionScopeId } }, ...record.positionDelta.enteredScopes.slice(1)],
    ].map(enteredScopes => alteredStep(step, index, { ...record, positionDelta: { ...record.positionDelta, enteredScopes } }, lifecycle)),
  ];
  for (const candidate of mutations) assert.throws(() => publish(candidate));
  assert.deepEqual(before, createCommandPublicationState(program, start.instanceId));
});

for (const [count, early] of [[1, false], [2, false], [2, true], [1, true]] as const) test(
  `private parallel numbered publication binds ${count}-body ${early ? "condition" : "natural"} retirement`, async () => {
    const { program, start } = (await parallelCommandInputs({ condition: early })).find(input => input.count === count)!;
    let state = initialState;
    let publication = createCommandPublicationState(program, start.instanceId);
    const run = (stimulus: Stimulus, retirement = false) => {
      const step = parallelStep(program, state, stimulus);
      const before = publication;
      const publish = (candidate = step) => integrateCommandPublication(program, before, stimulus, candidate, () => 1_000);
      publication = publish();
      state = step.state;
      if (!retirement) return;
      assert.ok(step.publication && step.flowNodeOccurrenceLifecycles);
      const index = step.publication.transitions.findIndex(record => record.transition.kind === SemanticTransitionKind.InternalOperation &&
        record.transition.operationKind === SemanticOperationKind.CompleteParallelMultiInstanceScope);
      assert.ok(index >= 0);
      const record = step.publication.transitions[index]!;
      const lifecycle = step.flowNodeOccurrenceLifecycles[index]!;
      assert.equal(lifecycle.started.length, 0);
      assert.equal(lifecycle.ended.filter(end => end.terminal === FlowNodeOccurrenceTerminalKind.Completed).length, 1);
      assert.equal(lifecycle.ended.filter(end => end.terminal === FlowNodeOccurrenceTerminalKind.Cancelled).length, early && count === 2 ? 2 : 0);
      const end = lifecycle.ended[0]!;
      const exited = record.positionDelta.exitedScopes[0]!;
      const mutations: CommittedStep[] = [
        alteredStep(step, index, record, { ...lifecycle, ended: lifecycle.ended.slice(1) }),
        alteredStep(step, index, record, { ...lifecycle, ended: [...lifecycle.ended, end] }),
        alteredStep(step, index, record, { ...lifecycle, ended: [{ ...end, terminal: end.terminal === FlowNodeOccurrenceTerminalKind.Completed
          ? FlowNodeOccurrenceTerminalKind.Cancelled : FlowNodeOccurrenceTerminalKind.Completed }, ...lifecycle.ended.slice(1)] }),
        alteredStep(step, index, record, { ...lifecycle, started: [{ anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Scope, id: exited.id },
          processId: program.processId, elementId: exited.bpmnElementId, owner: exited.parent! }] }),
        ...[
          [...record.positionDelta.exitedScopes, exited],
          record.positionDelta.exitedScopes.slice(1),
          [{ ...exited, parent: { ...exited.parent!, activation: exited.parent!.activation + 1 } }, ...record.positionDelta.exitedScopes.slice(1)],
        ].map(exitedScopes => alteredStep(step, index, { ...record, positionDelta: { ...record.positionDelta, exitedScopes } }, lifecycle)),
      ];
      for (const [mutationIndex, candidate] of mutations.entries()) assert.throws(() => publish(candidate), `retirement mutation ${mutationIndex}`);
    };
    run(start);
    for (let index = 0; index < (early ? 1 : count); index++) {
      const review = state.userTaskWaits.find(wait => wait.id.elementId === "Review")!;
      run({ kind: StimulusKind.CompleteUserTaskInstance, commandId: `review-${index}`, taskId: review.id,
        submittedValues: early ? [{ name: "stop", value: { kind: VariableValueKind.Boolean, value: true } }] : [] });
      const effect = state.effectWaits[0]!;
      run({ kind: StimulusKind.CompleteEffect, commandId: `effect-${index}`, effectId: effect.id,
        result: { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "accepted" } }] } });
      const confirm = state.userTaskWaits.find(wait => wait.id.elementId === "Confirm")!;
      run({ kind: StimulusKind.CompleteUserTaskInstance, commandId: `confirm-${index}`, taskId: confirm.id, submittedValues: [] }, true);
      assert.equal(state.variables.scopes.length, early ? 0 : count - index - 1);
    }
  },
);

for (const bodyShape of ["serial", "joined", "separate-ends"] as const) test(
  `sixteen-body private parallel payload ${bodyShape} uses production byte guards`, async context => {
    const { program, start } = (await parallelCommandInputs({ bodyShape })).find(input => input.count === 16)!;
    assert.equal(supportsSemanticProcessExecution(start, program), false);
    const hosting = assessTemporalHostCapability(program);
    assert.equal(hosting.kind, TemporalHostCapabilityResultKind.Rejected);
    assert.ok(hosting.kind === TemporalHostCapabilityResultKind.Rejected);
    assert.equal(hosting.failure.code, TemporalHostAdmissionFailureCode.ParallelSubProcessQualificationUnavailable);
    requireWorkflowChainInitialArgumentBudgets(start, program);
    const maxima = {
      program: workflowChainCanonicalUtf8ByteLength(program), start: workflowChainCanonicalUtf8ByteLength(start),
      stimulus: 0, state: 0, publicationBatch: 0, effectRequest: 0, effectResult: 0,
    };
    let state = initialState;
    let publication = createCommandPublicationState(program, start.instanceId);
    let commandCount = 0;
    const run = (stimulus: Stimulus, expectedPublicationRefusal = false): boolean => {
      maxima.stimulus = Math.max(maxima.stimulus,
        requireWorkflowChainCanonicalByteBudget(WorkflowChainBudgetKind.SemanticStimulusBytes, stimulus));
      const step = parallelStep(program, state, stimulus);
      const nextPublication = recordCommandPublicationOutcome(
        integrateCommandPublication(program, publication, stimulus, step, () => 1_000), stimulus, step.observations);
      const measured = preflightWorkflowSemanticCandidate({ state: step.state,
        publicationBefore: publication, publication: nextPublication });
      if (expectedPublicationRefusal) {
        assert.equal(measured.kind, WorkflowSemanticCandidatePreflightKind.CapacityExceeded);
        assert.ok(measured.kind === WorkflowSemanticCandidatePreflightKind.CapacityExceeded);
        assert.equal(measured.failure.budget, WorkflowChainBudgetKind.PublicationBatchBytes);
        assert.equal(measured.failure.configuredBound, 65_536);
        assert.ok(measured.failure.observedValue > measured.failure.configuredBound);
        assert.deepEqual(state, initialState, "over-budget candidate cannot install committed state");
        assert.deepEqual(publication, createCommandPublicationState(program, start.instanceId),
          "over-budget candidate cannot install either publication");
        context.diagnostic(`${bodyShape} command=${stimulus.commandId} priorCommands=${commandCount} refusal=${JSON.stringify(measured)} candidateStateBytes=${workflowChainCanonicalUtf8ByteLength(step.state)} inputBytes=${JSON.stringify(maxima)}; branched full journey remains unqualified`);
        return false;
      }
      assert.equal(measured.kind, WorkflowSemanticCandidatePreflightKind.Ready, `${bodyShape} ${stimulus.commandId}: ${JSON.stringify(measured)}`);
      assert.ok(measured.kind === WorkflowSemanticCandidatePreflightKind.Ready);
      maxima.state = Math.max(maxima.state, measured.observedStateBytes);
      maxima.publicationBatch = Math.max(maxima.publicationBatch, measured.observedPublicationBatchBytes ?? 0);
      state = step.state;
      publication = nextPublication;
      commandCount++;
      return true;
    };
    if (!run(start, bodyShape !== "serial")) return;
    assert.equal(state.variables.scopes.length, 16);
    assert.equal(JSON.stringify(requireBpmnWorkflowContinuationStateV1(JSON.parse(JSON.stringify(state)), program, start.instanceId)),
      JSON.stringify(state), "Private PMIS restoration preserves exact state bytes");
    const humanElements = bodyShape === "serial" ? ["Review"]
      : bodyShape === "joined" ? ["Branch0", "Branch1", "Branch2"] : ["Branch0", "Branch1"];
    for (const element of humanElements) {
      const waits = state.userTaskWaits.filter(wait => wait.id.elementId === element);
      assert.equal(waits.length, 16, element);
      for (const wait of waits) run({ kind: StimulusKind.CompleteUserTaskInstance,
        commandId: `${element}-${wait.id.activation}`, taskId: wait.id, submittedValues: element === "Review"
          ? [{ name: "reviewStatus", value: { kind: VariableValueKind.String, value: "reviewed" } }] : [] });
    }
    const effects = projectOpenEffects(state);
    assert.equal(effects.length, 16, "retain the complete sixteen-effect population");
    const result = { kind: EffectExecutionResultKind.Success,
      localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "accepted" } }] } as const;
    for (const effect of effects) {
      const material = projectEffectTransportMaterial(program, effect);
      const request = { ...material.descriptor, idempotencyKey: effectTransportKey(material), arguments: material.arguments };
      const requestCapacity = preflightEffectActivityRequest(request);
      const resultCapacity = preflightEffectActivityResult(result);
      assert.equal(requestCapacity.kind, EffectActivityCapacityPreflightKind.WithinCapacity);
      assert.equal(resultCapacity.kind, EffectActivityCapacityPreflightKind.WithinCapacity);
      assert.ok(requestCapacity.kind === EffectActivityCapacityPreflightKind.WithinCapacity && resultCapacity.kind === EffectActivityCapacityPreflightKind.WithinCapacity);
      maxima.effectRequest = Math.max(maxima.effectRequest, requestCapacity.observedValue);
      maxima.effectResult = Math.max(maxima.effectResult, resultCapacity.observedValue);
      run({ kind: StimulusKind.CompleteEffect, commandId: `effect-${effect.id.activation}`, effectId: effect.id, result });
    }
    const confirmations = state.userTaskWaits.filter(wait => wait.id.elementId === "Confirm");
    assert.equal(confirmations.length, 16);
    for (const wait of confirmations) run({ kind: StimulusKind.CompleteUserTaskInstance,
      commandId: `Confirm-${wait.id.activation}`, taskId: wait.id, submittedValues: [] });
    const publish = state.userTaskWaits[0];
    assert.equal(publish?.id.elementId, "PublishBatch");
    assert.ok(publish);
    run({ kind: StimulusKind.CompleteUserTaskInstance, commandId: "publish", taskId: publish.id, submittedValues: [] });
    assert.equal(state.control.kind, ControlStateKind.Completed);
    context.diagnostic(`${bodyShape} commands=${commandCount} canonicalUtf8Maxima=${JSON.stringify(maxima)}; private state restoration passed; host admission remains refused`);
  },
);
