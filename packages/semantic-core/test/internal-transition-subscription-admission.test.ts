import assert from "node:assert/strict";
import test from "node:test";
import {
  ControlStateKind, EffectOperation, EffectProtocol, SemanticOperationKind,
  initialState, isWellFormedRuntimeState, isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram, ScopeOccurrenceId } from "@bpmn-lean/semantic-core";
import * as message from "./activity-boundary-message-fixture.ts";
import * as child from "./bounded-scope-fixture.ts";

const { deriveInternalTransitionPreparation: prepare, applyPreparedInternalTransition: apply,
  preparedInternalTransitionsAreIndependent, prepareInternalTransitionBatch } = await import(
  new URL("../dist/internal-transition-batch.js", import.meta.url).href
) as typeof import("../src/internal-transition-batch.ts");
const { deriveInternalActivityArmingPreparation: rawMessage } = await import(
  new URL("../dist/internal-transition-activity-arming-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-activity-arming-preparation.ts");
const { deriveInternalBoundedScopePreparation: rawChild } = await import(
  new URL("../dist/internal-transition-bounded-scope-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-bounded-scope-preparation.ts");
const { repeatableSubscriptionProgramGraph } = await import(
  new URL("../dist/repeatable-subscription-admission.js", import.meta.url).href
) as typeof import("../src/repeatable-subscription-admission.ts");

const profile = "bpmn-2.0.2-repeatable-event-subscriptions-draft";

function predecessor(owner: ScopeOccurrenceId): RuntimeState {
  return { ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: owner.processInstanceId },
    scopeOccurrences: [{ id: owner, parent: null }],
    scopeActivations: [{ elementId: owner.definitionScopeId, count: owner.activation }],
    controlTokens: [{ placeId: "place:Flow_Start", owner, multiplicity: 1 }],
  };
}

function withEffect(program: SemanticProcessProgram): SemanticProcessProgram {
  const task = program.operations.find((operation) => operation.kind === SemanticOperationKind.AwaitUserTask);
  assert.ok(task?.kind === SemanticOperationKind.AwaitUserTask);
  const effect: SemanticOperation = {
    id: task.id, origin: task.origin, kind: SemanticOperationKind.AwaitEffect,
    input: task.input, output: task.output,
    effect: { elementId: task.task.elementId,
      descriptor: { protocol: EffectProtocol.Activity, operation: EffectOperation.Probe },
      inputMappings: [], outputMappings: [] },
    bpmnErrorRoute: null,
  };
  return { ...program, operations: program.operations.map((operation) => operation.id === task.id ? effect : operation) };
}

for (const kind of [SemanticOperationKind.AwaitMessageBoundedUserTask,
  SemanticOperationKind.AwaitMessageMonitoredUserTask, SemanticOperationKind.EnterBoundedScope,
  SemanticOperationKind.EnterMonitoredScope] as const) {
  const isMessage = kind === SemanticOperationKind.AwaitMessageBoundedUserTask ||
    kind === SemanticOperationKind.AwaitMessageMonitoredUserTask;
  const original = isMessage ? message.program : child.boundedScopeProgram;
  const owner = isMessage ? message.owner : child.rootOccurrence;
  const program: SemanticProcessProgram = { ...original,
    identity: { ...original.identity, semanticProfile: profile },
    operations: original.operations.map((operation): SemanticOperation => {
      if (operation.kind === SemanticOperationKind.AwaitMessageBoundedUserTask &&
          (kind === SemanticOperationKind.AwaitMessageBoundedUserTask || kind === SemanticOperationKind.AwaitMessageMonitoredUserTask)) {
        return { ...operation, kind };
      }
      if (operation.kind === SemanticOperationKind.EnterBoundedScope &&
          (kind === SemanticOperationKind.EnterBoundedScope || kind === SemanticOperationKind.EnterMonitoredScope)) {
        return { ...operation, kind };
      }
      return operation;
    }),
  };
  const operation = program.operations.find((candidate) => candidate.kind === kind);
  assert.ok(operation?.kind === SemanticOperationKind.AwaitMessageBoundedUserTask ||
    operation?.kind === SemanticOperationKind.AwaitMessageMonitoredUserTask ||
    operation?.kind === SemanticOperationKind.EnterBoundedScope || operation?.kind === SemanticOperationKind.EnterMonitoredScope);
  const state = predecessor(owner);
  const candidate = { operation, owner };
  const raw = (input: SemanticProcessProgram) => "boundaryMessage" in operation
    ? rawMessage(input, state, operation) : rawChild(input, state, operation);

  test(`${kind} requires full subscription admission at preparation and application`, () => {
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(isWellFormedRuntimeState(program, owner.processInstanceId, state), true);
    const prepared = prepare(program, state, candidate);
    assert.ok(prepared !== null);
    assert.equal(preparedInternalTransitionsAreIndependent(prepared, prepared), false);
    assert.equal(prepareInternalTransitionBatch(program, state, [candidate, candidate]), null);
    assert.notEqual(apply(program, state, prepared), null);
    const malformed = { ...program, identity: { ...program.identity, sourceSha256: "invalid" } };
    assert.equal(repeatableSubscriptionProgramGraph(malformed), true);
    for (const invalid of [malformed, withEffect(program)]) {
      assert.equal(isWellFormedSemanticProcessProgram(invalid), false);
      assert.notEqual(raw(invalid), null, "raw family preparation remains independent of admission");
      assert.equal(prepare(invalid, state, candidate), null);
      assert.equal(apply(invalid, state, prepared), null, "prepared values cannot bypass admission");
    }
    const legacy = { ...program, identity: original.identity };
    assert.notEqual(raw(legacy), null);
    if (kind === SemanticOperationKind.EnterBoundedScope) {
      const legacyWithEffect = withEffect(legacy);
      assert.equal(isWellFormedSemanticProcessProgram(legacyWithEffect), true);
      const oldPrepared = prepare(legacyWithEffect, state, candidate);
      assert.ok(oldPrepared !== null, "legacy raw bounded entry retains its wider domain");
      assert.notEqual(apply(legacyWithEffect, state, oldPrepared), null);
    } else {
      if (kind === SemanticOperationKind.AwaitMessageBoundedUserTask) {
        assert.equal(isWellFormedSemanticProcessProgram(withEffect(legacy)), true);
        assert.notEqual(raw(withEffect(legacy)), null);
        assert.equal(prepare(withEffect(legacy), state, candidate), null);
      }
      assert.equal(prepare(legacy, state, candidate), null, "new integration requires exact profile identity");
      assert.equal(apply(legacy, state, prepared), null);
    }
  });
}
