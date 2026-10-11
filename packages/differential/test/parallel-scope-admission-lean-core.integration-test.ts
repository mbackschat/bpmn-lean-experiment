import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { initialState, SemanticOperationKind, LocalDataOwnerKind, CommandOutcome, ActivityBodyKind, VariableValueKind,
  StimulusKind, EffectExecutionResultKind, SemanticFlowNodeOccurrenceAnchorKind as Anchor,
  FlowNodeOccurrenceTerminalKind as Terminal } from "@bpmn-lean/semantic-core";
import type { RuntimeState, ScopeOccurrenceId, SemanticProcessProgram, StartProcessStimulus,
  UnnumberedFlowNodeOccurrenceDelta } from "@bpmn-lean/semantic-core";
import { reservationInputs, controlClosureInputs, wholeModelReservationInputs, wholeModelStartClosureInputs } from "./parallel-scope-reservation-fixture.ts";
import { parallelAdmissionCases } from "../../bpmn-source/test/parallel-scope-admission-fixture.ts";
import { parallelStartBoundCases, parallelStartFrontierCases } from "../../bpmn-source/test/parallel-scope-start-bound-fixture.ts";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";
const { parallelScopeCheckedSourceAdmitted } = await import(new URL("../../bpmn-source/dist/multi-instance-scope-source-compiler.js", import.meta.url).href) as typeof import("../../bpmn-source/src/multi-instance-scope-source-compiler.ts");
const { parallelScopeStartClosureBound, parallelScopeStartFrontierCapacity } = await import(new URL("../../bpmn-source/dist/parallel-scope-start-bound.js", import.meta.url).href) as typeof import("../../bpmn-source/src/parallel-scope-start-bound.ts");

import { owner, prefix, verifyParallelCommandParity, verifyParallelEarlyCompletionParity, verifyParallelRootEffectParity, verifyParallelInnerBodyCommandParity, verifyParallelProgramCapacityParity, verifyParallelDataCommandParity, verifyParallelParentPreludeParity, verifyParallelOutputMappingParity } from "./parallel-scope-command-parity.ts";

test("Lean and TypeScript agree on shared-input reservation slots and every applied prefix", async () => {
  const { admitProcessStart } = await import(new URL("../../semantic-core/dist/semantic-process-triggered-start.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-process-triggered-start.ts");
  const { applyInternalOperationOccurrence } = await import(new URL("../../semantic-core/dist/internal-operation-occurrence.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-operation-occurrence.ts");
  const { applyInternalOccurrenceBatch } = await import(new URL("../../semantic-core/dist/internal-occurrence-batch.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-occurrence-batch.ts");
  const { deriveInternalExecutionFrontier } = await import(new URL("../../semantic-core/dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-transition-preparation.ts");
  const { evaluateScheduledClosure } = await import(new URL("../../semantic-core/dist/internal-choice-schedule.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-choice-schedule.ts");
  const { isWellFormedSemanticProcessProgram } = await import(new URL("../../semantic-core/dist/semantic-process-admission.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-process-admission.ts");
  const { projectInternalExecutionBatch, replayInternalTransitionRecord } = await import(new URL("../../semantic-core/dist/semantic-transition-trace.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-transition-trace.ts");
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-reservation-"));
  try {
    const files: string[] = [];
    const results: unknown[] = [];
    const cases: { program: SemanticProcessProgram; start: StartProcessStimulus; count: number; accepted: boolean }[] = [];
    for (const count of [0, 1, 2, 16]) for (const human of [false, true]) for (const reverse of [false, true]) {
      cases.push({ ...reservationInputs(count, human, reverse), count, accepted: count >= 2 });
    }
    for (const human of [false, true]) {
      const { program, start } = reservationInputs(2, human, false);
      const wait = program.operations.find(operation => operation.id === "check")!;
      const competitor = wait.kind === SemanticOperationKind.AwaitUserTask
        ? { ...wait, id: "other", origin: { ...wait.origin, elementId: "Other" }, task: { ...wait.task, elementId: "Other" } }
        : wait.kind === SemanticOperationKind.AwaitEffect
          ? { ...wait, id: "other", origin: { ...wait.origin, elementId: "Other" }, effect: { ...wait.effect, elementId: "Other" } }
          : null;
      assert.ok(competitor);
      for (const invalid of [
        { ...program, identity: { ...program.identity, semanticProfile: "unselected-reservation-profile" } },
        { ...program, operations: program.operations.map(operation => operation.id === "check"
          ? { ...operation, origin: { ...operation.origin, elementId: "Wrong" } } : operation) },
        { ...program, controlPlaceScopes: program.controlPlaceScopes.filter(binding => binding.controlPlaceId !== "check") },
        { ...program, operations: [...program.operations, wait] },
        { ...program, operations: [...program.operations, competitor],
          operationScopes: [...program.operationScopes, { operationId: "other", scopeId: "body" }] },
      ]) cases.push({ program: invalid, start, count: 2, accepted: false });
    }
    for (const input of await wholeModelReservationInputs()) {
      assert.ok(isWellFormedSemanticProcessProgram(input.program), "whole-model publication input must be structurally valid");
      cases.push({ ...input, accepted: true });
    }
    for (const { program, start, count, accepted } of cases) {
      const state = admitProcessStart(program, initialState, start);
      assert.ok(state);
      const root = state.scopeOccurrences[0]!.id;
      const initiation = program.operations.find(operation => operation.kind === SemanticOperationKind.Initiate)!;
      const initiated = applyInternalOperationOccurrence(program, state, { operationId: initiation.id, owner: root });
      assert.ok(initiated);
      const entry = program.operations.find(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope)!;
      const entered = applyInternalOperationOccurrence(program, initiated, { operationId: entry.id, owner: root });
      assert.ok(entered);
      const batch = deriveInternalExecutionFrontier(program, entered, () => ({ step: null, refusal: null })).occurrenceBatch ?? null;
      assert.equal(batch !== null, accepted, `reservation case ${results.length}`);
      let result = null;
      if (batch !== null) {
        const applied = applyInternalOccurrenceBatch(program, entered, batch);
        assert.ok(applied);
        assert.equal(applied.length, count);
        const close = (fuel: number) => evaluateScheduledClosure(program, entered,
          { outcome: CommandOutcome.Committed, state: entered }, [], fuel,
          current => deriveInternalExecutionFrontier(program, current, () => assert.fail("legacy dispatch")));
        const closed = close(count);
        assert.equal(closed.result.outcome, CommandOutcome.Committed);
        assert.ok(closed.selectedInternalPreparations[0], "reservation certificate must survive the scheduler/publication handoff");
        assert.deepEqual(closed.result.state, applied.at(-1)!.successor);
        const short = close(count - 1);
        assert.equal(short.result.outcome, CommandOutcome.RolledBack);
        assert.equal(short.result.internalStepBoundExceeded, true);
        assert.deepEqual(short.result.state, entered);
        assert.deepEqual(short.selectedInternalSteps, []);
        const published = projectInternalExecutionBatch(program, entered, applied,
          closed.selectedInternalPreparations[0]!, "batch", 0);
        assert.equal(published !== null, isWellFormedSemanticProcessProgram(program), "publication requires structural validity");
        if (published !== null) {
          assert.equal(published.records.length, count);
          assert.equal(published.lifecycles.length, count);
          let replayed = entered;
          for (const [index, record] of published.records.entries()) {
            assert.ok(record.transition.kind === "internalOperation");
            const next = replayInternalTransitionRecord(program, replayed, record);
            assert.deepEqual(next, applied[index]!.successor, "exact-owner replay must reconstruct each reserved prefix");
            assert.equal(replayInternalTransitionRecord(program, next!, record), null, "consumed owners cannot replay twice");
            for (const transition of [
              { ...record.transition, owner: root },
              { ...record.transition, operationId: "missing" },
              { ...record.transition, operationKind: SemanticOperationKind.Initiate },
              { ...record.transition, origin: { ...record.transition.origin, elementId: "Wrong" } },
            ]) assert.equal(replayInternalTransitionRecord(program, replayed, { ...record, transition }), null);
            assert.equal(replayInternalTransitionRecord(program, replayed,
              { ...record, logicalTimeMs: record.logicalTimeMs + 1 }), null, "replay retains the actual logical time");
            replayed = next!;
          }
          assert.equal(projectInternalExecutionBatch(program, entered, applied.slice(0, -1),
            closed.selectedInternalPreparations[0]!, "batch", 0), null, "a missing final member cannot publish a prefix");
          const altered = applied.map((step, index) => index === 0
            ? { ...step, owner: root } : step);
          assert.equal(projectInternalExecutionBatch(program, entered, altered,
            closed.selectedInternalPreparations[0]!, "batch", 0), null, "a substituted owner cannot publish a reserved member");
          const wrongSuccessor = applied.map((step, index) => index === 0
            ? { ...step, successor: applied.at(-1)!.successor } : step);
          assert.equal(projectInternalExecutionBatch(program, entered, wrongSuccessor,
            closed.selectedInternalPreparations[0]!, "batch", 0), null, "a later successor cannot replace its actual prefix");
        }
        const prefixes = applied.map(step => prefix(entered, step.successor));
        assert.ok(prefixes.every(value => value.otherStateUnchanged));
        result = { programWellFormed: isWellFormedSemanticProcessProgram(program),
          slots: batch.members.map(member => [member.alternative.operationId, owner(member.alternative.owner), member.slot]), prefixes,
          publications: published === null ? null : { records: published.records, lifecycles: published.lifecycles } };
      }
      const index = results.length;
      const programPath = path.join(directory, `${index}.program.json`);
      const startPath = path.join(directory, `${index}.start.json`);
      await writeFile(programPath, JSON.stringify(program));
      await writeFile(startPath, JSON.stringify(start));
      files.push(programPath, startPath);
      results.push(result);
    }
    const execution = await runLeanInterpreter("BpmnSemantics/ParallelScopeReservationMain.lean", files, results.length);
    assert.deepEqual(execution.stdout.trim().split("\n").map(line => JSON.parse(line)), results);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Lean and TypeScript agree on shared-input arming refusal and successful controls", async () => {
  const { admitProcessStart } = await import(new URL("../../semantic-core/dist/semantic-process-triggered-start.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-process-triggered-start.ts");
  const { applyInternalOperationOccurrence, deriveInternalExecutionFrontier } = await import(new URL("../../semantic-core/dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-transition-preparation.ts");
  const { evaluateScheduledClosure } = await import(new URL("../../semantic-core/dist/internal-choice-schedule.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-choice-schedule.ts");
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-refusal-"));
  try {
    const files: string[] = [];
    const results: unknown[] = [];
    for (const count of [1, 2, 16]) for (const missing of [false, true]) {
      const input = reservationInputs(count, false, false);
      const { program } = input;
      const start = { ...input.start, initialVariables: input.start.initialVariables.filter(binding => !missing || binding.name !== "tenant") };
      let entered = admitProcessStart(program, initialState, start);
      assert.ok(entered);
      const root = entered.scopeOccurrences[0]!.id;
      for (const kind of [SemanticOperationKind.Initiate, SemanticOperationKind.EnterParallelMultiInstanceScope]) {
        const operation = program.operations.find(candidate => candidate.kind === kind)!;
        entered = applyInternalOperationOccurrence(program, entered, { operationId: operation.id, owner: root });
        assert.ok(entered);
      }
      const frontierAt = (state: RuntimeState) => deriveInternalExecutionFrontier(program, state, () => assert.fail("legacy dispatch"));
      const closed = evaluateScheduledClosure(program, entered, { outcome: CommandOutcome.Committed, state: entered }, [], 16, frontierAt);
      const result = { preparationFailed: frontierAt(entered).preparationFailed,
        failed: closed.result.outcome !== CommandOutcome.Committed, unchanged: isDeepStrictEqual(closed.result.state, entered) };
      assert.deepEqual(result, { preparationFailed: missing, failed: missing, unchanged: missing });
      const programPath = path.join(directory, `${results.length}.program.json`);
      const startPath = path.join(directory, `${results.length}.start.json`);
      await writeFile(programPath, JSON.stringify(program));
      await writeFile(startPath, JSON.stringify(start));
      files.push(programPath, startPath);
      results.push(result);
    }
    const execution = await runLeanInterpreter("BpmnSemantics/ParallelScopeReservationMain.lean", ["--refusal", ...files], results.length);
    assert.deepEqual(execution.stdout.trim().split("\n").map(line => JSON.parse(line)), results);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

async function reservationIntegrityCases() {
  const { admitProcessStart } = await import(new URL("../../semantic-core/dist/semantic-process-triggered-start.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-process-triggered-start.ts");
  const { applyInternalOperationOccurrence, deriveInternalExecutionFrontier } = await import(new URL("../../semantic-core/dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-transition-preparation.ts");
  const { evaluateScheduledClosure } = await import(new URL("../../semantic-core/dist/internal-choice-schedule.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-choice-schedule.ts");
  const inputs = [];
  for (const count of [1, 2, 16]) for (const human of [false, true]) for (const reverse of [false, true]) {
    const { program, start } = reservationInputs(count, human, reverse);
    let entered = admitProcessStart(program, initialState, start);
    assert.ok(entered);
    const root = entered.scopeOccurrences[0]!.id;
    for (const kind of [SemanticOperationKind.Initiate, SemanticOperationKind.EnterParallelMultiInstanceScope]) {
      const operation = program.operations.find(candidate => candidate.kind === kind)!;
      entered = applyInternalOperationOccurrence(program, entered, { operationId: operation.id, owner: root });
      assert.ok(entered);
    }
    const wait = program.operations.find(operation => operation.id === "check")!;
    assert.ok(wait.kind === SemanticOperationKind.AwaitUserTask || wait.kind === SemanticOperationKind.AwaitEffect);
    const elementId = wait.kind === SemanticOperationKind.AwaitUserTask ? wait.task.elementId : wait.effect.elementId;
    const counters = (values: readonly number[]): RuntimeState => human
      ? { ...entered, taskActivations: values.map(value => ({ elementId, count: value })) }
      : { ...entered, effectActivations: values.map(value => ({ elementId, count: value })) };
    const variants = [
      ["normal", entered],
      ["missing-controller", { ...entered, parallelScopeControllers: [] }],
      ["missing-frames", { ...entered, variables: { ...entered.variables, scopes: [] } }],
      ["duplicate-counters", counters([0, 0])],
      ["exhausted-counters", counters([Number.MAX_SAFE_INTEGER])],
      ["exact-headroom", counters([Number.MAX_SAFE_INTEGER - count])],
      ["one-short-headroom", counters([Number.MAX_SAFE_INTEGER - count + 1])],
    ] as const;
    const results = variants.map(([label, state]) => {
      const frontierAt = (current: RuntimeState) => deriveInternalExecutionFrontier(program, current, () => assert.fail("legacy dispatch"));
      const frontier = frontierAt(state);
      const closed = evaluateScheduledClosure(program, state, { outcome: CommandOutcome.Committed, state }, [], count, frontierAt);
      const failed = closed.result.outcome !== CommandOutcome.Committed;
      const owners = state.scopeOccurrences.filter(scope => scope.id.definitionScopeId === "body").map(scope => scope.id);
      assert.equal(owners.length, count);
      return { label, preparationFailed: frontier.preparationFailed, offers: frontier.offers.length,
        directRefused: owners.every(owner => applyInternalOperationOccurrence(program, state, { operationId: wait.id, owner }) === null),
        failed, unchanged: isDeepStrictEqual(closed.result.state, state),
        noPartialOutcomes: !failed || (closed.selectedInternalSteps.length === 0 && closed.selectedInternalBatches.length === 0 &&
          closed.selectedInternalPreparations.length === 0 && closed.admittedState === null),
        activations: human ? closed.result.state.userTaskWaits.map(wait => wait.id.activation)
          : closed.result.state.effectWaits.map(wait => wait.id.activation),
        counters: human ? closed.result.state.taskActivations.map(row => row.count)
          : closed.result.state.effectActivations.map(row => row.count) };
    });
    inputs.push({ count, human, reverse, program, start, results });
  }
  return inputs;
}

test("TypeScript refuses malformed shared-input wait issuance before singleton or batch dispatch", async t => {
  for (const { count, human, reverse, results } of await reservationIntegrityCases()) for (const result of results) {
    await t.test(`${count} ${human ? "human" : "effect"} ${reverse ? "reverse" : "forward"} ${result.label}`, () => {
      const accepted = result.label === "normal" || result.label === "exact-headroom";
      assert.equal(result.failed, !accepted, "scheduler refusal must precede any committed wait");
      assert.equal(result.unchanged, !accepted, "refusal preserves every state collection and variable frame");
      assert.equal(result.noPartialOutcomes, true, "refusal discards all selected steps, batches and preparations");
      if (result.label !== "one-short-headroom" || count === 1) {
        assert.equal(result.preparationFailed, !accepted, "exhausted or malformed issuance refuses the frontier immediately");
        assert.equal(result.offers, accepted ? count : 0, "a refused enabled wait cannot remain offered or disappear as disabled");
      }
      assert.equal(result.directRefused, !accepted && (result.label !== "one-short-headroom" || count === 1),
        "direct occurrence dispatch validates population and its next safe activation");
      const base = result.label === "exact-headroom" ? Number.MAX_SAFE_INTEGER - count : 0;
      assert.deepEqual(result.activations, accepted ? Array.from({ length: count }, (_, index) => base + index + 1) : []);
      const expectedCounters = accepted ? [base + count] : result.label === "duplicate-counters" ? [0, 0]
        : result.label === "exhausted-counters" ? [Number.MAX_SAFE_INTEGER]
          : result.label === "one-short-headroom" ? [Number.MAX_SAFE_INTEGER - count + 1] : [];
      assert.deepEqual(result.counters, expectedCounters, "failure preserves counters; exact fit allocates through MAX_SAFE_INTEGER");
    });
  }
});

test("Lean and TypeScript agree on shared-input wait issuance integrity and atomic headroom", async () => {
  const inputs = await reservationIntegrityCases();
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-integrity-"));
  try {
    const files: string[] = [];
    for (const [index, { program, start }] of inputs.entries()) {
      const programPath = path.join(directory, `${index}.program.json`);
      const startPath = path.join(directory, `${index}.start.json`);
      await writeFile(programPath, JSON.stringify(program));
      await writeFile(startPath, JSON.stringify(start));
      files.push(programPath, startPath);
    }
    const execution = await runLeanInterpreter("BpmnSemantics/ParallelScopeReservationMain.lean", ["--integrity", ...files], inputs.length * 7);
    assert.deepEqual(execution.stdout.trim().split("\n").map(line => JSON.parse(line)), inputs.map(input => input.results));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("source-derived parallel invoice Start closure reaches every concrete stable frontier", async t => {
  const { admitProcessStart } = await import(new URL("../../semantic-core/dist/semantic-process-triggered-start.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-process-triggered-start.ts");
  const { deriveInternalExecutionFrontier } = await import(new URL("../../semantic-core/dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-transition-preparation.ts");
  const { evaluateScheduledClosure } = await import(new URL("../../semantic-core/dist/internal-choice-schedule.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-choice-schedule.ts");
  const { isWellFormedSemanticProcessProgram } = await import(new URL("../../semantic-core/dist/semantic-process-admission.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-process-admission.ts");
  const inputs = await wholeModelStartClosureInputs();
  assert.equal(inputs.length, 24);
  for (const { shape, source, program, start, count, reverse } of inputs) {
    await t.test(`${shape} ${count} ${reverse ? "reverse" : "forward"}`, () => {
      assert.equal(parallelScopeCheckedSourceAdmitted(source), true, "setup requires an already admitted invoice source shape");
      assert.equal(isWellFormedSemanticProcessProgram(program), true, "setup requires canonical whole-Process IL");
      const limit = parallelScopeStartClosureBound(source, start.initialVariables);
      assert.ok(limit !== undefined, "setup requires the source-derived Start closure bound");
      const admitted = admitProcessStart(program, initialState, start);
      assert.ok(admitted, "private Start admission must retain the complete source-bound inputs");
      let lastFrontier: unknown;
      const frontierAt = (state: RuntimeState) => {
        const frontier = deriveInternalExecutionFrontier(program, state, () => assert.fail("legacy dispatch"));
        lastFrontier = { offers: frontier.offers.length, kinds: [...new Set(frontier.offers.map(offer => offer.step.operation.kind))],
          preparationFailed: frontier.preparationFailed, reserved: frontier.occurrenceBatch !== undefined };
        return frontier;
      };
      const closed = evaluateScheduledClosure(program, initialState, { outcome: CommandOutcome.Committed, state: admitted }, [], limit, frontierAt);
      assert.equal(closed.result.outcome, CommandOutcome.Committed, `Start closure must reach the source frontier: ${JSON.stringify({
        limit, hitBound: closed.result.internalStepBoundExceeded, ambiguous: closed.result.ambiguousInternalChoice, lastFrontier })}`);
      const state = closed.result.state;
      const rootDefinition = source.definitionScopes.find(scope => scope.parentScopeId === null)!;
      const childDefinition = source.definitionScopes.find(scope => scope.originElementId === "ReviewInvoice")!;
      const root = { processInstanceId: start.instanceId, definitionScopeId: rootDefinition.id, activation: 1 };
      const bodies = Array.from({ length: count }, (_, index) => ({ processInstanceId: start.instanceId,
        definitionScopeId: childDefinition.id, activation: index + 1 }));
      const humanElements = count === 0 ? ["PublishBatch"] : shape === "serial" ? ["Review"]
        : shape === "fork-join" ? ["Branch0", "Branch1", "Branch2"] : ["Branch0", "Branch1"];
      const waitOwners = count === 0 ? [root] : bodies;
      assert.deepEqual(state.userTaskWaits.map(wait => [wait.id.elementId, wait.owner, wait.id.activation]),
        humanElements.flatMap(elementId => waitOwners.map(owner => [elementId, owner, owner.activation])),
        "every body must expose exactly the first human waits dictated by its concrete graph");
      const effectOwners = shape === "separate-ends" ? bodies : [];
      assert.deepEqual(state.effectWaits.map(wait => ({ elementId: wait.id.elementId, owner: wait.owner,
        activation: wait.id.activation, arguments: wait.arguments })), effectOwners.map(owner => ({ elementId: "Validate", owner,
        activation: owner.activation, arguments: [
          { name: "payload", value: { kind: VariableValueKind.String, value: `invoice-${owner.activation}` } },
          { name: "status", value: { kind: VariableValueKind.String, value: "pending" } },
        ] })), "separate Ends retain both human branches and the independent Validate effect for each body");
      assert.deepEqual(state.controlTokens, []);
      assert.equal(state.initiationPending, false);
      assert.deepEqual(state.scopeOccurrences.filter(scope => scope.parent === null), [{ id: root, parent: null }]);
      assert.deepEqual(state.scopeOccurrences.filter(scope => scope.parent !== null), bodies.map(id => ({ id, parent: root })));
      assert.deepEqual(state.variables.process.bindings, start.initialVariables, "Start closure preserves the complete Process input snapshot");
      assert.deepEqual(state.variables.scopes, bodies.map(owner => ({ owner, bindings: [
        { name: "decision", value: { kind: VariableValueKind.String, value: "unset" } },
        { name: "reviewStatus", value: { kind: VariableValueKind.String, value: "pending" } },
      ] })), "every body receives both declared local input snapshots");
      assert.deepEqual(state.variables.activities, state.effectWaits.map(wait => ({
        owner: { kind: LocalDataOwnerKind.EffectOccurrence, id: wait.id }, bindings: wait.arguments,
      })), "only armed effects own Activity-local frames");
      assert.deepEqual(state.taskActivations, humanElements.map(elementId => ({ elementId, count: Math.max(1, count) })));
      assert.deepEqual(state.effectActivations, effectOwners.length === 0 ? [] : [{ elementId: "Validate", count }]);
      assert.deepEqual(state.parallelScopeControllers ?? [], count === 0 ? [] : [{
        id: { processInstanceId: start.instanceId, activityElementId: "ReviewInvoice", activation: 1 }, total: count, completed: 0,
      }]);
      const activities = state.activityOccurrences.filter(activity => activity.id.activityElementId === "ReviewInvoice");
      assert.equal(activities.length, count === 0 ? 0 : 1);
      if (count > 0) {
        const activity = activities[0]!;
        assert.deepEqual(activity.owner, root);
        assert.deepEqual(activity.body, { kind: ActivityBodyKind.ParallelChildScopes,
          iterations: bodies.map((scope, loopCounter) => ({ scope, loopCounter, item: `invoice-${loopCounter + 1}` })) });
      }
      const stable = frontierAt(state);
      assert.equal(stable.preparationFailed, false);
      assert.deepEqual(stable.offers, []);
    });
  }
});

for (const afterEntry of [false, true]) test(afterEntry
  ? "Lean and TypeScript agree on source-derived invoice frontiers and complete publications after exact-owner entry"
  : "Lean and TypeScript agree on source-derived invoice Start frontiers and reserved publications", async () => {
  const { admitProcessStart } = await import(new URL("../../semantic-core/dist/semantic-process-triggered-start.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-process-triggered-start.ts");
  const { applyInternalOperationOccurrence } = await import(new URL("../../semantic-core/dist/internal-operation-occurrence.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-operation-occurrence.ts");
  const { deriveInternalExecutionFrontier } = await import(new URL("../../semantic-core/dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-transition-preparation.ts");
  const { evaluateScheduledClosure } = await import(new URL("../../semantic-core/dist/internal-choice-schedule.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-choice-schedule.ts");
  const { projectInternalExecutionBatch } = await import(new URL("../../semantic-core/dist/semantic-transition-trace.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-transition-trace.ts");
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-start-frontier-"));
  try {
    const files: string[] = [];
    const results: unknown[] = [];
    const inputs = (await wholeModelStartClosureInputs()).filter(input => !afterEntry || input.count >= 2);
    assert.equal(inputs.length, afterEntry ? 12 : 24);
    for (const { source, program, start } of inputs) {
      const bound = parallelScopeStartClosureBound(source, start.initialVariables);
      const admitted = admitProcessStart(program, initialState, start);
      assert.ok(bound !== undefined && admitted);
      let predecessor = admitted;
      if (afterEntry) {
        const root = admitted.scopeOccurrences[0]!.id;
        for (const kind of [SemanticOperationKind.Initiate, SemanticOperationKind.EnterParallelMultiInstanceScope]) {
          const operation = program.operations.find(candidate => candidate.kind === kind)!;
          const successor = applyInternalOperationOccurrence(program, predecessor, { operationId: operation.id, owner: root });
          assert.ok(successor, "the after-entry probe uses actual exact-owner initiation and population entry");
          predecessor = successor;
        }
      }
      const limit = bound - (afterEntry ? 2 : 0);
      const closed = evaluateScheduledClosure(program, afterEntry ? predecessor : initialState,
        { outcome: CommandOutcome.Committed, state: predecessor }, [], limit,
        state => deriveInternalExecutionFrontier(program, state, () => assert.fail("legacy dispatch")));
      assert.equal(closed.result.outcome, CommandOutcome.Committed);
      const state = closed.result.state;
      let previous = predecessor;
      let index = 0;
      const publications = [];
      for (const [position, batch] of closed.selectedInternalBatches.entries()) {
        const publication = projectInternalExecutionBatch(program, previous, batch,
          closed.selectedInternalPreparations[position] ?? null, start.commandId, index);
        assert.ok(publication, "every selected singleton or reserved batch must publish all members");
        assert.equal(publication.records.length, batch.length);
        assert.equal(publication.lifecycles.length, batch.length);
        publications.push(publication);
        previous = batch.at(-1)!.successor;
        index += batch.length;
      }
      const published = { records: publications.flatMap(value => value.records),
        lifecycles: publications.flatMap(value => value.lifecycles) };
      assert.equal(published.records.length, closed.selectedInternalSteps.length, "the complete closure publishes every selected transition");
      assert.equal(published.lifecycles.length, closed.selectedInternalSteps.length, "the complete closure publishes every selected lifecycle");
      assert.deepEqual(previous, state);
      results.push({ failed: false, prefix: prefix(predecessor, state), process: state.variables.process.bindings,
        scopeFrames: state.variables.scopes.map(frame => [owner(frame.owner), frame.bindings]),
        scopes: state.scopeOccurrences.map(scope => [owner(scope.id), scope.parent === null ? null : owner(scope.parent)]),
        publications: published });
      const programPath = path.join(directory, `${results.length}.program.json`);
      const startPath = path.join(directory, `${results.length}.start.json`);
      await writeFile(programPath, JSON.stringify(program));
      await writeFile(startPath, JSON.stringify(start));
      files.push(programPath, startPath, String(limit));
    }
    const execution = await runLeanInterpreter("BpmnSemantics/ParallelScopeReservationMain.lean",
      [afterEntry ? "--entered-frontier" : "--start-frontier", ...files], results.length);
    assert.deepEqual(execution.stdout.trim().split("\n").map(line => JSON.parse(line)), results);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Lean and TypeScript agree on mixed fork/join/End closure and fuel refusal", async () => {
  const { admitProcessStart } = await import(new URL("../../semantic-core/dist/semantic-process-triggered-start.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-process-triggered-start.ts");
  const { deriveInternalExecutionFrontier } = await import(new URL("../../semantic-core/dist/internal-transition-preparation.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-transition-preparation.ts");
  const { evaluateScheduledClosure } = await import(new URL("../../semantic-core/dist/internal-choice-schedule.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-choice-schedule.ts");
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-control-closure-"));
  try {
    const files: string[] = [];
    const results: unknown[] = [];
    for (const count of [2, 16]) for (const reverse of [false, true]) for (const short of [false, true]) {
      const { program, start } = controlClosureInputs(count, reverse);
      const admitted = admitProcessStart(program, initialState, start);
      assert.ok(admitted);
      const fuel = 2 + 4 * count - (short ? 1 : 0);
      const frontierAt = (state: RuntimeState) => deriveInternalExecutionFrontier(program, state, () => assert.fail("legacy dispatch"));
      const closed = evaluateScheduledClosure(program, admitted, { outcome: CommandOutcome.Committed, state: admitted }, [], fuel, frontierAt);
      assert.equal(closed.result.outcome, short ? CommandOutcome.RolledBack : CommandOutcome.Committed);
      assert.equal(closed.result.internalStepBoundExceeded, short);
      const state = closed.result.state;
      assert.deepEqual(state.variables.process.bindings, start.initialVariables, "control closure preserves all captured Process values");
      if (short) {
        assert.deepEqual(state, admitted, "one-short fuel rolls back every control/wait prefix to the exact admitted Start state");
        assert.deepEqual(closed.selectedInternalSteps, []);
        assert.deepEqual(closed.selectedInternalBatches, []);
        assert.deepEqual(closed.selectedInternalPreparations, []);
        assert.equal(closed.admittedState, null);
      } else {
        assert.equal(closed.selectedInternalSteps.length, fuel, "fuel counts initiation, population entry and all four steps per body");
        assert.equal(state.endOccurrences, count, "each independently owned End contributes exactly one relative increment");
        assert.deepEqual(state.controlTokens, []);
        const root = admitted.scopeOccurrences[0]!.id;
        const bodies = Array.from({ length: count }, (_, index) => ({ processInstanceId: start.instanceId,
          definitionScopeId: "body", activation: index + 1 }));
        assert.deepEqual(state.userTaskWaits.map(wait => [wait.id.elementId, wait.owner, wait.id.activation, wait.output]),
          bodies.map(body => ["Hold", body, body.activation, "later"]), "the waiting branch preserves every body's exact live occurrence");
        assert.deepEqual(state.effectWaits, []);
        assert.deepEqual(state.taskActivations, [{ elementId: "Hold", count }]);
        assert.deepEqual(state.effectActivations, []);
        assert.deepEqual(state.scopeOccurrences.filter(scope => scope.parent === null), [{ id: root, parent: null }]);
        assert.deepEqual(state.scopeOccurrences.filter(scope => scope.parent !== null), bodies.map(id => ({ id, parent: root })));
        assert.deepEqual(state.variables.scopes, bodies.map(owner => ({ owner,
          bindings: [{ name: "status", value: { kind: VariableValueKind.Null } }] })), "fork, join, wait and End preserve every body input snapshot");
        assert.deepEqual(state.variables.activities, []);
        assert.deepEqual(state.parallelScopeControllers, [{
          id: { processInstanceId: start.instanceId, activityElementId: "Checks", activation: 1 }, total: count, completed: 0,
        }], "a live waiting branch prevents the paired completion from retiring any body");
        const stable = frontierAt(state);
        assert.equal(stable.preparationFailed, false);
        assert.deepEqual(stable.offers, []);
      }
      results.push({ failed: short, prefix: prefix(admitted, state), process: state.variables.process.bindings,
        scopeFrames: state.variables.scopes.map(frame => [owner(frame.owner), frame.bindings]),
        scopes: state.scopeOccurrences.map(scope => [owner(scope.id), scope.parent === null ? null : owner(scope.parent)]),
        publications: null });
      const programPath = path.join(directory, `${results.length}.program.json`);
      const startPath = path.join(directory, `${results.length}.start.json`);
      await writeFile(programPath, JSON.stringify(program));
      await writeFile(startPath, JSON.stringify(start));
      files.push(programPath, startPath, String(fuel));
    }
    const execution = await runLeanInterpreter("BpmnSemantics/ParallelScopeReservationMain.lean", ["--start-frontier", ...files], results.length);
    assert.deepEqual(execution.stdout.trim().split("\n").map(line => JSON.parse(line)), results);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Lean and TypeScript agree on source-derived natural retirement and private early-condition publications", async () => {
  const { admitProcessStart } = await import(new URL("../../semantic-core/dist/semantic-process-triggered-start.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-process-triggered-start.ts");
  const { applyInternalOperationOccurrence } = await import(new URL("../../semantic-core/dist/internal-operation-occurrence.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/internal-operation-occurrence.ts");
  const { completeOrdinaryUserTask } = await import(new URL("../../semantic-core/dist/semantic-process-user-task-runtime.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-process-user-task-runtime.ts");
  const { completeParallelScopeEffect } = await import(new URL("../../semantic-core/dist/parallel-scope-data.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/parallel-scope-data.ts");
  const { projectInternalExecutionBatch, replayInternalTransitionRecord } = await import(new URL("../../semantic-core/dist/semantic-transition-trace.js", import.meta.url).href
  ) as typeof import("../../semantic-core/src/semantic-transition-trace.ts");
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-retirement-publication-"));
  try {
    const files: string[] = [];
    const results: unknown[] = [];
    const inputs = (await wholeModelStartClosureInputs()).filter(input => input.count === 2 &&
      (input.shape === "serial" || input.shape === "separate-ends"));
    assert.equal(inputs.length, 4);
    for (const input of inputs) {
      const early = input.shape === "separate-ends";
      const program: SemanticProcessProgram = early ? { ...input.program, operations: input.program.operations.map(operation =>
        operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope ? { ...operation, completionBooleanName: "approved" } : operation) } : input.program;
      const start: StartProcessStimulus = early ? { ...input.start, initialVariables: [
        { name: "approved", value: { kind: VariableValueKind.Boolean, value: false } }, ...input.start.initialVariables,
      ] } : input.start;
      const admitted = admitProcessStart(program, initialState, start);
      assert.ok(admitted);
      let state: RuntimeState = admitted;
      const root = state.scopeOccurrences[0]!.id;
      const entry = program.operations.find(operation => operation.kind === SemanticOperationKind.EnterParallelMultiInstanceScope)!;
      assert.ok(entry.kind === SemanticOperationKind.EnterParallelMultiInstanceScope);
      const body = (activation: number): ScopeOccurrenceId => ({ processInstanceId: start.instanceId, definitionScopeId: entry.childScopeId, activation });
      const step = (kind: SemanticOperationKind, elementId: string, target: ScopeOccurrenceId) => {
        const operation = program.operations.find(candidate => candidate.kind === kind && candidate.origin.elementId === elementId);
        assert.ok(operation);
        const successor = applyInternalOperationOccurrence(program, state, { operationId: operation.id, owner: target });
        assert.ok(successor, `exact ${kind} ${elementId} in body ${target.activation}`);
        state = successor;
        return operation;
      };
      const human = (elementId: string, activation: number, approved = false) => {
        const wait = state.userTaskWaits.find(candidate => candidate.id.elementId === elementId && isDeepStrictEqual(candidate.owner, body(activation)));
        assert.ok(wait);
        const successor = completeOrdinaryUserTask(program, state, { kind: StimulusKind.CompleteUserTaskInstance,
          commandId: `finish-${elementId}-${activation}`, taskId: wait.id,
          submittedValues: approved ? [{ name: "approved", value: { kind: VariableValueKind.Boolean, value: true } }] : [] });
        assert.ok(successor);
        state = successor;
      };
      const effect = (activation: number) => {
        const wait = state.effectWaits.find(candidate => candidate.id.elementId === "Validate" && isDeepStrictEqual(candidate.owner, body(activation)));
        assert.ok(wait);
        const successor = completeParallelScopeEffect(program, state, wait.id, { kind: EffectExecutionResultKind.Success,
          localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "ok" } }] });
        assert.ok(successor);
        state = successor;
      };
      step(SemanticOperationKind.Initiate, "Start", root);
      step(SemanticOperationKind.EnterParallelMultiInstanceScope, "ReviewInvoice", root);
      for (const activation of [1, 2]) {
        if (early) {
          step(SemanticOperationKind.Duplicate, "Review", body(activation));
          for (const elementId of ["Branch0", "Branch1"]) step(SemanticOperationKind.AwaitUserTask, elementId, body(activation));
          step(SemanticOperationKind.AwaitEffect, "Validate", body(activation));
        } else step(SemanticOperationKind.AwaitUserTask, "Review", body(activation));
      }
      const checkpoints = [];
      for (const activation of early ? [1] : [1, 2]) {
        if (early) {
          human("Branch0", activation, true);
          step(SemanticOperationKind.ReachNoneEnd, "End0", body(activation));
          human("Branch1", activation);
          step(SemanticOperationKind.ReachNoneEnd, "End1", body(activation));
        } else {
          human("Review", activation);
          step(SemanticOperationKind.AwaitEffect, "Validate", body(activation));
        }
        effect(activation);
        step(SemanticOperationKind.AwaitUserTask, "Confirm", body(activation));
        human("Confirm", activation);
        step(SemanticOperationKind.ReachNoneEnd, "ItemEnd", body(activation));
        const before = state;
        const operation = step(SemanticOperationKind.CompleteParallelMultiInstanceScope, "ReviewInvoice", body(activation));
        const after = state;
        const published = projectInternalExecutionBatch(program, before, [{ operation, owner: body(activation), successor: after }], null,
          start.commandId, checkpoints.length);
        assert.ok(published, "actual exact-owner singleton retirement must publish complete E1 and E2 records");
        assert.equal(published.records.length, 1);
        assert.equal(published.lifecycles.length, 1);
        assert.deepEqual(replayInternalTransitionRecord(program, before, published.records[0]!), after);
        assert.equal(replayInternalTransitionRecord(program, after, published.records[0]!), null);
        const expectedEnds: UnnumberedFlowNodeOccurrenceDelta["ended"] = [
          { anchor: { kind: Anchor.Scope, id: body(activation) }, terminal: Terminal.Completed },
          ...(early ? [{ anchor: { kind: Anchor.Scope, id: body(2) }, terminal: Terminal.Cancelled } as const] : []),
          ...(early ? [...before.userTaskWaits, ...before.effectWaits].map(wait => ({
            anchor: { kind: Anchor.Wait, id: wait.id }, terminal: Terminal.Cancelled } as const)) : []),
        ];
        assert.deepEqual(published.lifecycles[0]!.started, []);
        const ordered = (ends: UnnumberedFlowNodeOccurrenceDelta["ended"]) => ends.map(end => JSON.stringify(end)).sort();
        assert.deepEqual(ordered(published.lifecycles[0]!.ended), ordered(expectedEnds));
        assert.deepEqual(published.records[0]!.positionDelta.exitedScopes.map(scope => scope.id.activation).sort((a, b) => a - b),
          early ? [1, 2] : [activation]);
        assert.deepEqual(after.variables.process, before.variables.process);
        assert.deepEqual([after.taskActivations, after.effectActivations, after.scopeActivations, after.activityActivations, after.endOccurrences],
          [before.taskActivations, before.effectActivations, before.scopeActivations, before.activityActivations, before.endOccurrences]);
        const final = early || activation === 2;
        assert.deepEqual(after.variables.scopes, final ? [] : before.variables.scopes.filter(frame => !isDeepStrictEqual(frame.owner, body(activation))));
        assert.deepEqual(after.scopeOccurrences, final ? before.scopeOccurrences.filter(scope => scope.parent === null)
          : before.scopeOccurrences.filter(scope => !isDeepStrictEqual(scope.id, body(activation))));
        assert.deepEqual(after.controlTokens, final ? [{ placeId: entry.normalOutput, owner: root, multiplicity: 1 }] : []);
        assert.deepEqual(after.parallelScopeControllers?.map(controller => [controller.total, controller.completed]), final ? [] : [[2, 1]]);
        if (early) {
          assert.equal(before.userTaskWaits.length, 2);
          assert.equal(before.effectWaits.length, 1);
          assert.deepEqual(after.userTaskWaits, []);
          assert.deepEqual(after.effectWaits, []);
          assert.deepEqual(after.variables.activities, []);
          for (const wait of before.userTaskWaits) assert.equal(completeOrdinaryUserTask(program, after,
            { kind: StimulusKind.CompleteUserTaskInstance, commandId: "stale", taskId: wait.id, submittedValues: [] }), null);
          for (const wait of before.effectWaits) assert.equal(completeParallelScopeEffect(program, after, wait.id,
            { kind: EffectExecutionResultKind.Success, localPatch: [{ name: "result", value: { kind: VariableValueKind.String, value: "late" } }] }), null);
        } else assert.deepEqual(after.userTaskWaits, before.userTaskWaits);
        checkpoints.push({ failed: false, prefix: prefix(before, after), process: after.variables.process.bindings,
          scopeFrames: after.variables.scopes.map(frame => [owner(frame.owner), frame.bindings]),
          scopes: after.scopeOccurrences.map(scope => [owner(scope.id), scope.parent === null ? null : owner(scope.parent)]),
          publications: { records: published.records, lifecycles: published.lifecycles } });
      }
      results.push(checkpoints);
      const programPath = path.join(directory, `${results.length}.program.json`);
      const startPath = path.join(directory, `${results.length}.start.json`);
      await writeFile(programPath, JSON.stringify(program));
      await writeFile(startPath, JSON.stringify(start));
      files.push(programPath, startPath);
    }
    const execution = await runLeanInterpreter("BpmnSemantics/ParallelScopeReservationMain.lean", ["--retirement-frontier", ...files], 6);
    assert.deepEqual(execution.stdout.trim().split("\n").map(line => JSON.parse(line)), results);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Lean independently admits or refuses the same private parallel checked-source inputs", async () => {
  const cases = await parallelAdmissionCases();
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-source-admission-"));
  try {
    const files: string[] = [];
    for (const [index, { source, expected }] of cases.entries()) {
      assert.equal(parallelScopeCheckedSourceAdmitted(source), expected, `admission case ${index}`);
      const file = path.join(directory, `${index}.json`);
      await writeFile(file, JSON.stringify(source));
      files.push(file);
    }
    const execution = await runLeanInterpreter("BpmnSemantics/ParallelScopeAdmissionMain.lean", files, cases.length);
    assert.deepEqual(execution.stdout.trim().split("\n").map(line => JSON.parse(line)), cases.map(({ expected }) => expected));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Lean and TypeScript derive the same model-bound closure fuel from validated Start inputs", async () => {
  const cases = await parallelStartBoundCases();
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-start-bound-"));
  try {
    const files: string[] = [];
    for (const [index, { source, bindings, expected }] of cases.entries()) {
      assert.equal(parallelScopeStartClosureBound(source, bindings) ?? null, expected, `Start bound case ${index}`);
      const sourcePath = path.join(directory, `${index}.source.json`);
      const stimulusPath = path.join(directory, `${index}.start.json`);
      await writeFile(sourcePath, JSON.stringify(source));
      await writeFile(stimulusPath, JSON.stringify({ kind: "startProcess", commandId: "start", processId: source.processId,
        instanceId: "batch", initialVariables: bindings }));
      files.push(sourcePath, stimulusPath);
    }
    const execution = await runLeanInterpreter("BpmnSemantics/ParallelScopeStartAdmissionMain.lean", files, cases.length);
    assert.deepEqual(execution.stdout.trim().split("\n").map(line => JSON.parse(line)), cases.map(({ expected }) => expected));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Lean and TypeScript derive the same concurrent wait/effect capacity from validated Start inputs", async () => {
  const cases = await parallelStartFrontierCases();
  const directory = await mkdtemp(path.join(tmpdir(), "parallel-start-frontier-"));
  try {
    const files: string[] = [];
    for (const [index, { source, bindings, expected }] of cases.entries()) {
      assert.deepEqual(parallelScopeStartFrontierCapacity(source, bindings) ?? null, expected, `Start frontier case ${index}`);
      const sourcePath = path.join(directory, `${index}.source.json`);
      const stimulusPath = path.join(directory, `${index}.start.json`);
      await writeFile(sourcePath, JSON.stringify(source));
      await writeFile(stimulusPath, JSON.stringify({ kind: "startProcess", commandId: "start", processId: source.processId,
        instanceId: "batch", initialVariables: bindings }));
      files.push(sourcePath, stimulusPath);
    }
    const execution = await runLeanInterpreter("BpmnSemantics/ParallelScopeStartAdmissionMain.lean", ["--frontier", ...files], cases.length);
    assert.deepEqual(execution.stdout.trim().split("\n").map(line => JSON.parse(line)), cases.map(({ expected }) => expected));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Lean and TypeScript agree on real parallel Start, scoped commands and complete natural retirement", verifyParallelCommandParity);

test("Lean and TypeScript agree on private raw Program capacity ordinary matrix and syntax refusal", () => verifyParallelProgramCapacityParity());
test("Lean and TypeScript agree on private raw Program capacity accepted 1024-operation parent boundary", () => verifyParallelProgramCapacityParity("maximum-parent"));
test("Lean and TypeScript agree on private raw Program capacity accepted 1024-operation body boundary", () => verifyParallelProgramCapacityParity("maximum-body"));
test("Lean and TypeScript agree on real parallel early completion and stale cancelled work", verifyParallelEarlyCompletionParity);
test("Lean and TypeScript agree on private root Service null-output commands", verifyParallelRootEffectParity);
test("Lean and TypeScript agree on interleaved parallel inner-body joined and separate-End commands", verifyParallelInnerBodyCommandParity);
test("Lean and TypeScript agree on ordered Process writes, early cancellation retention and data refusals", verifyParallelDataCommandParity);

test("Lean and TypeScript agree on parent approval and validation before parallel entry", verifyParallelParentPreludeParity);

test("Lean and TypeScript agree on source-admitted parallel Service multi-output completion and refusals", verifyParallelOutputMappingParity);
