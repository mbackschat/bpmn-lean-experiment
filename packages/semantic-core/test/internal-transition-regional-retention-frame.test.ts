import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivityBodyKind, ActivityHandlerKind, SemanticOperationKind as Kind, applyInternalOperationStep,
  compareCanonicalStrings, isWellFormedSemanticProcessProgram, projectOpenFlowNodeOccurrences,
  runtimeStateDefects, supportsSemanticProcessExecution, projectFlowNodeOccurrenceLifecycleDelta,
  SemanticFlowNodeOccurrenceAnchorKind, FlowNodeOccurrenceTerminalKind, attachedHandlersForBodyAnchor,
  StimulusKind, SemanticTransitionKind, projectControlPositionDelta, requireCompleteFlowNodeOccurrenceLifecycles,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { internalArmingOperation } from "./internal-arming-operation-fixture.ts";
import { regionalPairFixture } from "./internal-regional-pair-fixture.ts";

const { deriveInternalRegionalPreparation: prepare, applyPreparedInternalRegionalTransition: apply } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { deriveRegionalReferenceRetention: retention, regionalOwnershipIsClosed: closed } = await import(
  new URL("../dist/internal-transition-regional-ownership.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-ownership.ts");
const { internalTransitionStateFootprintsAreIndependent: independent, InternalTransitionStateAtomKind: Atom } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint.ts");
const { compareTokenPlaces } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as typeof import("../src/internal-publication-template.ts");
const { cancelledRegion } = await import(
  new URL("../dist/flow-node-occurrence-publication-external-completeness.js", import.meta.url).href
) as typeof import("../src/flow-node-occurrence-publication-external-completeness.ts");
const { completeOrdinaryUserTask } = await import(
  new URL("../dist/semantic-process-user-task-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-user-task-runtime.ts");

for (const leftKind of [Kind.ThrowError, Kind.TerminateScope] as const) {
  for (const rightKind of [Kind.ThrowError, Kind.TerminateScope] as const) {
    for (const handlerKind of [ActivityHandlerKind.Timer, ActivityHandlerKind.Message] as const) {
      test(`${leftKind}/${rightKind}/${handlerKind} preserves closure and publishes actual child-body withdrawal`, () => {
        const fixture = regionalPairFixture(leftKind, rightKind);
        const [left, right] = fixture.branches;
        assert.ok(left && right);
        const original = fixture.program.operations.find(({ id }) => id === `operation:${left.name}_Sibling_Task`);
        assert.ok(original?.kind === Kind.AwaitUserTask);
        const originalWait = fixture.state.userTaskWaits.find(({ id }) => id.elementId === original.task.elementId)!;
        const arming = internalArmingOperation(handlerKind === ActivityHandlerKind.Timer ? Kind.AwaitTimer : Kind.AwaitMessage,
          original.input, original.output);
        const program: SemanticProcessProgram = { ...fixture.program,
          operations: fixture.program.operations.map((operation) => operation === original ? arming : operation)
            .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
          operationScopes: fixture.program.operationScopes.map((binding) => binding.operationId === original.id
            ? { ...binding, operationId: arming.id } : binding)
            .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
        };
        const restored: RuntimeState = { ...fixture.state,
          userTaskWaits: fixture.state.userTaskWaits.filter((wait) => wait !== originalWait),
          controlTokens: [...fixture.state.controlTokens,
            { placeId: original.input, owner: originalWait.owner, multiplicity: 1 }].sort(compareTokenPlaces),
        };
        const armed = applyInternalOperationStep(program, arming, restored);
        assert.ok(armed !== null);
        const sideArmed = applyInternalOperationStep(program, fixture.side, armed.successor);
        assert.ok(sideArmed !== null);
        const rightScope = armed.successor.scopeOccurrences.find(({ id }) => id.definitionScopeId === right.scopeId)!;
        const wait = handlerKind === ActivityHandlerKind.Timer
          ? armed.successor.timerWaits[0]! : armed.successor.messageWaits[0]!;
        const activityElementId = "CrossRegionBody";
        const before: RuntimeState = { ...sideArmed.successor,
          activityOccurrences: [{ id: { processInstanceId: originalWait.owner.processInstanceId, activityElementId, activation: 1 },
            operationId: left.entry.id, owner: originalWait.owner,
            body: { kind: ActivityBodyKind.ChildScope, scope: rightScope.id },
            attachedHandlers: [{ kind: handlerKind, occurrence: wait.id }],
          }],
          activityActivations: [...armed.successor.activityActivations, { elementId: activityElementId, count: 1 }]
            .sort((a, b) => compareCanonicalStrings(a.elementId, b.elementId)),
        };
        const valid = (state: RuntimeState) => {
          assert.deepEqual(runtimeStateDefects(program, fixture.start.instanceId, state), []);
          assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
        };
        assert.equal(isWellFormedSemanticProcessProgram(program), true);
        assert.equal(supportsSemanticProcessExecution(fixture.start, program), false);
        valid(before);
        const leftPrepared = prepare(program, before, left.selected);
        const rightPrepared = prepare(program, before, right.selected);
        assert.ok(leftPrepared !== null && rightPrepared !== null);
        assert.equal(closed(before, rightPrepared.selection), true);
        const oldMask = retention(before, rightPrepared.selection);
        const after = apply(program, before, leftPrepared);
        assert.ok(after !== null);
        assert.deepEqual(after, applyInternalOperationStep(program, left.selected, before)?.successor);
        valid(after);
        assert.deepEqual(after.activityOccurrences, []);
        assert.deepEqual(after.timerWaits, []);
        assert.deepEqual(after.messageWaits, []);
        const next = prepare(program, after, right.selected);
        assert.ok(next !== null);
        assert.equal(closed(after, next.selection), true);
        const newMask = retention(after, next.selection);
        const removesBody = rightKind === Kind.ThrowError;
        if (handlerKind === ActivityHandlerKind.Timer) {
          assert.equal(oldMask.timer(before.timerWaits[0]!), !removesBody);
          assert.equal(newMask.timer(before.timerWaits[0]!), true);
        } else {
          assert.equal(oldMask.message(before.messageWaits[0]!), !removesBody);
          assert.equal(newMask.message(before.messageWaits[0]!), true);
        }
        assert.equal(independent(leftPrepared.footprint, rightPrepared.footprint), false,
          "the Activity withdrawal overlaps the other cancellation's body region even when its root survives");
        const omitActivityWrites = (prepared: typeof leftPrepared) => ({ ...prepared.footprint,
          writes: prepared.footprint.writes.filter(({ kind }) => kind !== Atom.ActivityAssociation),
        });
        assert.equal(independent(omitActivityWrites(leftPrepared), omitActivityWrites(rightPrepared)), true,
          "omitting shared Activity writes reproduces false independence");
        assert.equal(apply(program, before, { ...leftPrepared, footprint: omitActivityWrites(leftPrepared) }), null);
        if (removesBody) {
          assert.notDeepEqual(next, rightPrepared,
            "ownership closure alone does not prove preservation of complete preparation");
        } else {
          assert.deepEqual(next, rightPrepared);
        }
        const rightAfter = apply(program, before, rightPrepared);
        assert.ok(rightAfter !== null);
        valid(rightAfter);
        assert.deepEqual(rightAfter.timerWaits, removesBody ? [] : before.timerWaits);
        assert.deepEqual(rightAfter.messageWaits, removesBody ? [] : before.messageWaits);
        if (!removesBody) {
          const leftAfterRight = prepare(program, rightAfter, left.selected);
          assert.ok(leftAfterRight !== null);
          assert.deepEqual(leftAfterRight, leftPrepared);
          assert.deepEqual(apply(program, rightAfter, leftAfterRight), apply(program, after, next));
        }
        const publication = instantiateInternalPublicationBatch("cancel-body", 0, [rightPrepared.publicationTemplate]);
        assert.ok(publication !== null && publication[0] !== undefined);
        assert.equal(publication[0].lifecycle.ended.some(({ anchor, terminal }) =>
          anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
          JSON.stringify(anchor.id) === JSON.stringify(wait.id) &&
          terminal === FlowNodeOccurrenceTerminalKind.Cancelled
        ), removesBody, "the template ends the outside handler only when its body is removed");
        const actual = projectFlowNodeOccurrenceLifecycleDelta(program, before, rightAfter, {
          kind: "internal", operation: right.selected,
          owner: rightPrepared.selection.owner,
        }, "cancel-body", 0);
        assert.notEqual(actual, null, "actual publication must fold to the exact successor open set");
        assert.deepEqual(actual, publication[0].lifecycle);
        const retained = projectOpenFlowNodeOccurrences(program, before)!.map((entry) => ({
          ...entry, attachedHandlers: attachedHandlersForBodyAnchor(before, entry.anchor),
        }));
        assert.deepEqual(cancelledRegion(program, retained, rightPrepared.selection.owner,
          rightKind === Kind.TerminateScope), actual!.ended.filter(({ terminal }) =>
          terminal === FlowNodeOccurrenceTerminalKind.Cancelled
        ), "the state-free relation must distinguish a retained body from a removed body");
        const side = before.userTaskWaits.find(({ id }) => id.elementId === "Side_Task");
        assert.ok(side !== undefined);
        const stimulus = { kind: StimulusKind.CompleteUserTaskInstance,
          commandId: "cancel-body", taskId: side.id, submittedValues: [] } as const;
        const externalAfter = completeOrdinaryUserTask(program, before, stimulus);
        assert.ok(externalAfter !== null);
        const externalDelta = projectFlowNodeOccurrenceLifecycleDelta(program, before, externalAfter,
          { kind: "external", stimulus }, stimulus.commandId, 0);
        const positionDelta = projectControlPositionDelta(program, before, externalAfter);
        assert.ok(externalDelta !== null && positionDelta !== null);
        const commandPrepared = prepare(program, externalAfter, right.selected);
        assert.ok(commandPrepared !== null);
        const commandAfter = apply(program, externalAfter, commandPrepared);
        assert.ok(commandAfter !== null);
        const commandPublication = instantiateInternalPublicationBatch(stimulus.commandId, 1,
          [commandPrepared.publicationTemplate])![0]!;
        assert.deepEqual(projectFlowNodeOccurrenceLifecycleDelta(program, externalAfter, commandAfter,
          { kind: "internal", operation: right.selected, owner: commandPrepared.selection.owner },
          stimulus.commandId, 1), commandPublication.lifecycle);
        const transitions = [{ logicalTimeMs: before.logicalTimeMs,
          transition: { kind: SemanticTransitionKind.ExternalStimulus, stimulus }, positionDelta },
          commandPublication.record] as const;
        const check = () => requireCompleteFlowNodeOccurrenceLifecycles(program, retained, stimulus.commandId,
          transitions, [externalDelta, commandPublication.lifecycle]);
        if (handlerKind === ActivityHandlerKind.Message) {
          assert.throws(check, /accumulator continuity drifted/u,
            "the current retained Message account still excludes child-scope hosts");
        } else {
          assert.doesNotThrow(check);
          const wrongHandler: typeof commandPublication.lifecycle = { ...commandPublication.lifecycle,
            ended: removesBody ? commandPublication.lifecycle.ended.filter(({ anchor }) =>
              anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Wait ||
              JSON.stringify(anchor.id) !== JSON.stringify(wait.id)) : [...commandPublication.lifecycle.ended, {
                anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Wait, id: wait.id },
                terminal: FlowNodeOccurrenceTerminalKind.Cancelled,
              }] };
          assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(program, retained, stimulus.commandId,
            transitions, [externalDelta, wrongHandler]));
        }
      });
    }
  }
}
