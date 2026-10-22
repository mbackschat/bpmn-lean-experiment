import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { CanonicalObservationKind, CommandOutcome, EffectExecutionResultKind, ScenarioOutcomeKind, StimulusKind, VariableValueKind, applyStimulusWithTrace, compareCanonicalStrings, initialState, isWellFormedRuntimeState, observeStableState,
  projectOpenFlowNodeOccurrences, replayCommittedTransitions, runScenario, runtimeStateDefects, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { ScenarioResult } from "@bpmn-lean/semantic-core";
import { assessBpmnProcessAdmission, BpmnProcessAdmissionResultKind } from "@bpmn-lean/temporal-testkit";
import { parseWireJson } from "../../../scripts/strict-json.ts";
import { domainCases, selectedProfileContexts, values } from "./scenario-value-domain-cases.ts";
import type { DomainCase } from "./scenario-value-domain-cases.ts";
import { assertProfilesEnrolled } from "./scenario-value-domain-expectations.ts";
import { runLeanDriver } from "./semantic-differential-targets.ts";

test("every registered profile states its expected value domain on every surface", async () => {
  assertProfilesEnrolled((await selectedProfileContexts()).keys());
});

// A refused Start leaves the program-independent initial state, which Lean's `notStartedStateEmpty` admits for every program;
// program-required core fields are installed only when a Start commits.
test("the untouched initial state is well-formed for every registered profile", async () => {
  const defective = [...await selectedProfileContexts()].flatMap(([profile, { semanticProcess }]) => {
    const defects = runtimeStateDefects(semanticProcess, "Instance_NotStarted", initialState);
    return defects.length === 0 ? [] : [`${profile}: ${defects.join(", ")}`];
  });
  assert.deepEqual(defective, []);
});

// A Workflow created for a Start that command admission refuses would host no instance; the client must refuse first.
test("the hosting preflight admits only Starts that command admission commits", async () => {
  const hostedRefusals = (await domainCases()).flatMap(({ scenario, context }) => {
    const start = scenario.stimuli[0];
    if (scenario.stimuli.length !== 1 || start === undefined || start.kind !== StimulusKind.StartProcess ||
      assessBpmnProcessAdmission(start, context.semanticProcess).kind !== BpmnProcessAdmissionResultKind.Admitted) return [];
    const outcome = applyStimulusWithTrace(context.semanticProcess, initialState, start).result.outcome;
    return outcome === CommandOutcome.Committed ? [] : [`${scenario.id}: ${outcome}`];
  });
  assert.deepEqual(hostedRefusals, []);
});

test("existing profile scenario support checks later values against independent domains", async () => {
  for (const input of await domainCases()) assert.equal(supportsSemanticProcessScenario(input.scenario, input.context.semanticProcess),
    input.supported, input.scenario.id);
});

test("out-of-domain typed late commands retain direct refusal separately from scenario support", async () => {
  for (const input of await domainCases()) {
    const last = input.scenario.stimuli.at(-1);
    if (input.supported || last === undefined || !last.commandId.startsWith("late-") ||
      (last.kind !== StimulusKind.CompleteUserTaskInstance && last.kind !== StimulusKind.CompleteEffect)) continue;
    let state = initialState;
    for (const stimulus of input.scenario.stimuli.slice(0, -1)) state = applyStimulusWithTrace(input.context.semanticProcess, state, stimulus).result.state;
    const refused = applyStimulusWithTrace(input.context.semanticProcess, state, last);
    assert.equal(refused.result.outcome, CommandOutcome.Rejected, input.scenario.id);
    assert.deepEqual(refused.result.state, state, input.scenario.id);
    assert.deepEqual(refused.committedTransitions, []);
    assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
  }
});

test("invalid Start identity and required data retain direct rejection separately from unsupported scenarios", async () => {
  for (const input of (await domainCases()).filter(input => input.scenario.id.endsWith("wrong-start-process") ||
    input.scenario.id.includes("invalid-start-data-"))) {
    assert.deepEqual(runScenario(input.scenario, input.context.semanticProcess), {
      outcome: { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.Unsupported },
      trace: [{ kind: CanonicalObservationKind.Deployment, outcome: CommandOutcome.Unsupported }],
    }, input.scenario.id);
    const refused = applyStimulusWithTrace(input.context.semanticProcess, initialState, input.scenario.stimuli[0]!);
    assert.equal(refused.result.outcome, CommandOutcome.Rejected, input.scenario.id);
    assert.deepEqual(refused.result.state, initialState, input.scenario.id);
    assert.deepEqual(refused.committedTransitions, []);
    assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
  }
});

test("out-of-domain Start values retain direct rejection separately from unsupported scenarios", async () => {
  const inputs = (await domainCases()).filter(input => !input.supported && /-start-[A-Za-z]+$/u.test(input.scenario.id));
  assert.ok(inputs.length > 0);
  for (const input of inputs) {
    assert.deepEqual(runScenario(input.scenario, input.context.semanticProcess), {
      outcome: { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.Unsupported },
      trace: [{ kind: CanonicalObservationKind.Deployment, outcome: CommandOutcome.Unsupported }],
    }, input.scenario.id);
    const refused = applyStimulusWithTrace(input.context.semanticProcess, initialState, input.scenario.stimuli[0]!);
    assert.equal(refused.result.outcome, CommandOutcome.Rejected, input.scenario.id);
    assert.deepEqual(refused.result.state, initialState, input.scenario.id);
    assert.deepEqual(refused.committedTransitions, []);
    assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
  }
});

test("Lean scenario support checks every selected profile and both late effect result arms", async () => {
  const inputs = await domainCases();
  const actual = await leanScenarioSupport(inputs.map(({ context, scenario }) => ({ program: context.semanticProcess, scenario })));
  const mismatches = inputs.flatMap((input, index) => {
    assert.equal(actual[index]?.id, input.scenario.id);
    assert.equal(actual[index]?.unsupportedResultExact, true, `${input.scenario.id}: exact pure unsupported result`);
    return actual[index]?.supported === input.supported ? [] : [input.scenario.id];
  });
  assert.deepEqual(mismatches, []);
});

// Lean answers a Start on a Program without exactly one root scope with `semanticFailure`, an outcome the
// core never produces; both supports must refuse such a Program so no scenario can reach that arm. The
// duplicate keeps canonical scope order, so only root multiplicity, never sortedness, can cause the refusal.
test("a Program without exactly one root scope is unsupported by both implementations", async () => {
  const inputs = [...await selectedProfileContexts()].flatMap(([, { semanticProcess, scenario }]) => {
    const root = semanticProcess.definitionScopes.find(({ parentScopeId, originElementId }) =>
      parentScopeId === null && originElementId === semanticProcess.processId);
    assert.ok(root !== undefined, scenario.id);
    return [semanticProcess.definitionScopes.filter((candidate) => candidate !== root),
      [...semanticProcess.definitionScopes, { ...root, id: `${root.id}_Second` }]
        .sort((left, right) => compareCanonicalStrings(left.id, right.id))]
      .map((definitionScopes, index) => ({ program: { ...semanticProcess, definitionScopes },
        scenario: { ...scenario, id: `${scenario.id}-root-${index === 0 ? "absent" : "duplicated"}` } }));
  });
  const supported = (await leanScenarioSupport(inputs)).filter(({ supported }) => supported).map(({ id }) => `lean: ${id}`);
  for (const { program, scenario } of inputs) {
    if (supportsSemanticProcessScenario(scenario, program)) supported.push(`core: ${scenario.id}`);
  }
  assert.deepEqual(supported, []);
});

async function leanScenarioSupport(inputs: ReadonlyArray<{ program: unknown; scenario: { id: string } }>) {
  const directory = await mkdtemp(path.join(tmpdir(), "scenario-value-domain-support-"));
  try {
    const paths = await Promise.all(inputs.map(async ({ program, scenario }) => {
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(file, JSON.stringify({ program, scenario }));
      return file;
    }));
    const execution = await runLeanDriver("BpmnSemantics/ScenarioSupportJsonMain.lean", paths, inputs.length);
    const actual = execution.stdout.split("\n").filter(line => line.length > 0).map(line => parseWireJson<{ id: string; supported: boolean;
      unsupportedResultExact: boolean }>(line, "scenario support"));
    assert.equal(actual.length, inputs.length);
    return actual;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

/** The emitter requires a Start naming the Program's Process and a scenario carrying the Program's profile and source identity. */
function emitterBindsDefinition({ scenario, context }: DomainCase): boolean {
  const first = scenario.stimuli[0];
  const { processId, identity } = context.semanticProcess;
  return first !== undefined && "processId" in first && first.processId === processId && scenario.profile === identity.semanticProfile &&
    scenario.bpmn.id === identity.sourceId && scenario.bpmn.sha256 === identity.sourceSha256 &&
    isDeepStrictEqual(scenario.bpmn.sourceOverlay, identity.sourceOverlay);
}

function publications(input: DomainCase) {
  if (!input.supported) return [];
  const start = input.scenario.stimuli[0]!;
  assert.ok("instanceId" in start);
  const program = input.context.semanticProcess;
  let state = initialState;
  const records = [];
  for (const stimulus of input.scenario.stimuli) {
    const before = state;
    const traced = applyStimulusWithTrace(program, before, stimulus);
    state = traced.result.state;
    if (stimulus.commandId.startsWith("refuse-") || stimulus.commandId.startsWith("late-")) {
      assert.equal(traced.result.outcome, CommandOutcome.Rejected);
      assert.deepEqual(state, before);
      assert.deepEqual(traced.committedTransitions, []);
    }
    records.push({ commandId: stimulus.commandId, outcome: traced.result.outcome, stateUnchanged: isDeepStrictEqual(state, before),
      stateWellFormed: isWellFormedRuntimeState(program, start.instanceId, state),
      traceReplays: isDeepStrictEqual(replayCommittedTransitions(program, before, traced.committedTransitions), state),
      publication: traced.committedTransitions.length === 0 ? null : { transitions: traced.committedTransitions, current: traced.currentPositions },
      lifecycles: traced.flowNodeOccurrenceLifecycles, openOccurrences: projectOpenFlowNodeOccurrences(program, state) });
    // Lean's `commandPublicationsJson` publishes no command after one the scenario cannot continue from.
    const continues = (traced.result.outcome === CommandOutcome.Committed || traced.result.outcome === CommandOutcome.Rejected) &&
      !traced.result.internalStepBoundExceeded && !traced.result.ambiguousInternalChoice && observeStableState(program, state) !== null;
    if (!continues) break;
  }
  return records;
}

test("every refusal class has complete Lean/core result agreement and unsupported scenarios no publications", async () => {
  // One scenario per (profile, surface, kind) class: the BpmnError effect arm repeats its Success arm's class, and the Lean
  // support test already covers both arms. Excluded as well: the retained schedules (pipeline-owned) and the scenarios the
  // definition-bound emitter refuses to bind, whose Lean exception is checked by the emitter test below.
  const classes = (await domainCases()).filter(input => input.scenario !== input.context.scenario && emitterBindsDefinition(input) &&
    !input.scenario.id.includes(`-${EffectExecutionResultKind.BpmnError}-`));
  // A refused Start leaves no instance to observe; continuing its retained schedule separates ending the run semantically from
  // grounding later commands in absent state, which Lean's `executeStimuli` refuses as a harness failure.
  const continued = classes.filter(({ scenario, context }) => scenario.stimuli.length === 1 && context.scenario.stimuli.length > 1 &&
    isDeepStrictEqual(runScenario(scenario, context.semanticProcess).outcome, { kind: ScenarioOutcomeKind.Semantic, outcome: CommandOutcome.Rejected }))
    .map(input => ({ ...input, scenario: { ...input.scenario, id: `${input.scenario.id}-continued`,
      stimuli: [...input.scenario.stimuli, ...input.context.scenario.stimuli.slice(1)] } }));
  assert.ok(continued.length > 0);
  const inputs = [...classes, ...continued];
  const directory = await mkdtemp(path.join(tmpdir(), "scenario-value-domain-results-"));
  try {
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, inputs.map(({ context, scenario }) => JSON.stringify({ scenarioId: scenario.id,
      checkedProcess: context.checkedProcess, semanticProcess: context.semanticProcess })).join("\n") + "\n");
    const paths = await Promise.all(inputs.map(async ({ scenario }) => {
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(file, JSON.stringify(scenario));
      return file;
    }));
    const execution = await runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", ["--publications", definitions, ...paths], inputs.length);
    const actual = execution.stdout.split("\n").filter(line => line.length > 0).map(line => parseWireJson<{ scenarioId: string; scenario: unknown;
      result: ScenarioResult; commandPublications: unknown }>(line, "scenario results"));
    assert.equal(actual.length, inputs.length);
    // Collected rather than asserted one by one, so a single run names every disagreeing scenario.
    const disagreements: string[] = [];
    for (const [index, input] of inputs.entries()) {
      const record = actual[index]!;
      assert.equal(record.scenarioId, input.scenario.id);
      assert.deepEqual(record.scenario, input.scenario);
      if (!isDeepStrictEqual(record.result, runScenario(input.scenario, input.context.semanticProcess))) disagreements.push(`${input.scenario.id}: result`);
      if (!isDeepStrictEqual(record.commandPublications, publications(input))) disagreements.push(`${input.scenario.id}: publications`);
    }
    assert.deepEqual(disagreements, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("the emitter rejects definition binding for wrong ordinary, Message and Timer Process starts", async () => {
  const inputs = (await domainCases()).filter(input => input.scenario.id.endsWith("wrong-start-process"));
  const directory = await mkdtemp(path.join(tmpdir(), "scenario-start-process-binding-"));
  try {
    for (const kind of [StimulusKind.StartProcess, StimulusKind.TriggerMessageStart, StimulusKind.TriggerTimerStart]) {
      const input = inputs.find(input => input.scenario.stimuli[0]?.kind === kind);
      assert.ok(input !== undefined, kind);
      const definitions = path.join(directory, "definitions.jsonl");
      await writeFile(definitions, JSON.stringify({ scenarioId: input.scenario.id, checkedProcess: input.context.checkedProcess,
        semanticProcess: input.context.semanticProcess }) + "\n");
      const file = path.join(directory, "wrong-process.json");
      await writeFile(file, JSON.stringify(input.scenario));
      await assert.rejects(runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", ["--publications", definitions, file], 1),
        error => error instanceof Error && error.message.split(/\r?\n/u).includes(
          `uncaught exception: definition identity does not match scenario ${input.scenario.id}`));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("strict wire decoding rejects non-String correlation and noncanonical patches before support", async () => {
  const inputs = await domainCases();
  const correlation = inputs.find(input => input.scenario.profile === "bpmn-2.0.2-message-key-correlation-draft" &&
    input.scenario.id.endsWith("correlated-string"))!;
  const effect = inputs.find(input => input.scenario.profile === "cibseven-2.0.0-mapped-success-service-task-draft" &&
    input.scenario.id.endsWith("success-string"))!;
  const directory = await mkdtemp(path.join(tmpdir(), "scenario-value-domain-wire-"));
  try {
    for (const input of [correlation, effect]) {
      const definitions = path.join(directory, "definitions.jsonl");
      await writeFile(definitions, JSON.stringify({ scenarioId: input.scenario.id, checkedProcess: input.context.checkedProcess,
        semanticProcess: input.context.semanticProcess }) + "\n");
      const last = input.scenario.stimuli.at(-1)!;
      const invalid = last.kind === StimulusKind.DeliverCorrelatedPayloadMessage
        ? values.filter(value => value.kind !== VariableValueKind.String).map(payload => ({ stimulus: { ...last, payload },
          // The reader checks the `{kind, value}` shape before the kind, so Null and Decimal fail on shape first.
          diagnostic: !("value" in payload) ? /object fields do not match \[kind, value\]/u
            : new RegExp(`expected string, got ${payload.kind}`, "u") }))
        : last.kind === StimulusKind.CompleteEffect
          ? [[...last.result.localPatch, last.result.localPatch[0]!], [...last.result.localPatch].reverse()]
            .map(localPatch => ({ stimulus: { ...last, result: { ...last.result, localPatch } },
              diagnostic: /variable bindings must have unique names in canonical order/u })) : [];
      assert.ok(invalid.length > 0);
      for (const { stimulus, diagnostic } of invalid) {
        const scenario = { ...input.scenario, stimuli: [...input.scenario.stimuli.slice(0, -1), stimulus] };
        const file = path.join(directory, "invalid.json");
        await writeFile(file, JSON.stringify(scenario));
        await assert.rejects(runLeanDriver("BpmnSemantics/SemanticProcessJsonMain.lean", [definitions, file], 1),
          diagnostic);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
