import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { completeEffectCommandId } from "@bpmn-lean/temporal-protocol";
import {
  ObservationRequestKind, CommandOutcome, EffectExecutionResultKind, ScenarioDocumentKind,
  StimulusKind, VariableValueKind, applyStimulusWithTrace, initialState, isWellFormedRuntimeState,
  projectOpenFlowNodeOccurrences, replayCommittedTransitions, runScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario, ScenarioResult, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { compile, profile, source } from "../../bpmn-source/test/serial-business-task-fixture.ts";
import { semanticProcessTestLimits } from "../../bpmn-source/test/semantic-process-compilation-test-support.ts";
import { parseStrictJson } from "../../../scripts/strict-json.ts";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";
import { projectRoot } from "./pipeline-target-support.ts";

const binding = (name: string, value: string): VariableBinding => ({ name, value: { kind: VariableValueKind.String, value } });
const instanceId = "invoice";
const effectId = { processInstanceId: instanceId, elementId: "Validate", activation: 1 };
const observations = [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults,
  ObservationRequestKind.ProcessStatus, ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks,
  ObservationRequestKind.OpenTimers, ObservationRequestKind.OpenEffects, ObservationRequestKind.Variables,
  ObservationRequestKind.EnabledInteractions, ObservationRequestKind.LogicalTime];

test("serial business lowering, local data, refusals and complete publications agree with Lean", async () => {
  const original = await readFile(source, "utf8");
  const retainedPath = new URL("./fixtures/serial-classification.scenario.json", import.meta.url);
  const retained = parseStrictJson<Scenario>(await readFile(retainedPath, "utf8"), "retained classification scenario");
  assert.equal(retained.id, "classification");
  assert.equal(retained.profile, profile);
  assert.ok(retained.bpmn.sourceOverlay !== null);
  for (const stimulus of retained.stimuli) {
    assert.ok(!stimulus.commandId.startsWith("refuse-"), "retained journey contains only successful commands");
    if (stimulus.kind === StimulusKind.CompleteEffect) {
      assert.equal(stimulus.commandId, completeEffectCommandId(stimulus.effectId, stimulus.result));
    }
  }
  const overlayBytes = await readFile(new URL("./fixtures/serial-classification.overlay.json", import.meta.url));
  const cases = [
    { id: "success", xml: original, nullResult: false, empty: false },
    { id: "null-fanout", xml: original.replace('</camunda:inputOutput>', '<camunda:outputParameter name="receipt">${result}</camunda:outputParameter></camunda:inputOutput>'), nullResult: true, empty: false },
    { id: "literal", xml: original.replace('${request}', 'literal-invoice'), nullResult: false, empty: false },
    { id: "empty", xml: original.replace(/<extensionElements>[\s\S]*?<\/extensionElements>/u, ''), nullResult: false, empty: true },
    { id: "missing-input", xml: original, nullResult: false, empty: false },
  ];
  const inputs = await Promise.all(cases.map(async selected => {
    const compiled = await compile(selected.xml);
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted, selected.id);
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Serial business fixture rejected");
    const program = compiled.semanticProcess;
    const patch: VariableBinding[] = selected.empty ? [] : [{ name: "result", value: selected.nullResult ? { kind: VariableValueKind.Null } : { kind: VariableValueKind.String, value: "approved" } }];
    const completion: Stimulus = { kind: StimulusKind.CompleteEffect, commandId: "validate", effectId, result: { kind: EffectExecutionResultKind.Success, localPatch: patch } };
    const stimuli: Stimulus[] = [
      { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId, instanceId,
        initialVariables: [binding("payload", "parent-payload"), binding("request", "initial"), binding("result", "parent-result")] },
      { kind: StimulusKind.CompleteUserTaskInstance, commandId: "review", taskId: { processInstanceId: instanceId, elementId: "Review", activation: 1 }, submittedValues: [binding("request", "reviewed")] },
      { ...completion, commandId: "refuse-extra", result: { kind: EffectExecutionResultKind.Success, localPatch: [binding("private", "extra"), ...patch] } },
      { ...completion, commandId: "refuse-foreign", effectId: { ...effectId, processInstanceId: "other" } },
      completion,
      { ...completion, commandId: "refuse-stale" },
      { kind: StimulusKind.CompleteUserTaskInstance, commandId: "finalize", taskId: { processInstanceId: instanceId, elementId: "Finalize", activation: 1 }, submittedValues: [] },
    ];
    if (selected.id === "missing-input") {
      stimuli.splice(0, stimuli.length, { kind: StimulusKind.StartProcess, commandId: "refuse-missing-input",
        processId: program.processId, instanceId, initialVariables: [] });
    }
    const scenario: Scenario = { kind: ScenarioDocumentKind.Scenario, id: selected.id, profile,
      bpmn: { id: program.identity.sourceId, sha256: program.identity.sourceSha256, sourceOverlay: program.identity.sourceOverlay, relativePath: `${selected.id}.bpmn` },
      stimuli, observations,
      provenance: { normativeRefs: ["BPMN 2.0.2 Clause 13.3.2", "BPMN 2.0.2 Clause 13.3.3"], cibRevision: "2.2.0", cibRefs: ["CIB-EXT-0015"] } };
    return { ...selected, scenario, program, checkedProcess: compiled.checkedProcess };
  }));
  const retainedXml = await readFile(path.join(projectRoot, retained.bpmn.relativePath), "utf8");
  const retainedCompilation = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(retainedXml),
    sourceId: retained.bpmn.id, expectedSha256: retained.bpmn.sha256, semanticProfile: retained.profile,
    sourceOverlay: { ...retained.bpmn.sourceOverlay, bytes: overlayBytes }, limits: semanticProcessTestLimits });
  assert.equal(retainedCompilation.status, BpmnCompilationStatus.Accepted);
  if (retainedCompilation.status !== BpmnCompilationStatus.Accepted) throw new Error("Retained classification rejected");
  inputs.push({ id: retained.id, xml: retainedXml, nullResult: false, empty: false, scenario: retained,
    program: retainedCompilation.semanticProcess, checkedProcess: retainedCompilation.checkedProcess });
  const validation = retained.stimuli[2]!;
  assert.equal(validation.kind, StimulusKind.CompleteEffect);
  if (validation.kind !== StimulusKind.CompleteEffect) throw new Error("Retained validation completion missing");
  assert.equal(validation.result.kind, EffectExecutionResultKind.Success);
  const refusalScenario: Scenario = { ...retained, id: "classification-refusals", stimuli: [
    ...retained.stimuli.slice(0, 2),
    { ...validation, commandId: "refuse-extra", result: { kind: EffectExecutionResultKind.Success,
      localPatch: [binding("private", "extra"), ...validation.result.localPatch] } },
    { ...validation, commandId: "refuse-foreign", effectId: { ...validation.effectId, processInstanceId: "other" } },
    validation,
    { ...validation, commandId: "refuse-stale" },
    ...retained.stimuli.slice(3),
  ] };
  inputs.push({ id: refusalScenario.id, xml: retainedXml, nullResult: false, empty: false, scenario: refusalScenario,
    program: retainedCompilation.semanticProcess, checkedProcess: retainedCompilation.checkedProcess });
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-serial-business-parity-"));
  try {
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, inputs.map(({ scenario, checkedProcess, program }) => JSON.stringify({ scenarioId: scenario.id, checkedProcess, semanticProcess: program })).join("\n") + "\n");
    const paths = await Promise.all(inputs.map(async ({ scenario, xml }) => {
      if (scenario.id === "classification") return fileURLToPath(retainedPath);
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(file, JSON.stringify(scenario));
      if (scenario.id !== refusalScenario.id) await writeFile(path.join(directory, scenario.bpmn.relativePath), xml);
      return file;
    }));
    const execution = await runLeanInterpreter("BpmnSemantics/SemanticProcessJsonMain.lean", ["--publications", definitions, ...paths], inputs.length);
    const records = execution.stdout.trim().split("\n").map(line => parseStrictJson<{
      scenarioId: string; scenario: Scenario; result: ScenarioResult; definitionBinding: unknown; commandPublications: unknown;
    }>(line, "serial business Lean result"));
    assert.equal(records.length, inputs.length);
    for (const [index, { scenario, program }] of inputs.entries()) {
      const record = records[index]!;
      assert.equal(record.scenarioId, scenario.id);
      assert.deepEqual(record.scenario, scenario);
      assert.deepEqual(record.definitionBinding, { kind: "leanDefinitionBinding", sourceSha256: program.identity.sourceSha256, semanticProfile: profile, programMatchesLeanLowering: true });
      assert.deepEqual(record.result, runScenario(scenario, program), `${scenario.id} E1`);
      if (scenario.id === "missing-input") {
        assert.deepEqual(record.result, { outcome: { kind: "semantic", outcome: "unsupported" }, trace: [{ kind: "deployment", outcome: "unsupported" }] });
        assert.deepEqual(record.commandPublications, []);
        const command = applyStimulusWithTrace(program, initialState, scenario.stimuli[0]!);
        assert.equal(command.result.outcome, CommandOutcome.Rejected);
        assert.deepEqual(command.result.state, initialState);
        assert.deepEqual(command.committedTransitions, []);
        continue;
      }
      let state = initialState;
      const publications = scenario.stimuli.map(stimulus => {
        const before = state;
        const traced = applyStimulusWithTrace(program, before, stimulus);
        state = traced.result.state;
        const rejected = stimulus.commandId.startsWith("refuse-");
        assert.equal(traced.result.outcome, rejected ? CommandOutcome.Rejected : CommandOutcome.Committed);
        if ((scenario.id === retained.id || scenario.id === refusalScenario.id)
          && stimulus.kind === StimulusKind.CompleteEffect && stimulus.effectId.elementId === "Validate" && !rejected) {
          assert.deepEqual(state.effectWaits.map(({ id, arguments: values }) => ({ id, arguments: values })), [{
            id: { processInstanceId: instanceId, elementId: "Classify", activation: 1 }, arguments: [binding("payload", "valid")],
          }]);
        }
        assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
        const replayed = replayCommittedTransitions(program, before, traced.committedTransitions);
        assert.deepEqual(replayed, rejected ? null : state);
        if (rejected) assert.deepEqual(state, before);
        return { commandId: stimulus.commandId, outcome: traced.result.outcome, stateUnchanged: isDeepStrictEqual(state, before),
          stateWellFormed: true, traceReplays: isDeepStrictEqual(replayed, state), publication: traced.committedTransitions.length === 0 ? null :
            { transitions: traced.committedTransitions, current: traced.currentPositions }, lifecycles: traced.flowNodeOccurrenceLifecycles,
          openOccurrences: projectOpenFlowNodeOccurrences(program, state) };
      });
      assert.equal(state.control.kind, "completed");
      if (scenario.id === retained.id || scenario.id === refusalScenario.id) {
        assert.deepEqual(state.variables.process.bindings, [binding("classification", "standard"), binding("decision", "valid"),
          binding("payload", "parent-payload"), binding("request", "INV-42"), binding("result", "parent-result")]);
        assert.deepEqual(state.variables.activities, []);
      }
      assert.deepEqual(record.commandPublications, publications, `${scenario.id} E2`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
