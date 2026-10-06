import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { initialState, SemanticOperationKind, LocalDataOwnerKind, CommandOutcome } from "@bpmn-lean/semantic-core";
import type { RuntimeState, ScopeOccurrenceId, SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";
import { reservationInputs, wholeModelReservationInputs } from "./parallel-scope-reservation-fixture.ts";
import { parallelAdmissionCases } from "../../bpmn-source/test/parallel-scope-admission-fixture.ts";
import { parallelStartBoundCases, parallelStartFrontierCases } from "../../bpmn-source/test/parallel-scope-start-bound-fixture.ts";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";
const { parallelScopeCheckedSourceAdmitted } = await import(new URL("../../bpmn-source/dist/multi-instance-scope-source-compiler.js", import.meta.url).href) as typeof import("../../bpmn-source/src/multi-instance-scope-source-compiler.ts");
const { parallelScopeStartClosureBound, parallelScopeStartFrontierCapacity } = await import(new URL("../../bpmn-source/dist/parallel-scope-start-bound.js", import.meta.url).href) as typeof import("../../bpmn-source/src/parallel-scope-start-bound.ts");

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
  const owner = (id: ScopeOccurrenceId) => [id.processInstanceId, id.definitionScopeId, id.activation];
  const prefix = (before: RuntimeState, state: RuntimeState) => ({
    tokens: state.controlTokens.flatMap(token => Array.from({ length: token.multiplicity }, () => [token.placeId, owner(token.owner)])),
    tasks: state.userTaskWaits.map(wait => [owner(wait.owner), wait.id.elementId, wait.id.activation, wait.output]),
    effects: state.effectWaits.map(wait => [owner(wait.owner), wait.id.elementId, wait.id.activation, wait.output, wait.arguments]),
    taskCounters: state.taskActivations.map(row => [row.elementId, row.count]),
    effectCounters: state.effectActivations.map(row => [row.elementId, row.count]),
    effectFrames: state.variables.activities.flatMap(frame => frame.owner.kind === LocalDataOwnerKind.EffectOccurrence
      ? [[frame.owner.id.processInstanceId, frame.owner.id.elementId, frame.owner.id.activation, frame.bindings]] : []),
    otherStateUnchanged: isDeepStrictEqual({ ...state, controlTokens: before.controlTokens,
      userTaskWaits: before.userTaskWaits, effectWaits: before.effectWaits, taskActivations: before.taskActivations,
      effectActivations: before.effectActivations, variables: { ...state.variables, activities: before.variables.activities } }, before),
  });
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
