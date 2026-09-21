import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivityBodyKind, ActivityHandlerKind, SemanticOperationKind as Kind,
  SemanticFlowNodeOccurrenceAnchorKind as Anchor, FlowNodeOccurrenceTerminalKind as Terminal,
  applyInternalOperationStep, attachedHandlersForBodyAnchor, compareCanonicalStrings,
  isWellFormedSemanticProcessProgram, projectFlowNodeOccurrenceLifecycleDelta,
  projectOpenFlowNodeOccurrences, runtimeStateDefects,
  StimulusKind, SemanticTransitionKind, projectControlPositionDelta, requireCompleteFlowNodeOccurrenceLifecycles,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { regionalPairFixture } from "./internal-regional-pair-fixture.ts";
import { internalArmingOperation } from "./internal-arming-operation-fixture.ts";
import { controlPlace } from "./semantic-program-parts.ts";

const { deriveInternalRegionalPreparation: prepare, applyPreparedInternalRegionalTransition: apply } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { cancelledRegion } = await import(
  new URL("../dist/flow-node-occurrence-publication-external-completeness.js", import.meta.url).href
) as typeof import("../src/flow-node-occurrence-publication-external-completeness.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as typeof import("../src/internal-publication-template.ts");
const { interruptBoundedScope } = await import(
  new URL("../dist/semantic-process-bounded-scope-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-bounded-scope-runtime.ts");

for (const kind of [Kind.AwaitUserTask, Kind.AwaitMessage] as const) {
  test(`private boundary Timer cancellation preserves an unrelated ${kind} with the same wait identity`, () => {
    const fixture = regionalPairFixture(Kind.ThrowError, Kind.TerminateScope);
    const branch = fixture.branches[0]!;
    assert.ok(branch.entry.kind === Kind.EnterScope && branch.selected.kind === Kind.ThrowError);
    assert.ok(fixture.side.kind === Kind.AwaitUserTask);
    const side = internalArmingOperation(kind, fixture.side.input, fixture.side.output);
    assert.ok(side.kind === Kind.AwaitUserTask || side.kind === Kind.AwaitMessage);
    const elementId = side.kind === Kind.AwaitUserTask ? side.task.elementId : side.message.elementId;
    const timerOutput = controlPlace("Private_Deadline_Output");
    const parentScopeId = fixture.program.operationScopes.find(({ operationId }) => operationId === branch.entry.id)!.scopeId;
    const entry = { ...branch.entry, kind: Kind.EnterBoundedScope,
      boundaryTimer: { elementId, durationMs: 1000, output: timerOutput.id, origin: timerOutput.origin },
    } as const;
    const program: SemanticProcessProgram = { ...fixture.program,
      operations: fixture.program.operations.map((operation) => operation === branch.entry ? entry
        : operation === fixture.side ? side
        : operation.kind === Kind.MergeExclusive && operation.id === `operation:${branch.name}_Merge`
          ? { ...operation, inputs: ([timerOutput.id, ...operation.inputs] as [string, ...string[]]).sort(compareCanonicalStrings) } : operation)
        .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      operationScopes: fixture.program.operationScopes.map((binding) => binding.operationId === fixture.side.id
        ? { ...binding, operationId: side.id } : binding).sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
      controlPlaces: [...fixture.program.controlPlaces, timerOutput].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      controlPlaceScopes: [...fixture.program.controlPlaceScopes, { controlPlaceId: timerOutput.id, scopeId: parentScopeId }]
        .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
    };
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    const armed = applyInternalOperationStep(program, side, fixture.state);
    assert.ok(armed !== null);
    const child = fixture.state.scopeOccurrences.find(({ id }) => id.definitionScopeId === branch.scopeId)!;
    assert.ok(child.parent !== null);
    const timerId = { processInstanceId: fixture.start.instanceId, elementId, activation: 1 };
    const before: RuntimeState = { ...armed.successor,
      timerWaits: [{ id: timerId, owner: child.parent, deadlineMs: fixture.state.logicalTimeMs + 1000,
        output: entry.boundaryTimer.output }],
      timerActivations: [...fixture.state.timerActivations, { elementId, count: 1 }]
        .sort((a, b) => compareCanonicalStrings(a.elementId, b.elementId)),
      activityOccurrences: [{ id: { processInstanceId: fixture.start.instanceId,
        activityElementId: entry.origin.elementId, activation: 1 }, operationId: entry.id,
        owner: child.parent, body: { kind: ActivityBodyKind.ChildScope, scope: child.id },
        attachedHandlers: [{ kind: ActivityHandlerKind.Timer, occurrence: timerId }] }],
      activityActivations: [...fixture.state.activityActivations, { elementId: entry.origin.elementId, count: 1 }]
        .sort((a, b) => compareCanonicalStrings(a.elementId, b.elementId)),
    };
    assert.deepEqual(runtimeStateDefects(program, fixture.start.instanceId, before), []);
    const open = projectOpenFlowNodeOccurrences(program, before);
    assert.ok(open !== null);
    const alias = open.find(({ anchor }) => anchor.kind === Anchor.Wait && anchor.id.elementId === elementId)!;
    assert.ok(alias !== undefined);
    const prepared = prepare(program, before, branch.selected);
    assert.ok(prepared !== null);
    const after = apply(program, before, prepared);
    assert.ok(after !== null);
    assert.deepEqual(runtimeStateDefects(program, fixture.start.instanceId, after), []);
    assert.deepEqual(after.timerWaits, []);
    assert.ok(projectOpenFlowNodeOccurrences(program, after)!.some(({ anchor }) =>
      JSON.stringify(anchor) === JSON.stringify(alias.anchor)));
    const expected = open.filter(({ owner, anchor }) => owner.definitionScopeId === branch.scopeId ||
      (anchor.kind === Anchor.Scope && anchor.id.definitionScopeId === branch.scopeId))
      .map(({ anchor }) => ({ anchor, terminal: Terminal.Cancelled }));
    const retained = open.map((item) => ({ ...item, attachedHandlers: attachedHandlersForBodyAnchor(before, item.anchor) }));
    assert.deepEqual(cancelledRegion(program, retained, child.id, false), expected,
      "retained cancellation must not turn a private Timer attachment into a public wait ending");
    const publication = instantiateInternalPublicationBatch("private-alias", 0, [prepared.publicationTemplate]);
    assert.ok(publication !== null && publication[0] !== undefined);
    assert.deepEqual(publication[0].lifecycle.ended.filter(({ terminal }) => terminal === Terminal.Cancelled), expected);
    const actual = projectFlowNodeOccurrenceLifecycleDelta(program, before, after,
      { kind: "internal", operation: branch.selected, owner: child.id }, "private-alias", 0);
    assert.ok(actual !== null, "the candidate must be accepted against the surviving public wait");
    assert.deepEqual(actual, publication[0].lifecycle);
    assert.deepEqual(actual.ended.filter(({ terminal }) => terminal === Terminal.Cancelled), expected);
    const stimulus = { kind: StimulusKind.FireTimer, commandId: "private-deadline", timerId,
      logicalTimeMs: before.timerWaits[0]!.deadlineMs } as const;
    const interrupted = interruptBoundedScope(program, before, stimulus);
    assert.ok(interrupted !== null);
    assert.deepEqual(runtimeStateDefects(program, fixture.start.instanceId, interrupted), []);
    const external = projectFlowNodeOccurrenceLifecycleDelta(program, before, interrupted,
      { kind: "external", stimulus }, stimulus.commandId, 0);
    const positionDelta = projectControlPositionDelta(program, before, interrupted);
    assert.ok(external !== null && positionDelta !== null);
    assert.deepEqual(external.ended.filter(({ terminal }) => terminal === Terminal.Cancelled), expected);
    assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(program, retained, stimulus.commandId,
      [{ logicalTimeMs: stimulus.logicalTimeMs, transition: { kind: SemanticTransitionKind.ExternalStimulus, stimulus }, positionDelta }],
      [external]));
    assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(program, retained, stimulus.commandId,
      [{ logicalTimeMs: stimulus.logicalTimeMs, transition: { kind: SemanticTransitionKind.ExternalStimulus, stimulus }, positionDelta }],
      [{ started: [], ended: [{ anchor: alias.anchor, terminal: Terminal.Completed }] }]),
    /not a complete lifecycle/u, "a private deadline must not complete the aliased public wait");
  });
}
