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
  SemanticOperationKind, SemanticTransitionKind, CanonicalObservationKind, MultiInstanceBodyKind, supportsSemanticProcessScenario,
  MessageChannelKind,
} from "@bpmn-lean/semantic-core";
import type { Scenario, ScenarioResult, Stimulus, VariableBinding, VariableValue, OccurrenceId, SemanticProcessProgram,
  EffectExecutionResult } from "@bpmn-lean/semantic-core";
import { ComparisonKind, DifferentialTarget, compareTargetResults } from "@bpmn-lean/differential";
import type { MutableScenarioResult } from "./pipeline-types.ts";
import { profile, source, prepareSource, sourceOverlay, parallelBodySource } from "../../bpmn-source/test/sequential-scope-source-fixture.ts";
import { sequentialOutputMappingSources } from "../../bpmn-source/test/sequential-scope-output-mapping-fixture.ts";
import { parseWireJson } from "../../../scripts/strict-json.ts";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";
import { program as embeddedProgram, startStimulus as embeddedStart } from "../../semantic-core/test/embedded-subprocess-fixture.ts";

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

type ScenarioAdmissionCase = { program: SemanticProcessProgram; scenario: Scenario; supported: boolean };

async function scenarioAdmissionCases(): Promise<ScenarioAdmissionCase[]> {
  const sourceInput = (await sequentialOutputMappingSources()).find(input => input.shape === "distinct");
  assert.ok(sourceInput);
  const inputs: ScenarioAdmissionCase[] = [];
  const add = (program: SemanticProcessProgram, id: string, stimuli: readonly Stimulus[], supported: boolean,
    requested = observations) => {
    const scenario: Scenario = { kind: ScenarioDocumentKind.Scenario, id, profile: program.identity.semanticProfile,
      bpmn: { id: program.identity.sourceId, sha256: program.identity.sourceSha256,
        sourceOverlay: program.identity.sourceOverlay, relativePath: `${id}.bpmn` }, stimuli, observations: requested,
      provenance: { normativeRefs: ["SMIS-ADMIT-01"], cibRevision: "not-applicable", cibRefs: [] } };
    inputs.push({ program, scenario, supported });
  };
  const values = [
    { kind: VariableValueKind.String, value: "accepted" }, { kind: VariableValueKind.Null },
    { kind: VariableValueKind.Boolean, value: true }, { kind: VariableValueKind.Integer, value: 7 },
    { kind: VariableValueKind.StringList, value: ["accepted"] },
  ] as const satisfies readonly VariableValue[];
  const label = "sequential";
  const program = sourceInput.program;
  const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId,
    initialVariables: [{ name: "items", value: { kind: VariableValueKind.StringList, value: ["invoice"] } }] };
  const prefix = [start, human("Review", 1, [binding("item", "protected-name-negative")])];
  add(program, `${label}-baseline`, [start], true);
  for (const value of [values[0], values[1], values[3]]) add(program, `${label}-start-${value.kind}`,
    [{ ...start, initialVariables: [...start.initialVariables, { name: "zzExtra", value }] }], value.kind !== VariableValueKind.Integer);
  add(program, `${label}-missing-progress`, [start], false, observations.filter(kind => kind !== ObservationRequestKind.OpenMultiInstances));
  for (const value of values) {
    add(program, `${label}-human-${value.kind}`, [...prefix, human("Confirm", 1,
      [binding("reviewStatus", "valid-first-member"), { name: "zzSubmitted", value }])],
    value.kind === VariableValueKind.String || value.kind === VariableValueKind.Null || value.kind === VariableValueKind.Boolean);
    for (const kind of [EffectExecutionResultKind.Success, EffectExecutionResultKind.BpmnError]) {
      const localPatch = [binding("result", "valid-first-member"), { name: "summaryResult", value }];
      const result: EffectExecutionResult = kind === EffectExecutionResultKind.Success ? { kind, localPatch }
        : { kind, code: "BUSINESS", message: null, localPatch };
      add(program, `${label}-${kind}-${value.kind}`, [...prefix,
        { kind: StimulusKind.CompleteEffect, commandId: "late-effect", effectId: { processInstanceId: instanceId, elementId: "Validate", activation: 2 }, result }],
      value.kind === VariableValueKind.String || value.kind === VariableValueKind.Null);
    }
  }
  for (const localPatch of [[], [binding("extra", "supported-kind-negative")]]) {
    add(program, `${label}-effect-${localPatch.length === 0 ? "missing" : "extra"}`, [...prefix,
      { kind: StimulusKind.CompleteEffect, commandId: "negative-effect", effectId: { processInstanceId: instanceId, elementId: "Validate", activation: 1 },
        result: { kind: EffectExecutionResultKind.Success, localPatch } }], true);
  }
  const occurrence = { processInstanceId: instanceId, elementId: "Unavailable", activation: 1 };
  const channel = { kind: MessageChannelKind.OperationMessage, interfaceId: "Interface", interfaceOperationId: "Operation", messageId: "Message" } as const;
  const families: readonly [Stimulus, boolean][] = [
    [{ kind: StimulusKind.DeliverMessage, commandId: "message", subscriptionId: occurrence, channel }, true],
    [{ kind: StimulusKind.FireTimer, commandId: "timer", timerId: occurrence, logicalTimeMs: 1000 }, true],
    [{ kind: StimulusKind.ReportEffectFailure, commandId: "failure", effectId: occurrence, generation: 1 }, false],
    [{ kind: StimulusKind.RetryIncident, commandId: "retry", incidentId: { effectId: occurrence, generation: 1 } }, false],
    [{ kind: StimulusKind.CancelIncidentProcess, commandId: "cancel", processInstanceId: instanceId,
      incidentId: { effectId: occurrence, generation: 1 } }, false],
    [{ kind: StimulusKind.DeliverPayloadMessage, commandId: "payload", subscriptionId: occurrence, channel, payload: values[0] }, false],
    [{ kind: StimulusKind.DeliverCorrelatedPayloadMessage, commandId: "correlated", subscriptionId: occurrence,
      address: { definition: program.identity, processId: program.processId, channel, correlationKeyId: "Key" }, ingressOrdinal: 1,
      correlationPropertyId: "Correlation", processPropertyId: "Property", payload: values[0] }, false],
  ];
  for (const [stimulus, supported] of families) add(program, `${label}-${stimulus.kind}`, [...prefix, stimulus], supported);
  const baseline = observations.filter(kind => kind !== ObservationRequestKind.OpenMultiInstances);
  add(embeddedProgram, "unrelated-baseline", [embeddedStart()], true, baseline);
  return inputs;
}

test("sequential MI scenario support checks every write surface and preserves negative commands independently of execution", async t => {
  const inputs = await scenarioAdmissionCases();
  const directory = await mkdtemp(path.join(tmpdir(), "mi-scenario-admission-"));
  try {
    const driver = path.join(directory, "Admission.lean");
    await writeFile(driver, `import BpmnSemantics.SemanticProcess.ScenarioAdmission
import BpmnSemantics.SemanticProcessJson.Program
import BpmnSemantics.SemanticProcessJson.Scenario
open BpmnSemantics BpmnSemantics.SemanticProcess BpmnSemantics.SemanticProcessJson Lean
def main (paths : List String) : IO Unit := do
  for path in paths do
    let contents ← IO.FS.readFile path
    let decoded := do
      let json ← parseWireJson contents
      requireObjectShape json ["program", "scenario"]
      let program ← decodeProgram (← field json "program")
      let scenario ← decodeScenario (← field json "scenario")
      pure (scenario.id.value, supportsScenario program scenario)
    match decoded with
    | .error message => throw (IO.userError message)
    | .ok (id, supported) => IO.println (Json.mkObj [("id", toJson id), ("supported", toJson supported)]).compress
`);
    const paths = await Promise.all(inputs.map(async ({ program, scenario }) => {
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(file, JSON.stringify({ program, scenario }));
      return file;
    }));
    const execution = await runLeanInterpreter(driver, paths, inputs.length);
    const actual = execution.stdout.split("\n").filter(line => line.length > 0).map(line => parseWireJson<{ id: string; supported: boolean }>(line, "scenario admission"));
    assert.equal(actual.length, inputs.length);
    for (const [index, input] of inputs.entries()) await t.test(input.scenario.id, () => {
      assert.equal(actual[index]?.id, input.scenario.id);
      assert.equal(actual[index]?.supported, input.supported, "Lean support must match the independent expectation");
      assert.equal(supportsSemanticProcessScenario(input.scenario, input.program), input.supported,
        "TypeScript support must match the independent expectation");
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

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

async function verifyScopeCases(inputs: readonly Awaited<ReturnType<typeof cases>>[number][]) {
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
    const actual = execution.stdout.split("\n").filter(line => line.length > 0).map(line => parseWireJson<{
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
      assert.deepEqual(actual[index]!.commandPublications,
        supportsSemanticProcessScenario(input.scenario, input.program) ? publications(input) : [], `${input.scenario.id}: publications`);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test("private MI source, observations, replay and publications agree with independent Lean lowering", async () => {
  await verifyScopeCases(await cases());
});

async function outputMappingCases(includeUnsupportedValues = false) {
  const inputs: Awaited<ReturnType<typeof cases>> = [];
  for (const { shape, bytes, program, checkedProcess } of await sequentialOutputMappingSources()) {
    for (const firstNull of [false, true]) {
      const id = `outputs-${shape}-${firstNull ? "null" : "string"}-first`;
      const stimuli: Stimulus[] = [];
      let state = initialState;
      const run = (stimulus: Stimulus, outcome = CommandOutcome.Committed, retain = true) => {
        const before = state;
        const traced = applyStimulusWithTrace(program, before, stimulus);
        assert.equal(traced.result.outcome, outcome, `${id}: ${stimulus.commandId}`);
        state = traced.result.state;
        if (outcome === CommandOutcome.Rejected) assert.deepEqual(state, before);
        if (retain) stimuli.push(stimulus);
      };
      run({ kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId,
        initialVariables: [{ name: "items", value: { kind: VariableValueKind.StringList, value: ["same-invoice", "same-invoice"] } }] });
      const initialBindings = state.variables.scopes[0]!.bindings;
      let previousEffect: OccurrenceId | undefined;
      for (const iteration of [1, 2]) {
        const review = state.userTaskWaits[0]!;
        assert.equal(review.id.elementId, "Review");
        assert.equal(review.id.activation, iteration);
        assert.deepEqual(state.variables.scopes[0]!.bindings, initialBindings);
        run({ kind: StimulusKind.CompleteUserTaskInstance, commandId: `review-${iteration}`, taskId: review.id,
          submittedValues: [binding("reviewStatus", `reviewed-${iteration}`)] });
        const wait = state.effectWaits[0]!;
        assert.equal(wait.id.elementId, "Validate");
        assert.equal(wait.id.activation, iteration);
        assert.deepEqual(wait.owner, review.owner);
        assert.deepEqual(wait.outputMappings.map(mapping => mapping.target), shape === "single" ? ["decision"] : ["decision", "summary"]);
        assert.deepEqual(wait.arguments.find(value => value.name === "status"), binding("status", `reviewed-${iteration}`));
        if (shape === "distinct") assert.deepEqual(wait.arguments.find(value => value.name === "summaryResult"),
          binding("summaryResult", "argument-only"));
        const nullable = iteration === 1 ? firstNull : !firstNull;
        const result = binding("result", nullable ? null : `accepted-${iteration}`);
        const summary = binding("summaryResult", nullable ? null : `audited-${iteration}`);
        const patch: readonly VariableBinding[] = [result, ...(shape === "distinct" ? [summary] : [])];
        const effect = (commandId: string, localPatch: readonly VariableBinding[], effectId = wait.id): Stimulus => ({
          kind: StimulusKind.CompleteEffect, commandId, effectId, result: { kind: EffectExecutionResultKind.Success, localPatch },
        });
        for (const [label, invalid] of [
          ["missing", patch.slice(0, -1)],
          ["extra", [...patch, binding("zzExtra", "unexpected")]],
        ] as const) run(effect(`refuse-${label}-${iteration}`, invalid), CommandOutcome.Rejected);
        for (const [label, invalid] of [
          ["type", patch.map<VariableBinding>((value, index) => index === 0
            ? { ...value, value: { kind: VariableValueKind.Boolean, value: true } } : value)],
          ["later-output-type", patch.map<VariableBinding>((value, index) => index === patch.length - 1
            ? { ...value, value: { kind: VariableValueKind.Integer, value: 7 } } : value)],
        ] as const) run(effect(`refuse-${label}-${iteration}`, invalid), CommandOutcome.Rejected, includeUnsupportedValues);
        run(effect(`refuse-wrong-instance-${iteration}`, patch, { ...wait.id, processInstanceId: "other" }), CommandOutcome.Rejected);
        run(effect(`refuse-wrong-activation-${iteration}`, patch, { ...wait.id, activation: wait.id.activation + 1 }), CommandOutcome.Rejected);
        if (previousEffect !== undefined) run(effect("refuse-former-body-effect", patch, previousEffect), CommandOutcome.Rejected);
        // JsonSupport.decodeCanonicalVariableBindings rejects these before Lean execution; direct core calls still need refusal.
        for (const invalid of [[...patch, patch[0]!], ...(patch.length > 1 ? [[...patch].reverse()] : [])]) {
          const refused = applyStimulusWithTrace(program, state, effect("wire-invalid", invalid));
          assert.equal(refused.result.outcome, CommandOutcome.Rejected);
          assert.deepEqual(refused.result.state, state);
          assert.deepEqual(refused.committedTransitions, []);
          assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
        }
        run(effect(`effect-${iteration}`, patch));
        assert.deepEqual(state.variables.scopes.find(frame => isDeepStrictEqual(frame.owner, review.owner))?.bindings
          .find(value => value.name === "decision")?.value, result.value);
        assert.deepEqual(state.variables.process.bindings.find(value => value.name === "summary")?.value,
          shape === "single" ? undefined : shape === "distinct" ? summary.value : result.value);
        assert.deepEqual(state.variables.activities, []);
        assert.deepEqual(state.effectWaits, []);
        const confirm = state.userTaskWaits[0]!;
        assert.equal(confirm.id.elementId, "Confirm");
        assert.deepEqual(confirm.owner, review.owner);
        run(effect(`refuse-stale-effect-${iteration}`, patch), CommandOutcome.Rejected);
        run({ kind: StimulusKind.CompleteUserTaskInstance, commandId: `confirm-${iteration}`, taskId: confirm.id, submittedValues: [] });
        assert.equal(state.variables.scopes.some(frame => isDeepStrictEqual(frame.owner, review.owner)), false);
        assert.equal(state.scopeOccurrences.some(scope => isDeepStrictEqual(scope.id, review.owner)), false);
        if (iteration === 1) {
          assert.notDeepEqual(state.userTaskWaits[0]!.owner, review.owner);
          assert.deepEqual(state.variables.scopes[0]!.bindings, initialBindings);
        }
        previousEffect = wait.id;
      }
      const publish = state.userTaskWaits[0]!;
      assert.equal(publish.id.elementId, "PublishBatch");
      run({ kind: StimulusKind.CompleteUserTaskInstance, commandId: "publish", taskId: publish.id, submittedValues: [] });
      const scenario: Scenario = { kind: ScenarioDocumentKind.Scenario, id, profile,
        bpmn: { id: program.identity.sourceId, sha256: program.identity.sourceSha256,
          sourceOverlay: program.identity.sourceOverlay, relativePath: `${id}.bpmn` }, stimuli, observations,
        provenance: { normativeRefs: ["SMIS-ADMIT-01", "SMIS-DATA-01", "SMIS-END-01", "SMIS-IDENTITY-01"], cibRevision: "not-applicable", cibRefs: [] } };
      inputs.push({ scenario, program, checkedProcess, bytes });
    }
  }
  return inputs;
}

test("TypeScript sequential Service output witnesses preserve writes, turnover and refusal; comparison detects output loss", async () => {
  const inputs = await outputMappingCases();
  assert.equal(inputs.length, 6);
  for (const input of inputs) {
    assert.equal(supportsSemanticProcessScenario(input.scenario, input.program), true);
    publications(input);
    const expected = runScenario(input.scenario, input.program);
    for (const field of ["local", ...(input.scenario.id.includes("single") ? [] : ["process"])]) {
      const mutated = structuredClone(expected) as MutableScenarioResult;
      const index = mutated.trace.findIndex(value => value.kind === CanonicalObservationKind.Command && value.commandId === "effect-1");
      const after = mutated.trace[index + 1];
      assert.ok(index >= 0 && after?.kind === CanonicalObservationKind.State);
      if (field === "local") {
        const progress = after.openMultiInstances?.[0];
        assert.ok(progress?.bodyKind === MultiInstanceBodyKind.SubProcess);
        const iteration = progress.activeIterations[0]!;
        assert.ok(iteration.bindings.some(value => value.name === "decision"));
        iteration.bindings = iteration.bindings.filter(value => value.name !== "decision");
      } else {
        assert.ok(after.variables.some(value => value.name === "summary"));
        after.variables = after.variables.filter(value => value.name !== "summary");
      }
      const comparison = compareTargetResults({ target: DifferentialTarget.Lean, result: expected },
        [{ target: DifferentialTarget.SemanticCore, result: mutated }]);
      assert.equal(comparison.kind, ComparisonKind.Disagreement);
    }
  }
  for (const input of await outputMappingCases(true)) {
    assert.equal(supportsSemanticProcessScenario(input.scenario, input.program), false);
    publications(input);
  }
});

test("Lean and TypeScript agree on source-admitted sequential Service output mappings through body turnover", async () => {
  const inputs = await outputMappingCases();
  await verifyScopeCases(inputs);
  // Unsupported whole scenarios emit no publications; typed command refusal is checked separately above.
  const unsupportedValues = await outputMappingCases(true);
  unsupportedValues.forEach(input => assert.equal(supportsSemanticProcessScenario(input.scenario, input.program), false));
  await verifyScopeCases(unsupportedValues);
  const input = inputs.find(value => value.scenario.id === "outputs-distinct-string-first")!;
  const effect = input.scenario.stimuli.find(stimulus => stimulus.commandId === "effect-1");
  assert.ok(effect?.kind === StimulusKind.CompleteEffect && effect.result.kind === EffectExecutionResultKind.Success);
  const directory = await mkdtemp(path.join(tmpdir(), "sequential-output-wire-"));
  try {
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, JSON.stringify({ scenarioId: input.scenario.id,
      checkedProcess: input.checkedProcess, semanticProcess: input.program }) + "\n");
    for (const localPatch of [[...effect.result.localPatch, effect.result.localPatch[0]!], [...effect.result.localPatch].reverse()]) {
      const scenario = { ...input.scenario, stimuli: [...input.scenario.stimuli.slice(0, 2),
        { ...effect, result: { ...effect.result, localPatch } }] };
      const file = path.join(directory, "invalid.json");
      await writeFile(file, JSON.stringify(scenario));
      await assert.rejects(runLeanInterpreter("BpmnSemantics/SemanticProcessJsonMain.lean", [definitions, file], 1),
        /variable bindings must have unique names in canonical order/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
