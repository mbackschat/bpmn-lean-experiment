import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProfileId,
  StimulusKind,
  applyInternalOperationStep,
  applyStimulusWithTrace,
  compareCanonicalStrings,
  initialState,
  isWellFormedRuntimeState,
  isWellFormedSemanticProcessProgram,
  projectOpenFlowNodeOccurrences,
  projectControlPositionDelta,
  projectFlowNodeOccurrenceLifecycleDelta,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation } from "@bpmn-lean/semantic-core";
import { boundedProgram, instanceId, owner } from "./bounded-task-fixture.ts";
import { callActivityProgram, callActivityStart, expectedCalledInstanceId } from "./call-activity-fixture.ts";
import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import type { InstantiatedInternalPublication } from "../src/internal-publication-template.ts";

type ArmingModule = typeof import("../src/internal-transition-arming-batch.ts");
const { deriveInternalArmingPreparation: prepare, applyPreparedInternalArming: apply,
  prepareInternalArmingBatch: batch } = await import(
  new URL("../dist/internal-transition-arming-batch.js", import.meta.url).href
) as ArmingModule;
type PublicationModule = typeof import("../src/internal-publication-template.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as PublicationModule;

type TimerTaskKind = SemanticOperationKind.AwaitBoundedUserTask |
  SemanticOperationKind.AwaitMonitoredUserTask;

function fixture(kind: TimerTaskKind) {
  const bounded = boundedProgram.operations.find((operation) =>
    operation.kind === SemanticOperationKind.AwaitBoundedUserTask);
  assert.ok(bounded !== undefined);
  const timerTask = { ...bounded, kind };
  const ordinary = {
    ...operationBase("IndependentReview"),
    kind: SemanticOperationKind.AwaitUserTask,
    input: "place:Flow_Independent",
    output: "place:Flow_Independent_End",
    task: { elementId: "IndependentReview", name: "Independent review" },
  } as const;
  const program = rootScopedProgram({
    ...boundedProgram,
    identity: { ...boundedProgram.identity, semanticProfile:
      kind === SemanticOperationKind.AwaitBoundedUserTask
        ? SemanticProfileId.ActivityBoundaryTimer : SemanticProfileId.NonInterruptingBoundaryTimer },
    controlPlaces: [...boundedProgram.controlPlaces,
      ...["Flow_Entry", "Flow_Independent", "Flow_Independent_End"].map(controlPlace)]
      .sort((left, right) => compareCanonicalStrings(left.id, right.id)),
    operations: [
      ...boundedProgram.operations.map((operation): SemanticOperation => {
        if (operation.id === timerTask.id) return timerTask;
        if (operation.kind === SemanticOperationKind.Initiate) {
          return { ...operation, output: "place:Flow_Entry" };
        }
        return operation;
      }),
      { ...operationBase("ForkReview"), kind: SemanticOperationKind.Duplicate,
        input: "place:Flow_Entry", outputs: [ordinary.input, timerTask.input] },
      ordinary,
      { ...operationBase("IndependentEnd"), kind: SemanticOperationKind.ReachNoneEnd,
        input: ordinary.output },
    ],
  });
  const state: RuntimeState = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId },
    scopeOccurrences: [{ id: owner, parent: null }],
    scopeActivations: [{ elementId: owner.definitionScopeId, count: 1 }],
    controlTokens: [ordinary.input, timerTask.input].map((placeId) => ({ placeId, owner, multiplicity: 1 })),
  };
  return { program, state, timerTask, ordinary };
}

for (const kind of [SemanticOperationKind.AwaitBoundedUserTask, SemanticOperationKind.AwaitMonitoredUserTask] as const) {
  test(`${kind} preserves the called Process identity through preparation and execution`, () => {
    const state = admittedInternalPrefix(callActivityProgram, initialState, callActivityStart(),
      ["operation:Start_Caller", "operation:Call:é"], ["operation:Task_Called"]);
    const task = callActivityProgram.operations.find(({ id }) => id === "operation:Task_Called");
    assert.ok(task?.kind === SemanticOperationKind.AwaitUserTask);
    const operation = {
      id: task.id, origin: task.origin, kind, input: task.input,
      task: { ...task.task, output: task.output },
      boundaryTimer: { elementId: "CalledDeadline", durationMs: 1000,
        output: "place:CalledDeadlineFlow", origin: { kind: SemanticOriginKind.BpmnSequenceFlow,
          elementId: "CalledDeadlineFlow" } },
    } as const;
    const scopeId = callActivityProgram.operationScopes.find(({ operationId }) => operationId === task.id)!.scopeId;
    const mergeInputs: [string, string] = [operation.task.output, operation.boundaryTimer.output];
    const merge = { ...operationBase("CalledMerge"), kind: SemanticOperationKind.MergeExclusive,
      inputs: mergeInputs.sort(compareCanonicalStrings),
      output: "place:CalledMerged" } as const;
    const addedPlaces = [controlPlace("CalledDeadlineFlow"), controlPlace("CalledMerged")];
    const program = { ...callActivityProgram,
      definitionScopes: [...callActivityProgram.definitionScopes].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      controlPlaces: [...callActivityProgram.controlPlaces, ...addedPlaces]
        .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      controlPlaceScopes: [...callActivityProgram.controlPlaceScopes,
        ...addedPlaces.map(({ id }) => ({ controlPlaceId: id, scopeId }))]
        .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
      operations: [...callActivityProgram.operations.map((candidate): SemanticOperation =>
        candidate.id === operation.id ? operation :
          candidate.kind === SemanticOperationKind.ReachNoneEnd && candidate.input === task.output
            ? { ...candidate, input: merge.output } : candidate), merge]
        .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      operationScopes: [...callActivityProgram.operationScopes, { operationId: merge.id, scopeId }]
        .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
    };
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(isWellFormedRuntimeState(program, callActivityStart().instanceId, state), true);
    const calledOwner = state.controlTokens.find(({ placeId }) => placeId === operation.input)?.owner;
    assert.ok(calledOwner !== undefined);
    const prepared = prepare(program, state, { operation, owner: calledOwner });
    assert.ok(prepared !== null);
    const successor = apply(program, state, prepared);
    const evaluated = applyInternalOperationStep(program, operation, state);
    assert.ok(successor !== null && evaluated !== null);
    assert.deepEqual(successor, evaluated.successor);
    assert.equal(isWellFormedRuntimeState(program, callActivityStart().instanceId, successor), true);
    assert.notEqual(projectOpenFlowNodeOccurrences(program, successor), null);
    assert.deepEqual(successor.userTaskWaits.map(({ id }) => id.processInstanceId), [expectedCalledInstanceId]);
    assert.deepEqual(successor.timerWaits.map(({ id }) => id.processInstanceId), [expectedCalledInstanceId]);
    assert.deepEqual(successor.activityOccurrences.map(({ id }) => id.processInstanceId), [expectedCalledInstanceId]);
    assert.equal(prepared.publicationTemplate.lifecycle.started[0]?.processId, "Process_Called");
  });

  test(`${kind} closes an independent ordinary-task frontier without losing its deadline`, () => {
    const { program, state, timerTask, ordinary } = fixture(kind);
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
    assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
    const left = applyInternalOperationStep(program, timerTask, state);
    const right = applyInternalOperationStep(program, ordinary, state);
    assert.ok(left !== null && right !== null);
    const leftThenRight = applyInternalOperationStep(program, ordinary, left.successor);
    const rightThenLeft = applyInternalOperationStep(program, timerTask, right.successor);
    assert.ok(leftThenRight !== null && rightThenLeft !== null);
    assert.deepEqual(leftThenRight.successor, rightThenLeft.successor);
    for (const successor of [left.successor, right.successor, leftThenRight.successor]) {
      assert.equal(isWellFormedRuntimeState(program, instanceId, successor), true);
      assert.notEqual(projectOpenFlowNodeOccurrences(program, successor), null);
    }
    const started = applyStimulusWithTrace(program, initialState, {
      kind: StimulusKind.StartProcess, commandId: `start-${kind}`,
      processId: program.processId, instanceId, initialVariables: [],
    }, 4);
    assert.equal(started.result.outcome, CommandOutcome.Committed);
    assert.deepEqual(started.result.state, leftThenRight.successor);
    assert.equal(started.result.state.timerWaits.length, 1);
    assert.equal(started.result.state.activityOccurrences.length, 1);
    assert.deepEqual(started.result.state.variables.activities, []);
  });

  test(`${kind} retains unequal counter domains, complete sibling preparations and accepted publication`, () => {
    const { program, state: empty, timerTask, ordinary } = fixture(kind);
    const state = { ...empty, logicalTimeMs: 321,
      taskActivations: [{ elementId: timerTask.task.elementId, count: 2 }],
      timerActivations: [{ elementId: timerTask.boundaryTimer.elementId, count: 5 }],
      activityActivations: [{ elementId: timerTask.task.elementId, count: 7 }] };
    assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
    const prepared = batch(program, state, [timerTask, ordinary].map((operation) => ({ operation, owner })));
    assert.ok(prepared !== null);
    const publication = instantiateInternalPublicationBatch("timer-review", 19,
      prepared.map(({ publicationTemplate }) => publicationTemplate));
    assert.ok(publication !== null);
    let final: RuntimeState | undefined;
    for (const ordered of [prepared, prepared.toReversed()]) {
      assert.deepEqual(instantiateInternalPublicationBatch("timer-review", 19,
        ordered.map(({ publicationTemplate }) => publicationTemplate)), publication);
      let current: RuntimeState = state;
      for (const member of ordered) {
        assert.deepEqual(prepare(program, current, member), member);
        const successor = apply(program, current, member);
        const step = applyInternalOperationStep(program, member.operation, current);
        assert.ok(successor !== null && step !== null);
        assert.deepEqual(successor, step.successor);
        assert.equal(isWellFormedRuntimeState(program, instanceId, successor), true);
        assert.notEqual(projectOpenFlowNodeOccurrences(program, successor), null);
        const expected: InstantiatedInternalPublication | undefined = publication.find(
          ({ alternative }) => alternative.operationId === member.operation.id);
        assert.ok(expected !== undefined);
        assert.deepEqual(projectControlPositionDelta(program, current, successor), expected.record.positionDelta);
        assert.deepEqual(projectFlowNodeOccurrenceLifecycleDelta(program, current, successor,
          { kind: "internal", operation: member.operation, owner }, "timer-review", expected.transitionIndex),
        expected.lifecycle);
        current = successor;
      }
      if (final === undefined) final = current;
      else assert.deepEqual(current, final);
    }
    assert.ok(final !== undefined);
    assert.equal(final.userTaskWaits.find(({ id }) => id.elementId === timerTask.task.elementId)?.id.activation, 3);
    assert.equal(final.timerWaits[0]?.id.activation, 6);
    assert.equal(final.timerWaits[0]?.deadlineMs, 1321);
    assert.equal(final.activityOccurrences[0]?.id.activation, 8);
    assert.deepEqual(final.variables, state.variables);
    const timerPublication = publication.find(({ alternative }) => alternative.operationId === timerTask.id);
    assert.deepEqual(timerPublication?.lifecycle.started.map(({ elementId }) => elementId), [timerTask.task.elementId]);
  });

  test(`${kind} rejects stale time, each counter, wrong owner and snapshot declarations`, () => {
    const { program, state, timerTask, ordinary } = fixture(kind);
    const candidate = { operation: timerTask, owner };
    const prepared = prepare(program, state, candidate);
    assert.ok(prepared !== null);
    const stale = [
      { ...state, logicalTimeMs: 1 },
      { ...state, taskActivations: [{ elementId: timerTask.task.elementId, count: 1 }] },
      { ...state, timerActivations: [{ elementId: timerTask.boundaryTimer.elementId, count: 1 }] },
      { ...state, activityActivations: [{ elementId: timerTask.task.elementId, count: 1 }] },
    ];
    for (const changed of stale) {
      assert.notEqual(prepare(program, changed, candidate), null);
      assert.equal(apply(program, changed, prepared), null);
    }
    assert.equal(prepare(program, state, { operation: timerTask, owner: { ...owner, activation: 2 } }), null);
    const snapshots = { ...program, compensationEventSubProcessSnapshots: {
      targets: [], limits: { maxRecords: 1, maxCanonicalBytes: 1024 },
    } };
    assert.equal(prepare(snapshots, state, candidate), null);
    assert.equal(apply(snapshots, state, prepared), null);
    assert.equal(batch(snapshots, state, [candidate, { operation: ordinary, owner }]), null);
  });

  test(`${kind} rolls back the whole command when the batch lacks one unit of fuel`, () => {
    const { program } = fixture(kind);
    const result = applyStimulusWithTrace(program, initialState, {
      kind: StimulusKind.StartProcess, commandId: `short-${kind}`,
      processId: program.processId, instanceId, initialVariables: [],
    }, 3);
    assert.equal(result.result.outcome, CommandOutcome.RolledBack);
    assert.equal(result.result.internalStepBoundExceeded, true);
    assert.equal(result.result.ambiguousInternalChoice, false);
    assert.deepEqual(result.result.state, initialState);
    assert.deepEqual(result.committedTransitions, []);
    assert.deepEqual(result.flowNodeOccurrenceLifecycles, []);
  });
}
