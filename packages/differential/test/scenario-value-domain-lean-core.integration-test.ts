import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { CommandOutcome, StimulusKind, VariableValueKind, applyStimulusWithTrace, initialState, isWellFormedRuntimeState,
  projectOpenFlowNodeOccurrences, replayCommittedTransitions, runScenario, supportsSemanticProcessScenario } from "@bpmn-lean/semantic-core";
import type { ScenarioResult } from "@bpmn-lean/semantic-core";
import { parseStrictJson } from "../../../scripts/strict-json.ts";
import { domainCases, values } from "./scenario-value-domain-cases.ts";
import type { DomainCase } from "./scenario-value-domain-cases.ts";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";

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

test("Lean scenario support checks every selected profile and both late effect result arms", async () => {
  const inputs = await domainCases();
  const directory = await mkdtemp(path.join(tmpdir(), "scenario-value-domain-support-"));
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
    const paths = await Promise.all(inputs.map(async ({ context, scenario }) => {
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(file, JSON.stringify({ program: context.semanticProcess, scenario }));
      return file;
    }));
    const execution = await runLeanInterpreter(driver, paths, inputs.length);
    const actual = execution.stdout.trim().split("\n").map(line => parseStrictJson<{ id: string; supported: boolean }>(line, "scenario support"));
    assert.equal(actual.length, inputs.length);
    const mismatches = inputs.flatMap((input, index) => {
      assert.equal(actual[index]?.id, input.scenario.id);
      return actual[index]?.supported === input.supported ? [] : [input.scenario.id];
    });
    assert.deepEqual(mismatches, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function publications(input: DomainCase) {
  if (!input.supported) return [];
  const start = input.scenario.stimuli[0]!;
  assert.ok("instanceId" in start);
  let state = initialState;
  return input.scenario.stimuli.map(stimulus => {
    const before = state;
    const traced = applyStimulusWithTrace(input.context.semanticProcess, before, stimulus);
    state = traced.result.state;
    if (stimulus.commandId.startsWith("refuse-") || stimulus.commandId.startsWith("late-")) {
      assert.equal(traced.result.outcome, CommandOutcome.Rejected);
      assert.deepEqual(state, before);
      assert.deepEqual(traced.committedTransitions, []);
    }
    return { commandId: stimulus.commandId, outcome: traced.result.outcome, stateUnchanged: isDeepStrictEqual(state, before),
      stateWellFormed: isWellFormedRuntimeState(input.context.semanticProcess, start.instanceId, state),
      traceReplays: isDeepStrictEqual(replayCommittedTransitions(input.context.semanticProcess, before, traced.committedTransitions), state),
      publication: traced.committedTransitions.length === 0 ? null : { transitions: traced.committedTransitions, current: traced.currentPositions },
      lifecycles: traced.flowNodeOccurrenceLifecycles, openOccurrences: projectOpenFlowNodeOccurrences(input.context.semanticProcess, state) };
  });
}

test("whole unsupported scenarios have complete Lean/core result agreement and no publications", async () => {
  const all = await domainCases();
  const profiles = new Set<string>();
  const inputs = all.filter(input => {
    if (input.scenario.id.endsWith("-missing") || input.scenario.id.endsWith("-extra") || input.scenario.id.endsWith("-wrong-name") ||
      /-(payload|correlated)-/u.test(input.scenario.id) || /-(reportEffectFailure|retryIncident|cancelIncidentProcess)$/u.test(input.scenario.id)) return true;
    if (!input.scenario.id.endsWith("human-integer") && !input.scenario.id.endsWith("success-null")) return false;
    const key = `${input.scenario.profile}:${input.supported}`;
    if (profiles.has(key)) return false;
    profiles.add(key);
    return true;
  });
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
    const execution = await runLeanInterpreter("BpmnSemantics/SemanticProcessJsonMain.lean", ["--publications", definitions, ...paths], inputs.length);
    const actual = execution.stdout.trim().split("\n").map(line => parseStrictJson<{ scenarioId: string; scenario: unknown;
      result: ScenarioResult; commandPublications: unknown }>(line, "scenario results"));
    assert.equal(actual.length, inputs.length);
    for (const [index, input] of inputs.entries()) {
      const record = actual[index]!;
      assert.equal(record.scenarioId, input.scenario.id);
      assert.deepEqual(record.scenario, input.scenario);
      assert.deepEqual(record.result, runScenario(input.scenario, input.context.semanticProcess), input.scenario.id);
      assert.deepEqual(record.commandPublications, publications(input), input.scenario.id);
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
          diagnostic: payload.kind === VariableValueKind.Null ? /object fields do not match \[kind, value\]/u
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
        await assert.rejects(runLeanInterpreter("BpmnSemantics/SemanticProcessJsonMain.lean", [definitions, file], 1),
          diagnostic);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
