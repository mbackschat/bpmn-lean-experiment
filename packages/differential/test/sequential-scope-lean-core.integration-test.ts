import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ControlStateKind, EffectExecutionResultKind, ObservationRequestKind, ScenarioDocumentKind,
  StimulusKind, VariableValueKind, applyStimulusWithTrace, initialState, isWellFormedRuntimeState,
  projectOpenFlowNodeOccurrences, replayCommittedTransitions, runScenario,
  requireCompleteFlowNodeOccurrenceLifecycles, observeStableState,
  SemanticOperationKind, SemanticTransitionKind,
} from "@bpmn-lean/semantic-core";
import type { Scenario, ScenarioResult, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { profile, source, prepareSource, sourceOverlay, parallelBodySource } from "../../bpmn-source/test/sequential-scope-source-fixture.ts";
import { parseStrictJson } from "../../../scripts/strict-json.ts";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";

const instanceId = "invoices";
const binding = (name: string, value: string | null): VariableBinding => ({ name,
  value: value === null ? { kind: VariableValueKind.Null } : { kind: VariableValueKind.String, value } });
const human = (elementId: string, activation: number, values: readonly VariableBinding[] = [], prefix = "complete"): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId: `${prefix}-${elementId}-${activation}`,
  taskId: { processInstanceId: instanceId, elementId, activation }, submittedValues: values,
});
const validate = (activation: number): Stimulus => ({ kind: StimulusKind.CompleteEffect, commandId: `validate-${activation}`,
  effectId: { processInstanceId: instanceId, elementId: "Validate", activation },
  result: { kind: EffectExecutionResultKind.Success, localPatch: [binding("result", activation === 1 ? null : "accepted")] } });
const observations = [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults, ObservationRequestKind.ProcessStatus,
  ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks, ObservationRequestKind.OpenTimers,
  ObservationRequestKind.OpenEffects, ObservationRequestKind.OpenMultiInstances, ObservationRequestKind.Variables,
  ObservationRequestKind.EnabledInteractions, ObservationRequestKind.LogicalTime];

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, other) => index !== other))
    .map(rest => [value, ...rest]));
}

const completionOrders = new Map<string, readonly string[]>([
  ...permutations(["Branch0", "Branch1", "Branch2"]).map(order =>
    [`order-paired-${order.join("-")}`, order] as const),
  ...permutations(["Branch0", "Branch1", "Validate", "Confirm"])
    .filter(order => order.indexOf("Validate") < order.indexOf("Confirm"))
    .map(order => [`order-separate-${order.join("-")}`, order] as const),
]);

async function cases() {
  const base = prepareSource(await readFile(source, "utf8"));
  return Promise.all(["two-items", "empty", "early-false", "early-true", "paired-body", "separate-ends", "early-separate-ends",
    ...completionOrders.keys()].map(async id => {
    const early = id.startsWith("early-");
    const separateEnds = id.endsWith("separate-ends") || id.startsWith("order-separate-");
    const parallel = id === "paired-body" || separateEnds || id.startsWith("order-paired-");
    const body = parallel ? parallelBodySource(base, 3, separateEnds) : base;
    const bytes = early ? body.replace('camunda:elementVariable="item" />',
      'camunda:elementVariable="item"><completionCondition>${stop}</completionCondition></multiInstanceLoopCharacteristics>')
      : body;
    const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(bytes), sourceId: "invoice-batch",
      expectedSha256: undefined, semanticProfile: profile, sourceOverlay: sourceOverlay(),
      limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 } });
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted, id);
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error(`source rejected: ${id}`);
    const initialVariables: VariableBinding[] = [{ name: "items", value: { kind: VariableValueKind.StringList,
      value: id === "empty" ? [] : ["A", "B"] } }];
    if (early) initialVariables.push({ name: "stop", value: { kind: VariableValueKind.Boolean, value: id === "early-true" } });
    const stimuli: Stimulus[] = [{ kind: StimulusKind.StartProcess, commandId: "start", processId: compiled.semanticProcess.processId,
      instanceId, initialVariables }];
    for (const activation of id === "empty" ? [] : early ? [1] : [1, 2]) {
      const values: VariableBinding[] = [binding("reviewStatus", "reviewed")];
      if (early) values.push({ name: "stop", value: { kind: VariableValueKind.Boolean, value: true } });
      const reviews = parallel ? (separateEnds ? ["Branch0", "Branch1"] : ["Branch0", "Branch1", "Branch2"]) : ["Review"];
      const reviewCommands = reviews.map(element => human(element, activation, values));
      const order = completionOrders.get(id);
      if (order !== undefined) {
        for (const element of order) {
          switch (element) {
            case "Validate": stimuli.push(validate(activation)); break;
            case "Confirm": stimuli.push(human(element, activation)); break;
            default: stimuli.push(human(element, activation, [binding("reviewStatus", `${element}-${activation}`)]));
          }
        }
        if (!separateEnds) stimuli.push(validate(activation), human("Confirm", activation));
      } else if (early && separateEnds) {
        stimuli.push(reviewCommands[0]!, validate(activation), human("Confirm", activation), reviewCommands[1]!);
      } else stimuli.push(...reviewCommands, validate(activation), human("Confirm", activation));
      stimuli.push(human(reviews[0]!, activation, [], "refuse-stale"));
    }
    stimuli.push(human("PublishBatch", 1, [binding("item", "replacement")], "refuse-protected"), human("PublishBatch", 1));
    const scenario: Scenario = { kind: ScenarioDocumentKind.Scenario, id, profile,
      bpmn: { id: compiled.semanticProcess.identity.sourceId, sha256: compiled.semanticProcess.identity.sourceSha256,
        sourceOverlay: compiled.semanticProcess.identity.sourceOverlay, relativePath: `${id}.bpmn` }, stimuli, observations,
      provenance: { normativeRefs: ["SMIS-ADMIT-01", "SMIS-DATA-01", "SMIS-END-01", "SMIS-EARLY-01"], cibRevision: "not-applicable", cibRefs: [] } };
    return { scenario, program: compiled.semanticProcess, checkedProcess: compiled.checkedProcess, bytes };
  }));
}

function publications({ scenario, program }: Awaited<ReturnType<typeof cases>>[number]) {
  let state = initialState;
  const records = scenario.stimuli.map(stimulus => {
    const before = state;
    const order = completionOrders.get(scenario.id);
    if (order !== undefined && stimulus.kind === StimulusKind.CompleteEffect) {
      const observed = observeStableState(program, before);
      assert.ok(observed !== null);
      const effect = observed.openEffects[0];
      assert.ok(effect !== undefined);
      assert.deepEqual(effect.arguments, [binding("payload", stimulus.effectId.activation === 1 ? "A" : "B"),
        binding("status", scenario.id.startsWith("order-separate-") ? "pending" : `${order.at(-1)}-${stimulus.effectId.activation}`)]);
    }
    const traced = applyStimulusWithTrace(program, before, stimulus);
    state = traced.result.state;
    const rejected = stimulus.commandId.startsWith("refuse-");
    assert.equal(traced.result.outcome, rejected ? CommandOutcome.Rejected : CommandOutcome.Committed, `${scenario.id}: ${stimulus.commandId}`);
    assert.equal(traced.result.internalStepBoundExceeded || traced.result.ambiguousInternalChoice, false);
    assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
    if (scenario.id === "early-separate-ends" && stimulus.commandId === "complete-Confirm-1") {
      assert.deepEqual(state.variables.process.bindings.find(({ name }) => name === "stop")?.value,
        { kind: VariableValueKind.Boolean, value: true });
      assert.equal(state.sequentialScopeControllers?.[0]?.completed, 0);
      assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), ["Branch1"]);
      assert.equal(state.userTaskWaits[0]?.owner.activation, 1);
    }
    assert.equal(traced.committedTransitions.length > 0, !rejected, `${scenario.id}: ${stimulus.commandId}: complete trace`);
    const replayed = replayCommittedTransitions(program, before, traced.committedTransitions);
    assert.deepEqual(replayed, rejected ? null : state);
    if (rejected) assert.deepEqual(state, before);
    if (!rejected) {
      const open = projectOpenFlowNodeOccurrences(program, before);
      assert.notEqual(open, null);
      requireCompleteFlowNodeOccurrenceLifecycles(program,
        open!.map(occurrence => ({ ...occurrence, attachedHandlers: [] })), stimulus.commandId,
        traced.committedTransitions, traced.flowNodeOccurrenceLifecycles);
      for (const [index, record] of traced.committedTransitions.entries()) {
        if (record.transition.kind !== SemanticTransitionKind.InternalOperation ||
            (record.transition.operationKind !== SemanticOperationKind.EnterSequentialMultiInstanceScope &&
             record.transition.operationKind !== SemanticOperationKind.CompleteSequentialMultiInstanceScope)) continue;
        const lifecycle = traced.flowNodeOccurrenceLifecycles[index]!;
        const mutations = [
          ...lifecycle.started.map(() => ({ ...lifecycle, started: [] })),
          ...lifecycle.started.map(start => ({ ...lifecycle, started: [{ ...start,
            owner: { ...start.owner, activation: start.owner.activation + 1 } }] })),
          ...lifecycle.ended.map(() => ({ ...lifecycle, ended: [] })),
        ];
        for (const mutation of mutations) assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(program,
          open!.map(occurrence => ({ ...occurrence, attachedHandlers: [] })), stimulus.commandId,
          traced.committedTransitions, traced.flowNodeOccurrenceLifecycles.map((delta, ordinal) => ordinal === index ? mutation : delta)),
        /complete lifecycle|unknown anchor/);
      }
    }
    return { commandId: stimulus.commandId, outcome: traced.result.outcome, stateUnchanged: isDeepStrictEqual(state, before),
      stateWellFormed: true, traceReplays: isDeepStrictEqual(replayed, state),
      publication: traced.committedTransitions.length === 0 ? null : { transitions: traced.committedTransitions, current: traced.currentPositions },
      lifecycles: traced.flowNodeOccurrenceLifecycles, openOccurrences: projectOpenFlowNodeOccurrences(program, state) };
  });
  assert.equal(state.control.kind, ControlStateKind.Completed);
  assert.deepEqual(state.variables.scopes, []);
  assert.deepEqual(state.variables.activities, []);
  assert.deepEqual(state.sequentialScopeControllers ?? [], []);
  return records;
}

test("private MI runtime validation rejects corrupted progress and missing controller ownership", async t => {
  const { scenario, program } = (await cases())[0]!;
  const state = applyStimulusWithTrace(program, initialState, scenario.stimuli[0]!).result.state;
  assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
  const controller = state.sequentialScopeControllers![0]!;
  for (const [label, controllers] of [
    ["total disagrees with collection", [{ ...controller, total: controller.total + 1 }]],
    ["captured item disagrees with index", [{ ...controller, currentItem: "other" }]],
    ["missing controller for live body", []],
    ["duplicate controller", [controller, controller]],
    ["controller names no Activity", [{ ...controller, id: { ...controller.id, activation: 2 } }]],
  ] as const) await t.test(label, () => {
    assert.equal(isWellFormedRuntimeState(program, instanceId, { ...state, sequentialScopeControllers: controllers }), false);
  });
});

test("private MI TypeScript schedules preserve state, replay and complete each batch", async () => {
  for (const input of await cases()) {
    const records = publications(input);
    const deltas = records.flatMap(({ lifecycles }) => lifecycles);
    const starts = deltas.flatMap(({ started }) => started).filter(({ elementId }) => elementId === "ReviewInvoice");
    assert.equal(starts.length, input.scenario.id === "empty" ? 0 : input.scenario.id.startsWith("early-") ? 1 : 2);
    for (const { anchor } of starts) {
      assert.equal(anchor.kind, "scope");
      assert.equal(deltas.flatMap(({ ended }) => ended).filter(end => isDeepStrictEqual(end.anchor, anchor) &&
        end.terminal === "completed").length, 1);
    }
  }
});

test("private MI covers every branch completion order around a captured Service input", async () => {
  const inputs = await cases();
  assert.equal(inputs.filter(({ scenario }) => scenario.id.startsWith("order-paired-")).length, 6);
  assert.equal(inputs.filter(({ scenario }) => scenario.id.startsWith("order-separate-")).length, 12);
  for (const input of inputs.filter(({ scenario }) => scenario.id.startsWith("order-"))) publications(input);
});

test("private MI source, observations, replay and publications agree with independent Lean lowering", async () => {
  const inputs = await cases();
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-mi-scope-parity-"));
  try {
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, inputs.map(({ scenario, program, checkedProcess }) =>
      JSON.stringify({ scenarioId: scenario.id, checkedProcess, semanticProcess: program })).join("\n") + "\n");
    const paths = await Promise.all(inputs.map(async ({ scenario, bytes }) => {
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(path.join(directory, scenario.bpmn.relativePath), bytes);
      await writeFile(file, JSON.stringify(scenario));
      return file;
    }));
    const execution = await runLeanInterpreter("BpmnSemantics/SemanticProcessJsonMain.lean", ["--publications", definitions, ...paths], inputs.length);
    const actual = execution.stdout.trim().split("\n").map(line => parseStrictJson<{
      scenarioId: string; scenario: Scenario; definitionBinding: unknown; result: ScenarioResult; commandPublications: unknown;
    }>(line, "MI scope Lean result"));
    assert.equal(actual.length, inputs.length);
    for (const [index, input] of inputs.entries()) {
      const record = actual[index]!;
      assert.equal(record.scenarioId, input.scenario.id);
      assert.deepEqual(record.scenario, input.scenario);
      assert.deepEqual(record.definitionBinding, { kind: "leanDefinitionBinding", sourceSha256: input.program.identity.sourceSha256,
        semanticProfile: profile, programMatchesLeanLowering: true });
      assert.deepEqual(record.result, runScenario(input.scenario, input.program), input.scenario.id);
    }
    for (const [index, input] of inputs.entries())
      assert.deepEqual(actual[index]!.commandPublications, publications(input), `${input.scenario.id}: publications`);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
